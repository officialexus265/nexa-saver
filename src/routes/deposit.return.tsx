import { useEffect, useMemo, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { errMessage } from "@/lib/nexa/errors";
import { verifyDeposit } from "@/lib/nexa/fns";
import { formatKwacha } from "@/lib/nexa/money";
import { cn } from "@/lib/utils";
import { LoadingStatus } from "@/components/ui/spinner";

function pickRef(search: Record<string, unknown>): string {
  for (const key of ["ref", "tx_ref", "txRef", "reference", "data_tx_ref"]) {
    const v = search[key];
    if (typeof v === "string" && v.trim().length >= 4) return v.trim();
  }
  return "";
}

function pickRefFromWindow(): string {
  if (typeof window === "undefined") return "";
  const q = new URLSearchParams(window.location.search);
  for (const key of ["ref", "tx_ref", "txRef", "reference", "data_tx_ref"]) {
    const v = q.get(key);
    if (v && v.trim().length >= 4) return v.trim();
  }
  return "";
}

export const Route = createFileRoute("/deposit/return")({
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
    <div className="nexa-shell grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">
          {state === "ok" ? "Deposit received" : state === "err" ? "Almost there" : "Checking payment"}
        </h1>
        {state === "pending" ? <LoadingStatus label={body} /> : <p className="mt-3 text-sm text-muted">{body}</p>}
        {ref ? <p className="mt-2 text-xs text-faint">Ref: {ref}</p> : null}
        <Link to="/dashboard" className={cn(buttonVariants(), "mt-6 w-full")}>
          Back to vault
        </Link>
      </div>
    </div>
  );
}
