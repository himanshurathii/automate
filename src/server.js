require('dotenv').config();
const app = require('./app');
const prisma = require('./services/database');
const { collectLeads } = require('./collectors/indiamart');

const PORT = process.env.PORT || 3000;

/**
 * Seed default priority rules if database is empty
 */
async function seedDefaultRules() {
  try {
    const count = await prisma.priorityRule.count();
    if (count === 0) {
      console.log('No priority rules found. Seeding default priority rules...');
      
      const defaultRules = [
        {
          ruleName: 'Bulk Quantity Filter',
          field: 'quantity',
          operator: 'contains',
          value: '1000',
          weight: 10,
          active: true
        },
        {
          ruleName: 'Target Product: Solar Panels',
          field: 'product',
          operator: 'contains',
          value: 'Solar Panels',
          weight: 6,
          active: true
        },
        {
          ruleName: 'Target Product: Industrial Valves',
          field: 'product',
          operator: 'contains',
          value: 'Industrial Valves',
          weight: 6,
          active: true
        },
        {
          ruleName: 'Tier 1 City: Mumbai',
          field: 'city',
          operator: 'equals',
          value: 'Mumbai',
          weight: 4,
          active: true
        },
        {
          ruleName: 'Tier 1 City: Delhi',
          field: 'city',
          operator: 'equals',
          value: 'Delhi',
          weight: 4,
          active: true
        },
        {
          ruleName: 'Spam Filter',
          field: 'message',
          operator: 'contains',
          value: 'spam',
          weight: -15,
          active: true
        }
      ];

      await prisma.priorityRule.createMany({
        data: defaultRules
      });
      console.log('Seeded 6 default priority rules.');
    }
  } catch (error) {
    console.error('Failed to seed default priority rules:', error.message);
  }
}

/**
 * Initialize and start the automated polling scheduler
 */
function startPollingScheduler() {
  const intervalSeconds = parseInt(process.env.POLL_INTERVAL_SECONDS || '300');
  const msInterval = intervalSeconds * 1000;

  console.log(`Setting up IndiaMART Pull API polling scheduler loop every ${intervalSeconds} seconds.`);
  
  // Set up repeating timeout/interval
  const runScheduler = async () => {
    console.log(`[Scheduler] Executing scheduled IndiaMART lead pull...`);
    try {
      const result = await collectLeads();
      console.log(`[Scheduler] Lead pull completed. Result:`, result);
    } catch (err) {
      console.error(`[Scheduler] Error during scheduled lead pull:`, err.message);
    }
    // Schedule next run
    setTimeout(runScheduler, msInterval);
  };

  // Run initial pull after a brief startup delay (e.g. 5 seconds) to avoid conflicts
  setTimeout(runScheduler, 5000);
}

/**
 * Main application entrypoint
 */
async function startServer() {
  try {
    // 1. Connect to DB and run migrations check
    await prisma.$connect();
    console.log('Connected to SQLite Database.');

    // 2. Seed configuration rules
    await seedDefaultRules();

    // 3. Start Express server listener
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`🚀 IndiaMART Lead Automation Server running on port ${PORT}`);
      console.log(`👉 Webhook endpoint: http://localhost:${PORT}/api/leads/webhook`);
      console.log(`=================================================`);

      // 4. Start scheduler loop
      startPollingScheduler();
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
