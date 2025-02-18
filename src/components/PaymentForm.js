import React, { useState } from 'react';
import { useStripe } from '@stripe/react-stripe-js';

function PaymentForm({ paymentMethod, onError, onReset }) {
  const stripe = useStripe();
  const [amount, setAmount] = useState(1000);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe) {
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('/create-payment-intent', {
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
      } else {
        switch (data.status) {
          case 'succeeded':
            onError('Payment successful!');
            break;
          case 'requires_payment_method':
            onError('Your payment was not successful, please try again.');
            break;
          default:
            onError('Something went wrong.');
            break;
        }
      }
    } catch (err) {
      onError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div>
      <h2>Make a Payment</h2>
      <p>Use your saved card to make a payment</p>
      
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label htmlFor="amount">Amount (in cents)</label>
          <input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount in cents"
            min="50"
            required
            disabled={isProcessing}
          />
        </div>

        <button type="submit" disabled={!stripe || isProcessing}>
          {isProcessing ? 'Processing...' : 'Pay Now'}
        </button>

        <button 
          type="button" 
          onClick={onReset}
          className="secondary"
          disabled={isProcessing}
        >
          Use Different Card
        </button>
      </form>
    </div>
  );
}

export default PaymentForm;
