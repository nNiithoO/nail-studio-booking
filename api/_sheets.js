// /api/_sheets.js
// Conexión a Google Sheets, compartida por las demás funciones.

import { google } from 'googleapis';

export function getSheetsClient() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return google.sheets({ version: 'v4', auth });
}

export const SHEET_ID = process.env.GOOGLE_SHEET_ID;
export const SHEET_TAB = 'Citas'; // nombre de la pestaña dentro de tu Google Sheet

// Columnas en la pestaña "Citas" (fila 1 = encabezados, datos desde fila 2):
// A: Fecha        | B: Hora          | C: Nombre         | D: Servicio
// E: Estado       | F: Anticipo MXN  | G: No. Operación  | H: Saldo restante
// I: Fecha registro
