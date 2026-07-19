const axios = require('axios');
const prisma = require('../services/database');
const { calculatePriority } = require('../utils/priority');
const { sendLeadNotification } = require('../services/notification');

// Base URL for IndiaMART Pull API
const INDIAMART_PULL_URL = 'https://mapi.indiamart.com/wservce/crm/crmListing/v2/';

/**
 * Format date in DD-Mon-YYYYHH:MM:SS format for IndiaMART API (IST)
 */
function formatDate(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * Perform duplicate detection.
 * If a lead with the same phone and product exists in the database within the last 24 hours,
 * mark it as duplicate pointing to the original lead.
 */
async function detectDuplicate(phone, product) {
  if (!phone || !product) return null;

  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  const originalLead = await prisma.lead.findFirst({
    where: {
      phone,
      product: {
        contains: product
      },
      createdAt: {
        gte: yesterday
      },
      isDuplicateOfId: null // Reference the primary original lead
    },
    orderBy: {
      createdAt: 'asc'
    }
  });

  return originalLead ? originalLead.id : null;
}

/**
 * Process a lead payload (from pull collector or webhook push).
 * Saves to LeadRaw and processes into Lead.
 */
async function processIncomingLead(rawLead, source = 'push') {
  const uniqueQueryId = (rawLead.UNIQUE_QUERY_ID || rawLead.QUERY_ID || rawLead.id)?.toString();
  if (!uniqueQueryId) {
    throw new Error('UNIQUE_QUERY_ID/QUERY_ID/id is missing from lead payload.');
  }

  // 1. Check if lead already exists in DB
  const existingLead = await prisma.lead.findUnique({
    where: { indiamartLeadId: uniqueQueryId },
    include: { raw: true }
  });

  if (existingLead) {
    console.log(`Lead ${uniqueQueryId} already exists. Skipping processing.`);
    return { lead: existingLead, isNew: false };
  }

  // 2. Save Raw Lead payload (check if exists first, to support fast-path webhook pre-saving)
  let rawRecord = await prisma.leadRaw.findUnique({
    where: { indiamartLeadId: uniqueQueryId }
  });
  if (!rawRecord) {
    rawRecord = await prisma.leadRaw.create({
      data: {
        indiamartLeadId: uniqueQueryId,
        source,
        rawPayload: JSON.stringify(rawLead)
      }
    });
  }

  // 3. Extract and normalize data fields
  const queryTimeStr = rawLead.QUERY_TIME || new Date().toISOString();
  let queryTime = new Date(queryTimeStr);
  if (isNaN(queryTime.getTime())) {
    queryTime = new Date();
  }

  const phone = rawLead.SENDER_MOBILE || rawLead.SENDER_PHONE || null;
  const product = rawLead.QUERY_PRODUCT_NAME || null;
  const buyerName = rawLead.SENDER_NAME || null;
  const companyName = rawLead.SENDER_COMPANY || null;
  const email = rawLead.SENDER_EMAIL || null;
  const city = rawLead.SENDER_CITY || null;
  const state = rawLead.SENDER_STATE || null;
  const message = rawLead.QUERY_MESSAGE || null;
  
  // Extract quantity if present or parse from message (e.g. Qty: 100 pcs)
  let quantity = rawLead.QUERY_MESSAGE_QUANTITY || rawLead.QUERY_MCAT_NAME || null; 
  if (message && !quantity) {
    const qtyMatch = message.match(/(?:qty|quantity|needs)\s*[:\-]?\s*(\d+\s*\w*)/i);
    if (qtyMatch) {
      quantity = qtyMatch[1];
    }
  }

  // 4. Run Duplicate Check
  const duplicateOfId = await detectDuplicate(phone, product);

  // 5. Evaluate priority rules
  const computedPriority = await calculatePriority({
    buyerName,
    companyName,
    phone,
    email,
    city,
    state,
    product,
    quantity,
    message
  });

  // 6. Create normalized lead
  const newLead = await prisma.lead.create({
    data: {
      rawId: rawRecord.id,
      indiamartLeadId: uniqueQueryId,
      buyerName,
      companyName,
      phone,
      email,
      city,
      state,
      product,
      quantity,
      message,
      priority: computedPriority,
      status: 'new',
      isDuplicateOfId: duplicateOfId,
      delayed: source === 'pull_backfill'
    },
    include: {
      raw: true
    }
  });

  console.log(`Processed new lead ${uniqueQueryId}. Priority: ${computedPriority}. Duplicate status: ${duplicateOfId ? 'DUPLICATE' : 'UNIQUE'}`);

  // 7. Trigger alerts for non-duplicate leads
  if (!duplicateOfId) {
    try {
      await sendLeadNotification(newLead);
    } catch (err) {
      console.error(`Failed to send notifications for lead ${uniqueQueryId}:`, err.message);
    }
  } else {
    console.log(`Lead ${uniqueQueryId} flagged as duplicate of Lead ID ${duplicateOfId}. Notification skipped.`);
  }

  // 8. Trigger AI follow-up asynchronously in the background (decoupled)
  generateAiFollowUp(newLead.id).catch(err => {
    console.error(`Failed to trigger AI follow-up for lead ${newLead.id}:`, err);
  });

  return { lead: newLead, isNew: true };
}

/**
 * Generate simulated IndiaMART lead response for testing/development
 */
function generateMockLeads() {
  const names = ['Rahul Sharma', 'Amit Patel', 'Vikram Singh', 'Priya Nair', 'Suresh Kumar', 'Neha Gupta', 'Rajesh Kulkarni'];
  const companies = ['Sharma Trading Co.', 'Patel Enterprises', 'Delta Systems', 'Apex Industries', 'Karan Exports', 'Gupta Metals', 'Kulkarni AgriTech'];
  const products = ['Industrial Valves', 'Solar Panels', 'Packaging Boxes', 'Cotton Yarn', 'LED Lights', 'Steel Pipe Fitting', 'Drip Irrigation Kit'];
  const cities = ['Mumbai', 'Delhi', 'Ahmedabad', 'Bangalore', 'Coimbatore', 'Ludhiana', 'Pune'];
  const states = ['Maharashtra', 'Delhi', 'Gujarat', 'Karnataka', 'Tamil Nadu', 'Punjab', 'Maharashtra'];
  const quantities = ['500 pcs', '20 units', '1000 boxes', '5 tons', '2000 pcs', '150 meters', '50 sets'];
  
  const count = Math.floor(Math.random() * 3) + 1; // 1 to 3 mock leads
  const mockLeads = [];

  for (let i = 0; i < count; i++) {
    const randomIndex = Math.floor(Math.random() * names.length);
    const uniqueId = 'MOCK-' + Math.floor(100000000000 + Math.random() * 900000000000);
    const queryTime = new Date().toISOString();

    mockLeads.push({
      UNIQUE_QUERY_ID: uniqueId,
      QUERY_TYPE: 'B',
      QUERY_TIME: queryTime,
      SENDER_NAME: names[randomIndex],
      SENDER_MOBILE: '+91' + Math.floor(7000000000 + Math.random() * 2999999999),
      SENDER_EMAIL: names[randomIndex].toLowerCase().replace(' ', '.') + '@example.com',
      SENDER_COMPANY: companies[randomIndex],
      SENDER_ADDRESS: 'Industrial Area Phase ' + (i + 1),
      SENDER_CITY: cities[randomIndex],
      SENDER_STATE: states[randomIndex],
      SENDER_PINCODE: Math.floor(100000 + Math.random() * 800000).toString(),
      SENDER_COUNTRY_ISO: 'IN',
      QUERY_PRODUCT_NAME: products[Math.floor(Math.random() * products.length)],
      QUERY_MESSAGE: `Looking to purchase bulk order of products. Requirement: ${quantities[Math.floor(Math.random() * quantities.length)]}. Please send quotes ASAP.`,
      QUERY_MCAT_NAME: quantities[Math.floor(Math.random() * quantities.length)]
    });
  }

  return mockLeads;
}

/**
 * Main Poll Collector function
 */
async function collectLeads() {
  const apiKey = process.env.INDIAMART_CRM_KEY;

  if (!apiKey) {
    console.log('INDIAMART_CRM_KEY is not defined in .env. Running in SIMULATION MODE.');
    const mocks = generateMockLeads();
    console.log(`Generated ${mocks.length} mock leads for simulation.`);
    
    let newLeadsCount = 0;
    for (const mock of mocks) {
      const result = await processIncomingLead(mock, 'pull_backfill');
      if (result.isNew) newLeadsCount++;
    }
    return { count: mocks.length, newLeads: newLeadsCount, source: 'simulation' };
  }

  try {
    const endTime = new Date();
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 24); // Pull past 24 hours

    const url = `${INDIAMART_PULL_URL}?glusr_crm_key=${apiKey}&start_time=${formatDate(startTime)}&end_time=${formatDate(endTime)}`;
    console.log(`Polling IndiaMART Pull API: ${url.replace(apiKey, 'SECRET_KEY')}`);

    const response = await axios.get(url);
    const apiData = response.data;

    // Handle standard IndiaMART response structure
    // IndiaMART API returns: { STATUS: "SUCCESS", RESPONSE: [ { UNIQUE_QUERY_ID: ... }, ... ] }
    if (!apiData || apiData.STATUS !== 'SUCCESS' || !Array.isArray(apiData.RESPONSE)) {
      const errorMsg = apiData?.RESPONSE?.MESSAGE || JSON.stringify(apiData);
      console.warn('IndiaMART Pull API returned empty or unsuccessful response:', errorMsg);
      return { count: 0, newLeads: 0, source: 'indiamart', error: errorMsg };
    }

    const leadsList = apiData.RESPONSE;
    console.log(`IndiaMART Pull API returned ${leadsList.length} leads.`);

    let newLeadsCount = 0;
    for (const rawLead of leadsList) {
      const result = await processIncomingLead(rawLead, 'pull_backfill');
      if (result.isNew) newLeadsCount++;
    }

    return { count: leadsList.length, newLeads: newLeadsCount, source: 'indiamart' };
  } catch (error) {
    console.error('Error in IndiaMART collector:', error.message);
    throw error;
  }
}

