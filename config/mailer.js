const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Tu correo de Gmail
    pass: process.env.EMAIL_PASS  // Tu Contraseña de Aplicación de 16 letras
  }
});

// Verificamos que la conexión sea correcta
transporter.verify().then(() => {
  console.log('✅ Sistema de correos listo para enviar notificaciones');
});

module.exports = transporter;