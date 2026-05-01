// backend/routes/appointmentRoutes.js
const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointmentController');
const { protegerRuta } = require('../middleware/authMiddleware');

router.get('/', protegerRuta, appointmentController.obtenerCitas);
router.post('/', protegerRuta, appointmentController.crearCita);
router.put('/:id', protegerRuta, appointmentController.actualizarCita); 
router.delete('/:id', protegerRuta, appointmentController.eliminarCita);
router.get('/mis-citas', protegerRuta, appointmentController.obtenerMisCitas);
router.get('/disponibilidad/:fecha', protegerRuta, appointmentController.consultarDisponibilidad);

module.exports = router;