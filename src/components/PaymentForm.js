import React, { useState } from 'react';
import { useStripe } from '@stripe/react-stripe-js';
import { useNavigate } from 'react-router-dom';

function PaymentForm({ paymentMethod, onError }) {
  const stripe = useStripe();
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

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

      // Перенаправляем на страницу completion с payment_intent_client_secret
      navigate(`/completion?payment_intent_client_secret=${data.clientSecret}`);
    } catch (err) {
      onError(err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <h2>Make a Payment</h2>
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
            />
          </label>
        </div>
        <button type="submit" disabled={isProcessing || !stripe}>
          {isProcessing ? 'Processing...' : 'Pay'}
        </button>
      </form>
    </div>
  );
}

export default PaymentForm;
