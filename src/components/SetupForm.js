import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

const SetupForm = ({ onSetupComplete, onError }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);

    try {
      const { setupIntent, error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/completion`,
          payment_method_data: {
            billing_details: {
              address: {
                country: 'DE',
              },
            },
          },
        },
      });

      if (error) {
        onError(error.message);
      } else {
        const paymentMethod = setupIntent.payment_method;
        onSetupComplete(paymentMethod);
      }
    } catch (err) {
      onError('An unexpected error occurred.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="payment-element-container">
        <h3>Add Payment Method</h3>
        <p>We accept cards, SEPA Direct Debit, iDEAL, Bancontact, and SOFORT.</p>
        <PaymentElement />
      </div>
      <button
        type="submit"
        disabled={!stripe || processing}
        className="submit-button"
      >
        {processing ? 'Setting up...' : 'Save Payment Method'}
      </button>
    </form>
  );
};

export default SetupForm;
