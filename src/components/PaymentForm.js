import React, { useState, useEffect } from 'react';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate, Link } from 'react-router-dom';
import './PaymentForm.css';

// Компонент для отображения метода оплаты
function PaymentMethodDisplay({ cardDetails }) {
  const getBrandName = (brand) => {
    const brands = {
      visa: 'Visa',
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      jcb: 'JCB',
      diners: 'Diners Club',
      unionpay: 'UnionPay'
    };
    return brands[brand.toLowerCase()] || brand;
  };

  return (
    <div className="payment-method-display">
      <div className="payment-method-info">
        <div className="payment-method-row">
          <div className="payment-method-brand-icon">
            {getBrandName(cardDetails.brand)}
          </div>
          <div className="payment-method-details">
            <span className="payment-method-dots">••••</span>
            <span className="payment-method-last4">{cardDetails.last4}</span>
            <span className="payment-method-separator">·</span>
            <span className="payment-method-expiry">
              {cardDetails.exp_month.toString().padStart(2, '0')}/{cardDetails.exp_year.toString().slice(-2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ onError }) {
  const stripe = useStripe();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('eur');
  const [cardDetails, setCardDetails] = useState(null);
  const [hasPaymentMethod, setHasPaymentMethod] = useState(true);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);

  // Поддерживаемые валюты
  const currencies = [
    { code: 'usd', symbol: '$', name: 'USD' },
    { code: 'eur', symbol: '€', name: 'EUR' },
    { code: 'gbp', symbol: '£', name: 'GBP' }
  ];

  // Get customerName from URL parameters
  const searchParams = new URLSearchParams(window.location.search);
  const customerName = searchParams.get('customerName');

  useEffect(() => {
    const fetchCustomerAndPaymentMethod = async () => {
      if (!customerName) {
        onError('Customer name is required');
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetch(`/api/payment-methods?customerName=${encodeURIComponent(customerName)}`);
        const data = await response.json();

        if (data.error) {
          if (data.redirect === '/') {
            setHasPaymentMethod(false);
          } else {
            onError(data.error);
          }
          return;
        }

        if (data.length > 0) {
          setCardDetails(data[0].card);
          setStripeCustomerId(data[0].customer);
          setHasPaymentMethod(true);
        } else {
          setHasPaymentMethod(false);
        }
      } catch (err) {
        onError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerAndPaymentMethod();
  }, [customerName, onError]);

  const handlePortalRedirect = async () => {
    try {
      const response = await fetch('/api/create-portal-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ customerName }),
      });

      const { url } = await response.json();
      window.location.href = url;
    } catch (err) {
      onError('Could not redirect to customer portal');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsProcessing(true);

    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName: searchParams.get('customerName'),
          amount: Math.round(parseFloat(amount) * 100),
          currency,
        }),
      });

      const data = await response.json();

      if (data.error) {
        if (data.redirect) {
          navigate(data.redirect);
          return;
        }
        throw new Error(data.error);
      }

      if (data.requiresAction) {
        const { error } = await stripe.handleCardAction(data.clientSecret);
        if (error) {
          throw error;
        }
      }

      // Store invoice ID in session storage for the completion page
      if (data.invoice) {
        sessionStorage.setItem('lastInvoiceId', data.invoice.id);
      }

      // Navigate to completion page with payment and invoice info
      navigate('/completion', {
        state: {
          paymentIntent: data.paymentIntent,
          invoice: data.invoice
        }
      });

    } catch (error) {
      console.error('Payment error:', error);
      onError?.(error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="payment-container">
        <div className="loading-message">Loading payment information...</div>
      </div>
    );
  }

  if (!hasPaymentMethod) {
    return (
      <div className="payment-container">
        <div className="no-payment-method">
          <h2>No Payment Method Found</h2>
          <p>There is no payment method set up for customer: <strong>{customerName}</strong></p>
          <p>Please set up a payment method to continue.</p>
          <Link to={`/?customerName=${encodeURIComponent(customerName)}`} className="setup-link">
            Set Up Payment Method
          </Link>
        </div>
      </div>
    );
  }

  if (!customerName) {
    return <div className="error-message">Customer name is required</div>;
  }

  return (
    <div className="payment-container">
      <h2>Make a Payment</h2>
      <div className="customer-info">
        Customer: {customerName}
      </div>
      {cardDetails && <PaymentMethodDisplay cardDetails={cardDetails} />}
      <form onSubmit={handleSubmit} className="payment-form">
        <div className="form-row amount-row">
          <div className="amount-input-group">
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="currency-select"
            >
              {currencies.map(curr => (
                <option key={curr.code} value={curr.code}>
                  {curr.symbol} {curr.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              required
              min="0.01"
              step="0.01"
              className="amount-input"
            />
          </div>
        </div>
        <button 
          type="submit"
          disabled={!stripe || isProcessing || !amount}
          className="submit-button"
        >
          {isProcessing ? 'Processing...' : 'Pay Now'}
        </button>
      </form>
      {stripeCustomerId && (
        <div className="portal-link-container">
          <button onClick={handlePortalRedirect} className="portal-link">
            Manage Payment Methods
          </button>
        </div>
      )}
    </div>
  );
}

export default PaymentForm;
