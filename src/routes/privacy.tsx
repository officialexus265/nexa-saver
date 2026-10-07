import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";
import { getPublicFeePolicy } from "@/lib/nexa/fns";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  const [dep, setDep] = useState(6);

  useEffect(() => {
    void getPublicFeePolicy()
      .then((p) => setDep(p.depositFeePercent))
      .catch(() => undefined);
  }, []);

  return (
    <LegalLayout title="Privacy policy">
      <p className="text-sm text-muted">Last updated: October 2026.</p>

      <h2 className="font-display text-xl font-semibold">1. Data we collect</h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>Identity: name, date of birth, gender (if provided), username</li>
        <li>Contact: email, mobile number, optional bank payout details</li>
        <li>Security: password hash, PIN hash, security question and answer hash, lock preferences</li>
        <li>Money movement: deposits, withdrawals, fees (including the current deposit fee of about {dep}%), references</li>
        <li>Device/session data and authenticated page-visit counts for operations</li>
        <li>Support messages and survey responses you submit</li>
      </ul>

      <h2 className="font-display text-xl font-semibold">2. How we use data</h2>
      <p>
        To run your vault, verify payments, prevent fraud, enforce holds and limits, send security alerts, comply with
        law, and operate the service. We do not sell your personal information.
      </p>

      <h2 className="font-display text-xl font-semibold">3. Payment partners</h2>
      <p>
        PayChangu and similar processors receive payment data needed to collect or pay out. Their processing follows
        their own terms and privacy notices.
      </p>

      <h2 className="font-display text-xl font-semibold">4. Security of secrets</h2>
      <p>
        Passwords, PINs, and security answers are stored with one-way hashing. Plain-text PINs are not stored. Protect
        your devices and never share your PIN.
      </p>

      <h2 className="font-display text-xl font-semibold">5. Retention</h2>
      <p>
        Profile and wallet data last while your account is open. After deletion we remove profile access where feasible;
        ledger and audit records may be kept for reconciliation and legal holds.
      </p>

      <h2 className="font-display text-xl font-semibold">6. Your choices</h2>
      <p>
        Update contact details, lock preferences, and security settings in the app (subject to holds). Theme (day/night)
        is stored only on your device. Contact support for access questions.
      </p>

      <h2 className="font-display text-xl font-semibold">7. Children</h2>
      <p>The service is not directed at persons under 18.</p>

      <h2 className="font-display text-xl font-semibold">8. Contact</h2>
      <p>Use in-app help and the platform support channels published by the operator.</p>
    </LegalLayout>
  );
}
