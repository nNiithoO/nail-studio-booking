// /api/verify-payment.js
// Verifica en el servidor (con tu Access Token secreto) si un pago realmente
// fue aprobado, usando el SDK oficial de Mercado Pago.

import { MercadoPagoConfig, Payment } from 'mercadopago';

export default async function handler(req, res) {
  const { payment_id } = req.query;

  if (!payment_id) {
    return res.status(400).json({ error: 'Falta payment_id' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const DEPOSIT_AMOUNT = 200; // MXN — debe coincidir con create-preference.js

  try {
    const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
    const payment = new Payment(client);

    const data = await payment.get({ id: payment_id });

    const approved =
      data.status === 'approved' &&
      data.transaction_amount >= DEPOSIT_AMOUNT &&
      data.currency_id === 'MXN';

    return res.status(200).json({
      approved,
      status: data.status,
      amount: data.transaction_amount,
      payer_email: data.payer?.email || null,
    });
  } catch (err) {
    console.error('Mercado Pago error:', err);
    return res.status(404).json({ approved: false, error: 'Pago no encontrado' });
  }
}

