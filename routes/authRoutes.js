const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// POST /api/auth/registro -> Crea un nuevo usuario
router.post('/registro', authController.registrarUsuario);

// POST /api/auth/login -> Inicia sesión y devuelve el token
router.post('/login', authController.iniciarSesion);

module.exports = router;