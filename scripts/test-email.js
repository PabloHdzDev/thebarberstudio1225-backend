// Envía un correo de prueba con la cuenta de Gmail configurada en .env.
//
// Uso, desde la carpeta backend:
//   node scripts/test-email.js destinatario@ejemplo.com
const path = require('path');

const destinatario = (process.argv[2] || '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
  console.error('Uso: node scripts/test-email.js destinatario@ejemplo.com');
  process.exit(1);
}

// Se carga el .env del backend aunque el comando se corra desde otra carpeta
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { enviarCorreo, verificarConexion } = require('../config/mailer');

(async () => {
  console.log('Revisando la conexión con Gmail...');
  const conexion = await verificarConexion();
  if (!conexion.ok) {
    console.error(`No se pudo entrar a Gmail: ${conexion.error}`);
    console.error('Revisa GMAIL_USER y GMAIL_APP_PASSWORD en backend/.env.');
    process.exit(1);
  }

  const enviado = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const { data, error } = await enviarCorreo({
    to: destinatario,
    subject: 'Correo de prueba · The Barber Studio 1225',
    text: `Si lees esto, el envío de correos con Gmail funciona. Enviado el ${enviado}.`,
    html: `
      <div style="font-family: sans-serif; border: 2px solid #C2A27C; padding: 20px; border-radius: 10px; max-width: 600px;">
        <h2 style="color: #C2A27C; margin-top: 0;">Correo de prueba</h2>
        <p>Si lees esto, el envío de correos con Gmail funciona.</p>
        <p style="font-size: 12px; color: #888;">Enviado el ${enviado}.</p>
      </div>
    `,
  });

  if (error) process.exit(1);
  console.log(`Listo: correo enviado a ${destinatario} (id ${data.id}).`);
})();
