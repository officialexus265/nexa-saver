import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy">
      <p>
        We store your name, email, phone number, date of birth, username, hashed password, hashed PIN, hashed security
        answer, and the ledger of your deposits and withdrawals. PINs and security answers are stored with a one-way hash.
        We never store them in plain text.
      </p>
      <p>
        PayChangu processes collection and payout data (amount, phone, name, email, transaction reference) as an
        independent payment processor. We do not sell your personal information.
      </p>
      <p>
        Sessions last while you are active, up to thirty days of inactivity. After five minutes idle we only ask for your
        PIN. After thirty days idle we require a full sign-in.
      </p>
      <p>
        When you delete your account we remove your profile, wallet, sessions, and ledger from our database. Payment
        processor records may remain with PayChangu as required by financial regulation.
      </p>
    </LegalLayout>
  );
}
