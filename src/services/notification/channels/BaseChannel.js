/**
 * Base contract for all notification channels.
 */
class BaseChannel {
  constructor(name = 'base') {
    this.name = name;
  }

  /**
   * Return false if required credentials/config are missing, so the
   * service can skip this channel instead of failing loudly at send time.
   * @returns {boolean}
   */
  isConfigured() {
    throw new Error('isConfigured() must be implemented by subclass');
  }

  /**
   * Send the notification. Must not throw — catch provider exceptions
   * internally and return a Result object.
   * @param {string} recipient - The recipient destination (phone, email, etc.)
   * @param {Object} payload - The notification payload
   * @returns {Promise<{success: boolean, channelName: string, error: string|null, providerMessageId: string|null}>}
   */
  async send(recipient, payload) {
    throw new Error('send() must be implemented by subclass');
  }

  /**
   * Default plain-text formatting shared by most channels. Override
   * if a channel needs a different format (e.g. WhatsApp template params).
   * @param {Object} payload
   * @returns {string}
   */
  formatMessage(payload) {
    if (payload.isFollowup) {
      const lines = [
        `AI Summary — Lead #${payload.indiamartLeadId}`,
        payload.aiSummary || '(summary unavailable)'
      ];
      if (payload.suggestedReply) {
        lines.push(`\nSuggested reply:\n${payload.suggestedReply}`);
      }
      return lines.join('\n');
    }

    const priorityTag = {
      high: '🔴 HIGH',
      medium: '🟡 MEDIUM',
      low: '🟢 LOW'
    }[payload.priority] || payload.priority.toUpperCase();

    const lines = [
      `NEW LEAD [${priorityTag}] — #${payload.indiamartLeadId}`,
      `Buyer: ${payload.buyerName || '-'}`
    ];
    
    if (payload.companyName) {
      lines.push(`Company: ${payload.companyName}`);
    }
    lines.push(`Phone: ${payload.phone || '-'}`);
    if (payload.email) {
      lines.push(`Email: ${payload.email}`);
    }
    if (payload.city) {
      lines.push(`City: ${payload.city}`);
    }
    lines.push(`Product: ${payload.product || '-'}`);
    if (payload.quantity) {
      lines.push(`Quantity: ${payload.quantity}`);
    }
    if (payload.message) {
      lines.push(`Message: ${payload.message}`);
    }
    if (payload.delayed) {
      lines.push('\n⚠ Delivered via backup reconciliation (push notification may have been missed).');
    }

    return lines.join('\n');
  }
}

module.exports = BaseChannel;
