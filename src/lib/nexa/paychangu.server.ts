import { env, isProduction } from "@/lib/env.server";
import { detectOperator, normalizeMwPhone, type MomoOperator } from "./phone";

const API = "https://api.paychangu.com";

/** Public operator refs (PayChangu Malawi). Live mode still fetches /mobile-money when possible. */
const FALLBACK_OPERATORS: Record<MomoOperator, string> = {
  airtel: "27494cb5-ba9e-437f-a114-4e7a7686bcca",
  tnm: "20be6c20-adeb-4b5b-a5ba-31678243cac7",
};

export function paychanguConfigured(): boolean {
  return Boolean(env("PAYCHANGU_SECRET_KEY"));
}

/**
 * Demo payments credit a deposit without any real money moving. They exist only
 * for local development and must be switched on explicitly
 * (`NEXA_DEMO_PAYMENTS=true`); they are never available in production builds
 * or when PayChangu is configured.
 */
export function demoPaymentsEnabled(): boolean {
  return !isProduction() && !paychanguConfigured() && env("NEXA_DEMO_PAYMENTS") === "true";
}

function secret(): string | undefined {
  return env("PAYCHANGU_SECRET_KEY");
}

async function paychanguFetch(path: string, init: RequestInit = {}) {
  const key = secret();
  if (!key) throw new Error("PayChangu is not configured");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (typeof json.message === "string" && json.message) ||
      (typeof json.error === "string" && json.error) ||
      `PayChangu request failed (${res.status})`;
    throw new Error(message);
  }
  return json;
}

export async function initiateHostedCheckout(input: {
  amountKwacha: number;
  email: string;
  firstName: string;
  lastName: string;
  txRef: string;
  callbackUrl: string;
  returnUrl: string;
  description: string;
}): Promise<{ checkoutUrl: string; txRef: string }> {
  const json = await paychanguFetch("/payment", {
    method: "POST",
    body: JSON.stringify({
      amount: String(Math.round(input.amountKwacha)),
      currency: "MWK",
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
      callback_url: input.callbackUrl,
      return_url: input.returnUrl,
      tx_ref: input.txRef,
      customization: {
        title: "NEXA-SAVER Deposit",
        description: input.description,
      },
    }),
  });
  const data = json.data as { checkout_url?: string } | undefined;
  const checkoutUrl = data?.checkout_url;
  if (!checkoutUrl) throw new Error("PayChangu did not return a checkout URL");
  return { checkoutUrl, txRef: input.txRef };
}

export async function verifyPayment(txRef: string): Promise<{
  ok: boolean;
  amount: number;
  status: string;
  txRef: string;
}> {
  const json = await paychanguFetch(`/verify-payment/${encodeURIComponent(txRef)}`);
  const data = json.data as
    | { amount?: number | string; status?: string; tx_ref?: string }
    | undefined;
  const status = String(data?.status ?? json.status ?? "").toLowerCase();
  const amount = Number(data?.amount ?? 0);
  const ok = status === "success" || status === "successful";
  return { ok, amount, status, txRef: String(data?.tx_ref ?? txRef) };
}

export async function operatorRefForPhone(phone: string): Promise<string> {
  const op = detectOperator(phone);
  if (!op) throw new Error("Enter a valid Airtel or TNM Malawi number");
  try {
    const json = await paychanguFetch("/mobile-money");
    const list = (json.data ?? json) as Array<{ name?: string; ref_id?: string }>;
    if (Array.isArray(list)) {
      const needle = op === "airtel" ? "airtel" : "tnm";
      const found = list.find((item) => String(item.name ?? "").toLowerCase().includes(needle));
      if (found?.ref_id) return found.ref_id;
    }
  } catch {
    /* fall through to known refs */
  }
  return FALLBACK_OPERATORS[op];
}

export async function initiateMomoPayout(input: {
  phone: string;
  amountKwacha: number;
  chargeId: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<{ chargeId: string; status: string }> {
  const mobile = normalizeMwPhone(input.phone);
  if (!mobile) throw new Error("Registered number is not a valid Malawi mobile");
  const operator = await operatorRefForPhone(mobile);
  const json = await paychanguFetch("/mobile-money/payouts/initialize", {
    method: "POST",
    body: JSON.stringify({
      mobile,
      mobile_money_operator_ref_id: operator,
      amount: String(Math.round(input.amountKwacha)),
      charge_id: input.chargeId,
      email: input.email,
      first_name: input.firstName,
      last_name: input.lastName,
    }),
  });
  const data = json.data as { transaction?: { status?: string; charge_id?: string } } | undefined;
  return {
    chargeId: data?.transaction?.charge_id ?? input.chargeId,
    status: String(data?.transaction?.status ?? json.status ?? "pending"),
  };
}

export function parseWebhookPayload(body: unknown): {
  eventType: string;
  status: string;
  txRef: string | null;
  chargeId: string | null;
  amount: number;
} {
  const rec = (body ?? {}) as Record<string, unknown>;
  return {
    eventType: String(rec.event_type ?? ""),
    status: String(rec.status ?? "").toLowerCase(),
    txRef: typeof rec.tx_ref === "string" ? rec.tx_ref : typeof rec.reference === "string" ? rec.reference : null,
    chargeId: typeof rec.charge_id === "string" ? rec.charge_id : null,
    amount: Number(rec.amount ?? 0),
  };
}
