import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  return (
    <LegalLayout title="Terms of use">
      <p className="text-sm text-muted">Last updated: October 2026. Malawi kwacha (MWK) only.</p>

      <h2 className="font-display text-xl font-semibold">1. Who we are</h2>
      <p>
        NEXA-SAVER is a private digital savings vault. It is not a bank and does not take deposits under a banking
        licence. Balances are recorded on our ledger; collection and payout of mobile money and bank transfers are
        processed by independent payment partners (including PayChangu).
      </p>

      <h2 className="font-display text-xl font-semibold">2. Eligibility</h2>
      <p>
        You must be at least 18 years old, provide accurate identity details, and use a phone number and email you
        control. One person may not open multiple accounts to evade limits, holds, or security rules.
      </p>

      <h2 className="font-display text-xl font-semibold">3. Account security</h2>
      <p>
        You are responsible for your password, 4-digit withdrawal PIN, security question answer, and device access. We
        never ask for your PIN by email or SMS. Hashed secrets are stored; we cannot recover a forgotten PIN without your
        security answer (which starts a temporary withdrawal hold). Sessions expire after long inactivity; optional vault
        lock settings control when the PIN screen appears again.
      </p>

      <h2 className="font-display text-xl font-semibold">4. Deposits</h2>
      <p>
        Deposits are accepted through supported channels (e.g. Airtel Money, TNM Mpamba) via our payment partner. A
        platform fee is deducted from the gross amount at deposit time; the remaining credited amount is what appears in
        your vault. Fees and splits are shown before you pay. Successful deposits may verify your registered withdrawal
        number when the payer number matches.
      </p>
      <p>
        Network or partner delays can leave a deposit pending. Contact support with your reference; we reconcile against
        partner records. We do not invent balances that the payment partner has not confirmed as successful.
      </p>

      <h2 className="font-display text-xl font-semibold">5. Withdrawals</h2>
      <p>
        Withdrawals go only to your registered mobile number (after verification rules) or to bank details you saved for
        payouts. Daily limits, new-account holds, PIN-reset holds, and phone/bank change holds may apply. Bank payouts
        may include a fixed rail fee charged by the payment channel (not a NEXA “surprise” fee); you accept that amount
        before confirming.
      </p>

      <h2 className="font-display text-xl font-semibold">6. Voluntary withdrawal time-lock (commitment)</h2>
      <p>
        You may lock withdrawals for a chosen period (up to five years). While locked you may still deposit; you cannot
        withdraw until the unlock date unless you end the lock early under these rules:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Cooling-off (48 hours)</strong> from when the lock starts: cancel or adjust free. This covers honest
          mistakes (wrong unit or period).
        </li>
        <li>
          <strong>After cooling-off</strong>, ending the lock early or shortening it is an early unlock. A fee is taken
          from your vault balance. The fee is calculated by the system from remaining time and balance (base scale about
          3% of balance × remaining fraction of the original lock, capped at 5% of balance). Unlocking a short time early
          costs less than unlocking years early.
        </li>
        <li>
          <strong>Extending</strong> the lock is free (within the five-year maximum).
        </li>
        <li>
          Locks of about two years or longer require an extra confirmation at set time.
        </li>
        <li>
          After cooling-off, fee amounts are not waived by informal admin discretion. Exception paths (e.g. documented
          emergency policy) must be logged if ever used.
        </li>
      </ul>
      <p>
        The confirmation screen shows the unlock date and, when relevant, the early-unlock fee estimate. Setting a lock
        is a deliberate commitment feature, not a trap; fees exist so early exit is priced fairly for the platform’s risk
        of holding committed balances.
      </p>

      <h2 className="font-display text-xl font-semibold">7. Platform and admin controls</h2>
      <p>
        We may pause deposits or withdrawals system-wide for security or partner outages. We may lock an entire account
        or withdrawals only where there is suspected compromise, fraud, legal process, or policy breach. Withdrawal-only
        locks still allow deposits. You will see a message and a way to contact support (e.g. WhatsApp on the platform
        number).
      </p>

      <h2 className="font-display text-xl font-semibold">8. Fees and profit</h2>
      <p>
        Deposit fees fund operations, payment-partner costs, and platform continuity. Early-unlock fees (section 6) are
        separate and only apply when you choose to break a voluntary time-lock after cooling-off. Partner payout fees
        (e.g. mobile money percentage or bank flat amounts) are charged by the rail and disclosed where they affect what
        you receive.
      </p>

      <h2 className="font-display text-xl font-semibold">9. Closing your account</h2>
      <p>
        Account deletion requires multiple confirmations and your PIN. Withdraw available funds first. After deletion,
        profile access ends; some transaction records may be retained for audit, dispute, and legal obligations. Payment
        partners may retain their own records as required by law.
      </p>

      <h2 className="font-display text-xl font-semibold">10. Liability</h2>
      <p>
        We aim to keep the service available and balances accurate against confirmed partner events. We are not liable
        for losses from sharing your PIN or password, using a compromised device, partner network failures outside our
        control, or incorrect destination details you supplied. Nothing in these terms excludes liability that cannot be
        excluded under applicable Malawian law.
      </p>

      <h2 className="font-display text-xl font-semibold">11. Changes</h2>
      <p>
        We may update these terms. Material changes to fees or lock rules will be reflected in the product UI and this
        page. Continued use after changes means you accept the updated terms.
      </p>

      <h2 className="font-display text-xl font-semibold">12. Contact</h2>
      <p>
        Use in-app help lines and the platform support number set by the operator for disputes, unlock requests after
        cooling-off, and security reports.
      </p>
    </LegalLayout>
  );
}
