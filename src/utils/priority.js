const prisma = require('../services/database');

/**
 * Calculates priority based on active database rules
 * @param {Object} leadData - The lead object containing fields like product, city, quantity, etc.
 * @returns {Promise<string>} - Returns 'high', 'medium', or 'low'
 */
async function calculatePriority(leadData) {
  try {
    // 1. Fetch active rules
    const rules = await prisma.priorityRule.findMany({
      where: { active: true }
    });

    if (rules.length === 0) {
      return 'medium'; // Default priority
    }

    let score = 0;

    // 2. Evaluate each rule
    for (const rule of rules) {
      if (!rule.field) continue;
      
      // Get the value from lead data (case-insensitive key mapping)
      const fieldName = rule.field.trim();
      const leadValue = leadData[fieldName];
      
      if (leadValue === undefined || leadValue === null) continue;

      const ruleValue = rule.value ? rule.value.toString().trim() : '';
      const strLeadValue = leadValue.toString().trim();

      let matched = false;

      switch (rule.operator?.toLowerCase()) {
        case 'equals':
          matched = strLeadValue.toLowerCase() === ruleValue.toLowerCase();
          break;
        case 'contains':
          matched = strLeadValue.toLowerCase().includes(ruleValue.toLowerCase());
          break;
        case 'gte': {
          const numLead = parseFloat(strLeadValue);
          const numRule = parseFloat(ruleValue);
          if (!isNaN(numLead) && !isNaN(numRule)) {
            matched = numLead >= numRule;
          } else {
            matched = strLeadValue.localeCompare(ruleValue) >= 0;
          }
          break;
        }
        case 'in': {
          const list = ruleValue.split(',').map(item => item.trim().toLowerCase());
          matched = list.includes(strLeadValue.toLowerCase());
          break;
        }
        default:
          break;
      }

      if (matched) {
        score += rule.weight || 0;
      }
    }

    // 3. Determine priority class using environment variables or defaults
    const highThreshold = parseInt(process.env.PRIORITY_HIGH_THRESHOLD || '10');
    const lowThreshold = parseInt(process.env.PRIORITY_LOW_THRESHOLD || '-5');

    if (score >= highThreshold) {
      return 'high';
    } else if (score <= lowThreshold) {
      return 'low';
    } else {
      return 'medium';
    }
  } catch (error) {
    console.error('Error in priority calculation, defaulting to medium:', error);
    return 'medium';
  }
}

module.exports = {
  calculatePriority
};
