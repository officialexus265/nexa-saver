import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/conditions")({ component: ConditionsPage });

function ConditionsPage() {
  return (
    <LegalLayout title="Terms and conditions">
      <p>
        Every deposit is charged 6% at the moment of collection. That 6% is described to you as a future withdrawal fee.
        Internally, 3% is platform profit and 3% is reserved to cover mobile-money payout costs (including PayChangu rail
        fees).
      </p>
      <p>
        Your available balance is the amount credited after the 6% deduction. You may not withdraw more than that
        displayed balance. A successful withdrawal sends the full displayed amount to your registered number. The
        reserved 3% covers the payout fee so you are not charged again on the way out.
      </p>
      <p>
        Example: you deposit 100 kwacha. NEXA-SAVER retains 6 kwacha. 94 kwacha is yours. When you withdraw 94 kwacha, 3
        kwacha of the original retention covers the payout rail and 3 kwacha remains platform profit.
      </p>
      <p>
        Payments are processed by PayChangu. Settlements depend on mobile network operators and may take a short time to
        complete.
      </p>
      <p>
        NEXA-SAVER may refuse, delay, or reverse a movement that fails operator checks, appears fraudulent, or exceeds
        available merchant float.
      </p>
    </LegalLayout>
  );
}
