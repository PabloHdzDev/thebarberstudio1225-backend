const axios = require('axios');

exports.enviarNotificacionWebhook = async (datos) => {
  try {
    // Ejemplo: Mandar a una URL de Make/Zapier para que llegue al WhatsApp de Pablo
    await axios.post(process.env.WEBHOOK_URL, datos);
  } catch (error) {
    console.error("Error enviando Webhook:", error);
  }
};