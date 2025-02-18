import React, { useState, useEffect } from 'react';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate } from 'react-router-dom';
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

function PaymentForm({ paymentMethod, onError }) {
  const stripe = useStripe();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardDetails, setCardDetails] = useState(null);

  useEffect(() => {
    // Получаем детали платежного метода при монтировании
    const fetchPaymentMethod = async () => {
      try {
        const response = await fetch(`/api/payment-methods/${paymentMethod}`);
        const data = await response.json();
        if (data.error) {
          onError(data.error);
        } else {
          setCardDetails(data.card);
        }
      } catch (err) {
        onError(err.message);
      }
    };

    if (paymentMethod) {
      fetchPaymentMethod();
    }
  }, [paymentMethod, onError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !paymentMethod || !amount) {
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
          paymentMethod,
          amount: parseInt(amount),
        }),
      });

      const data = await response.json();

      if (data.error) {
        onError(data.error);
        setIsProcessing(false);
        return;
      }

      navigate(`/completion?payment_intent_client_secret=${data.clientSecret}`);
    } catch (err) {
      onError(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="payment-container">
      <h2>Make a Payment</h2>
      <CardDisplay cardDetails={cardDetails} />
      <form onSubmit={handleSubmit} className="payment-form">
        <div className="form-row">
          <label>
            Amount (in cents):
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isProcessing}
              required
              min="50"
              placeholder="Enter amount in cents"
            />
          </label>
        </div>
        <button 
          type="submit" 
          disabled={isProcessing || !stripe || !cardDetails}
          className="submit-button"
        >
          {isProcessing ? 'Processing...' : 'Pay'}
        </button>
      </form>
    </div>
  );
}

export default PaymentForm;
