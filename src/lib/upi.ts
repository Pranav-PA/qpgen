/**
 * UPI deep links. Safe to import from client components — no secrets, no
 * server-only dependencies.
 */

export function upiPayUrl(opts: {
  vpa: string;
  payee: string;
  /** Rupees. Omit to let the payer choose in their UPI app. */
  amount?: number;
  note?: string;
}): string {
  const parts = [
    `pa=${encodeURIComponent(opts.vpa)}`,
    `pn=${encodeURIComponent(opts.payee)}`,
    "cu=INR",
  ];
  if (opts.amount) parts.push(`am=${opts.amount}`);
  if (opts.note) parts.push(`tn=${encodeURIComponent(opts.note)}`);
  // `@` is put back after encoding: that is the form real UPI QR payloads use,
  // and some apps fail to resolve the escaped %40 variant.
  return `upi://pay?${parts.join("&")}`.replace(/%40/g, "@");
}

export function formatInr(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}
