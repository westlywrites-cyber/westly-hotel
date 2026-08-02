import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadImage, deleteImageByUrl, type ImageFolder } from "@/lib/storage";
import { ImageOff, Loader2, Upload, X } from "lucide-react";

interface ImageUploadProps {
  /** Current image URL (stored in the same field the app already uses, e.g. `image`, `photoUrl`). */
  value: string;
  onChange: (url: string) => void;
  /** Which folder in the "westly-media" Supabase Storage bucket this upload belongs to. */
  folder: ImageFolder;
  label?: string;
  className?: string;
  /** Aspect/height class for the preview box, e.g. "h-32" (default) or "h-20". */
  previewClassName?: string;
}

/**
 * Drop-in replacement for a "paste an image URL" text field. Uploads
 * directly to Supabase Storage and stores the resulting public URL via
 * onChange — the caller keeps treating it as a plain string field.
 */
export default function ImageUpload({
  value,
  onChange,
  folder,
  label = "Image",
  className = "",
  previewClassName = "h-32",
}: ImageUploadProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, folder);
      // Replacing an existing upload — best-effort cleanup of the old file.
      if (value) deleteImageByUrl(value);
      onChange(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {value ? (
        <div className={`relative group rounded-lg overflow-hidden border border-border ${previewClassName}`}>
          <img src={value} alt={label} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => { deleteImageByUrl(value); onChange(""); }}
              disabled={uploading}
            >
              <X className="w-3.5 h-3.5" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`w-full ${previewClassName} rounded-lg border border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-60`}
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs">Uploading…</span>
            </>
          ) : (
            <>
              <ImageOff className="w-5 h-5 opacity-40" />
              <span className="text-xs flex items-center gap-1"><Upload className="w-3 h-3" /> Upload {label.toLowerCase()}</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
