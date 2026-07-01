# Nail Studio · Reserva de citas con pago real (Mercado Pago)

## ¿Qué incluye esto?
- `index.html` → la página de reservas (front-end)
- `api/create-preference.js` → función que crea el cobro en Mercado Pago
- `api/verify-payment.js` → función que verifica con Mercado Pago si el pago fue aprobado de verdad
- `.env.example` → recordatorio de la variable de entorno que necesitas

El cliente **nunca** puede fingir que pagó: la confirmación final (`approved`) solo la decide tu Access Token secreto, que vive en el servidor, nunca en el navegador del cliente.

---

## Paso 0 — Crear el Google Sheet (tu "calendario" y panel del negocio)

Esto es lo que resuelve: que dos clientas no reserven el mismo horario, y te da una hoja donde puedes ver de un vistazo qué días están más llenos.

1. Crea un Google Sheet nuevo (sheets.new). Pon estos encabezados exactos en la fila 1, y nombra la pestaña **Citas**:

   | A | B | C | D | E | F | G | H | I |
   |---|---|---|---|---|---|---|---|---|
   | Fecha | Hora | Servicio | Nombre | Telefono | Monto anticipo | ID de pago | Estado | Fecha de registro |

2. Crea una **cuenta de servicio** de Google Cloud (es gratis):
   - Ve a https://console.cloud.google.com/ → crea un proyecto nuevo (ej. "nail-studio-booking")
   - Activa la **Google Sheets API** para ese proyecto (búscala en el buscador de la consola y dale "Habilitar")
   - Ve a "Credenciales" → "Crear credenciales" → "Cuenta de servicio"
   - Dale cualquier nombre, termina la creación
   - Entra a esa cuenta de servicio → pestaña "Claves" → "Agregar clave" → "Crear clave nueva" → JSON
   - Se descargará un archivo `.json` — ábrelo, ahí están los dos valores que necesitas:
     - `client_email` → esta es tu `GOOGLE_SERVICE_ACCOUNT_EMAIL`
     - `private_key` → esta es tu `GOOGLE_PRIVATE_KEY` (es un texto largo, cópialo completo tal cual, con los `\n` incluidos)

3. **Comparte tu Google Sheet** con ese `client_email` (botón "Compartir" en la esquina superior derecha del Sheet, igual que compartirías con una persona), dándole permiso de **Editor**.

4. Copia el ID de tu Sheet de la URL: `https://docs.google.com/spreadsheets/d/EL_ID_VA_AQUI/edit` → esto es tu `GOOGLE_SHEET_ID`.

Vas a usar estos 3 valores (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEET_ID`) en el Paso 2, junto con `MP_ACCESS_TOKEN`.

---


1. Ve a https://www.mercadopago.com.mx y crea tu cuenta como **vendedor / negocio**.
2. Verifica tu identidad (te pedirán tu INE y datos del negocio) — esto puede tardar de minutos a 1-2 días.
3. Una vez verificada, entra a: https://www.mercadopago.com.mx/developers/panel
4. Crea una "Aplicación" (puedes llamarla "Nail Studio Booking").
5. Ahí verás dos credenciales de **producción**:
   - `Public Key` (no la necesitamos en este proyecto)
   - `Access Token` ← **esta es la que necesitas, guárdala, es secreta**

⚠️ Mientras no termines la verificación de tu cuenta, Mercado Pago te da credenciales de **prueba** (test) — sirven para probar el flujo completo sin moverte dinero real, pero los pagos no son reales hasta usar las credenciales de producción.

---

## Paso 2 — Subir el proyecto a Vercel (gratis)
1. Crea una cuenta en https://vercel.com (puedes entrar con tu cuenta de GitHub/Google).
2. Sube esta carpeta a un repositorio de GitHub (o usa el botón "Add New Project" → "Upload" en Vercel directamente, sin necesidad de GitHub).
3. En Vercel: **Add New Project** → selecciona esta carpeta/repo → Deploy.
4. Antes de que termine el primer deploy (o después, y vuelves a desplegar), ve a:
   **Project Settings → Environment Variables**
   y agrega las 4 variables:
   - `MP_ACCESS_TOKEN` → tu Access Token de Mercado Pago
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` → el `client_email` del Paso 0
   - `GOOGLE_PRIVATE_KEY` → el `private_key` del Paso 0 (cópialo completo)
   - `GOOGLE_SHEET_ID` → el ID de tu Sheet del Paso 0
5. Vercel te dará una URL gratuita, por ejemplo: `https://nail-studio-booking.vercel.app`
   (Después puedes conectarle un dominio propio como `www.tunailstudio.com` desde la misma sección de Vercel, también gratis si ya tienes el dominio comprado).

---

## Paso 3 — Probar el flujo completo
1. Abre tu URL de Vercel.
2. Sigue el flujo: servicio → foto → fecha/hora → **Pagar con Mercado Pago**.
3. Si usaste credenciales de prueba, Mercado Pago te dejará pagar con tarjetas de prueba (las encuentras aquí: https://www.mercadopago.com.mx/developers/es/docs/checkout-api/integration-test/test-cards).
4. Al volver a tu sitio, deberías ver "✅ Pago aprobado" y el botón "Continuar" se habilita.
5. Cuando tengas tus credenciales de producción, repite el proceso con un pago real pequeño para confirmar que todo funciona antes de compartir el link con tus clientas.

---

## ¿Cómo ve la dueña qué días están más ocupados?
Abre el Google Sheet directamente — cada fila es una cita confirmada y pagada. Para ver qué días están más llenos:
- Ordena por columna **Fecha** (Datos → Ordenar hoja)
- O selecciona la columna Fecha → Insertar → Gráfico, para un vistazo visual de citas por día
- La columna **Estado** te deja marcar manualmente "cancelada" si una clienta cancela, para liberar ese horario sin borrar el historial

## Notas importantes
- Edita `CONFIG.whatsappNumber` en `index.html` con tu número real.
- El monto del anticipo está en dos lugares: `CONFIG.depositAmount` en `index.html` y `DEPOSIT_AMOUNT` en ambos archivos de `/api`. Si cambias el monto, cámbialo en los tres lugares.
- Nunca compartas tu `Access Token` por WhatsApp, email sin cifrar, ni lo subas a un repositorio público de GitHub.
- Mercado Pago cobra una comisión por transacción (revisa las tarifas vigentes en tu panel de desarrollador) — esto se descuenta automáticamente del monto que recibes.
