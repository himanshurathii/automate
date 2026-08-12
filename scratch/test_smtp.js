/**
 * Standalone SMTP Email Test Tool
 * 
 * Usage:
 *   1. Fill in SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, NOTIFICATION_EMAIL_TO in .env
 *   2. Run: node scratch/test_smtp.js
 */

require('dotenv').config();
const EmailSMTP = require('../src/services/notification/channels/EmailSMTP');

async function testSmtp() {
  console.log('====================================================');
  console.log('📧 Testing SMTP Email Delivery');
  console.log('====================================================\n');

  console.log('Configuration Check:');
  console.log(`- SMTP_HOST: ${process.env.SMTP_HOST || '(not set)'}`);
  console.log(`- SMTP_PORT: ${process.env.SMTP_PORT || '(not set)'}`);
  console.log(`- SMTP_USER: ${process.env.SMTP_USER || '(not set)'}`);
  console.log(`- SMTP_PASS: ${process.env.SMTP_PASS ? '*****' : '(not set)'}`);
  console.log(`- SMTP_FROM: ${process.env.SMTP_FROM || '(not set)'}`);
  console.log(`- NOTIFICATION_EMAIL_TO: ${process.env.NOTIFICATION_EMAIL_TO || '(not set)'}\n`);

  const emailChannel = new EmailSMTP();

  if (!emailChannel.isConfigured()) {
    console.error('❌ FAIL: EmailSMTP channel reports it is NOT configured.');
    console.error('Please fill in SMTP_HOST, SMTP_USER, and SMTP_PASS in your .env file.');
    process.exit(1);
  }

  const recipient = process.env.NOTIFICATION_EMAIL_TO || 'test@example.com';
  const samplePayload = {
    indiamartLeadId: 'TEST-SMTP-' + Date.now(),
    buyerName: 'Rahul Test Buyer',
    companyName: 'Test Corporation',
    phone: '+919876543210',
    email: 'buyer@example.com',
    city: 'Mumbai',
    state: 'Maharashtra',
    product: 'Solar Panels 500W',
    quantity: '100 units',
    message: 'This is a test notification email sent from IndiaMART Speed-to-Lead system.',
    priority: 'high',
    delayed: false,
    isFollowup: false
  };

  console.log(`Attempting to send live test email to: ${recipient}...`);
  const result = await emailChannel.send(recipient, samplePayload);

  console.log('\nResult:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success && !result.error?.includes('Mock')) {
    console.log('\n====================================================');
    console.log('🎉 PASS: Real SMTP email sent successfully!');
    console.log(`Provider Message ID: ${result.providerMessageId}`);
    console.log('====================================================');
  } else if (result.error?.includes('Mock')) {
    console.log('\n⚠️ Notice: Channel ran in Mock mode because credentials were not fully configured.');
  } else {
    console.error('\n❌ FAIL: SMTP Email delivery failed with error:', result.error);
  }
}

testSmtp();
