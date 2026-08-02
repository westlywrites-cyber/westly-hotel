import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { uploadImage, deleteImageByUrl, type ImageFolder } from "@/lib/storage";
import { ImagePlus, Loader2, X } from "lucide-react";

interface ImageUploadMultiProps {
  values: string[];
  onChange: (urls: string[]) => void;
  folder: ImageFolder;
  label?: string;
}

/** Multi-image variant (for the Rooms gallery) — same upload path, array of URLs. */
export default function ImageUploadMulti({ values, onChange, folder, label = "images" }: ImageUploadMultiProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        try {
          uploaded.push(await uploadImage(file, folder));
        } catch (err: any) {
          toast({ title: "Upload failed", description: `${file.name}: ${err.message}`, variant: "destructive" });
        }
      }
      if (uploaded.length) onChange([...values, ...uploaded]);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(url: string) {
    deleteImageByUrl(url);
    onChange(values.filter((u) => u !== url));
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button type="button" variant="outline" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        Upload {label}
      </Button>
      {values.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {values.map((url, i) => (
            <div key={url} className="relative group rounded-lg overflow-hidden border border-border h-20">
              <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.opacity = "0.2")} />
              {i === 0 && (
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5">Cover</span>
              )}
              <button
                type="button"
                onClick={() => removeAt(url)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">The first image is used as the cover photo shown in room listings.</p>
    </div>
  );
}
