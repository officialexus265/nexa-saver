import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  return (
    <LegalLayout title="Terms of use">
      <p>
        NEXA-SAVER is a private savings vault denominated in Malawi kwacha. By creating an account you confirm you are at
        least 18 years old and that the identity, phone number, and PIN you provide are yours.
      </p>
      <p>
        You must keep your password, 4-digit PIN, and security answer secret. NEXA-SAVER will never ask for your PIN by
        email or SMS. Five minutes of inactivity locks the vault behind that PIN. Thirty days of inactivity ends the
        session completely.
      </p>
      <p>
        Withdrawals are sent only to the mobile number registered at sign-up. Deposits may be paid from any supported
        Airtel Money or TNM Mpamba number.
      </p>
      <p>
        Deleting an account is permanent. Remaining funds cannot be recovered after the three-step deletion is completed.
        Withdraw first.
      </p>
    </LegalLayout>
  );
}
