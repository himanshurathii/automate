/**
 * Test flow script for IndiaMART Lead Automation.
 * Assumes the Express server is running on http://localhost:3000
 * 
 * To run:
 *   1. Start the server: NODE_ENV=development node src/server.js
 *   2. Run this script in another terminal: node scratch/test_flow.js
 */
const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/leads';

// Generate a random unique query ID
const uniqueId = 'TEST-' + Math.floor(1000000000 + Math.random() * 9000000000);

// Mock IndiaMART Webhook Payload
const mockPayload = {
  UNIQUE_QUERY_ID: uniqueId,
  QUERY_TYPE: 'B',
  QUERY_TIME: new Date().toISOString(),
  SENDER_NAME: 'John Doe',
  SENDER_MOBILE: '+919876543210',
  SENDER_EMAIL: 'johndoe@example.com',
  SENDER_COMPANY: 'Acme Corporates',
  SENDER_CITY: 'Mumbai',
  SENDER_STATE: 'Maharashtra',
  QUERY_PRODUCT_NAME: 'Solar Panels',
  QUERY_MESSAGE: 'Need bulk inquiry of 500 solar panels for commercial project.',
  QUERY_MESSAGE_QUANTITY: '500 pcs'
};

async function runTest() {
  console.log('====================================================');
  console.log('🚀 Starting IndiaMART Lead Flow Simulation Test');
  console.log(`Unique Lead ID: ${uniqueId}`);
  console.log('====================================================\n');

  try {
    // Step 1: Send Webhook Request
    console.log('Step 1: Sending simulated webhook request to /api/leads/webhook...');
    const startTime = Date.now();
    const webhookRes = await axios.post(`${BASE_URL}/webhook`, mockPayload);
    const duration = Date.now() - startTime;

    console.log(`Response Status: ${webhookRes.status}`);
    console.log(`Response Time: ${duration}ms (Expect < 50ms)`);
    console.log('Response Body:', webhookRes.data);
    
    if (duration > 200) {
      console.warn('⚠️ WARNING: Webhook response took longer than 200ms. Check for blocking calls.');
    } else {
      console.log('✅ PASS: Webhook responded instantly (fast-path works!).');
    }
    console.log('----------------------------------------------------\n');

    // Step 2: Wait for background tasks to complete
    const waitSeconds = 4;
    console.log(`Step 2: Waiting ${waitSeconds} seconds for background tasks (priority scoring, notifications, AI summary)...`);
    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    console.log('----------------------------------------------------\n');

    // Step 3: Fetch Leads list to verify database entry
    console.log('Step 3: Querying /api/leads to verify data processing...');
    const listRes = await axios.get(BASE_URL);
    const leads = listRes.data.data;
    const processedLead = leads.find(l => l.indiamartLeadId === uniqueId);

    if (!processedLead) {
      console.error('❌ FAIL: Lead was not found in the database!');
      return;
    }

    console.log('✅ PASS: Lead successfully stored and normalized in DB.');
    console.log(`Normalized Buyer Name: ${processedLead.buyerName}`);
    console.log(`Normalized Product: ${processedLead.product}`);
    console.log(`Computed Priority: ${processedLead.priority} (Expected: HIGH due to Solar Panels & Mumbai rules)`);
    console.log(`AI Summary: ${processedLead.aiSummary || 'PENDING'}`);
    console.log(`Suggested Reply: ${processedLead.suggestedReply || 'PENDING'}`);
    console.log('----------------------------------------------------\n');

    // Step 4: Check Notification Logs
    console.log('Step 4: Checking notification logs associated with this lead...');
    const logs = processedLead.notifications || [];
    console.log(`Found ${logs.length} notification log attempts.`);
    
    logs.forEach((log, index) => {
      console.log(`  [Attempt #${log.attemptNo}] Channel: ${log.channel} | Status: ${log.status} | Error: ${log.error || 'None'} | MessageID: ${log.providerMessageId || 'N/A'}`);
    });

    if (logs.length > 0) {
      console.log('\n✅ PASS: Notifications were triggered and logged successfully.');
    } else {
      console.warn('\n⚠️ WARNING: No notification attempts were logged. Check credentials/mock configuration.');
    }

    console.log('\n====================================================');
    console.log('🎉 Flow simulation test completed successfully!');
    console.log('====================================================');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
  }
}

runTest();
