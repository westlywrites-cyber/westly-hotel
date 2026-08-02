// Minimal Firestore REST client — direct port of the Cloudflare Workers version.
import { getAccessToken, getServiceAccount, type Env } from "./googleAuth.js";

const SERVER_TIMESTAMP = Symbol("firestore.serverTimestamp");

export const FieldValue = {
  serverTimestamp: () => SERVER_TIMESTAMP as unknown as Date,
};

async function baseUrl(env: Env): Promise<string> {
  const sa = getServiceAccount(env);
  return `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
}

async function authHeaders(env: Env): Promise<Record<string, string>> {
  const token = await getAccessToken(env);
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ── Value encoding ────────────────────────────────────────────────────────

function encodeValue(value: unknown): Record<string, unknown> {
  if (value === SERVER_TIMESTAMP) return { nullValue: null };
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object")
    return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  throw new Error(`Cannot encode value of type ${typeof value} for Firestore.`);
}

function encodeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === SERVER_TIMESTAMP) continue;
    fields[k] = encodeValue(v);
  }
  return fields;
}

function decodeValue(v: Record<string, unknown>): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("timestampValue" in v) return new Date(v.timestampValue as string);
  if ("arrayValue" in v) {
    const arr = v.arrayValue as { values?: Record<string, unknown>[] };
    return (arr.values ?? []).map(decodeValue);
  }
  if ("mapValue" in v) {
    const map = v.mapValue as { fields?: Record<string, Record<string, unknown>> };
    return decodeFields(map.fields ?? {});
  }
  return null;
}

function decodeFields(fields: Record<string, Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeValue(v);
  }
  return out;
}

function docIdFromName(name: string): string {
  return name.split("/").pop() as string;
}

// ── Public API ────────────────────────────────────────────────────────────

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}

export async function getDoc(env: Env, collection: string, id: string): Promise<DocSnap> {
  const url = `${await baseUrl(env)}/${collection}/${encodeURIComponent(id)}`;
  const res = await fetch(url, { headers: await authHeaders(env) });
  if (res.status === 404) return { id, exists: false, data: () => undefined };
  if (!res.ok)
    throw new Error(`Firestore getDoc(${collection}/${id}) failed (${res.status}): ${await res.text()}`);
  const json = await res.json() as { fields?: Record<string, Record<string, unknown>> };
  return { id, exists: true, data: () => decodeFields(json.fields ?? {}) };
}

export async function addDoc(
  env: Env,
  collection: string,
  data: Record<string, unknown>
): Promise<{ id: string }> {
  const { name, transforms } = await patchOrCreate(env, `${await baseUrl(env)}/${collection}`, data, "POST");
  await applyTransforms(env, name, transforms);
  return { id: docIdFromName(name) };
}

export async function setDoc(
  env: Env,
  collection: string,
  id: string,
  data: Record<string, unknown>,
  options: { merge?: boolean } = {}
): Promise<void> {
  const url = `${await baseUrl(env)}/${collection}/${encodeURIComponent(id)}`;
  const fieldPaths = options.merge ? Object.keys(data) : undefined;
  const { name, transforms } = await patchOrCreate(env, url, data, "PATCH", fieldPaths);
  await applyTransforms(env, name, transforms);
}

export async function updateDoc(
  env: Env,
  collection: string,
  id: string,
  data: Record<string, unknown>
): Promise<void> {
  const url = `${await baseUrl(env)}/${collection}/${encodeURIComponent(id)}`;
  const { name, transforms } = await patchOrCreate(env, url, data, "PATCH", Object.keys(data));
  await applyTransforms(env, name, transforms);
}

async function patchOrCreate(
  env: Env,
  url: string,
  data: Record<string, unknown>,
  method: "POST" | "PATCH",
  fieldPaths?: string[]
): Promise<{ name: string; transforms: string[] }> {
  const transforms = Object.entries(data)
    .filter(([, v]) => v === SERVER_TIMESTAMP)
    .map(([k]) => k);

  let target = url;
  if (fieldPaths && fieldPaths.length > 0) {
    const qs = fieldPaths.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
    target += `?${qs}`;
  }

  const res = await fetch(target, {
    method,
    headers: await authHeaders(env),
    body: JSON.stringify({ fields: encodeFields(data) }),
  });
  if (!res.ok)
    throw new Error(`Firestore ${method} ${url} failed (${res.status}): ${await res.text()}`);
  const json = await res.json() as { name: string };
  return { name: json.name, transforms };
}

async function applyTransforms(env: Env, docName: string, fieldPaths: string[]): Promise<void> {
  if (fieldPaths.length === 0) return;
  const sa = getServiceAccount(env);
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents:commit`;
  const res = await fetch(commitUrl, {
    method: "POST",
    headers: await authHeaders(env),
    body: JSON.stringify({
      writes: [{
        transform: {
          document: docName,
          fieldTransforms: fieldPaths.map((fieldPath) => ({
            fieldPath,
            setToServerValue: "REQUEST_TIME",
          })),
        },
      }],
    }),
  });
  if (!res.ok)
    throw new Error(`Firestore serverTimestamp transform failed (${res.status}): ${await res.text()}`);
}

export interface WhereFilter {
  field: string;
  op: "EQUAL" | "IN";
  value: unknown;
}

export async function queryCollection(
  env: Env,
  collection: string,
  filters: WhereFilter[],
  limit?: number
): Promise<DocSnap[]> {
  const sa = getServiceAccount(env);
  const url = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents:runQuery`;

  const where =
    filters.length === 1
      ? fieldFilter(filters[0])
      : { compositeFilter: { op: "AND", filters: filters.map(fieldFilter) } };

  const structuredQuery: Record<string, unknown> = {
    from: [{ collectionId: collection }],
    where,
  };
  if (limit) structuredQuery.limit = limit;

  const res = await fetch(url, {
    method: "POST",
    headers: await authHeaders(env),
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok)
    throw new Error(`Firestore query on ${collection} failed (${res.status}): ${await res.text()}`);

  const rows = (await res.json()) as Array<{ document?: { name: string; fields?: Record<string, Record<string, unknown>> } }>;
  return rows
    .filter((r) => r.document)
    .map((r) => {
      const doc = r.document!;
      const id = docIdFromName(doc.name);
      const data = decodeFields(doc.fields ?? {});
      return { id, exists: true, data: () => data };
    });
}

function fieldFilter(f: WhereFilter) {
  if (f.op === "IN") {
    return {
      fieldFilter: {
        field: { fieldPath: f.field },
        op: "IN",
        value: { arrayValue: { values: (f.value as unknown[]).map(encodeValue) } },
      },
    };
  }
  return {
    fieldFilter: {
      field: { fieldPath: f.field },
      op: "EQUAL",
      value: encodeValue(f.value),
    },
  };
}
