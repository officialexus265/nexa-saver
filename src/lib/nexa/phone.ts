/** Malawi mobile money numbers (Airtel 09x, TNM 08x). */

export type MomoOperator = "airtel" | "tnm";

export function normalizeMwPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, "");
  let local = digits;
  if (local.startsWith("265")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  if (!/^[89]\d{8}$/.test(local)) return null;
  return `0${local}`;
}

export function detectOperator(phone: string): MomoOperator | null {
  const n = normalizeMwPhone(phone);
  if (!n) return null;
  if (n.startsWith("09")) return "airtel";
  if (n.startsWith("08")) return "tnm";
  return null;
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizeMwPhone(phone) ?? phone;
  if (n.length === 10) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  return n;
}

export function operatorLabel(op: MomoOperator | null): string {
  if (op === "airtel") return "Airtel Money";
  if (op === "tnm") return "TNM Mpamba";
  return "Mobile money";
}
