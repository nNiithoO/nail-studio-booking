// /api/create-preference.js
// Crea una preferencia de pago (Checkout Pro) por el monto del anticipo,
// usando el SDK oficial de Mercado Pago (más confiable que llamar la API a mano).

import { MercadoPagoConfig, Preference } from 'mercadopago';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
  const DEPOSIT_AMOUNT = 200; // MXN — debe coincidir con el monto mostrado en el front-end

  const { service, name, phone } = req.body || {};
  const siteUrl = `https://${req.headers.host}`;

  try {
    const client = new MercadoPagoConfig({ accessToken: ACCESS_TOKEN });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: [
          {
            id: 'anticipo-cita',
            title: `Anticipo - ${service || 'Cita ODIOSA Studio'}`,
            quantity: 1,
            unit_price: DEPOSIT_AMOUNT,
            currency_id: 'MXN',
          },
        ],
        back_urls: {
          success: `${siteUrl}/?pago=resultado`,
          failure: `${siteUrl}/?pago=resultado`,
          pending: `${siteUrl}/?pago=resultado`,
        },
        auto_return: 'approved',
        statement_descriptor: 'ODIOSA STUDIO',
      },
    });

    return res.status(200).json({ init_point: result.init_point, preference_id: result.id });
  } catch (err) {
    console.error('Mercado Pago error:', err);
    return res.status(500).json({ error: 'No se pudo crear la preferencia de pago', detail: err.message });
  }
}

