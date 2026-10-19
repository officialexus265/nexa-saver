import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { SessionGate } from "@/components/session-gate";
import { Button } from "@/components/ui/button";
import { errMessage } from "@/lib/nexa/errors";
import { listTransactions } from "@/lib/nexa/fns";
import { formatKwacha } from "@/lib/nexa/money";
import { useT } from "@/lib/i18n/client";
import type { PublicTx } from "@/lib/nexa/types";
import { Modal } from "@/components/modal";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});

const PAGE_SIZE = 5;

function ActivityPage() {
  return (
    <SessionGate>
      {() => <ActivityList />}
    </SessionGate>
  );
}

function ActivityList() {
  const { t } = useT();
  const [txs, setTxs] = useState<PublicTx[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [selectedTx, setSelectedTx] = useState<PublicTx | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await listTransactions();
      setTxs(rows);
      setError(null);
    } catch (e) {
      setError(errMessage(e));
      setTxs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const total = txs?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages - 1);
  const slice = txs ? txs.slice(pageSafe * PAGE_SIZE, pageSafe * PAGE_SIZE + PAGE_SIZE) : [];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">
            <Link to="/dashboard" className="hover:text-primary">
              {t("nav.home")}
            </Link>
            {" / "}
            {t("dash.activity")}
          </p>
          <h1 className="font-display text-2xl font-semibold">{t("dash.activityAll")}</h1>
        </div>
      </div>

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      {txs === null ? (
        <p className="text-sm text-muted">{t("dash.loadingActivity")}</p>
      ) : !txs.length ? (
        <p className="text-sm text-muted">{t("dash.noActivity")}</p>
      ) : (
        <>
          <ul className="space-y-2">
            {slice.map((tx) => (
              <li key={tx.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 text-left transition hover:border-primary/40 hover:bg-surface-2"
                >
                  <div>
                    <p className="text-sm font-medium capitalize">
                      {tx.kind === "transfer_out"
                        ? "Sent"
                        : tx.kind === "transfer_in"
                          ? t("dash.received")
                          : tx.kind.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted">
                      {tx.status} · {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    {tx.kind === "deposit" || tx.kind === "transfer_in" ? "+" : "−"}
                    {formatKwacha(
                      tx.kind === "deposit" || tx.kind === "transfer_in"
                        ? tx.creditedTambala || tx.grossTambala
                        : tx.kind === "transfer_out"
                          ? tx.grossTambala + (tx.sendFeeTambala ?? 0)
                          : tx.grossTambala,
                      { compact: true },
                    )}
                  </p>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-xs"
              disabled={pageSafe <= 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              {t("dash.prevPage")}
            </Button>
            <p className="text-xs text-muted">
              {pageSafe + 1} / {totalPages}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="h-9 px-3 text-xs"
              disabled={pageSafe >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              {t("dash.nextPage")}
            </Button>
          </div>
        </>
      )}

      {selectedTx ? (
        <Modal open onClose={() => setSelectedTx(null)} title={selectedTx.kind.replace("_", " ")}>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("dash.status")}</dt>
              <dd className="capitalize">{selectedTx.status}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("dash.amount")}</dt>
              <dd className="tabular-nums">{formatKwacha(selectedTx.grossTambala)}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted">{t("dash.reference")}</dt>
              <dd className="break-all font-mono text-xs">{selectedTx.reference}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">{t("dash.date")}</dt>
              <dd className="text-xs">{new Date(selectedTx.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          <Button type="button" className="mt-4 w-full" onClick={() => setSelectedTx(null)}>
            {t("common.close")}
          </Button>
        </Modal>
      ) : null}
    </div>
  );
}
