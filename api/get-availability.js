// /api/get-availability.js
// Devuelve qué horarios ya están ocupados, leyendo directamente del Google Sheet.
// El front-end llama esto antes de mostrar el calendario, para que dos personas
// no puedan reservar el mismo horario.

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';

export default async function handler(req, res) {
  try {
    const sheets = getSheetsClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A2:H`, // saltamos la fila 1 (encabezados)
    });

    const rows = result.data.values || [];

    // Construimos un mapa: { "2026-06-26": ["1:00 pm", "4:00 pm"], ... }
    const taken = {};
    for (const row of rows) {
      const [fecha, hora, , , estado] = row;
      if (!fecha || !hora) continue;
      if (estado && estado.toLowerCase() === 'cancelada') continue; // ignoramos canceladas
      if (!taken[fecha]) taken[fecha] = [];
      taken[fecha].push(hora);
    }

    return res.status(200).json({ taken });
  } catch (err) {
    console.error(err);
    // Si el Sheet falla, no queremos tronar la página: devolvemos vacío
    // (peor caso: se muestra un horario que ya estaba tomado, en vez de romper la app)
    return res.status(200).json({ taken: {}, warning: 'No se pudo leer el calendario' });
  }
}
