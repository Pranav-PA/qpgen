"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { upiPayUrl, formatInr } from "@/lib/upi";

const PRESETS = [100, 250, 500];

/**
 * The VPA arrives as a prop rather than being imported from constants so that
 * no server-side env reads end up in the client bundle.
 */
export default function UpiPanel({
  vpa,
  payeeName,
}: {
  vpa: string;
  payeeName: string;
}) {
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

  const link = (amount?: number) =>
    upiPayUrl({ vpa, payee: payeeName, amount, note: "QPGen" });

  return (
    <div className="card p-6">
      <div className="grid sm:grid-cols-[auto_1fr] gap-6 items-start">
        {/* QR: the desktop path — scan it with the phone in your hand. */}
        <div className="order-2 sm:order-1 mx-auto sm:mx-0">
          <Image
            src="/upi-qr.png"
            alt={`UPI QR code for ${vpa}`}
            width={180}
            height={180}
            className="rounded-lg border border-line bg-white"
            unoptimized
          />
          <p className="text-xs text-muted text-center mt-2">
            Scan with any UPI app
          </p>
        </div>

        <div className="order-1 sm:order-2 min-w-0">
          {/* Mobile path: you cannot scan a QR that is on the same screen. */}
          <p className="label">On your phone</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {/* Sized for thumbs: this is the primary path on a phone. */}
            {PRESETS.map((amount) => (
              <a
                key={amount}
                href={link(amount)}
                className="btn-secondary min-h-11 px-5"
              >
                {formatInr(amount)}
              </a>
            ))}
            <a href={link()} className="btn-secondary min-h-11 px-5">
              Any amount
            </a>
          </div>
          <p className="help mb-5">
            Opens GPay, PhonePe, Paytm or whichever UPI app you have. These
            buttons only work on a phone.
          </p>

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
