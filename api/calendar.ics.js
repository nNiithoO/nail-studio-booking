// /api/calendar.ics.js
// Genera un feed iCal (.ics) en vivo a partir de las citas del Google Sheet.
// La dueña y empleados pueden suscribirse a esta URL desde:
//   Google Calendar: Otros calendarios → Añadir URL
//   Apple Calendar:  Archivo → Nueva suscripción de calendario
//   iPhone:          Ajustes → Calendario → Cuentas → Añadir cuenta → Otra → Cal. suscrito
//
// La URL es: https://tu-sitio.vercel.app/api/calendar.ics
// Protegida con un token secreto para que solo el equipo pueda acceder.

import { getSheetsClient, SHEET_ID, SHEET_TAB } from './_sheets.js';

function pad(n){ return String(n).padStart(2,'0'); }

function toICalDate(dateStr, timeStr){
  // dateStr: "2026-07-15" | timeStr: "10:00 am"
  const [y, m, d] = dateStr.split('-').map(Number);
  const [tp, mer] = timeStr.toLowerCase().split(' ');
  let [hh, mm] = tp.split(':').map(Number);
  if(mer === 'pm' && hh !== 12) hh += 12;
  if(mer === 'am' && hh === 12) hh = 0;
  // Format: YYYYMMDDTHHMMSS (local time with TZID)
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

function toICalDateEnd(dateStr, timeStr){
  // Assume 1.5 hour appointment duration
  const [y, m, d] = dateStr.split('-').map(Number);
  const [tp, mer] = timeStr.toLowerCase().split(' ');
  let [hh, mm] = tp.split(':').map(Number);
  if(mer === 'pm' && hh !== 12) hh += 12;
  if(mer === 'am' && hh === 12) hh = 0;
  hh += 1; mm += 30;
  if(mm >= 60){ hh += 1; mm -= 60; }
  if(hh >= 24){ hh = 23; mm = 59; }
  return `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
}

function escapeIcal(str){
  return (str || '').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}

export default async function handler(req, res){
  // Simple token protection so only the owner can subscribe
  const CAL_TOKEN = process.env.CAL_TOKEN;
  if(CAL_TOKEN && req.query.token !== CAL_TOKEN){
    return res.status(401).send('Acceso no autorizado. Agrega ?token=TU_TOKEN a la URL.');
  }

  try{
    const sheets = getSheetsClient();
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_TAB}!A2:I`,
    });

    const rows = result.data.values || [];
    const now = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z';

    let events = '';

    for(const row of rows){
      const [fecha, hora, nombre, servicio, estado] = row;
      if(!fecha || !hora) continue;
      if(estado && estado.toLowerCase() === 'cancelada') continue;
      if(estado === 'RESERVANDO') continue;

      const dtStart = toICalDate(fecha, hora);
      const dtEnd   = toICalDateEnd(fecha, hora);
      const uid     = `${fecha}-${hora}-${nombre || 'cliente'}@odiosa-studio`.replace(/\s/g,'-');
      const summary = `💅 ${escapeIcal(servicio || 'Cita')} — ${escapeIcal(nombre || 'Clienta')}`;
      const estadoLabel = estado === 'reagendada' ? ' (Reagendada)' : '';

      events += [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${now}`,
        `DTSTART;TZID=America/Mexico_City:${dtStart}`,
        `DTEND;TZID=America/Mexico_City:${dtEnd}`,
        `SUMMARY:${summary}${estadoLabel}`,
        `DESCRIPTION:Servicio: ${escapeIcal(servicio)}\\nClienta: ${escapeIcal(nombre)}\\nEstado: ${escapeIcal(estado)}`,
        `STATUS:${estado === 'reagendada' ? 'TENTATIVE' : 'CONFIRMED'}`,
        'END:VEVENT',
      ].join('\r\n') + '\r\n';
    }

    const ical = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ODIOSA Studio//Booking Calendar//ES',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:📅 ODIOSA Studio — Citas',
      'X-WR-TIMEZONE:America/Mexico_City',
      'X-WR-CALDESC:Calendario de citas de ODIOSA Studio',
      'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
      'X-PUBLISHED-TTL:PT15M',
      'BEGIN:VTIMEZONE',
      'TZID:America/Mexico_City',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:-0500',
      'TZOFFSETTO:-0600',
      'TZNAME:CST',
      'DTSTART:19701025T020000',
      'END:STANDARD',
      'END:VTIMEZONE',
      events.trim(),
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="odiosa-studio-citas.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store');
    return res.status(200).send(ical);
  } catch(err){
    console.error('iCal error:', err);
    return res.status(500).send('Error generando el calendario');
  }
}
