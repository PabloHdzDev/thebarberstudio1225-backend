const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { protegerRuta } = require('../middleware/authMiddleware');
const { soloBarbero } = require('../middleware/roleMiddleware');
const uploadCloud = require('../config/cloudinary');

// GET /api/productos -> Obtener todos
router.get('/', async (req, res) => {
  try {
      let filtro = { activo: true };
      if (req.query.admin === 'true') filtro = {};
      
      const productos = await Product.find(filtro);
      res.status(200).json(productos);
    } catch (error) {
      console.error("Error al obtener productos:", error);
      res.status(500).json({ mensaje: 'Error al obtener productos' });
    }
});

// GET /api/productos/:id -> Obtener un solo producto por su ID
router.get('/:id', async (req, res) => {
  try {
    const producto = await Product.findById(req.params.id);
    if (!producto) {
      return res.status(404).json({ mensaje: 'Producto no encontrado' });
    }
    res.status(200).json(producto);
  } catch (error) {
    console.error("Error al obtener un producto:", error);
    res.status(500).json({ mensaje: 'Error al buscar el producto' });
  }
});

// POST /api/productos -> Crear uno nuevo
router.post('/', protegerRuta, soloBarbero, uploadCloud.single('imagen'), async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, activo } = req.body;
    
    const nuevoProducto = new Product({
      nombre,
      descripcion,
      precio: Number(precio), // Aseguramos que sea número
      stock: Number(stock),   // Aseguramos que sea número
      activo: activo !== undefined ? (activo === 'true' || activo === true) : true,
      imagen: req.file ? req.file.path : ''
    });

    await nuevoProducto.save();
    res.status(201).json(nuevoProducto);
  } catch (error) {
    console.error("🔥 ERROR EN POST /productos:", error);
    res.status(500).json({ mensaje: 'Error al crear producto', detalle: error.message });
  }
});

// PUT /api/productos/:id -> Editar producto
router.put('/:id', protegerRuta, soloBarbero, (req, res, next) => {
  // 1. Envolvemos la subida de la imagen para atrapar errores ANTES del controlador
  const upload = uploadCloud.single('imagen');
  
  upload(req, res, function (err) {
    if (err) {
      console.error("☁️ ERROR DE CLOUDINARY/MULTER:", err);
      return res.status(400).json({ 
        mensaje: 'Error al subir la imagen', 
        detalle: err.message 
      });
    }
    // Si la imagen pasó bien (o si no subieron ninguna), seguimos al controlador
    next();
  });
}, async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, activo } = req.body;
    let updateData = {};

    if (nombre && nombre !== 'undefined') updateData.nombre = nombre;
    if (descripcion && descripcion !== 'undefined') updateData.descripcion = descripcion;

    if (precio !== undefined && precio !== 'undefined' && precio !== '') {
      updateData.precio = Number(precio);
    }

    if (stock !== undefined && stock !== 'undefined' && stock !== '') {
      updateData.stock = Number(stock);
    }

    if (activo !== undefined && activo !== 'undefined') {
      updateData.activo = activo === 'true' || activo === true;
    }

    // Si pasó el middleware y hay archivo, guardamos la nueva URL
    if (req.file) {
      updateData.imagen = req.file.path;
    }

    const productoActualizado = await Product.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true }
    );
    
    res.json({ mensaje: 'Producto actualizado con éxito', producto: productoActualizado });

  } catch (error) {
    console.error("🔥 ERROR EN BASE DE DATOS:", error);
    res.status(500).json({ mensaje: 'Error al actualizar producto en la base de datos' });
  }
});

// DELETE /api/productos/:id -> Eliminar producto
router.delete('/:id', protegerRuta, soloBarbero, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Producto eliminado con éxito' });
  } catch (error) {
    console.error("Error al eliminar producto:", error);
    res.status(500).json({ mensaje: 'Error al eliminar producto' });
  }
});

module.exports = router;