import React, { useState, useEffect } from 'react';
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
  const [isReplacingCard, setIsReplacingCard] = useState(false);

  useEffect(() => {
    // Check if customer has existing payment methods
    const checkExistingPaymentMethods = async () => {
      if (!customerName) return;

      try {
        const response = await fetch(`/api/payment-methods?customerName=${encodeURIComponent(customerName)}`);
        const data = await response.json();

        if (!data.error && data.length > 0) {
          setIsReplacingCard(true);
        }
      } catch (err) {
        console.error('Error checking payment methods:', err);
      }
    };

    checkExistingPaymentMethods();
  }, [customerName]);

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
        // Если у клиента были старые методы оплаты, удаляем их после успешного добавления нового
        if (isReplacingCard) {
          try {
            await fetch('/api/detach-payment-methods', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ customerName }),
            });
          } catch (detachError) {
            console.error('Error detaching old payment methods:', detachError);
            // Продолжаем выполнение, так как новый метод уже добавлен
          }
        }
        
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
      <h2 className="setup-title">
        {isReplacingCard ? 'Replace Payment Method' : 'Set Up Payment Method'}
      </h2>
      <div className="customer-info">
        {isReplacingCard ? 
          `Replacing payment method for: ${customerName}` : 
          `Setting up payment method for: ${customerName}`
        }
        {isReplacingCard && (
          <div className="warning-message">
            Note: This will replace your existing payment method
          </div>
        )}
      </div>
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
                  }
                }
              }
            }}
          />
        </div>
        <button 
          type="submit" 
          disabled={isProcessing || !stripe}
          className="submit-button"
        >
          {isProcessing ? 'Processing...' : (isReplacingCard ? 'Replace Payment Method' : 'Save Payment Method')}
        </button>
      </form>
    </div>
  );
}

export default SetupForm;
