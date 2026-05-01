// backend/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Función auxiliar para generar el Token
const generarToken = (id, rol) => {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, {
    expiresIn: '30d', // El gafete dura 30 días
  });
};

// 1. REGISTRAR USUARIO
exports.registrarUsuario = async (req, res) => {
  const { nombre, email, password, whatsapp } = req.body;

  try {
    // 1. Revisar si el email ya existe
    const emailExiste = await User.findOne({ email });
    if (emailExiste) {
      return res.status(400).json({ mensaje: 'Este correo electrónico ya está registrado.' });
    }

    // 2. Revisar si el WhatsApp ya existe
    const whatsappExiste = await User.findOne({ whatsapp });
    if (whatsappExiste) {
      return res.status(400).json({ mensaje: 'Este número de WhatsApp ya está vinculado a otra cuenta.' });
    }

    // 3. Si todo está limpio, crear el usuario
    const usuario = await User.create({ nombre, email, password, whatsapp });

    res.status(201).json({
      _id: usuario._id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      token: generarToken(usuario._id, usuario.rol)
    });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ mensaje: 'Error al procesar el registro' });
  }
};

// 2. INICIAR SESIÓN (LOGIN)
exports.iniciarSesion = async (req, res) => {
const { identificador, password } = req.body;

  try {
    // Buscamos al usuario que coincida con el email O con el whatsapp
    const usuario = await User.findOne({
      $or: [
        { email: identificador },
        { whatsapp: identificador }
      ]
    });

    if (usuario && (await usuario.matchPassword(password))) {
      res.json({
        _id: usuario._id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        token: generarToken(usuario._id, usuario.rol),
      });
    } else {
      res.status(401).json({ mensaje: 'Credenciales inválidas. Revisa tu correo/celular o contraseña.' });
    }
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

exports.obtenerUsuarios = async (req, res) => {
  try {
    // Buscamos todos los usuarios, pero EXCLUIMOS la contraseña por seguridad
    const usuarios = await User.find().select('-password');
    res.json(usuarios);
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ mensaje: 'Error al obtener la lista de clientes' });
  }
};