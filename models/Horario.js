const mongoose = require('mongoose');

// Un documento por día de la semana (0 = domingo ... 6 = sábado).
// Las horas se guardan como texto "HH:MM" en formato de 24 horas.
const HorarioSchema = new mongoose.Schema({
  diaSemana: {
    type: Number,
    required: true,
    unique: true,
    min: 0,
    max: 6,
  },
  abierto: { type: Boolean, default: true },
  apertura: { type: String, default: '11:00' },
  cierre: { type: String, default: '20:00' },
}, { timestamps: true });

module.exports = mongoose.model('Horario', HorarioSchema);
