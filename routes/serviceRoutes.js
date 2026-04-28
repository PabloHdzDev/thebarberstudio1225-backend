const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { protegerRuta } = require('../middleware/authMiddleware');

// Si tienes un middleware de roles (como en productos), descomenta la siguiente línea:
const { soloBarbero } = require('../middleware/roleMiddleware'); 

const uploadCloud = require('../config/cloudinary');

// 1. Obtener todos los servicios (Público / Admin)
router.get('/', serviceController.obtenerServicios);

router.get('/:id', serviceController.obtenerUnServicio);

// 2. Crear un servicio (Solo tú)
router.post('/', protegerRuta, uploadCloud.single('imagen'), serviceController.crearServicio);

// 3. ACTUALIZAR UN SERVICIO (👈 Esta es la que te faltaba y causaba el error)
router.put('/:id', protegerRuta, uploadCloud.single('imagen'), serviceController.actualizarServicio);

// 4. ELIMINAR UN SERVICIO (Por si las dudas)
router.delete('/:id', protegerRuta, serviceController.eliminarServicio);

module.exports = router;