import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { LoadingStatus } from "@/components/ui/spinner";
import { errMessage } from "@/lib/nexa/errors";
import { verifyDeposit } from "@/lib/nexa/fns";
import { formatKwacha } from "@/lib/nexa/money";
import { cn } from "@/lib/utils";

function pickRef(search: Record<string, unknown>): string | undefined {
  for (const k of ["ref", "tx_ref", "txRef", "reference", "transaction_id"]) {
    const v = search[k];
    if (typeof v === "string" && v.trim().length >= 4) return v.trim();
  }
  return undefined;
}

function pickRefFromWindow(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const q = new URLSearchParams(window.location.search);
    for (const k of ["ref", "tx_ref", "txRef", "reference", "transaction_id"]) {
      const v = q.get(k);
      if (v && v.trim().length >= 4) return v.trim();
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export const Route = createFileRoute("/deposit-return")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...search,
    ref: pickRef(search),
  }),
  component: DepositReturnPage,
});

function DepositReturnPage() {
  const search = Route.useSearch() as { ref?: string } & Record<string, unknown>;
  const ref = useMemo(() => {
    const fromSearch = typeof search.ref === "string" ? search.ref.trim() : "";
    if (fromSearch.length >= 4) return fromSearch;
    return pickRefFromWindow();
  }, [search]);

  const [state, setState] = useState<"pending" | "ok" | "err">("pending");
  const [body, setBody] = useState("Confirming your PayChangu payment…");
  const [details, setDetails] = useState<{
    grossTambala: number;
    feeTambala: number;
    creditedTambala: number;
    reference: string;
  } | null>(null);

  useEffect(() => {
    if (!ref) {
      setState("err");
      setBody(
        "Missing payment reference in the link. Open the vault and check Activity. If the deposit is still pending, contact support with the time and amount.",
      );
      return;
    }
    let cancelled = false;
    setState("pending");
    setBody("Confirming your PayChangu payment…");
    verifyDeposit({ data: { reference: ref } })
      .then((res) => {
        if (cancelled) return;
        setState("ok");
        setDetails({
          grossTambala: res.grossTambala,
          feeTambala: res.feeTambala,
          creditedTambala: res.creditedTambala,
          reference: ref,
        });
        setBody(
          `You deposited ${formatKwacha(res.grossTambala)}. Fee reserved for withdrawals: ${formatKwacha(res.feeTambala)}. Credited to your vault: ${formatKwacha(res.creditedTambala)}.`,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setState("err");
        setBody(
          errMessage(
            err,
            "Payment is not confirmed yet. If money left your mobile wallet, wait a minute and open the vault — or contact support with reference " +
              ref +
              ".",
          ),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center shadow-lg">
        <h1 className="font-display text-2xl font-semibold">
          {state === "ok" ? "Payment received" : state === "err" ? "Almost there" : "Checking payment"}
        </h1>

        {state === "pending" ? <LoadingStatus label={body} /> : null}

        {state === "ok" && details ? (
          <div className="mt-4 space-y-4 text-left">
            <p className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-center text-sm font-medium text-fg">
              Take a screenshot of this screen as proof of payment.
            </p>
            <dl className="space-y-2 rounded-xl border border-border bg-surface-2 p-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Status</dt>
                <dd className="font-medium text-primary">Success</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Amount paid</dt>
                <dd className="tabular-nums font-semibold">{formatKwacha(details.grossTambala)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Platform fee</dt>
                <dd className="tabular-nums">{formatKwacha(details.feeTambala)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Credited to vault</dt>
                <dd className="tabular-nums font-semibold text-primary">{formatKwacha(details.creditedTambala)}</dd>
              </div>
              <div className="space-y-1 border-t border-border pt-2">
                <dt className="text-muted">Reference</dt>
                <dd className="break-all font-mono text-xs">{details.reference}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Date</dt>
                <dd className="text-xs">{new Date().toLocaleString()}</dd>
              </div>
            </dl>
            <p className="text-center text-xs text-muted">
              Keep the screenshot until the money shows in the vault Activity list. Share the reference with support if anything looks wrong.
            </p>
          </div>
        ) : null}

        {state === "err" ? <p className="mt-3 text-sm text-muted">{body}</p> : null}
        {ref && state !== "ok" ? <p className="mt-2 text-xs text-faint">Ref: {ref}</p> : null}

        <Link to="/dashboard" className={cn(buttonVariants(), "mt-6 w-full")}>
          Back to vault
        </Link>
      </div>
    </div>
  );
}
