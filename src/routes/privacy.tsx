import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy">
      <p className="text-sm text-muted">Last updated: October 2026.</p>

      <h2 className="font-display text-xl font-semibold">1. Data we collect</h2>
      <p>We process:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>Identity: name, date of birth, gender (if provided), username</li>
        <li>Contact: email, mobile number, optional bank payout details</li>
        <li>Security: password hash, PIN hash, security question and answer hash, lock preferences</li>
        <li>Money movement: deposits, withdrawals, fees, references, statuses, amounts</li>
        <li>Device/session: session tokens, approximate activity times, user agent / IP where provided by the stack</li>
        <li>Product analytics: authenticated page paths and hit counts for operations (not sold as advertising data)</li>
        <li>Support: messages and survey responses you submit</li>
      </ul>

      <h2 className="font-display text-xl font-semibold">2. How we use data</h2>
      <p>
        To run your vault, verify deposits and withdrawals, prevent fraud and abuse, enforce holds and limits, send
        security alerts (e.g. new device, PIN or phone change), comply with law, and improve reliability. We do not sell
        your personal information.
      </p>

      <h2 className="font-display text-xl font-semibold">3. Payment partners</h2>
      <p>
        PayChangu and similar processors receive payment data needed to collect or pay out (amount, phone, name, email,
        references). Their processing is under their own terms and privacy notices as independent controllers or
        processors of payment data.
      </p>

      <h2 className="font-display text-xl font-semibold">4. Security of secrets</h2>
      <p>
        Passwords, PINs, and security answers are stored with one-way hashing (and platform-specific hardening where
        configured). Plain-text PINs are not stored. No system is perfectly secure; protect your devices and never share
        your PIN.
      </p>

      <h2 className="font-display text-xl font-semibold">5. Retention</h2>
      <p>
        Profile and wallet data last while your account is open. After deletion we remove profile access and personal
        identifiers where feasible; ledger rows may be kept for audit, reconciliation, and legal holds. Security and
        admin action logs may be retained longer when needed for investigations.
      </p>

      <h2 className="font-display text-xl font-semibold">6. Your choices</h2>
      <p>
        You can update phone, bank payout details, lock preferences, and security question in the app (subject to holds
        and verification rules). You may request support contact for access or correction questions. Closing the account
        follows the in-app deletion flow.
      </p>

      <h2 className="font-display text-xl font-semibold">7. Children</h2>
      <p>The service is not directed at persons under 18.</p>

      <h2 className="font-display text-xl font-semibold">8. Contact</h2>
      <p>Use in-app help and the platform support channels published by the operator.</p>
    </LegalLayout>
  );
}
