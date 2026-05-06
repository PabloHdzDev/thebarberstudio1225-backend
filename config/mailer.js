const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  // 👇 ESTA LÍNEA ES LA SOLUCIÓN AL ERROR ENETUNREACH
  family: 4, // 👈 Fuerza a Nodemailer a usar IPv4 y omitir IPv6
  
  // Configuraciones adicionales para estabilidad en la nube (Render)
  connectionTimeout: 10000, // 10 segundos de espera para conectar
  greetingTimeout: 10000,   // 10 segundos para el saludo inicial
  socketTimeout: 10000,     // 10 segundos de inactividad permitida
  
  tls: {
    // Ayuda a pasar a través de firewalls de servidores en la nube
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2'
  }
});

// Verificación segura: No detiene el servidor si falla el mailer
transporter.verify()
  .then(() => {
    console.log('✅ Sistema de correos conectado con éxito (IPv4)');
  })
  .catch(err => {
    console.log('⚠️ Alerta de Correo: No se pudo conectar a Gmail.');
    console.log('Causa probable: Restricción de red en el puerto 587 o contraseña de aplicación.');
    console.error('Detalle técnico:', err.message);
  });

module.exports = transporter;