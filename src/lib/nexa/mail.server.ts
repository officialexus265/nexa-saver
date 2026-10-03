import { env } from "@/lib/env.server";
import { APP_NAME } from "./constants";

export function mailConfigured(): boolean {
  return Boolean(env("SMTP_HOST") && env("SMTP_FROM") && (env("SMTP_USER") || env("SMTP_PASS") === undefined || true));
}

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Send email via SMTP. No-op (logs) when SMTP is not configured — never throws to callers.
 * Uses dynamic import of nodemailer so the package is only needed when mail is enabled.
 */
export async function sendMail(input: MailInput): Promise<{ sent: boolean; reason?: string }> {
  const host = env("SMTP_HOST");
  const from = env("SMTP_FROM");
  if (!host || !from) {
    console.info("[mail] skipped (SMTP not configured):", input.subject, "→", input.to);
    return { sent: false, reason: "smtp_not_configured" };
  }

  const port = Number(env("SMTP_PORT") || "587");
  const user = env("SMTP_USER");
  const pass = env("SMTP_PASS");
  const secure = env("SMTP_SECURE") === "true" || port === 465;

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass: pass || "" } : undefined,
    });
    await transport.sendMail({
      from: from.includes("<") ? from : `${APP_NAME} <${from}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(input.text)}</pre>`,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    return { sent: false, reason: (err as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendNewDeviceAlert(opts: {
  to: string;
  firstName: string;
  userAgent: string;
  ip: string;
  when: Date;
}): Promise<void> {
  const whenStr = opts.when.toLocaleString("en-GB", { timeZone: "Africa/Blantyre" });
  const subject = `${APP_NAME}: new sign-in on your account`;
  const text = [
    `Hi ${opts.firstName},`,
    ``,
    `Your ${APP_NAME} account was accessed from a device or network we have not seen before.`,
    ``,
    `When: ${whenStr} (Malawi time)`,
    `IP: ${opts.ip || "unknown"}`,
    `Device: ${opts.userAgent || "unknown"}`,
    ``,
    `If this was you, no action is needed.`,
    `If it was not you, change your password and PIN immediately, and use “Sign out other devices” in Profile.`,
    ``,
    `— ${APP_NAME}`,
  ].join("\n");
  await sendMail({ to: opts.to, subject, text });
}
