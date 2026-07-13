const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  whatsapp: { type: String, required: true, unique: true },
  rol: {
    type: String,
    enum: ['cliente', 'barbero', 'admin'],
    default: 'cliente'
  },

  // --- Sistema de fidelización ---
  // Se incrementa en cada visita completada y se resetea al ganar un premio
  contadorVisitas: { type: Number, default: 0 },
  // Contador histórico de todas las visitas, nunca se resetea
  totalVisitas: { type: Number, default: 0 },
  // Gasto acumulado en visitas completadas
  totalGastado: { type: Number, default: 0 },
  // Fecha de la última visita marcada como completada
  ultimaVisita: { type: Date, default: null },
  // true cuando el cliente acumuló suficientes visitas y puede canjear su premio
  premioPendiente: { type: Boolean, default: false },
  // false = cuenta bloqueada por el barbero
  activo: { type: Boolean, default: true }

}, { timestamps: true });

UserSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

UserSchema.methods.matchPassword = async function(passwordIngresada) {
  return await bcrypt.compare(passwordIngresada, this.password);
};

// Virtual: nivel de fidelidad calculado desde totalVisitas
UserSchema.virtual('nivel').get(function() {
  if (this.totalVisitas >= 20) return 'vip';
  if (this.totalVisitas >= 10) return 'frecuente';
  if (this.totalVisitas >= 3)  return 'regular';
  return 'nuevo';
});

module.exports = mongoose.model('User', UserSchema);
