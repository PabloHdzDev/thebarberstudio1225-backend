const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { protegerRuta, soloBarbero } = require('../middleware/authMiddleware');

router.get('/estadisticas', protegerRuta, soloBarbero, clienteController.obtenerEstadisticasClientes);
router.get('/directorio',   protegerRuta, soloBarbero, clienteController.obtenerDirectorio);
router.put('/:id/admin',    protegerRuta, soloBarbero, clienteController.accionAdmin);

module.exports = router;
