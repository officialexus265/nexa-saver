import { useEffect, useState } from "react";

/** Renders a TOTP otpauth URI as a QR image (generated in-browser, no external API). */
export function TotpQr({ otpauthUri }: { otpauthUri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setErr(null);
    void (async () => {
      try {
        const QR = await import("qrcode");
        const url = await QR.toDataURL(otpauthUri, {
          width: 220,
          margin: 2,
          color: { dark: "#0a1f16", light: "#ffffff" },
          errorCorrectionLevel: "M",
        });
        if (!cancelled) setSrc(url);
      } catch (e) {
        if (!cancelled) setErr(String((e as Error).message || "Could not draw QR"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otpauthUri]);

  if (err) {
    return (
      <p className="rounded-xl border border-border bg-surface-2 p-3 text-center text-xs text-muted">
        QR could not be drawn ({err}). Use the secret below in your authenticator app (add account manually).
      </p>
    );
  }
  if (!src) {
    return (
      <div className="mx-auto grid size-[220px] place-items-center rounded-lg border border-border bg-white text-sm text-muted">
        Drawing QR…
      </div>
    );
  }
  return (
    <img
      src={src}
      alt="Authenticator QR code"
      width={220}
      height={220}
      className="mx-auto rounded-lg border border-border bg-white p-2"
    />
  );
}
