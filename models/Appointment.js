const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  fechaHora: { type: Date, required: true },
  notas: { type: String },
  // 👈 AGREGAR ESTO
  googleEventId: { type: String } 
});

module.exports = mongoose.model('Appointment', appointmentSchema);