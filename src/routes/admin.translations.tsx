import { createFileRoute } from "@tanstack/react-router";
import { SessionGate } from "@/components/session-gate";
import { TranslationStudio } from "@/components/translation-studio";

export const Route = createFileRoute("/admin/translations")({
  component: AdminTranslationsPage,
});

function AdminTranslationsPage() {
  return (
    <SessionGate admin>
      {() => <TranslationStudio />}
    </SessionGate>
  );
}