/**
 * Asynchronously generates AI summary + suggested reply and sends a second notification.
 * Decoupled from the fast-path so AI latencies never delay the instant notification.
 */
async function generateAiFollowUp(leadId) {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: { raw: true }
    });

    if (!lead) return;

    console.log(`[AI Follow-up] Generating AI summary for lead ${lead.indiamartLeadId}...`);

    // In a real build, wire in your actual LLM provider (Gemini/OpenAI/Claude).
    // Here we implement the prompt/summary template following the Python project's model.
    const summary = `Buyer ${lead.buyerName || 'Unknown'} wants ${lead.quantity || 'unspecified qty'} of ${lead.product || 'a product'} in ${lead.city || 'unspecified location'}.`;
    const suggestedReply = `Hi ${lead.buyerName || 'there'}, thanks for your inquiry about ${lead.product || 'our product'}. Could you share more details on your requirement so we can send an accurate quote?`;

    // Update lead database entry
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        aiSummary: summary,
        suggestedReply: suggestedReply
      }
    });

    console.log(`[AI Follow-up] AI summary updated for lead ${lead.indiamartLeadId}. Sending follow-up notification...`);

    // Send the follow-up notification (isFollowup = true)
    await sendLeadNotification(updatedLead, true);
  } catch (err) {
    console.error(`[AI Follow-up] Error generating AI summary for lead ID ${leadId}:`, err.message);
  }
}

module.exports = {
  collectLeads,
  processIncomingLead,
  generateAiFollowUp
};
