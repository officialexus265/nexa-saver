import type { Sql } from "@/lib/db";
import { detectOperator, type MomoOperator } from "@/lib/nexa/phone";

const KEY = "rail_outage_json";

export type RailOutage = {
  /** Master switch — when false, no notices and no blocks from this module. */
  enabled: boolean;
  airtelDown: boolean;
  tnmDown: boolean;
  /** All bank rails unavailable. */
  bankDown: boolean;
  /** Specific bank names marked down (matched case-insensitive against user bank name). */
  bankNamesDown: string[];
};

const DEFAULT: RailOutage = {
  enabled: false,
  airtelDown: false,
  tnmDown: false,
  bankDown: false,
  bankNamesDown: [],
};

export async function getRailOutage(sql: Sql): Promise<RailOutage> {
  try {
    const rows = await sql<{ value: string }>`
      select value from platform_settings where key = ${KEY} limit 1
    `;
    if (!rows[0]?.value) return { ...DEFAULT };
    const parsed = JSON.parse(rows[0].value) as Partial<RailOutage>;
    return {
      enabled: Boolean(parsed.enabled),
      airtelDown: Boolean(parsed.airtelDown),
      tnmDown: Boolean(parsed.tnmDown),
      bankDown: Boolean(parsed.bankDown),
      bankNamesDown: Array.isArray(parsed.bankNamesDown)
        ? parsed.bankNamesDown.map((s) => String(s).trim()).filter(Boolean)
        : [],
    };
  } catch {
    return { ...DEFAULT };
  }
}

export async function setRailOutage(sql: Sql, next: RailOutage): Promise<RailOutage> {
  const clean: RailOutage = {
    enabled: Boolean(next.enabled),
    airtelDown: Boolean(next.airtelDown),
    tnmDown: Boolean(next.tnmDown),
    bankDown: Boolean(next.bankDown),
    bankNamesDown: (next.bankNamesDown || [])
      .map((s) => String(s).trim())
      .filter(Boolean)
      .slice(0, 20),
  };
  const value = JSON.stringify(clean);
  await sql`
    insert into platform_settings (key, value, updated_at)
    values (${KEY}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;
  return clean;
}

/** User-facing templated notice (empty if master off or nothing down). */
export function buildRailOutageMessage(o: RailOutage): string {
  if (!o.enabled) return "";
  const parts: string[] = [];

  const bothMomo = o.airtelDown && o.tnmDown;
  if (bothMomo) {
    parts.push(
      "Airtel Money and TNM Mpamba are temporarily unavailable due to network issues. Please withdraw to bank if you can.",
    );
  } else if (o.airtelDown) {
    parts.push(
      "Airtel Money is temporarily unavailable due to network issues. Please use TNM Mpamba or bank transfer.",
    );
  } else if (o.tnmDown) {
    parts.push(
      "TNM Mpamba is temporarily unavailable due to network issues. Please use Airtel Money or bank transfer.",
    );
  }

  if (o.bankDown) {
    parts.push(
      "Bank withdrawals are temporarily unavailable due to network issues. Please use mobile money if it is available.",
    );
  } else if (o.bankNamesDown.length) {
    const names = o.bankNamesDown.join(", ");
    parts.push(
      `${names} ${o.bankNamesDown.length === 1 ? "is" : "are"} temporarily unavailable. Please use another bank if possible, or mobile money.`,
    );
  }

  return parts.join(" ");
}

export type RailOutagePublic = RailOutage & { message: string };

export async function getRailOutagePublic(sql: Sql): Promise<RailOutagePublic> {
  const o = await getRailOutage(sql);
  return { ...o, message: buildRailOutageMessage(o) };
}

/**
 * Block a withdraw that targets a rail currently marked down.
 * Call after method is known; pass user phone for MoMo and bank name for bank.
 */
export function assertRailAllowsWithdraw(
  o: RailOutage,
  method: "momo" | "bank",
  opts: { phone?: string | null; bankName?: string | null },
): void {
  if (!o.enabled) return;
  const msg = buildRailOutageMessage(o);

  if (method === "momo") {
    const op: MomoOperator | null = opts.phone ? detectOperator(opts.phone) : null;
    if (o.airtelDown && o.tnmDown) {
      throw new Error(msg || "Mobile money is temporarily unavailable. Please try bank transfer.");
    }
    if (op === "airtel" && o.airtelDown) {
      throw new Error(msg || "Airtel Money is temporarily unavailable. Please use TNM or bank.");
    }
    if (op === "tnm" && o.tnmDown) {
      throw new Error(msg || "TNM Mpamba is temporarily unavailable. Please use Airtel or bank.");
    }
    // Unknown operator but both partial — still allow if one works
  }

  if (method === "bank") {
    if (o.bankDown) {
      throw new Error(msg || "Bank withdrawals are temporarily unavailable. Please use mobile money.");
    }
    const name = (opts.bankName || "").trim().toLowerCase();
    if (name && o.bankNamesDown.some((n) => name.includes(n.toLowerCase()) || n.toLowerCase().includes(name))) {
      throw new Error(msg || `${opts.bankName} is temporarily unavailable. Try another bank or mobile money.`);
    }
  }
}
