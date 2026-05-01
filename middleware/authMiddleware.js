// backend/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protegerRuta = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next(); 
    } catch (error) {
      res.status(401).json({ mensaje: 'No autorizado, token fallido' });
    }
  }

  if (!token) {
    res.status(401).json({ mensaje: 'No autorizado, no hay token' });
  }
};

// 👇 NUEVO CANDADO: Solo deja pasar si el rol es 'barbero'
const soloBarbero = (req, res, next) => {
  if (req.user && req.user.rol === 'barbero') {
    next(); // Si es barbero, que pase
  } else {
    res.status(403).json({ mensaje: 'No autorizado como barbero' }); // Si no, portazo
  }
};

// 👇 Exportamos AMBOS candados
module.exports = { protegerRuta, soloBarbero };