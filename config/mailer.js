// Envío de correos con Gmail (Nodemailer).
//
// Credenciales, siempre desde variables de entorno:
//   GMAIL_USER          la cuenta de Gmail que envía
//   GMAIL_APP_PASSWORD  una "contraseña de aplicación" de Google, no la normal
// Si no están, se usan EMAIL_USER y EMAIL_PASS, los nombres de la configuración
// anterior. Nada de esto se imprime nunca en los registros.
const nodemailer = require('nodemailer');

const NOMBRE_REMITENTE = 'The Barber Studio 1225';

const credenciales = () => ({
  usuario: (process.env.GMAIL_USER || process.env.EMAIL_USER || '').trim(),
  // Google muestra la contraseña de aplicación en bloques separados por espacios
  clave: (process.env.GMAIL_APP_PASSWORD || process.env.EMAIL_PASS || '').replace(/\s+/g, ''),
});

// El transporte se crea al primer envío, no al cargar el archivo: así el
// servidor arranca igual aunque el correo no esté configurado
let transporte = null;

const obtenerTransporte = () => {
  const { usuario, clave } = credenciales();
  if (!usuario || !clave) return null;
  if (!transporte) {
    transporte = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: usuario, pass: clave },
      // Sin estos límites, una red que bloquea el correo dejaría la petición
      // esperando hasta dos minutos antes de rendirse
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transporte;
};

const FALTAN_CREDENCIALES = 'Faltan GMAIL_USER o GMAIL_APP_PASSWORD en las variables de entorno';

// Correo del negocio, el que recibe los avisos de citas nuevas, movidas y
// canceladas. Si no está configurado, le llegan a la misma cuenta que envía.
const correoDelBarbero = () => process.env.EMAIL_USER || credenciales().usuario;

// Se comporta como el envío de Resend que había antes: nunca lanza error y
// devuelve { data, error }, para que una falla del correo no eche abajo la
// acción que lo dispara (agendar una cita, por ejemplo).
const enviarCorreo = async ({ to, subject, html, text }) => {
  const gmail = obtenerTransporte();
  if (!gmail) {
    console.error(`⚠️ No se envió el correo: ${FALTAN_CREDENCIALES}`);
    return { data: null, error: new Error(FALTAN_CREDENCIALES) };
  }

  try {
    const info = await gmail.sendMail({
      from: { name: NOMBRE_REMITENTE, address: credenciales().usuario },
      to,
      subject,
      html,
      text,
    });
    return { data: { id: info.messageId }, error: null };
  } catch (error) {
    // Sólo el mensaje: el objeto completo trae detalles de la conexión
    console.error(`⚠️ No se pudo enviar el correo: ${error.message}`);
    return { data: null, error };
  }
};

// Comprueba usuario, contraseña y conexión con Gmail sin enviar nada
const verificarConexion = async () => {
  const gmail = obtenerTransporte();
  if (!gmail) return { ok: false, error: FALTAN_CREDENCIALES };
  try {
    await gmail.verify();
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

module.exports = { enviarCorreo, verificarConexion, correoDelBarbero };
