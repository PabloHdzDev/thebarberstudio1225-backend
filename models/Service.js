const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  precio: { type: Number, required: true },
  duracionMinutos: { type: Number, default: 30 },
  imagen: { type: String },
  activo: { type: Boolean, default: true },
  // Posición en la lista: 1, 2, 3… sin repetidos (ver utils/catalogo.js)
  orden: { type: Number, default: 0 },
  // Pestaña en la que aparece en el sitio ("Cortes", "Barba"…). Vacío: sólo en "Todos"
  categoria: { type: String, trim: true, default: '' },
  esOferta: { type: Boolean, default: false },
  precioAnterior: { type: Number },
  // Cambio de precio programado: desde esa fecha, precioNuevo pasa a ser el precio
  precioNuevo: { type: Number, default: null },
  precioNuevoDesde: { type: Date, default: null },
});

module.exports = mongoose.model('Service', serviceSchema);