import { env } from "@/lib/env.server";
import { APP_NAME } from "./constants";

export function mailConfigured(): boolean {
  return Boolean(env("SMTP_HOST") && env("SMTP_FROM"));
}

type MailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

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
      html: input.html,
    });
    return { sent: true };
  } catch (err) {
    console.error("[mail] send failed:", (err as Error).message);
    return { sent: false, reason: (err as Error).message };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function alertHtml(opts: {
  title: string;
  greeting: string;
  bodyLines: string[];
  secureUrl: string;
  buttonLabel: string;
}): string {
  const lines = opts.bodyLines.map((l) => `<p style="margin:0 0 12px;color:#334;line-height:1.5">${escapeHtml(l)}</p>`).join("");
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#f4f6f5;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8e6">
    <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#3dcf8e;font-weight:600">${escapeHtml(APP_NAME)}</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#0e1a16">${escapeHtml(opts.title)}</h1>
    <p style="margin:0 0 16px;color:#334">${escapeHtml(opts.greeting)}</p>
    ${lines}
    <p style="margin:24px 0 12px">
      <a href="${escapeHtml(opts.secureUrl)}" style="display:inline-block;background:#3dcf8e;color:#062016;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${escapeHtml(opts.buttonLabel)}</a>
    </p>
    <p style="margin:16px 0 0;font-size:12px;color:#6b7c74">If the button does not work, open this link:<br/><a href="${escapeHtml(opts.secureUrl)}" style="color:#2a9b6a;word-break:break-all">${escapeHtml(opts.secureUrl)}</a></p>
    <p style="margin:20px 0 0;font-size:12px;color:#6b7c74">This link expires in 24 hours and can be used once. If you made this change, you can ignore this email.</p>
  </div></body></html>`;
}

export async function sendSecurityAlertEmail(opts: {
  to: string;
  firstName: string;
  kind: "new_device" | "phone_change" | "pin_change";
  secureUrl: string;
  detailLines: string[];
}): Promise<void> {
  const titles = {
    new_device: "New sign-in on your account",
    phone_change: "Registered phone number changed",
    pin_change: "Withdraw PIN was changed",
  } as const;
  const intros = {
    new_device:
      "Your account was accessed from a device or network we have not seen before. If this was not you, secure the account now.",
    phone_change:
      "The mobile number used for withdrawals was changed. If this was not you, secure the account and restore your previous number.",
    pin_change:
      "Your 4-digit withdraw PIN was changed. If this was not you, set a new PIN and sign out all devices.",
  } as const;
  const buttons = {
    new_device: "Secure my account",
    phone_change: "Secure account & restore phone",
    pin_change: "Secure my PIN",
  } as const;

  const subject = `${APP_NAME}: ${titles[opts.kind]}`;
  const text = [
    `Hi ${opts.firstName},`,
    ``,
    intros[opts.kind],
    ``,
    ...opts.detailLines,
    ``,
    `${buttons[opts.kind]}: ${opts.secureUrl}`,
    ``,
    `This link expires in 24 hours. If you made this change, you can ignore this email.`,
    ``,
    `— ${APP_NAME}`,
  ].join("\n");

  const html = alertHtml({
    title: titles[opts.kind],
    greeting: `Hi ${opts.firstName},`,
    bodyLines: [intros[opts.kind], ...opts.detailLines],
    secureUrl: opts.secureUrl,
    buttonLabel: buttons[opts.kind],
  });

  await sendMail({ to: opts.to, subject, text, html });
}
