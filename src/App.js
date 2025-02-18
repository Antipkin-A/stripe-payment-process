import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import SetupForm from './components/SetupForm';
import PaymentForm from './components/PaymentForm';
import CompletionPage from './components/CompletionPage';

function App() {
  const [stripePromise, setStripePromise] = useState(null);
  const [setupIntent, setSetupIntent] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Fetch publishable key
    fetch("/config")
      .then((r) => r.json())
      .then(({ publishableKey }) => {
        setStripePromise(loadStripe(publishableKey));
      })
      .catch(err => setError('Failed to load Stripe configuration'));
  }, []);

  useEffect(() => {
    if (!paymentMethod) {
      // Create SetupIntent when no payment method is saved
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
    }
  }, [paymentMethod]);

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

  const MainPage = () => {
    if (!stripePromise || (!setupIntent && !paymentMethod)) {
      return <div>Loading...</div>;
    }

    return (
      <div className="container">
        {!paymentMethod ? (
          setupIntent && stripePromise && (
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
              <SetupForm onSetupComplete={setPaymentMethod} onError={setError} />
            </Elements>
          )
        ) : (
          <PaymentForm 
            paymentMethod={paymentMethod}
            onError={setError}
            onReset={() => setPaymentMethod(null)}
          />
        )}
        
        {error && <div className="error-message">{error}</div>}
      </div>
    );
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route 
          path="/completion" 
          element={
            stripePromise ? (
              <Elements stripe={stripePromise}>
                <CompletionPage />
              </Elements>
            ) : (
              <div>Loading...</div>
            )
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
