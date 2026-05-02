const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Verificamos que la conexión sea correcta, Y ATRAPAMOS EL ERROR si falla
transporter.verify()
  .then(() => {
    console.log('✅ Sistema de correos conectado con éxito a Gmail');
  })
  .catch(err => {
    // Si falla la red de Render, solo muestra una alerta, PERO NO apaga tu servidor
    console.log('⚠️ Alerta de Correo: No se pudo conectar a Gmail al iniciar el servidor.');
    console.log('Detalle del error de red:', err.message);
  });

module.exports = transporter;