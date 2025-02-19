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

    // Сначала проверяем, существует ли клиент
    let customer = await InternalCustomer.findOne({
      where: { customerName }
    });

    let stripeCustomerId;

    if (!customer) {
      // Если клиент не существует, создаем нового в Stripe
      const stripeCustomer = await stripe.customers.create({
        name: customerName,
        metadata: {
          internalName: customerName
        }
      });

      // Создаем запись в базе данных
      customer = await InternalCustomer.create({
        customerName,
        stripeCustomerId: stripeCustomer.id
      });

      stripeCustomerId = stripeCustomer.id;
    } else {
      stripeCustomerId = customer.stripeCustomerId;
    }
    
    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ['card', 'sepa_debit', 'ideal', 'bancontact', 'sofort'],
      usage: 'off_session'
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId
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
    const { amount, currency, customerName } = req.body;
    
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Find existing customer
    const customer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!customer) {
      return res.status(404).json({ 
        error: 'Customer not found',
        redirect: '/'
      });
    }

    // Get customer's payment methods
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: 'card'
    });

    if (paymentMethods.data.length === 0) {
      return res.status(400).json({ 
        error: 'No payment methods found',
        redirect: '/'
      });
    }

    // Use the first payment method
    const paymentMethod = paymentMethods.data[0].id;

    // Create the invoice first
    const invoice = await stripe.invoices.create({
      customer: customer.stripeCustomerId,
      auto_advance: false,
      collection_method: 'charge_automatically',
      currency,
      description: `Wallet deposit for ${customerName}`,
      payment_settings: {
        payment_method_types: ['card'],
        payment_method_options: {
          card: {
            request_three_d_secure: 'automatic'
          }
        }
      },
    });

    // Create an invoice item and attach it to the invoice
    await stripe.invoiceItems.create({
      customer: customer.stripeCustomerId,
      amount,
      currency,
      description: `Wallet deposit for ${customerName}`,
      invoice: invoice.id  // Attach item to the invoice
    });

    // Finalize the invoice to include the items
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id, {
      payment_method: paymentMethod
    });

    // The invoice will be automatically marked as paid when the payment succeeds
    const finallyInvoice = await stripe.invoices.retrieve(paidInvoice.id);

    res.json({
      requiresAction: false,
      invoice: finallyInvoice
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

    // Проверяем существует ли клиент
    const customer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!customer) {
      return res.status(404).json({ 
        error: 'Customer not found',
        redirect: '/'
      });
    }

    // Получаем методы оплаты
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.stripeCustomerId,
      type: 'card'
    });

    res.json(paymentMethods.data.map(pm => ({
      id: pm.id,
      card: pm.card,
      customer: customer.stripeCustomerId
    })));
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

// Create customer portal session
app.post('/api/create-portal-session', async (req, res) => {
  try {
    const { customerName } = req.body;
    if (!customerName) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    const customer = await InternalCustomer.findOne({
      where: { customerName }
    });

    if (!customer) {
      return res.status(404).json({ 
        error: 'Customer not found',
        redirect: '/'
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customer.stripeCustomerId,
      return_url: `${req.headers.origin}/payment?customerName=${encodeURIComponent(customerName)}`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process refund
app.post('/api/refund', async (req, res) => {
  try {
    const { paymentMethod, amount, currency } = req.body;

    // Create a refund
    const refund = await stripe.refunds.create({
      payment_intent: paymentMethod,
      amount: amount,
      currency: currency,
    });

    res.json(refund);
  } catch (error) {
    console.error('Error processing refund:', error);
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
