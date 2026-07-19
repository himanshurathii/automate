const nodemailer = require('nodemailer');
const BaseChannel = require('./BaseChannel');

function escapeHTML(str) {
  if (!str) return '';
  return str
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class EmailSMTP extends BaseChannel {
  constructor() {
    super('email');
    this.host = process.env.SMTP_HOST;
    this.port = parseInt(process.env.SMTP_PORT || '587');
    this.user = process.env.SMTP_USER;
    this.pass = process.env.SMTP_PASS;
    this.from = process.env.SMTP_FROM || 'noreply@example.com';

    this.transporter = null;
    if (this.host && this.user && this.pass) {
      this.transporter = nodemailer.createTransport({
        host: this.host,
        port: this.port,
        secure: this.port === 465,
        auth: {
          user: this.user,
          pass: this.pass
        }
      });
    }
  }

  isConfigured() {
    return !!(this.transporter && this.from);
  }

  async send(recipient, payload) {
    const messageText = this.formatMessage(payload);
    
    // HTML table rendering for emails
    const subjectPriority = payload.priority.toUpperCase();
    const subject = `[${subjectPriority}] ${payload.isFollowup ? 'AI Follow-up: ' : ''}New Lead: ${payload.buyerName || 'Unknown'} - ${payload.product || 'N/A'}`;

    const htmlContent = payload.isFollowup ? `
      <h2>🤖 AI Follow-up & Summary</h2>
      <p><b>Lead ID:</b> ${escapeHTML(payload.indiamartLeadId)}</p>
      <p><b>Summary:</b> ${escapeHTML(payload.aiSummary || 'N/A')}</p>
      ${payload.suggestedReply ? `<p><b>Suggested Reply:</b></p><pre style="background: #f4f4f4; padding: 10px; border-radius: 5px;">${escapeHTML(payload.suggestedReply)}</pre>` : ''}
    ` : `
      <h2>🔔 New IndiaMART Lead Alert</h2>
      <table border="1" cellpadding="8" style="border-collapse: collapse; border-color: #ddd;">
        <tr bgcolor="#f2f2f2"><th>Field</th><th>Details</th></tr>
        <tr><td><b>Lead ID</b></td><td>${escapeHTML(payload.indiamartLeadId)}</td></tr>
        <tr><td><b>Priority</b></td><td><strong style="color: ${payload.priority === 'high' ? 'red' : 'orange'}">${escapeHTML(payload.priority.toUpperCase())}</strong></td></tr>
        <tr><td><b>Buyer Name</b></td><td>${escapeHTML(payload.buyerName || 'N/A')}</td></tr>
        <tr><td><b>Company</b></td><td>${escapeHTML(payload.companyName || 'N/A')}</td></tr>
        <tr><td><b>Phone</b></td><td>${escapeHTML(payload.phone || 'N/A')}</td></tr>
        <tr><td><b>Email</b></td><td>${escapeHTML(payload.email || 'N/A')}</td></tr>
        <tr><td><b>Location</b></td><td>${escapeHTML(payload.city || 'N/A')}, ${escapeHTML(payload.state || 'N/A')}</td></tr>
        <tr><td><b>Product</b></td><td>${escapeHTML(payload.product || 'N/A')}</td></tr>
        <tr><td><b>Quantity</b></td><td>${escapeHTML(payload.quantity || 'N/A')}</td></tr>
        <tr><td><b>Message</b></td><td>${escapeHTML(payload.message || 'N/A')}</td></tr>
        <tr><td><b>Source</b></td><td>${payload.delayed ? 'Reconciliation Pull' : 'Push Webhook'}</td></tr>
      </table>
    `;

    if (!this.isConfigured()) {
      // Print to console if not configured
      console.log(`\n--- [MOCK EMAIL SEND] ---`);
      console.log(`To: ${recipient || 'Not Configured'}`);
      console.log(`Subject: ${subject}`);
      console.log(`Body (Plain Text):`);
      console.log(messageText);
      console.log(`-------------------------\n`);
      return {
        success: true,
        channelName: this.name,
        error: 'Mock mode: SMTP credentials missing',
        providerMessageId: 'mock-smtp-id-' + Math.floor(Math.random() * 1000000)
      };
    }

    if (!recipient) {
      return { success: false, channelName: this.name, error: 'No recipient email provided', providerMessageId: null };
    }

    try {
      console.log(`Sending Email to ${recipient}...`);
      const info = await this.transporter.sendMail({
        from: this.from,
        to: recipient,
        subject,
        text: messageText,
        html: htmlContent
      });

      return {
        success: true,
        channelName: this.name,
        error: null,
        providerMessageId: info.messageId || null
      };
    } catch (err) {
      console.error('SMTP Email send failed:', err.message);
      return {
        success: false,
        channelName: this.name,
        error: err.message,
        providerMessageId: null
      };
    }
  }
}

module.exports = EmailSMTP;
