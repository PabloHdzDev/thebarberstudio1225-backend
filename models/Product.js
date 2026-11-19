const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  precio: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  imagen: { type: String },
  activo: { type: Boolean, default: true },
  // Posición en la lista: 1, 2, 3… sin repetidos (ver utils/catalogo.js)
  orden: { type: Number, default: 0 },
  // Pestaña en la que aparece en el sitio. Vacío: sólo en "Todos"
  categoria: { type: String, trim: true, default: '' },
  esOferta: { type: Boolean, default: false },
  precioAnterior: { type: Number }
});

module.exports = mongoose.model('Product', productSchema);