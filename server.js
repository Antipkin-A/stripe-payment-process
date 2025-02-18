require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Serve static files from the React app
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Get Stripe publishable key
app.get('/config', async (req, res) => {
  res.json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
});

// Create SetupIntent
app.post('/create-setup-intent', async (req, res) => {
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
app.post('/create-payment-intent', async (req, res) => {
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
      return_url: `${req.headers.origin}/completion`
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer's saved payment methods
app.get('/payment-methods', async (req, res) => {
  try {
    const { customerId } = req.query;
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
    res.json(paymentMethods.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on port ${port}`));
