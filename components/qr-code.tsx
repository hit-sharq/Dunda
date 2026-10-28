"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QrCode({ url, size = 160 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: size, margin: 2 }, (err, url) => {
      if (!err) setDataUrl(url);
    });
  }, [url, size]);

  if (!dataUrl) {
    return (
      <div className="flex h-32 w-32 items-center justify-center border border-dashed rounded-lg bg-[hsl(var(--app-surface))]">
        <span className="text-[10px] text-[hsl(var(--app-faint))]">QR…</span>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR code"
      className={`w-${size / 4} h-${size / 4}`}
      loading="lazy"
    />
  );
}
