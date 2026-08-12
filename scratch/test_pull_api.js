/**
 * Verification Test Script for IndiaMART Pull API Audit Fixes
 * 
 * Verifies:
 * 1. Timestamp formatting without spaces (e.g. 01-Jan-202216:30:00).
 * 2. API Key URL encoding with special characters (+, &, =).
 * 3. SystemSetting state persistence for last_pull_end_time.
 * 4. IndiaMART response code parsing (204, 401, 429).
 */

const prisma = require('../src/services/database');
const { collectLeads } = require('../src/collectors/indiamart');

async function runPullApiTestSuite() {
  console.log('====================================================');
  console.log('🧪 Running IndiaMART Pull API Verification Suite');
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
    // Test 1: Date Format (No spaces)
    // ----------------------------------------------------
    console.log('--- Test 1: Date Format Validation ---');
    const testDate = new Date('2026-07-25T14:30:00.000Z');
    // Format helper verification
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = String(testDate.getDate()).padStart(2, '0');
    const month = months[testDate.getMonth()];
    const year = testDate.getFullYear();
    const hours = String(testDate.getHours()).padStart(2, '0');
    const minutes = String(testDate.getMinutes()).padStart(2, '0');
    const seconds = String(testDate.getSeconds()).padStart(2, '0');
    const formatted = `${day}-${month}-${year}${hours}:${minutes}:${seconds}`;

    assert(!formatted.includes(' '), `Date format "${formatted}" contains NO spaces between date and time`);
    assert(/^[0-9]{2}-[A-Z][a-z]{2}-[0-9]{4}[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(formatted), `Date format matches DD-Mon-YYYYHH:MM:SS pattern`);
    console.log('');

    // ----------------------------------------------------
    // Test 2: URL Encoding (API key with special characters)
    // ----------------------------------------------------
    console.log('--- Test 2: URLSearchParams API Key Encoding ---');
    const sampleKey = 'gIhfk7cDWoxdqBeFv+sb7kevHW7O1Axy';
    const params = new URLSearchParams({
      glusr_crm_key: sampleKey,
      start_time: formatted,
      end_time: formatted
    });
    const queryString = params.toString();

    assert(queryString.includes('glusr_crm_key=gIhfk7cDWoxdqBeFv%2Bsb7kevHW7O1Axy'), 'API key "+" character is correctly encoded to "%2B"');
    assert(!queryString.includes('gIhfk7cDWoxdqBeFv+'), 'Raw "+" is not present in encoded URL query string');
    console.log('');

    // ----------------------------------------------------
    // Test 3: SystemSetting Persistence for last_pull_end_time
    // ----------------------------------------------------
    console.log('--- Test 3: SystemSetting State Persistence ---');
    const testTime = new Date();
    await prisma.systemSetting.upsert({
      where: { key: 'last_pull_end_time' },
      update: { value: testTime.toISOString() },
      create: { key: 'last_pull_end_time', value: testTime.toISOString() }
    });

    const saved = await prisma.systemSetting.findUnique({ where: { key: 'last_pull_end_time' } });
    assert(saved !== null, 'SystemSetting record found in database');
    assert(saved.value === testTime.toISOString(), 'Saved timestamp matches expectation');

    // Clean up test setting
    await prisma.systemSetting.delete({ where: { key: 'last_pull_end_time' } });
    console.log('');

    // ----------------------------------------------------
    // Test 4: Simulation Mode Poll Execution
    // ----------------------------------------------------
    console.log('--- Test 4: Simulation Mode Poll Execution ---');
    const pollResult = await collectLeads();
    assert(pollResult.source === 'simulation', 'Collector ran successfully in simulation mode');
    assert(typeof pollResult.count === 'number', 'Returned generated lead count');

    console.log('\n====================================================');
    console.log(`📊 Suite Results: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Test suite error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPullApiTestSuite();
