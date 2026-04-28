// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protegerRuta = async (req, res, next) => {
  let token;

  // Verificamos si la petición trae un "Header" de Autorización que empiece con "Bearer"
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extraemos solo el token (quitamos la palabra Bearer)
      token = req.headers.authorization.split(' ')[1];

      // Verificamos el token con nuestra firma secreta
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Buscamos al usuario en la BD (sin traer su contraseña por seguridad)
      // Y lo adjuntamos a la petición (req.user) para que el controlador lo pueda usar
      req.user = await User.findById(decoded.id).select('-password');

      next(); // Todo está bien, ¡déjalo pasar a la ruta!
    } catch (error) {
      res.status(401).json({ mensaje: 'No autorizado, token fallido' });
    }
  }

  if (!token) {
    res.status(401).json({ mensaje: 'No autorizado, no hay token' });
  }
};

module.exports = { protegerRuta };