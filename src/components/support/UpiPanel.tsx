"use client";

import Image from "next/image";
import { useRef, useState } from "react";

/**
 * The VPA arrives as a prop rather than being imported from constants so that
 * no server-side env reads end up in the client bundle.
 */
export default function UpiPanel({ vpa }: { vpa: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "manual">("idle");
  const vpaRef = useRef<HTMLElement>(null);

  async function copyVpa() {
    try {
      await navigator.clipboard.writeText(vpa);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      /*
       * The Clipboard API is unavailable on insecure origins and restricted in
       * several in-app browsers (WhatsApp and Instagram webviews especially).
       * Select the ID so the user can long-press and copy by hand — a button
       * that silently does nothing is worse than no button.
       */
      const el = vpaRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setStatus("manual");
      setTimeout(() => setStatus("idle"), 6000);
    }
  }

  return (
    <div className="card p-6">
      <div className="flex flex-col items-center gap-5">
        <Image
          src="/upi-qr.png"
          alt={`UPI QR code for ${vpa}`}
          width={200}
          height={200}
          className="rounded-lg border border-line bg-white"
          unoptimized
        />
        <p className="text-sm text-muted -mt-2">Scan with any UPI app</p>

        <div className="w-full max-w-sm">
          <p className="label">Or use the UPI ID</p>
          <div className="flex items-stretch gap-2">
            <code
              ref={vpaRef}
              className="flex-1 min-w-0 truncate rounded-lg border border-line bg-background px-3 text-sm font-mono flex items-center"
            >
              {vpa}
            </code>
            <button
              type="button"
              onClick={copyVpa}
              className="btn-secondary min-h-11 shrink-0"
            >
              {status === "copied"
                ? "Copied"
                : status === "manual"
                  ? "Selected"
                  : "Copy"}
            </button>
          </div>
          {status === "manual" && (
            <p className="help" role="status">
              Your browser blocked the clipboard. The ID is selected — long-press
              or right-click it to copy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
