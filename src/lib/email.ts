import { Resend } from 'resend';

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

export function isEmailConfigured(): boolean {
  return Boolean(resend && process.env.FROM_EMAIL);
}

export function getFromEmail(): string {
  return process.env.FROM_EMAIL || 'Flight Deals <onboarding@resend.dev>';
}
