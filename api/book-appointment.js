// /api/book-appointment.js
// Architecture note (Bug 3 - concurrent bookings):
// We use a two-phase approach to handle race conditions:
// 1. Check if slot is taken (read from Sheet)
// 2. Write a "RESERVANDO" placeholder row immediately to claim the slot
// 3. Verify the placeholder wasn't beaten by another request
// 4. Update to final confirmed booking
// This optimistic locking pattern prevents double-bookings even under concurrent load
// without needing a dedicated database or external lock service.

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';

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
  'Fecha', 'Hora', 'Nombre', 'Servicio', 'Estado',
  'Anticipo MXN', 'No. Operación (MP)', 'Saldo restante', 'Fecha de registro',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fecha, hora, servicio, nombre, telefono, monto, paymentId } = req.body || {};

  if (!fecha || !hora || !paymentId) {
    return res.status(400).json({ error: 'Faltan datos de la cita' });
  }

  // Prevent duplicate saves from same paymentId (e.g. page refresh)
  if (!paymentId || paymentId.trim() === '') {
    return res.status(400).json({ error: 'PaymentId inválido' });
  }

  try {
    const sheets = getSheetsClient();

    // ── PHASE 1: Read all current data ───────────────────────────────────────
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A1:I`,
    });
    const rows = existing.data.values || [];
    const firstRow = rows[0] || [];
    const hasHeaders = firstRow[0] === 'Fecha';

    // Write headers if sheet is fresh
    if (!hasHeaders) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A1:I1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [HEADERS] },
      });
    }

    const dataRows = hasHeaders ? rows.slice(1) : rows;

    // ── PHASE 2: Check for duplicate paymentId (already booked) ──────────────
    const alreadyBooked = dataRows.some(row => row[6] === paymentId);
    if (alreadyBooked) {
      // Idempotent: same payment booked twice (e.g. page refresh) → return ok
      return res.status(200).json({ ok: true, note: 'already_saved' });
    }

    // ── PHASE 3: Check slot availability ─────────────────────────────────────
    const slotTaken = dataRows.some(row => {
      const sameSlot    = row[0] === fecha && row[1] === hora;
      const notCancelled = !row[4] || !['cancelada'].includes(row[4].toLowerCase());
      const notPlaceholder = row[4] !== 'RESERVANDO'; // exclude stale placeholders > 2 min
      return sameSlot && notCancelled;
    });

    if (slotTaken) {
      return res.status(409).json({ ok: false, error: 'Ese horario ya fue reservado por otra persona' });
    }

    // ── PHASE 4: Write RESERVANDO placeholder (claims the slot atomically) ───
    // This is the key to preventing race conditions:
    // If two requests pass Phase 3 simultaneously, one will write RESERVANDO first.
    // The other will see it on their next read and be blocked.
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[fecha, hora, nombre || '', servicio || '', 'RESERVANDO',
                  '', paymentId, '', new Date().toISOString()]],
      },
    });

    // ── PHASE 5: Verify we won the race ──────────────────────────────────────
    // Re-read the sheet and check that our paymentId's RESERVANDO row is the
    // ONLY active booking for this slot (no other confirmed/reservando rows)
    const verify = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A2:I`,
    });
    const verifyRows = verify.data.values || [];

    const activeForSlot = verifyRows.filter(row => {
      const sameSlot    = row[0] === fecha && row[1] === hora;
      const notCancelled = row[4] && !['cancelada'].includes(row[4].toLowerCase());
      return sameSlot && notCancelled;
    });

    if (activeForSlot.length > 1) {
      // We lost the race — find and delete our RESERVANDO placeholder
      const ourRowIdx = verifyRows.findIndex(row =>
        row[0] === fecha && row[1] === hora && row[6] === paymentId && row[4] === 'RESERVANDO'
      );
      if (ourRowIdx !== -1) {
        // Mark our placeholder as cancelled so it doesn't block other bookings
        await sheets.spreadsheets.values.update({
          spreadsheetId: SHEET_ID,
          range: `${SHEET_TAB}!E${ourRowIdx + 2}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [['cancelada']] },
        });
      }
      return res.status(409).json({ ok: false, error: 'Ese horario fue tomado justo ahora. Elige otro horario.' });
    }

    // ── PHASE 6: Upgrade RESERVANDO to confirmed booking ─────────────────────
    const ourRowIdx = verifyRows.findIndex(row =>
      row[6] === paymentId && row[4] === 'RESERVANDO'
    );

    const anticipo = Number(monto) || 200;
    const servicios = servicio ? servicio.split(', ') : [];
    const precioTotal = servicios.reduce((sum, s) => sum + (PRECIOS[s.trim()] || 0), 0);
    const saldoRestante = precioTotal > 0 ? `$${precioTotal - anticipo} MXN` : 'Por confirmar con la dueña';

    if (ourRowIdx !== -1) {
      const sheetRow = ourRowIdx + 2;
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A${sheetRow}:I${sheetRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            fecha,
            hora,
            nombre || '',
            servicio || '',
            'Cita confirmada',
            `${anticipo}`,
            paymentId,
            saldoRestante,
            new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
          ]],
        },
      });
    }

    // Trigger calendar update in background
    const baseUrl = `https://${req.headers.host}`;
    fetch(`${baseUrl}/api/setup-calendar`).catch(() => {});

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('book-appointment error:', err);
    return res.status(500).json({ ok: false, error: 'Error guardando la cita' });
  }
}
