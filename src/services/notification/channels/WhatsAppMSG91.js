const axios = require('axios');
const BaseChannel = require('./BaseChannel');

class WhatsAppMSG91 extends BaseChannel {
  constructor() {
    super('whatsapp-msg91');
    this.authKey = process.env.MSG91_AUTH_KEY;
    this.integratedNumber = process.env.MSG91_WHATSAPP_INTEGRATED_NUMBER;
    this.templateName = process.env.MSG91_WHATSAPP_TEMPLATE_NAME;
    this.namespace = process.env.MSG91_WHATSAPP_NAMESPACE;
    this.baseUrl = 'https://control.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/';
    this.timeoutSeconds = 8;
  }

  isConfigured() {
    return !!(this.authKey && this.integratedNumber && this.templateName);
  }

  async send(recipient, payload) {
    if (!this.isConfigured()) {
      return { success: false, channelName: this.name, error: 'MSG91 WhatsApp channel not configured', providerMessageId: null };
    }
    if (!recipient) {
      return { success: false, channelName: this.name, error: 'No recipient phone number provided', providerMessageId: null };
    }

    const messageText = this.formatMessage(payload);
    const normalizedTo = this._normalizeNumber(recipient);

    const body = {
      integrated_number: this.integratedNumber,
      content_type: 'template',
      payload: {
        messaging_product: 'whatsapp',
        type: 'template',
        template: {
          name: this.templateName,
          language: { code: 'en', policy: 'deterministic' },
          namespace: this.namespace,
          to_and_components: [
            {
              to: [normalizedTo],
              components: {
                body_1: { type: 'text', value: messageText.substring(0, 1024) }
              }
            }
          ]
        }
      }
    };

    const headers = {
      authkey: this.authKey,
      'Content-Type': 'application/json'
    };

    try {
      console.log(`Sending MSG91 WhatsApp to ${normalizedTo}...`);
      const resp = await axios.post(this.baseUrl, body, {
        headers,
        timeout: this.timeoutSeconds * 1000
      });

      const data = resp.data;
      let msgId = null;
      try {
        if (data && data.data && data.data[0]) {
          msgId = data.data[0].messageId || null;
        }
      } catch (e) {
        // ignore
      }

      return {
        success: true,
        channelName: this.name,
        error: null,
        providerMessageId: msgId
      };
    } catch (err) {
      console.error('MSG91 WhatsApp send failed:', err.message);
      return {
        success: false,
        channelName: this.name,
        error: err.response?.data ? JSON.stringify(err.response.data) : err.message,
        providerMessageId: null
      };
    }
  }

  _normalizeNumber(number) {
    let digits = number.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = '91' + digits; // prepend India country code if 10 digits
    }
    return digits;
  }
}

module.exports = WhatsAppMSG91;
