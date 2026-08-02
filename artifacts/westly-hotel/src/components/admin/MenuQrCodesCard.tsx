import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, QrCode } from "lucide-react";

function QrBlock({
  title,
  description,
  url,
  filename,
}: {
  title: string;
  description: string;
  url: string;
  filename: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  const download = () => {
    const canvas = wrapperRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="flex flex-col items-center text-center gap-3 p-4 rounded-xl border border-border bg-muted/20 flex-1">
      <p className="font-semibold text-sm">{title}</p>
      <p className="text-xs text-muted-foreground -mt-2">{description}</p>
      <div ref={wrapperRef} className="bg-white p-3 rounded-lg border border-border">
        <QRCodeCanvas value={url} size={180} level="M" includeMargin />
      </div>
      <p className="text-xs text-muted-foreground break-all">{url}</p>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={download}>
        <Download className="w-3.5 h-3.5" /> Download PNG
      </Button>
    </div>
  );
}

export default function MenuQrCodesCard() {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const viewMenuUrl = `${origin}/menu`;
  const orderUrl = `${origin}/order`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <QrCode className="w-4 h-4" /> Digital Menu QR Codes
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Print and place these at tables or in rooms. Both links are permanent —
          they always load the current menu from this page, so you never need to
          reprint or regenerate them after adding, editing, or removing items.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col sm:flex-row gap-4">
        <QrBlock
          title="View Menu"
          description="Browse only — no ordering"
          url={viewMenuUrl}
          filename="westly-hotel-view-menu-qr.png"
        />
        <QrBlock
          title="Place Order"
          description="Browse and order directly from a phone"
          url={orderUrl}
          filename="westly-hotel-order-qr.png"
        />
      </CardContent>
    </Card>
  );
}
