// backend/models/Service.js
const mongoose = require('mongoose');

const ServiceSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  precio: { type: Number, required: true },
  duracionMinutos: { type: Number, default: 30 },
  imagen: { type: String },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Service', ServiceSchema);