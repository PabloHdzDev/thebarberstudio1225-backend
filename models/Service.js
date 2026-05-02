const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  precio: { type: Number, required: true },
  duracionMinutos: { type: Number, default: 30 },
  imagen: { type: String },
  activo: { type: Boolean, default: true },
  orden: { type: Number, default: 0 },
  esOferta: { type: Boolean, default: false },
  precioAnterior: { type: Number }
});

module.exports = mongoose.model('Service', serviceSchema);