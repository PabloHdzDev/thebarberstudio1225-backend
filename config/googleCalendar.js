const { google } = require('googleapis');
// Importas las credenciales del JSON que bajaste de Google Cloud
const auth = new google.auth.GoogleAuth({
  keyFile: './google-credentials.json', 
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });
module.exports = calendar;