exports.soloBarbero = (req, res, next) => {
  if (req.user && req.user.rol === 'barbero') {
    next();
  } else {
    res.status(403).json({ mensaje: 'Acceso denegado: Solo el barbero puede hacer esto' });
  }
};