// Adapter so Cloudflare-Workers-style `env: Env` code works unchanged in Node.js.
// Instead of `context.env.FIREBASE_SERVICE_ACCOUNT_KEY` the functions call getEnv().

export interface Env {
  FIREBASE_SERVICE_ACCOUNT_KEY: string;
  FIREBASE_FCM_SERVER_KEY?: string;
  [key: string]: unknown;
}

export function getEnv(): Env {
  return process.env as unknown as Env;
}
