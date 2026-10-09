import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";
import { getPublicLegalDoc } from "@/lib/nexa/fns";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  const [body, setBody] = useState<string | null>(null);

  useEffect(() => {
    void getPublicLegalDoc({ data: { kind: "terms" } })
      .then((r) => setBody(r.body))
      .catch(() => setBody("Unable to load terms right now."));
  }, []);

  return (
    <LegalLayout title="Terms of use">
      {!body ? <p className="text-sm text-muted">Loading…</p> : <LegalBody text={body} />}
    </LegalLayout>
  );
}

function LegalBody({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-4 text-sm leading-relaxed text-fg">
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="font-display text-xl font-semibold pt-2">
              {block.replace(/^##\s+/, "")}
            </h2>
          );
        }
        if (block.startsWith("# ")) {
          return (
            <h2 key={i} className="font-display text-xl font-semibold pt-2">
              {block.replace(/^#\s+/, "")}
            </h2>
          );
        }
        return (
          <p key={i} className="text-muted whitespace-pre-wrap">
            {block}
          </p>
        );
      })}
    </div>
  );
}
