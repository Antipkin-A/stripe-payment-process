import React, { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

function SetupForm({ onSetupComplete, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { setupIntent, error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/completion`
        },
      });

      if (error) {
        onError(error.message);
      } else if (setupIntent.status === "succeeded") {
        onSetupComplete(setupIntent.payment_method);
        onError('');
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Setup Payment Method</h2>
      <p>Enter your card details to save for future payments</p>
      
      <div className="payment-element">
        <PaymentElement
          options={{
            layout: {
              type: 'tabs',
              defaultCollapsed: false,
            },
            fields: {
              billingDetails: 'auto'
            }
          }}
        />
      </div>

      <button type="submit" disabled={!stripe || isProcessing}>
        {isProcessing ? 'Setting up...' : 'Save Card'}
      </button>
    </form>
  );
}

export default SetupForm;
