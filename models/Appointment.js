const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  nombreInvitado: { type: String },
  servicio: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  fechaHora: { type: Date, required: true },
  notas: { type: String },
  googleEventId: { type: String },
  // Estado del ciclo de vida de la cita
  estado: {
    type: String,
    enum: ['pendiente', 'completada', 'cancelada'],
    default: 'pendiente'
  },
  // true si fue agendada canjeando un premio de lealtad
  esPremio: { type: Boolean, default: false }
});

module.exports = mongoose.model('Appointment', appointmentSchema);
