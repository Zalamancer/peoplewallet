const { Resend } = require('resend');
const logger = require('../utils/logger');

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS = process.env.NODE_ENV === 'production'
  ? 'verify@peoplewallet.app'
  : 'onboarding@resend.dev';

/**
 * Send a 6-digit verification code to an email address
 */
async function sendVerificationCode(email, code) {
  if (!resend) {
    logger.warn('Resend not configured — logging verification code instead');
    logger.info(`[DEV] Verification code for ${email}: ${code}`);
    return;
  }

  const { data, error } = await resend.emails.send({
    from: `PeopleWallet <${FROM_ADDRESS}>`,
    to: email,
    subject: `${code} is your PeopleWallet verification code`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #1a1a1a; margin-bottom: 8px;">Verify your school email</h2>
        <p style="color: #666; font-size: 15px;">Enter this code in PeopleWallet to verify your .edu email address:</p>
        <div style="background: #f5f5f5; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a;">${code}</span>
        </div>
        <p style="color: #999; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });

  if (error) {
    logger.error(`Resend error for ${email}:`, error);
    throw new Error(error.message || 'Failed to send email');
  }

  logger.info(`Verification code sent to ${email} (id: ${data?.id})`);
}

module.exports = { sendVerificationCode };
