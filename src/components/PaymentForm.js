import React, { useState, useEffect } from 'react';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate, useLocation } from 'react-router-dom';
import './PaymentForm.css';

// Компонент для отображения карты
function CardDisplay({ cardDetails }) {
  if (!cardDetails) return null;

  return (
    <div className="card-display">
      <div className="card-chip"></div>
      <div className="card-details">
        <div className="card-number">
          **** **** **** {cardDetails.last4}
        </div>
        <div className="card-info">
          <div className="card-name">
            {cardDetails.brand.toUpperCase()}
          </div>
          <div className="card-expiry">
            {cardDetails.exp_month}/{cardDetails.exp_year.toString().slice(-2)}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentForm({ onError }) {
  const stripe = useStripe();
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const customerName = searchParams.get('customerName');
  
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stripeCustomerId, setStripeCustomerId] = useState(null);

  useEffect(() => {
    const fetchCustomerAndPaymentMethod = async () => {
      if (!customerName) {
        onError('Customer name is required');
        return;
      }

      try {
        setIsLoading(true);
        // Получаем информацию о клиенте и его платежном методе
        const response = await fetch(`/api/payment-methods?customerName=${encodeURIComponent(customerName)}`);
        const data = await response.json();

        if (data.error) {
          if (data.redirect === '/') {
            navigate(`/?customerName=${encodeURIComponent(customerName)}`);
          } else {
            onError(data.error);
          }
          return;
        }

        if (data.length > 0) {
          // Берем первый платежный метод как основной
          setCardDetails(data[0].card);
        } else {
          // Если нет платежных методов, редиректим на setup
          navigate(`/setup?customerName=${encodeURIComponent(customerName)}`);
        }
      } catch (err) {
        onError(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerAndPaymentMethod();
  }, [customerName, navigate, onError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !customerName || !amount) {
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerName,
          amount: parseInt(amount),
        }),
      });

      const data = await response.json();

      if (data.error) {
        if (data.redirect === '/') {
          navigate(`/?customerName=${encodeURIComponent(customerName)}`);
        } else {
          onError(data.error);
        }
        setIsProcessing(false);
        return;
      }

      if (data.requiresAction) {
        const { error } = await stripe.handleCardAction(data.clientSecret);
        if (error) {
          onError(error.message);
          setIsProcessing(false);
          return;
        }
      }

      navigate(`/completion?payment_intent_client_secret=${data.clientSecret}`);
    } catch (err) {
      onError(err.message);
      setIsProcessing(false);
    }
  };

  if (!customerName) {
    return <div className="error-message">Customer name is required</div>;
  }

  if (isLoading) {
    return <div className="loading">Loading payment information...</div>;
  }

  return (
    <div className="payment-container">
      <h2>Make a Payment</h2>
      <div className="customer-info">
        Customer: {customerName}
      </div>
      {cardDetails && <CardDisplay cardDetails={cardDetails} />}
      <form onSubmit={handleSubmit} className="payment-form">
        <div className="form-row">
          <label>
            Amount (in cents):
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="Enter amount in cents"
              min="1"
            />
          </label>
        </div>

        <button 
          type="submit" 
          disabled={isProcessing || !amount || !cardDetails}
        >
          {isProcessing ? 'Processing...' : 'Pay Now'}
        </button>
      </form>
    </div>
  );
}

export default PaymentForm;
