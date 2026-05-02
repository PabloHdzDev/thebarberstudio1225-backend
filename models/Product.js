const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  precio: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  imagen: { type: String },
  activo: { type: Boolean, default: true },
  orden: { type: Number, default: 0 },
  esOferta: { type: Boolean, default: false },
  precioAnterior: { type: Number }
});

module.exports = mongoose.model('Product', productSchema);