// /api/send-alert.js
// Envía emails de alerta a la dueña cuando una cita es reagendada o cancelada.
// Usa Resend (resend.com) — plan gratuito: 3,000 emails/mes, sin tarjeta de crédito.
//
// Variables de entorno necesarias en Vercel:
//   RESEND_API_KEY  → tu API key de resend.com
//   OWNER_EMAIL     → email donde quieres recibir las alertas (ej. odiosa@gmail.com)

const RESEND_API = 'https://api.resend.com/emails';

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

export async function sendRescheduleAlert({ nombre, servicio, fechaAntes, horaAntes, fechaDespues, horaDespues }) {
  const subject = `🔔 Cita reagendada · ${nombre}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#fbe9ee;padding:24px;border-radius:16px">
      <h2 style="color:#e8a0b4;margin-top:0">🌸 ODIOSA Studio · Alerta de cita</h2>
      <p style="font-size:15px;color:#4a3640">Una clienta ha <b>reagendado</b> su cita:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#4a3640">
        <tr><td style="padding:8px 0;color:#9c7c89">Clienta</td><td><b>${nombre}</b></td></tr>
        <tr><td style="padding:8px 0;color:#9c7c89">Servicio</td><td><b>${servicio}</b></td></tr>
        <tr><td style="padding:8px 0;color:#9c7c89">❌ Antes</td><td><b style="text-decoration:line-through;color:#c0577a">${formatDate(fechaAntes)} · ${horaAntes}</b></td></tr>
        <tr><td style="padding:8px 0;color:#9c7c89">✅ Ahora</td><td><b style="color:#3a7d44">${formatDate(fechaDespues)} · ${horaDespues}</b></td></tr>
      </table>
      <p style="font-size:12px;color:#9c7c89;margin-top:16px">El calendario de Google Sheets ya fue actualizado automáticamente.</p>
    </div>
  `;
  return sendEmail(subject, html);
}

export async function sendCancellationAlert({ nombre, servicio, fecha, hora, monto }) {
  const subject = `❌ Cita cancelada · ${nombre}`;
  const html = `
    <div style="font-family:sans-serif;max-width:480px;margin:auto;background:#fbe9ee;padding:24px;border-radius:16px">
      <h2 style="color:#e8a0b4;margin-top:0">🌸 ODIOSA Studio · Alerta de cancelación</h2>
      <p style="font-size:15px;color:#4a3640">Una clienta ha <b>cancelado</b> su cita:</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#4a3640">
        <tr><td style="padding:8px 0;color:#9c7c89">Clienta</td><td><b>${nombre}</b></td></tr>
        <tr><td style="padding:8px 0;color:#9c7c89">Servicio</td><td><b>${servicio}</b></td></tr>
        <tr><td style="padding:8px 0;color:#9c7c89">Fecha</td><td><b>${formatDate(fecha)} · ${hora}</b></td></tr>
        <tr><td style="padding:8px 0;color:#9c7c89">💸 Anticipo</td><td><b>$${monto} MXN retenido</b></td></tr>
      </table>
      <p style="font-size:12px;color:#9c7c89;margin-top:16px">El horario quedó libre automáticamente. El anticipo NO fue reembolsado.</p>
    </div>
  `;
  return sendEmail(subject, html);
}

async function sendEmail(subject, html) {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const OWNER_EMAIL   = process.env.OWNER_EMAIL;

  if (!RESEND_API_KEY || !OWNER_EMAIL) {
    console.warn('RESEND_API_KEY o OWNER_EMAIL no configurados — alerta omitida');
    return;
  }

  try {
    const resp = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // ← funciona sin dominio propio en plan gratuito
        to: [OWNER_EMAIL],
        subject,
        html,
      }),
    });
    const result = await resp.json();
    if (!resp.ok) {
      console.error('Resend error status:', resp.status, JSON.stringify(result));
    } else {
      console.log('Email enviado correctamente:', result.id);
    }
  } catch (err) {
    console.error('Error enviando alerta:', err.message);
  }
}
