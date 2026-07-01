// /api/setup-calendar.js
// Crea (o actualiza) la pestaña "📅 Calendario" en tu Google Sheet.
// Muestra una cuadrícula del año completo con:
//   🔴 Rojo   = 4+ citas (día muy ocupado)
//   🟡 Amarillo = 2–3 citas (día ocupado)
//   🟢 Verde  = 1 cita (disponible con espacio)
//   ⚪ Blanco  = 0 citas (completamente libre)
//
// Las fórmulas leen automáticamente de la pestaña "Citas", sin intervención manual.
// Llama a este endpoint una vez para configurarlo, o después de cada reserva para
// que el año se mantenga al día (ya incluido en book-appointment.js).

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';

const CAL_TAB   = '📅 Calendario';
const YEAR      = new Date().getFullYear();
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export default async function handler(req, res) {
  try {
    const sheets = getSheetsClient();

    // 1) Obtener lista de pestañas existentes
    const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    const existingSheets = meta.data.sheets.map(s => s.properties.title);
    const calSheetExists = existingSheets.includes(CAL_TAB);

    let calSheetId;

    if (!calSheetExists) {
      // 2a) Crear la pestaña si no existe
      const addResp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title: CAL_TAB,
                gridProperties: { rowCount: 34, columnCount: 14 },
                tabColor: { red: 0.91, green: 0.63, blue: 0.71 },
              },
            },
          }],
        },
      });
      calSheetId = addResp.data.replies[0].addSheet.properties.sheetId;
    } else {
      calSheetId = meta.data.sheets.find(s => s.properties.title === CAL_TAB).properties.sheetId;
    }

    // 3) Construir la cuadrícula de valores y fórmulas
    // Fila 1: Título
    // Fila 2: Encabezados de meses (columnas B–M)
    // Fila 3 en adelante: Días 1–31 (columna A) + fórmulas (columnas B–M)
    const rows = [];

    // Fila 1: Título
    rows.push([`📅 Calendario de Citas ${YEAR}`, ...Array(12).fill(''), '']);

    // Fila 2: Encabezados
    rows.push(['Día', ...MONTHS_ES, '']);

    // Filas 3–33: Días 1–31
    for (let day = 1; day <= 31; day++) {
      const rowData = [String(day)];
      for (let month = 1; month <= 12; month++) {
        // Si el día no existe en ese mes (ej. 30 de Feb), la fórmula devuelve vacío
        const formula =
          `=IFERROR(IF(MONTH(DATE(${YEAR},${month},${day}))<>${month},"",` +
          `COUNTIFS(${SHEET_TAB}!$A:$A,TEXT(DATE(${YEAR},${month},${day}),"YYYY-MM-DD"),` +
          `${SHEET_TAB}!$E:$E,"<>cancelada")),"")`;
        rowData.push(formula);
      }
      rowData.push(''); // columna N vacía de margen
      rows.push(rowData);
    }

    // Fila 34: Total por mes
    const totalsRow = ['Total del mes'];
    for (let col = 2; col <= 13; col++) {
      // Suma B3:B33 etc.
      const colLetter = String.fromCharCode(64 + col);
      totalsRow.push(`=SUM(${colLetter}3:${colLetter}33)`);
    }
    totalsRow.push('');
    rows.push(totalsRow);

    // 4) Escribir valores y fórmulas en la pestaña
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${CAL_TAB}!A1:N34`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    // 5) Aplicar formato y colores
    const dataRange = {
      sheetId: calSheetId,
      startRowIndex: 2,   // fila 3 (0-indexed)
      endRowIndex: 33,    // fila 33 inclusive
      startColumnIndex: 1, // columna B
      endColumnIndex: 13,  // columna M inclusive
    };

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [
          // Título: fusionar y poner en rosa
          {
            mergeCells: {
              range: { sheetId: calSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 13 },
              mergeType: 'MERGE_ALL',
            },
          },
          {
            repeatCell: {
              range: { sheetId: calSheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 13 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.91, green: 0.63, blue: 0.71 },
                  textFormat: { bold: true, fontSize: 14, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat',
            },
          },
          // Encabezados de mes: fondo rosa suave
          {
            repeatCell: {
              range: { sheetId: calSheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 14 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.82, blue: 0.85 },
                  textFormat: { bold: true },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat',
            },
          },
          // Columna A (días): fondo gris claro
          {
            repeatCell: {
              range: { sheetId: calSheetId, startRowIndex: 2, endRowIndex: 34, startColumnIndex: 0, endColumnIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 },
                  textFormat: { bold: true },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat',
            },
          },
          // Fila de totales: fondo dorado suave
          {
            repeatCell: {
              range: { sheetId: calSheetId, startRowIndex: 33, endRowIndex: 34, startColumnIndex: 0, endColumnIndex: 14 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.98, green: 0.93, blue: 0.80 },
                  textFormat: { bold: true },
                  horizontalAlignment: 'CENTER',
                },
              },
              fields: 'userEnteredFormat',
            },
          },
          // Alineación centrada en celdas de datos
          {
            repeatCell: {
              range: dataRange,
              cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } },
              fields: 'userEnteredFormat.horizontalAlignment',
            },
          },
          // 🟢 Verde: 1 cita
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [dataRange],
                booleanRule: {
                  condition: { type: 'NUMBER_EQ', values: [{ userEnteredValue: '1' }] },
                  format: { backgroundColor: { red: 0.71, green: 0.90, blue: 0.71 } },
                },
              },
              index: 0,
            },
          },
          // 🟡 Amarillo: 2–3 citas
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [dataRange],
                booleanRule: {
                  condition: { type: 'NUMBER_BETWEEN', values: [{ userEnteredValue: '2' }, { userEnteredValue: '3' }] },
                  format: { backgroundColor: { red: 1.0, green: 0.92, blue: 0.55 } },
                },
              },
              index: 1,
            },
          },
          // 🔴 Rojo: 4+ citas
          {
            addConditionalFormatRule: {
              rule: {
                ranges: [dataRange],
                booleanRule: {
                  condition: { type: 'NUMBER_GREATER_THAN_EQ', values: [{ userEnteredValue: '4' }] },
                  format: { backgroundColor: { red: 0.92, green: 0.49, blue: 0.45 } },
                },
              },
              index: 2,
            },
          },
          // Ancho de columnas: columna A más angosta, resto iguales
          {
            updateDimensionProperties: {
              range: { sheetId: calSheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
              properties: { pixelSize: 55 },
              fields: 'pixelSize',
            },
          },
          {
            updateDimensionProperties: {
              range: { sheetId: calSheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 13 },
              properties: { pixelSize: 90 },
              fields: 'pixelSize',
            },
          },
        ],
      },
    });

    return res.status(200).json({ ok: true, message: `Calendario ${YEAR} creado/actualizado correctamente` });
  } catch (err) {
    console.error('Error creando calendario:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
