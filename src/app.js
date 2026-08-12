const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const leadRoutes = require('./routes/leadRoutes');

const app = express();

// Webhook rate limiter (max 100 requests per 1 minute window per IP)
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests to webhook endpoint. Rate limit exceeded.'
  }
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply rate limiter specifically to webhook endpoint
app.use('/api/leads/webhook', webhookLimiter);

// HTTP logging
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// API Routes
app.use('/api/leads', leadRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found.'
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

module.exports = app;
