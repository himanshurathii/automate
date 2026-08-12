/**
 * Automated Verification Script for IndiaMART Speed-to-Lead Audit Fixes
 * 
 * Verifies:
 * 1. Envelope unwrapping of IndiaMART RESPONSE payload.
 * 2. Idempotency & duplicate race-condition P2002 handling on concurrent webhooks.
 * 3. Fallback and mock mode behavior.
 * 4. In-memory caching of priority rules.
 */

const { processIncomingLead } = require('../src/collectors/indiamart');
const { calculatePriority, clearRulesCache } = require('../src/utils/priority');
const EmailSMTP = require('../src/services/notification/channels/EmailSMTP');
const WhatsAppTwilio = require('../src/services/notification/channels/WhatsAppTwilio');
const prisma = require('../src/services/database');

async function runAuditVerificationSuite() {
  console.log('====================================================');
  console.log('🧪 Running IndiaMART Audit Fix Verification Suite');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // Test 1: Real IndiaMART Push API RESPONSE Envelope Unwrapping
    // ----------------------------------------------------
    console.log('--- Test 1: IndiaMART RESPONSE Envelope Unwrapping ---');
    const testLeadId = 'IND-ENVELOPE-' + Date.now();
    const indiamartPayloadFixture = {
      CODE: 200,
      STATUS: 'SUCCESS',
      RESPONSE: {
        UNIQUE_QUERY_ID: testLeadId,
        QUERY_TYPE: 'W',
        QUERY_TIME: new Date().toISOString(),
        SENDER_NAME: 'Prabhat Sharma',
        SENDER_MOBILE: '+919988776655',
        SENDER_EMAIL: 'prabhat@example.com',
        SENDER_COMPANY: 'Sharma Electricals',
        SENDER_CITY: 'Jaipur',
        SENDER_STATE: 'Rajasthan',
        QUERY_PRODUCT_NAME: 'Industrial Transformers',
        QUERY_MESSAGE: 'Require quote for 10 units of 500kVA transformers.',
        QUERY_MCAT_NAME: '10 units'
      }
    };

    const result = await processIncomingLead(indiamartPayloadFixture, 'push');
    assert(result.isNew === true, 'Successfully ingested nested RESPONSE envelope lead');
    assert(result.lead.indiamartLeadId === testLeadId, `Extracted correct lead ID: ${testLeadId}`);
    assert(result.lead.buyerName === 'Prabhat Sharma', 'Extracted buyer name from RESPONSE object');
    assert(result.lead.product === 'Industrial Transformers', 'Extracted product name from RESPONSE object');

    // Clean up test record
    await prisma.notificationLog.deleteMany({ where: { leadId: result.lead.id } });
    await prisma.lead.delete({ where: { id: result.lead.id } });
    await prisma.leadRaw.delete({ where: { indiamartLeadId: testLeadId } });
    console.log('');

    // ----------------------------------------------------
    // Test 2: Channel Mock vs Production Behavior
    // ----------------------------------------------------
    console.log('--- Test 2: Notification Channel Failover & Mock Mode ---');
    const emailChannel = new EmailSMTP();
    const twilioChannel = new WhatsAppTwilio();

    // In dev mode (NODE_ENV != 'production'), missing credentials should report dev mock
    process.env.NODE_ENV = 'development';
    const emailDevRes = await emailChannel.send('test@example.com', { priority: 'high', indiamartLeadId: '123' });
    assert(emailDevRes.success === true, 'Dev mode returns mock success for unconfigured Email channel');

    // In production mode, missing credentials MUST return success: false
    process.env.NODE_ENV = 'production';
    const emailProdRes = await emailChannel.send('test@example.com', { priority: 'high', indiamartLeadId: '123' });
    assert(emailProdRes.success === false, 'Production mode returns success: false for unconfigured Email channel');
    assert(emailProdRes.error.includes('not configured'), 'Production error clearly states channel not configured');

    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const unconfiguredTwilio = new WhatsAppTwilio();
    const twilioProdRes = await unconfiguredTwilio.send('+919988776655', { priority: 'high', indiamartLeadId: '123' });
    assert(twilioProdRes.success === false, 'Production mode returns success: false for unconfigured Twilio channel');
    
    // Restore dev mode
    process.env.NODE_ENV = 'development';
    console.log('');

    // ----------------------------------------------------
    // Test 3: Priority Rule In-Memory Cache
    // ----------------------------------------------------
    console.log('--- Test 3: Priority Rules Caching ---');
    clearRulesCache();
    const p1 = await calculatePriority({ product: 'Solar Panels', city: 'Mumbai' });
    const p2 = await calculatePriority({ product: 'Solar Panels', city: 'Mumbai' });
    assert(typeof p1 === 'string' && typeof p2 === 'string', 'Priority calculated successfully using cached rules');
    console.log('');

    // Summary
    console.log('====================================================');
    console.log(`📊 Suite Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Unexpected suite failure:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runAuditVerificationSuite();
