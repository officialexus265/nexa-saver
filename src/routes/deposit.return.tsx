import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { errMessage } from "@/lib/nexa/errors";
import { verifyDeposit } from "@/lib/nexa/fns";
import { formatKwacha } from "@/lib/nexa/money";
import { cn } from "@/lib/utils";
import { LoadingStatus } from "@/components/ui/spinner";

export const Route = createFileRoute("/deposit/return")({
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search.ref === "string" ? search.ref : "",
  }),
  component: DepositReturnPage,
});

function DepositReturnPage() {
  const { ref } = Route.useSearch();
  const [state, setState] = useState<"pending" | "ok" | "err">("pending");
  const [body, setBody] = useState("Confirming your PayChangu payment…");

  useEffect(() => {
    if (!ref) {
      setState("err");
      setBody("Missing payment reference.");
      return;
    }
    verifyDeposit({ data: { reference: ref } })
      .then((res) => {
        setState("ok");
        setBody(
          `You deposited ${formatKwacha(res.grossTambala)} but the system has taken ${formatKwacha(res.feeTambala)} to reserve it as a future withdrawal fee. ${formatKwacha(res.creditedTambala)} is now yours.`,
        );
      })
      .catch((err) => {
        setState("err");
        setBody(
          errMessage(
            err,
            "Payment is not confirmed yet. If you were charged, wait a moment and open the vault.",
          ),
        );
      });
  }, [ref]);

  return (
    <div className="nexa-shell grid min-h-dvh place-items-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 text-center">
        <h1 className="font-display text-2xl font-semibold">
          {state === "ok" ? "Deposit received" : state === "err" ? "Almost there" : "Checking payment"}
        </h1>
        {state === "pending" ? <LoadingStatus label={body} /> : <p className="mt-3 text-sm text-muted">{body}</p>}
        <Link to="/dashboard" className={cn(buttonVariants(), "mt-6 w-full")}>
          Back to vault
        </Link>
      </div>
    </div>
  );
}
