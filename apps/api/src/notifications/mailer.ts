// ponytail: no SMTP/e-mail provider configured yet (RF-11 allows deferring
// e-mail delivery in the MVP) — logs the link to the server console instead.
// Swap the body of consoleMailer for a real provider call once one exists;
// callers only depend on the SendPasswordResetLink signature.
export type SendPasswordResetLink = (params: { email: string; token: string; purpose: 'reset' | 'invite' }) => void;

export const consoleMailer: SendPasswordResetLink = ({ email, token, purpose }) => {
  // Never print a live token in production logs.
  const link = process.env.NODE_ENV === 'production' ? '[redacted]' : `/reset-password?token=${token}`;
  console.log(`[mailer stub] ${purpose} link for ${email}: ${link}`);
};
