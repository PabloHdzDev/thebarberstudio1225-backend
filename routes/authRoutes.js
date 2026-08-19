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

// GET /api/auth/perfil -> Perfil completo del usuario autenticado (incluye datos de lealtad)
router.get('/perfil', protegerRuta, authController.obtenerPerfil);

// PUT /api/auth/cambiar-password -> Cambia la contraseña del usuario autenticado
router.put('/cambiar-password', protegerRuta, authController.cambiarPassword);

// --- Recuperación de contraseña (público: el usuario no puede iniciar sesión) ---
// POST /api/auth/olvide-password -> Genera el enlace y avisa al barbero
router.post('/olvide-password', authController.solicitarReset);

// GET /api/auth/reset/:token -> Comprueba si el enlace sigue vigente
router.get('/reset/:token', authController.verificarTokenReset);

// POST /api/auth/reset/:token -> Guarda la contraseña nueva
router.post('/reset/:token', authController.restablecerPassword);

module.exports = router;