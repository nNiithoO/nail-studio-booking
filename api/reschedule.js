// /api/reschedule.js
// Maneja dos acciones:
//   action: 'reschedule' → cambia fecha/hora, actualiza Sheet, alerta a dueña
//   action: 'cancel'     → marca cita como cancelada, libera slot, alerta a dueña

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';
import { sendRescheduleAlert, sendCancellationAlert } from './send-alert.js';

const HOURS_IN_ADVANCE = 24;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, paymentId, rowIndex, nuevaFecha, nuevaHora, fechaActual, horaActual } = req.body || {};

  if (!paymentId || !rowIndex) return res.status(400).json({ error: 'Faltan datos' });

  // Validar regla de 24 horas (aplica a reagendar Y cancelar)
  if (fechaActual && horaActual) {
    const [year, month, day] = fechaActual.split('-').map(Number);
    const [timePart, meridiem] = horaActual.split(' ');
    let [hours, minutes] = timePart.split(':').map(Number);
    if (meridiem === 'pm' && hours !== 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;

    const appointmentDate = new Date(year, month - 1, day, hours, minutes);
    const hoursLeft = (appointmentDate - new Date()) / 3600000;

    if (hoursLeft < HOURS_IN_ADVANCE) {
      return res.status(400).json({
        error: `Solo puedes hacer cambios con al menos ${HOURS_IN_ADVANCE} horas de anticipación. Tu cita es en ${Math.round(hoursLeft)} horas.`,
      });
    }
  }

  try {
    const sheets = getSheetsClient();
    const existing = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A2:I`,
    });
    const rows = existing.data.values || [];
    const currentRow = rows[rowIndex - 2]; // rowIndex is 1-based, rows is 0-based, -1 for header

    if (!currentRow) return res.status(404).json({ error: 'Cita no encontrada' });

    // ── CANCELAR ──────────────────────────────────────────────
    if (action === 'cancel') {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!E${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [['cancelada']] },
      });

      // Alerta a la dueña (no bloqueante)
      sendCancellationAlert({
        nombre:   currentRow[2],
        servicio: currentRow[3],
        fecha:    currentRow[0],
        hora:     currentRow[1],
        monto:    currentRow[5]?.replace(/[^0-9]/g, '') || '200',
      }).catch(console.error);

      return res.status(200).json({ ok: true, action: 'cancelled' });
    }

    // ── REAGENDAR ─────────────────────────────────────────────
    if (action === 'reschedule') {
      if (!nuevaFecha || !nuevaHora) return res.status(400).json({ error: 'Faltan nueva fecha/hora' });

      // Verificar que el nuevo slot esté libre
      const conflicto = rows.some((row, idx) => {
        const mismoSlot    = row[0] === nuevaFecha && row[1] === nuevaHora;
        const noEsCancelada = !row[4] || row[4].toLowerCase() !== 'cancelada';
        const noEsLaMismaCita = idx + 2 !== rowIndex;
        return mismoSlot && noEsCancelada && noEsLaMismaCita;
      });

      if (conflicto) {
        return res.status(409).json({ error: 'Ese horario ya fue reservado por otra persona. Elige otro.' });
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_TAB}!A${rowIndex}:I${rowIndex}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [[
            nuevaFecha,
            nuevaHora,
            currentRow[2], // nombre
            currentRow[3], // servicio
            'reagendada',
            currentRow[5], // anticipo
            paymentId,
            currentRow[7], // saldo restante
            new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
          ]],
        },
      });

      // Alerta a la dueña (no bloqueante)
      sendRescheduleAlert({
        nombre:       currentRow[2],
        servicio:     currentRow[3],
        fechaAntes:   currentRow[0],
        horaAntes:    currentRow[1],
        fechaDespues: nuevaFecha,
        horaDespues:  nuevaHora,
      }).catch(console.error);

      return res.status(200).json({ ok: true, action: 'rescheduled' });
    }

    return res.status(400).json({ error: 'Acción no reconocida' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'Error actualizando la cita' });
  }
}
