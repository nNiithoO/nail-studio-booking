// /api/book-appointment.js
// Escribe la cita confirmada en el Google Sheet.
// - Crea encabezados automáticamente si la hoja está vacía
// - Guarda todos los datos de la cita incluyendo saldo restante del servicio
// - Doble check: verifica que el horario siga libre antes de escribir

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';

// Precio estimado por servicio (para calcular el saldo restante)
// La dueña puede editar estos valores directamente en el Sheet si lo prefiere
const PRECIOS = {
  'Acrílicas esculturales': 600,
  'Gel semipermanente': 450,
  'Pedicura': 350,
  'Exfoliación': 300,
  'Manicura': 250,
  'Botox capilar': 1200,
  'Queratina brasileña': 1500,
  'Keratina lavado inmediato': 800,
  'Keratina colombiana alisado efecto espejo': 1800,
};

const HEADERS = [
  'Fecha',
  'Hora',
  'Nombre',
  'Servicio',
  'Estado',
  'Anticipo MXN',
  'No. Operación (MP)',
  'Saldo restante',
  'Fecha de registro',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fecha, hora, servicio, nombre, telefono, monto, paymentId } = req.body || {};

  if (!fecha || !hora || !paymentId) {
    return res.status(400).json({ error: 'Faltan datos de la cita' });
  }

  try {
    const sheets = getSheetsClient();

    // 1) Leer datos existentes
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1:I`,
    });
    const rows = existing.data.values || [];

    // 2) Crear encabezados si la hoja está vacía o no los tiene
    const firstRow = rows[0] || [];
    const hasHeaders = firstRow[0] === 'Fecha';
    if (!hasHeaders) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A1:I1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS] },
      });
    }

    // 3) Verificar que el horario sigue libre (evitar doble reserva)
    const dataRows = hasHeaders ? rows.slice(1) : rows;
    const yaOcupado = dataRows.some(
      (row) => row[0] === fecha && row[1] === hora && (!row[4] || row[4].toLowerCase() !== 'cancelada')
    );

    if (yaOcupado) {
      return res.status(409).json({ ok: false, error: 'Ese horario ya fue reservado por otra persona' });
    }

    // 4) Calcular saldo restante
    const anticipo = Number(monto) || 200;
    const precioTotal = PRECIOS[servicio] || null;
    const saldoRestante = precioTotal ? `$${precioTotal - anticipo} MXN` : 'Por confirmar';

    // 5) Escribir la nueva fila
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          fecha,
          hora,
          nombre || '',
          servicio || '',
          'Cita confirmada',
          `$${anticipo} MXN`,
          paymentId || '',
          saldoRestante,
          new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
        ]],
      },
    });

    // 6) Actualizar el calendario en segundo plano (no bloquea la respuesta al cliente)
    const baseUrl = `https://${req.headers.host}`;
    fetch(`${baseUrl}/api/setup-calendar`).catch(err => console.warn('Calendar refresh failed:', err));

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Error guardando la cita' });
  }
}
