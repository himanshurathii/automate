require("dotenv").config();
const app = require("./app");
const prisma = require("./services/database");
const { collectLeads } = require("./collectors/indiamart");

const PORT = process.env.PORT || 3000;

/**
 * Seed default priority rules if database is empty
 */
async function seedDefaultRules() {
  try {
    const count = await prisma.priorityRule.count();
    if (count === 0) {
      console.log("No priority rules found. Seeding default priority rules...");

      const defaultRules = [
        // --- Bulk quantity: larger orders matter more in pharma distribution ---
        {
          ruleName: "Bulk Quantity Filter",
          field: "quantity",
          operator: "contains",
          value: "1000",
          weight: 10,
          active: true,
        },

        // --- Target product categories: EDIT these to match the client's actual catalog ---
        {
          ruleName: "Target Product: Generic Medicines",
          field: "product",
          operator: "contains",
          value: "generic medicine",
          weight: 6,
          active: true,
        },
        {
          ruleName: "Target Product: Pharmaceutical Tablets",
          field: "product",
          operator: "contains",
          value: "tablets",
          weight: 6,
          active: true,
        },
        {
          ruleName: "Target Product: Surgical / Medical Supplies",
          field: "product",
          operator: "contains",
          value: "surgical",
          weight: 6,
          active: true,
        },

        // --- Priority domestic cities: EDIT to match where the client actually ships fastest ---
        {
          ruleName: "Tier 1 City: Mumbai",
          field: "city",
          operator: "equals",
          value: "Mumbai",
          weight: 4,
          active: true,
        },
        {
          ruleName: "Tier 1 City: Delhi",
          field: "city",
          operator: "equals",
          value: "Delhi",
          weight: 4,
          active: true,
        },

        // --- Country exclusion ---
        // There's no hard "reject" operator in this scoring engine, so exclusion works
        // via a strongly negative weight that forces the score below the low-priority
        // threshold, guaranteeing these leads are never marked high/medium even if they
        // also match a positive rule above (e.g. bulk quantity).
        //
        // 'in' takes a comma-separated list of ISO country codes, matched against
        // SENDER_COUNTRY_ISO from IndiaMART's payload (field: 'country' here).
        //
        // IMPORTANT: 'PK,CN' below is a PLACEHOLDER. Replace with the client's actual
        // excluded country list before going live — medicine export restrictions are a
        // compliance/legal decision, not a technical one, and must come from the client.
        // {
        //   ruleName: 'Excluded Countries (confirm exact list with client before go-live)',
        //   field: 'country',
        //   operator: 'in',
        //   value: 'PK,CN',
        //   weight: -100,
        //   active: true
        // },

        // --- Spam filter ---
        // Kept as requested. Realistic expectation: this only catches the literal word
        // "spam" appearing in the buyer's message, which is rare in genuine spam/junk
        // enquiries. It won't catch vague one-line messages, competitor probing, or
        // clearly fake enquiries. Treat this as a minor extra signal, not a real spam
        // filter — worth revisiting once you've seen a few weeks of real lead data and
        // can spot actual junk patterns to filter on instead.
        {
          ruleName: "Spam Filter",
          field: "message",
          operator: "contains",
          value: "spam",
          weight: -15,
          active: true,
        },
      ];

      await prisma.priorityRule.createMany({
        data: defaultRules,
      });
      console.log(`Seeded ${defaultRules.length} default priority rules.`);
    }
  } catch (error) {
    console.error("Failed to seed default priority rules:", error.message);
  }
}

/**
 * Initialize and start the automated polling scheduler
 */
function startPollingScheduler() {
  const intervalSeconds = parseInt(process.env.POLL_INTERVAL_SECONDS || "300");
  const msInterval = intervalSeconds * 1000;

  console.log(
    `Setting up IndiaMART Pull API polling scheduler loop every ${intervalSeconds} seconds.`,
  );

  // Set up repeating timeout/interval
  const runScheduler = async () => {
    console.log(`[Scheduler] Executing scheduled IndiaMART lead pull...`);
    try {
      const result = await collectLeads();
      console.log(`[Scheduler] Lead pull completed. Result:`, result);
    } catch (err) {
      console.error(
        `[Scheduler] Error during scheduled lead pull:`,
        err.message,
      );
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
    console.log("Connected to SQLite Database.");

    // 2. Seed configuration rules
    await seedDefaultRules();

    // 3. Start Express server listener
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(
        `🚀 IndiaMART Lead Automation Server running on port ${PORT}`,
      );
      console.log(
        `👉 Webhook endpoint: http://localhost:${PORT}/api/leads/webhook`,
      );
      console.log(`=================================================`);

      // 4. Start scheduler loop
      startPollingScheduler();
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
}

startServer();
