const express = require('express');
const router = express.Router();
const leadController = require('../controllers/leadController');

// Leads listing (with pagination and filters)
router.get('/', leadController.getLeads);

// Trigger manual collector pull
router.post('/collect', leadController.triggerCollection);

// IndiaMART Push API Webhook Receiver
router.post('/webhook', leadController.receiveWebhook);

// Export Leads to styled Excel file
router.get('/export', leadController.exportLeads);

// Test Notification Endpoint
router.post('/notify-test', leadController.triggerTestNotification);

// Update lead status
router.patch('/:id/status', leadController.updateStatus);

// Claim a lead
router.post('/:id/claim', leadController.claimLead);

// Add note to a lead
router.post('/:id/notes', leadController.addNote);

module.exports = router;
