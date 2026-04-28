const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  // 👇 Añadimos unique: true aquí
  whatsapp: { type: String, required: true, unique: true }, 
  rol: { 
    type: String, 
    enum: ['cliente', 'barbero', 'admin'], 
    default: 'cliente' 
  }
}, { timestamps: true });

// "Middleware" de Mongoose: Se ejecuta ANTES de hacer .save()
UserSchema.pre('save', async function() {
  // Si la contraseña no ha sido modificada, simplemente regresamos (return)
  if (!this.isModified('password')) {
    return;
  }
  
  // Generamos la "sal" y encriptamos
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Método personalizado para comparar contraseñas cuando el usuario intente hacer login
UserSchema.methods.matchPassword = async function(passwordIngresada) {
  return await bcrypt.compare(passwordIngresada, this.password);
};

module.exports = mongoose.model('User', UserSchema);