const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) {
    console.warn('[emailService] SMTP not configured; emails will be logged to console only.');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(`[emailService] (no SMTP configured) Would send email to ${to}: ${subject}`);
    return { skipped: true };
  }
  try {
    const info = await t.sendMail({
      from: process.env.EMAIL_FROM || 'no-reply@rentfinder.test',
      to,
      subject,
      html,
    });
    return info;
  } catch (err) {
    // Email failures must never break the main request flow.
    console.error('[emailService] Failed to send email:', err.message);
    return { error: err.message };
  }
}

async function sendHighMatchInterestEmail({ ownerEmail, ownerName, tenantName, listingLocation, score }) {
  return sendEmail({
    to: ownerEmail,
    subject: `🔥 High-compatibility tenant interested in your listing (${score}% match)`,
    html: `<p>Hi ${ownerName},</p>
      <p><strong>${tenantName}</strong> has expressed interest in your listing at <strong>${listingLocation}</strong>
      with a compatibility score of <strong>${score}%</strong>.</p>
      <p>Log in to review their profile and accept or decline the interest.</p>`,
  });
}

async function sendInterestDecisionEmail({ tenantEmail, tenantName, listingLocation, status }) {
  const verb = status === 'ACCEPTED' ? 'accepted' : 'declined';
  return sendEmail({
    to: tenantEmail,
    subject: `Your interest was ${verb}`,
    html: `<p>Hi ${tenantName},</p>
      <p>The owner has <strong>${verb}</strong> your interest for the listing at <strong>${listingLocation}</strong>.</p>
      ${status === 'ACCEPTED' ? '<p>You can now chat with the owner in real time on the platform.</p>' : ''}`,
  });
}

module.exports = { sendEmail, sendHighMatchInterestEmail, sendInterestDecisionEmail };
