import type { LoginPref } from "./constants";

export type PublicProfile = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  phoneVerified?: boolean;
  lockMode?: "instant" | "idle" | "off";
  lockIdleMinutes?: number;
  username: string;
  dateOfBirth: string;
  gender?: "female" | "male" | "other" | "prefer_not_to_say" | null;
  role: "user" | "admin";
  mustChangePassword: boolean;
  loginIdentifierPref: LoginPref;
  pinLockedUntil: string | null;
  createdAt: string;
};

export type MeResponse =
  | { ok: true; needsProfile: true; email: string | null; name: string | null }
  | {
      ok: true;
      needsProfile: false;
      emailVerified?: boolean;
      profile: PublicProfile;
      pinUnlocked: boolean;
      demoPayments: boolean;
    };

export type BalanceResponse =
  | {
      ok: true;
      locked: true;
      withdrawHoldUntil: string | null;
      withdrawHoldMessage: string | null;
      dailyWithdrawCapTambala: number;
      dailyWithdrawRemainingTambala: number;
    }
  | {
      ok: true;
      locked: false;
      balanceTambala: number;
      lifetimeDepositedTambala: number;
      lifetimeWithdrawnTambala: number;
      withdrawHoldUntil: string | null;
      withdrawHoldMessage: string | null;
      dailyWithdrawCapTambala: number;
      dailyWithdrawRemainingTambala: number;
    };

export type TxKind = "deposit" | "withdrawal" | "fee" | "transfer_out" | "transfer_in";
export type TxStatus = "pending" | "processing" | "success" | "failed";

export type PublicTx = {
  id: number;
  kind: TxKind;
  status: TxStatus;
  grossTambala: number;
  creditedTambala: number;
  phone: string | null;
  reference: string;
  note: string | null;
  createdAt: string;
};

export type DepositStart =
  | { ok: true; mode: "live"; checkoutUrl: string; reference: string }
  | { ok: true; mode: "demo"; reference: string; phone: string; amountTambala: number };

export type WithdrawResult = {
  ok: true;
  reference: string;
  amountTambala: number;
  phone: string;
  phoneVerified?: boolean;
  lockMode?: "instant" | "idle" | "off";
  lockIdleMinutes?: number;
  remainingTambala: number;
};

export type AdminOverview = {
  userCount: number;
  totalDepositsTambala: number;
  totalWithdrawalsTambala: number;
  userBalancesTambala: number;
  platformProfitTambala: number;
  earlyUnlockFeesTambala: number;
  loanInterestTambala: number;
  payoutReserveTambala: number;
  pendingCount: number;
  demoPayments: boolean;
  /** Profit already paid out via treasury withdrawals */
  treasuryPaidOutTambala: number;
  /** Profit still available for admin treasury withdraw (book profit − paid out) */
  treasuryAvailableTambala: number;
  series: Array<{ day: string; deposits: number; withdrawals: number; profit: number }>;
};


export type AdminUserRow = PublicProfile & {
  balanceTambala: number;
  lifetimeDepositedTambala: number;
  lifetimeWithdrawnTambala: number;
};
