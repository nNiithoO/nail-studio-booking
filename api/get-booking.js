// /api/get-booking.js
// Busca una cita por su payment_id en el Google Sheet.
// La página de reagendación la usa para mostrar los datos actuales de la cita.

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) return res.status(400).json({ error: 'Falta el ID de la cita' });

  try {
    const sheets = getSheetsClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A2:I`,
    });

    const rows = result.data.values || [];

    // Columnas: A=Fecha B=Hora C=Nombre D=Servicio E=Estado F=Anticipo G=PaymentID H=Saldo I=FechaRegistro
    const rowIndex = rows.findIndex(r => r[6] === id);

    if (rowIndex === -1) {
      return res.status(404).json({ error: 'Cita no encontrada' });
    }

    const row = rows[rowIndex];

    return res.status(200).json({
      rowIndex: rowIndex + 2,
      fecha: row[0],
      hora: row[1],
      nombre: row[2],
      servicio: row[3],
      estado: row[4],
      monto: row[5],
      paymentId: row[6],
      saldo: row[7],
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error leyendo el calendario' });
  }
}
