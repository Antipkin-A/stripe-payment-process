require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const sequelize = require('./config/database');
const InternalCustomer = require('./models/InternalCustomer');

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

// Create or retrieve customer
async function getOrCreateCustomer(customerName) {
  try {
    // Check if customer exists in our database
    let internalCustomer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!internalCustomer) {
      // Create new Stripe customer
      const stripeCustomer = await stripe.customers.create({
        name: customerName,
        description: `Customer for ${customerName}`,
      });

      // Create internal customer record
      internalCustomer = await InternalCustomer.create({
        customerName,
        stripeCustomerId: stripeCustomer.id
      });
    }

    return internalCustomer;
  } catch (error) {
    console.error('Error in getOrCreateCustomer:', error);
    throw error;
  }
}

// Create SetupIntent
app.post('/api/setup-intent', async (req, res) => {
  try {
    const { customerName } = req.body;
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const customer = await getOrCreateCustomer(customerName);
    
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.stripeCustomerId,
      payment_method_types: ['card', 'sepa_debit', 'ideal', 'bancontact', 'sofort'],
      usage: 'off_session'
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.stripeCustomerId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Detach old payment methods
app.post('/api/detach-payment-methods', async (req, res) => {
  try {
    const { customerName } = req.body;
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const customer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get existing payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: 'card'
    });

    // Detach all existing payment methods
    for (const pm of paymentMethods.data) {
      await stripe.paymentMethods.detach(pm.id);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create PaymentIntent
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, customerName } = req.body;
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Find existing customer
    const internalCustomer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!internalCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get customer's payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: internalCustomer.stripeCustomerId,
      type: 'card'
    });

    if (paymentMethods.data.length === 0) {
      return res.status(400).json({ 
        error: 'No payment methods found',
        redirect: '/'
      });
    }

    // Use the first payment method as default if no default is set
    const defaultPaymentMethod = paymentMethods.data[0].id;

    // Create the payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      customer: internalCustomer.stripeCustomerId,
      payment_method: defaultPaymentMethod,
      off_session: true,
      confirm: true,
    });

    res.json({
      paymentIntent,
      requiresAction: paymentIntent.status === 'requires_action',
      clientSecret: paymentIntent.client_secret
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer payment methods
app.get('/api/payment-methods', async (req, res) => {
  try {
    const { customerName } = req.query;
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const internalCustomer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!internalCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: internalCustomer.stripeCustomerId,
      type: 'card',
    });

    res.json(paymentMethods.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specific payment method
app.get('/api/payment-methods/:paymentMethodId', async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    res.json(paymentMethod);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new endpoint to handle customer payment flow
app.get('/api/customer-payment-flow', async (req, res) => {
  try {
    const { customerName } = req.query;
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Find customer in database
    const internalCustomer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!internalCustomer) {
      return res.status(404).json({ 
        error: 'Customer not found',
        redirect: '/'
      });
    }

    // Get customer's payment methods from Stripe
    const paymentMethods = await stripe.paymentMethods.list({
      customer: internalCustomer.stripeCustomerId,
      type: 'card'
    });

    if (paymentMethods.data.length === 0) {
      // No payment methods - redirect to setup
      return res.json({
        customerId: internalCustomer.stripeCustomerId,
        redirect: '/'
      });
    }

    // Has payment method - can proceed to payment
    return res.json({
      customerId: internalCustomer.stripeCustomerId,
      redirect: '/payment',
      paymentMethods: paymentMethods.data
    });

  } catch (error) {
    console.error('Error in customer-payment-flow:', error);
    res.status(500).json({ error: error.message });
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

// Initialize database
sequelize.sync()
  .then(() => {
    console.log('Database synchronized successfully');
  })
  .catch((err) => {
    console.error('Failed to sync database:', err);
  });

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Server running on port ${port}`));
