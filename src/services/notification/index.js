const prisma = require('../database');
const WhatsAppMSG91 = require('./channels/WhatsAppMSG91');
const WhatsAppTwilio = require('./channels/WhatsAppTwilio');
const EmailSMTP = require('./channels/EmailSMTP');

// Register all available channels
const CHANNEL_REGISTRY = {
  'whatsapp-msg91': WhatsAppMSG91,
  'whatsapp-twilio': WhatsAppTwilio,
  'email': EmailSMTP
};

class NotificationService {
  constructor() {
    // Read the channels order from NOTIFICATION_CHANNELS (e.g. "whatsapp-msg91,email")
    // Fallback to backward-compatible defaults based on PRIMARY_NOTIFICATION_CHANNEL
    let configuredOrder = [];
    if (process.env.NOTIFICATION_CHANNELS) {
      configuredOrder = process.env.NOTIFICATION_CHANNELS.split(',').map(s => s.trim());
    } else {
      const primary = process.env.PRIMARY_NOTIFICATION_CHANNEL || 'whatsapp';
      if (primary === 'whatsapp') {
        configuredOrder = ['whatsapp-twilio', 'email'];
      } else {
        configuredOrder = ['email', 'whatsapp-twilio'];
      }
    }

    this.channels = [];
    for (const key of configuredOrder) {
      const ChannelClass = CHANNEL_REGISTRY[key];
      if (!ChannelClass) {
        console.warn(`[Notification] Unknown channel '${key}' in configuration, skipping.`);
        continue;
      }
      this.channels.push(new ChannelClass());
    }
  }

  /**
   * Sends a lead notification through the prioritized fallback chain
   * @param {Object} lead - The database Lead object
   * @param {boolean} isFollowup - Whether this is an AI follow-up message
   */
  async sendLeadNotification(lead, isFollowup = false) {
    const payload = {
      leadId: lead.id,
      indiamartLeadId: lead.indiamartLeadId,
      buyerName: lead.buyerName,
      companyName: lead.companyName,
      phone: lead.phone,
      email: lead.email,
      city: lead.city,
      state: lead.state,
      product: lead.product,
      quantity: lead.quantity,
      message: lead.message,
      priority: lead.priority,
      aiSummary: lead.aiSummary,
      suggestedReply: lead.suggestedReply,
      isFollowup,
      delayed: lead.delayed
    };

    // Recipient destinations mapping
    const recipients = {
      'whatsapp-msg91': process.env.SALES_TEAM_WHATSAPP_NUMBER || process.env.NOTIFICATION_WHATSAPP_TO,
      'whatsapp-twilio': process.env.NOTIFICATION_WHATSAPP_TO,
      'email': process.env.NOTIFICATION_EMAIL_TO
    };

    let attemptNo = 1;
    let lastResult = null;

    for (const channel of this.channels) {
      const recipient = recipients[channel.name];
      if (!recipient) {
        console.log(`[Notification] Skipping channel '${channel.name}' — no recipient configured.`);
        continue;
      }

      // Check if credentials are set (or if we fall back to mock)
      // Note: for development, Twilio/SMTP have mock fallback logic within their class send()
      // so they report isConfigured() = false but send() still succeeds in mock mode.
      // We only skip if the channel is completely disabled/not configured and we are not in mock-supporting mode.
      // We will let the channel decide inside send() if it can mock, but if it has no mock capability we skip.
      const isConfigured = channel.isConfigured();
      const isDevMock = process.env.NODE_ENV !== 'production';

      if (!isConfigured && !isDevMock && channel.name === 'whatsapp-msg91') {
        console.warn(`[Notification] Skipping channel '${channel.name}' — not configured (missing credentials).`);
        continue;
      }

      try {
        console.log(`[Notification] Attempting send via '${channel.name}' (Attempt #${attemptNo})...`);
        const result = await channel.send(recipient, payload);
        
        // Log attempt to database
        await this._logAttempt(lead.id, channel.name, result, attemptNo);

        if (result.success) {
          console.log(`[Notification] Channel '${channel.name}' succeeded for lead ${lead.indiamartLeadId}.`);
          return result;
        }

        lastResult = result;
        console.warn(`[Notification] Channel '${channel.name}' failed: ${result.error}. Falling back...`);
      } catch (err) {
        console.error(`[Notification] Unexpected error in channel '${channel.name}':`, err.message);
        await this._logAttempt(lead.id, channel.name, { success: false, error: err.message }, attemptNo);
      }

      attemptNo++;
    }

    // All channels exhausted
    this._escalateTotalFailure(lead);
    return lastResult || { success: false, channelName: 'none', error: 'No channels configured/available' };
  }

  async _logAttempt(leadId, channelName, result, attemptNo) {
    try {
      await prisma.notificationLog.create({
        data: {
          leadId,
          channel: channelName,
          status: result.success ? 'sent' : 'failed',
          attemptNo,
          error: result.error || null,
          providerMessageId: result.providerMessageId || null
        }
      });
    } catch (dbErr) {
      console.error('[Notification] Failed to write notification log to database:', dbErr.message);
    }
  }

  _escalateTotalFailure(lead) {
    console.error(
      `[CRITICAL] ALL notification channels failed for lead ${lead.id} (IndiaMART ID: ${lead.indiamartLeadId}). Manual review and escalation required!`
    );
    // Future expansion: hook up Slack / Discord / SMS ops alert.
  }
}

// Instantiate and expose the single function to maintain compatibility
const service = new NotificationService();

module.exports = {
  sendLeadNotification: (lead, isFollowup) => service.sendLeadNotification(lead, isFollowup),
  NotificationService
};
