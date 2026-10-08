import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";
import { getPublicFeePolicy } from "@/lib/nexa/fns";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  const [fees, setFees] = useState({
    depositFeePercent: 6,
    earlyUnlockBasePercent: 3,
    earlyUnlockCapPercent: 3,
  });

  useEffect(() => {
    void getPublicFeePolicy()
      .then((p) =>
        setFees({
          depositFeePercent: p.depositFeePercent,
          earlyUnlockBasePercent: p.earlyUnlockBasePercent,
          earlyUnlockCapPercent: p.earlyUnlockCapPercent,
        }),
      )
      .catch(() => undefined);
  }, []);

  const dep = fees.depositFeePercent;
  const unlockBase = fees.earlyUnlockBasePercent;
  const unlockCap = fees.earlyUnlockCapPercent;

  return (
    <LegalLayout title="Terms of use">
      <p className="text-sm text-muted">
        Last updated: October 2026. Malawi kwacha (MWK) only. Fee percentages below update automatically when the
        platform operator changes them in admin settings.
      </p>

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
        Deposits are accepted through supported channels via our payment partner. A platform fee of{" "}
        <strong className="text-fg">{dep}%</strong> of the gross deposit is deducted at deposit time; the remaining
        credited amount is what appears in your vault. The current percentage is set by the operator and is shown in the
        app before you pay. Successful deposits may verify your registered withdrawal number when the payer number
        matches.
      </p>
      <p>
        Network or partner delays can leave a deposit pending. Contact support with your reference; we reconcile against
        partner records. We do not invent balances that the payment partner has not confirmed as successful.
      </p>

      <h2 className="font-display text-xl font-semibold">5. Withdrawals</h2>
      <p>
        Withdrawals go only to your registered mobile number (after verification rules) or to bank details you saved for
        payouts. Daily limits, new-account holds, PIN-reset holds, and phone/bank change holds may apply. Bank payouts
        may include a fixed rail fee charged by the payment channel; you accept that amount before confirming.
      </p>

      <h2 className="font-display text-xl font-semibold">6. Voluntary withdrawal time-lock (commitment)</h2>
      <p>
        You may lock withdrawals for a chosen period (up to five years). While locked you may still deposit; you cannot
        withdraw until the unlock date unless you end the lock early under these rules:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>Cooling-off (48 hours)</strong> from when the lock starts: cancel or adjust free.
        </li>
        <li>
          <strong>After cooling-off</strong>, ending the lock early is charged a fee taken from your vault. The fee rate
          is about <strong className="text-fg">{unlockBase}%</strong> of balance × (time left ÷ original lock length),
          and never more than <strong className="text-fg">{unlockCap}%</strong> of balance. These percentages are
          controlled by the operator and always match what the app shows at unlock time.
        </li>
        <li>
          <strong>Extending</strong> the lock is free (within the five-year maximum).
        </li>
        <li>Locks of about two years or longer require an extra confirmation at set time.</li>
        <li>
          After cooling-off, fee amounts are calculated by the system; they are not waived by informal admin discretion.
        </li>
      </ul>

      <h2 className="font-display text-xl font-semibold">7. Platform and admin controls</h2>
      <p>
        We may pause deposits or withdrawals system-wide for security or partner outages. We may lock an entire account
        or withdrawals only where there is suspected compromise, fraud, legal process, or policy breach. Withdrawal-only
        locks still allow deposits. Contact support via the platform number when shown.
      </p>

      <h2 className="font-display text-xl font-semibold">8. Fees</h2>
      <p>
        Current deposit fee: <strong className="text-fg">{dep}%</strong> of gross. Early-unlock base scale:{" "}
        <strong className="text-fg">{unlockBase}%</strong>, maximum{" "}
        <strong className="text-fg">{unlockCap}%</strong> of balance. Partner rail fees (mobile money % or bank flat
        amounts) are separate and disclosed in the product. Operator changes to these platform fees update this page and
        the in-app displays together.
      </p>

      
      <h2 className="font-display text-xl font-semibold">Send money (peer transfer)</h2>
      <p>
        You may send kwacha to another registered NEXA-SAVER account using their verified mobile number. The system shows
        the recipient&apos;s registered full name for confirmation before you authorise with your PIN. If the number is not
        linked to an account, the send is refused.
      </p>
      <p>
        The amount you enter is delivered in full to the recipient (no cut from the send amount). A separate fixed send fee
        is taken from your balance according to platform tiers published in the app and configurable by the operator. Send
        is unavailable when withdrawals are paused, when your account is withdraw-locked, or when a voluntary time-lock is
        active.
      </p>
      <p>
        If you send to the wrong person, use Request reversal on the transaction and contact support with the transaction
        ID. An admin may freeze the transfer for a limited period (typically two days) and notify the recipient by email
        that the funds are under review. The platform may arrange a mediated call between both parties. Resolution may be
        a full return to the sender or release to the recipient. Send fees already taken are not automatically refunded.
        Do not use send for illegal purposes.
      </p>
<h2 className="font-display text-xl font-semibold">9. Closing your account</h2>
      <p>
        Account deletion requires multiple confirmations and your PIN. Withdraw available funds first. After deletion,
        profile access ends; some transaction records may be retained for audit and legal obligations.
      </p>

      <h2 className="font-display text-xl font-semibold">10. Liability</h2>
      <p>
        We aim to keep balances accurate against confirmed partner events. We are not liable for losses from sharing your
        PIN or password, compromised devices, partner network failures outside our control, or incorrect destination
        details you supplied. Liability that cannot be excluded under applicable Malawian law is not excluded.
      </p>

      <h2 className="font-display text-xl font-semibold">11. Changes</h2>
      <p>
        We may update these terms and fee settings. Fee figures on this page are live. Continued use after changes means
        you accept the updated terms and published fees.
      </p>

      <h2 className="font-display text-xl font-semibold">12. Contact</h2>
      <p>Use in-app help lines and the platform support number set by the operator.</p>
    </LegalLayout>
  );
}
