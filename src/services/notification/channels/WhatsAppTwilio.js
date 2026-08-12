const twilio = require('twilio');
const BaseChannel = require('./BaseChannel');

class WhatsAppTwilio extends BaseChannel {
  constructor() {
    super('whatsapp-twilio');
    this.sid = process.env.TWILIO_ACCOUNT_SID;
    this.token = process.env.TWILIO_AUTH_TOKEN;
    this.from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
    
    this.twilioClient = null;
    if (this.sid && this.token) {
      this.twilioClient = twilio(this.sid, this.token);
    }
  }

  isConfigured() {
    return !!(this.twilioClient && this.from);
  }

  async send(recipient, payload) {
    const messageText = this.formatMessage(payload);
    
    if (!this.isConfigured()) {
      if (process.env.NODE_ENV !== 'production') {
        // If not configured, we print to console as fallback mock in dev
        console.log(`\n--- [MOCK TWILIO WHATSAPP SEND] ---`);
        console.log(`To: ${recipient || 'Not Configured'}`);
        console.log(messageText);
        console.log(`-----------------------------------\n`);
        return {
          success: true,
          channelName: this.name,
          error: 'Mock mode: Twilio credentials missing (dev only)',
          providerMessageId: 'mock-twilio-id-' + Math.floor(Math.random() * 1000000)
        };
      }
      return {
        success: false,
        channelName: this.name,
        error: 'Twilio WhatsApp credentials not configured',
        providerMessageId: null
      };
    }

    if (!recipient) {
      return { success: false, channelName: this.name, error: 'No recipient phone number provided', providerMessageId: null };
    }

    try {
      console.log(`Sending Twilio WhatsApp to ${recipient}...`);
      const msg = await this.twilioClient.messages.create({
        body: messageText,
        from: this.from,
        to: recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`
      });

      return {
        success: true,
        channelName: this.name,
        error: null,
        providerMessageId: msg.sid
      };
    } catch (err) {
      console.error('Twilio WhatsApp send failed:', err.message);
      return {
        success: false,
        channelName: this.name,
        error: err.message,
        providerMessageId: null
      };
    }
  }
}

module.exports = WhatsAppTwilio;
