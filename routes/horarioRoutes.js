const express = require('express');
const router = express.Router();
const horarioController = require('../controllers/horarioController');
const { protegerRuta, soloBarbero } = require('../middleware/authMiddleware');

// Público: la página de reserva necesita saber a qué hora abre y cierra.
router.get('/', horarioController.obtenerHorarios);

// Solo el barbero puede modificarlos.
router.put('/', protegerRuta, soloBarbero, horarioController.actualizarHorarios);

module.exports = router;
