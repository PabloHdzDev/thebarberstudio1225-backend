const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

const { protegerRuta, soloBarbero } = require('../middleware/authMiddleware');
const uploadCloud = require('../config/cloudinary');

// Rutas Públicas (Cualquiera puede ver los productos)
router.get('/', productController.obtenerProductos);
router.get('/:id', productController.obtenerUnProducto);

// Rutas Privadas (Solo tú puedes crear, editar o borrar)
router.post('/', protegerRuta, soloBarbero, uploadCloud.single('imagen'), productController.crearProducto);
router.put('/:id', protegerRuta, soloBarbero, uploadCloud.single('imagen'), productController.actualizarProducto);
router.delete('/:id', protegerRuta, soloBarbero, productController.eliminarProducto);

module.exports = router;