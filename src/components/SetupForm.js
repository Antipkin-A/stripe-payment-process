import React, { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useNavigate, useLocation } from 'react-router-dom';
import './SetupForm.css';

function SetupForm({ onSetupComplete, onError }) {
  const stripe = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const customerName = searchParams.get('customerName');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || !customerName) {
      return;
    }

    setIsProcessing(true);

    try {
      const { setupIntent, error } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/completion?customerName=${encodeURIComponent(customerName)}`,
        },
      });

      if (error) {
        onError(error.message);
      } else if (setupIntent.status === "succeeded") {
        // After successful setup, redirect to payment page
        navigate(`/payment?customerName=${encodeURIComponent(customerName)}`);
        onError('');
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!customerName) {
    return <div className="setup-container">
      <div className="error-message">Error: Customer name is required</div>
    </div>;
  }

  return (
    <div className="setup-container">
      <h2 className="setup-title">Set Up Payment Method</h2>
      <div className="customer-info">Setting up payment method for: {customerName}</div>
      <form onSubmit={handleSubmit} className="setup-form">
        <div className="payment-element">
          <PaymentElement
            options={{
              layout: {
                type: 'tabs',
                defaultCollapsed: false,
                radios: true,
                spacedAccordionItems: true
              },
              paymentMethodOrder: ['card', 'sepa_debit', 'ideal', 'bancontact', 'sofort'],
              defaultValues: {
                billingDetails: {
                  name: customerName,
                  email: 'Auto',
                  address: {
                    country: 'DE',
                  },
                },
              },
              fields: {
                billingDetails: {
                  name: 'auto',
                  email: 'auto',
                  address: {
                    country: 'auto',
                  },
                },
              },
              terms: {
                bancontact: 'auto',
                card: 'auto',
                ideal: 'auto',
                sepaDebit: 'auto',
                sofort: 'auto',
              },
              wallets: {
                applePay: 'auto',
                googlePay: 'auto'
              }
            }}
          />
        </div>

        <button 
          type="submit" 
          disabled={!stripe || isProcessing} 
          className="submit-button"
        >
          {isProcessing ? (
            <>
              <span className="loading"></span>
              Setting up...
            </>
          ) : (
            'Save Card'
          )}
        </button>
      </form>
    </div>
  );
}

export default SetupForm;
