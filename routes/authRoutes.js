const express = require('express');
const router = express.Router();

// 1. Importamos TODO el controlador en una sola variable
const authController = require('../controllers/authController');

// 2. Importamos los candados (Asegúrate de que se llamen exactamente así en tu middleware)
const { protegerRuta, soloBarbero } = require('../middleware/authMiddleware');

// POST /api/auth/registro -> Crea un nuevo usuario
router.post('/registro', authController.registrarUsuario);

// POST /api/auth/login -> Inicia sesión y devuelve el token
router.post('/login', authController.iniciarSesion);

// GET /api/auth/usuarios -> Obtiene la lista (usando la nueva función)
router.get('/usuarios', protegerRuta, soloBarbero, authController.obtenerUsuarios);

// PUT /api/auth/cambiar-password -> Cambia la contraseña del usuario autenticado
router.put('/cambiar-password', protegerRuta, authController.cambiarPassword);

module.exports = router;