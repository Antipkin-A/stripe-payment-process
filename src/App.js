import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import SetupForm from './components/SetupForm';
import PaymentForm from './components/PaymentForm';
import CompletionPage from './components/CompletionPage';

// Компонент для настройки новой карты
function SetupPage({ stripePromise }) {
  const [setupIntent, setSetupIntent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch("/api/create-setup-intent", {
      method: "POST",
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setSetupIntent(data.clientSecret);
        }
      })
      .catch(err => setError('Failed to create setup intent'));
  }, []);

  if (!setupIntent) {
    return <div>Loading...</div>;
  }

  const appearance = {
    theme: 'stripe',
    variables: {
      colorPrimary: '#5469d4',
      colorBackground: '#ffffff',
      colorText: '#30313d',
      colorDanger: '#df1b41',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      spacingUnit: '4px',
      borderRadius: '4px',
    },
    rules: {
      '.Tab': {
        border: '1px solid #e6e6e6',
        boxShadow: '0px 1px 1px rgba(0, 0, 0, 0.03)',
        marginBottom: '8px',
      },
      '.Tab:hover': {
        color: '#5469d4',
      },
      '.Tab--selected': {
        color: '#5469d4',
        border: '1px solid #5469d4',
      },
      '.Label': {
        fontWeight: '500',
      },
    },
  };

  return (
    <div className="container">
      <Elements 
        stripe={stripePromise} 
        options={{ 
          clientSecret: setupIntent,
          appearance,
          layout: {
            type: 'tabs',
            defaultCollapsed: false,
          }
        }}
      >
        <SetupForm onError={setError} />
      </Elements>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

// Компонент для проведения платежа
function PaymentPage({ stripePromise }) {
  const [error, setError] = useState('');
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const paymentMethod = params.get('payment_method');

  if (!paymentMethod) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="container">
      <Elements stripe={stripePromise}>
        <PaymentForm 
          paymentMethod={paymentMethod}
          onError={setError}
        />
      </Elements>
      {error && <div className="error-message">{error}</div>}
    </div>
  );
}

// Компонент для страницы завершения
function CompletionRoute({ stripePromise }) {
  return (
    <Elements stripe={stripePromise}>
      <CompletionPage />
    </Elements>
  );
}

// Основной компонент приложения
function App() {
  const [stripePromise, setStripePromise] = useState(null);

  useEffect(() => {
    fetch("/config")
      .then((r) => r.json())
      .then(({ publishableKey }) => {
        setStripePromise(loadStripe(publishableKey));
      });
  }, []);

  if (!stripePromise) {
    return <div>Loading Stripe configuration...</div>;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SetupPage stripePromise={stripePromise} />} />
        <Route path="/payment" element={<PaymentPage stripePromise={stripePromise} />} />
        <Route path="/completion" element={<CompletionRoute stripePromise={stripePromise} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
