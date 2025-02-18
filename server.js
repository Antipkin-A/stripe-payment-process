require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');

// Парсинг аргументов командной строки с помощью yargs
const argv = yargs(hideBin(process.argv))
  .option('mode', {
    alias: 'm',
    type: 'string',
    description: 'Run mode (development or production)',
    choices: ['development', 'production'],
    default: 'production'
  })
  .argv;

const isDevelopment = argv.mode === 'development';
console.log('Running in', isDevelopment ? 'development' : 'production', 'mode');

const app = express();
app.use(express.json());

// Get Stripe publishable key
app.get('/config', async (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

// Create SetupIntent
app.post('/api/create-setup-intent', async (req, res) => {
  try {
    const setupIntent = await stripe.setupIntents.create({
      payment_method_types: ['card', 'sepa_debit', 'ideal', 'bancontact', 'sofort'],
      usage: 'off_session'
    });

    res.json({
      clientSecret: setupIntent.client_secret
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create PaymentIntent using saved payment method
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      payment_method: paymentMethod,
      payment_method_types: ['card', 'sepa_debit', 'ideal', 'bancontact', 'sofort'],
      confirmation_method: 'manual',
      confirm: true,
      off_session: true,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (!isDevelopment) {
  // В production режиме сервим статические файлы
  app.use(express.static(path.join(__dirname, 'dist')));
  
  // Все остальные GET запросы отправляем на index.html
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
}

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on port ${port}`));
