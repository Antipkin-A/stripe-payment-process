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

// Create or retrieve customer
async function getOrCreateCustomer() {
  // В реальном приложении здесь будет логика получения customer_id из базы данных
  // или создания нового customer для текущего пользователя
  const customers = await stripe.customers.list({
    limit: 1,
  });

  if (customers.data.length > 0) {
    return customers.data[0];
  }

  const customer = await stripe.customers.create({
    description: 'Test Customer',
  });

  return customer;
}

// Create SetupIntent
app.post('/api/create-setup-intent', async (req, res) => {
  try {
    const customer = await getOrCreateCustomer();
    
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      payment_method_types: ['card'],
      usage: 'off_session'
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: customer.id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create PaymentIntent
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    
    // Получаем или создаем customer
    const customer = await getOrCreateCustomer();

    // Привязываем payment method к customer, если еще не привязан
    try {
      await stripe.paymentMethods.attach(paymentMethod, {
        customer: customer.id,
      });
    } catch (err) {
      // Игнорируем ошибку, если payment method уже привязан
      if (err.code !== 'resource_already_exists') {
        throw err;
      }
    }

    // Устанавливаем payment method как default для customer
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethod,
      },
    });
    
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'eur',
      customer: customer.id,
      payment_method: paymentMethod,
      off_session: true,
      confirm: true,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      status: paymentIntent.status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get customer payment methods
app.get('/api/payment-methods', async (req, res) => {
  try {
    const customer = await getOrCreateCustomer();
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customer.id,
      type: 'card',
    });

    res.json(paymentMethods.data);
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
