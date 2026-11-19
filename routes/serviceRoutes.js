const express = require('express');
const router = express.Router();
const serviceController = require('../controllers/serviceController');
const { protegerRuta, soloBarbero } = require('../middleware/authMiddleware');

const uploadCloud = require('../config/cloudinary');

// 1. Obtener todos los servicios (Público / Admin)
router.get('/', serviceController.obtenerServicios);

router.get('/:id', serviceController.obtenerUnServicio);

// Lo que sigue cambia el catálogo: sólo el barbero

// 2. Crear un servicio
router.post('/', protegerRuta, soloBarbero, uploadCloud.single('imagen'), serviceController.crearServicio);

// 3. Cambiar o programar el precio de varios servicios a la vez
//    (va antes de "/:id" para que "precios" no se tome como un id)
router.put('/precios', protegerRuta, soloBarbero, serviceController.actualizarPrecios);

// 4. Actualizar un servicio
router.put('/:id', protegerRuta, soloBarbero, uploadCloud.single('imagen'), serviceController.actualizarServicio);

// 5. Eliminar un servicio
router.delete('/:id', protegerRuta, soloBarbero, serviceController.eliminarServicio);

module.exports = router;
