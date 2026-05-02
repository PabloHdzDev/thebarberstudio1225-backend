const Product = require('../models/Product');

// Crear Producto
exports.crearProducto = async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, activo, orden, esOferta, precioAnterior } = req.body;
    const urlImagen = req.file ? req.file.path : '';

    const nuevoProducto = new Product({
      nombre,
      descripcion,
      precio,
      stock,
      activo: activo !== undefined ? (activo === 'true' || activo === true) : true,
      orden: orden ? parseInt(orden) : 0,
      esOferta: esOferta === 'true' || esOferta === true,
      precioAnterior: precioAnterior ? parseFloat(precioAnterior) : 0,
      imagen: urlImagen
    });

    await nuevoProducto.save();
    res.status(201).json({ mensaje: 'Producto creado con éxito', producto: nuevoProducto });
  } catch (error) {
    console.error("Error en crearProducto:", error);
    res.status(500).json({ mensaje: 'Error al crear el producto' });
  }
};

// Obtener todos los productos
exports.obtenerProductos = async (req, res) => {
  try {
    let filtro = { activo: true };
    if (req.query.admin === 'true') {
      filtro = {}; 
    }

    const productos = await Product.find(filtro).sort({ orden: 1 });
    res.status(200).json(productos);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener los productos' });
  }
};

// Obtener un solo producto
exports.obtenerUnProducto = async (req, res) => {
  try {
    const producto = await Product.findById(req.params.id);
    if (!producto) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.status(200).json(producto);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al buscar el producto' });
  }
};

// Actualizar Producto
exports.actualizarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, precio, stock, activo, orden, esOferta, precioAnterior } = req.body;

    let updateData = { nombre, descripcion, precio, stock };

    if (activo !== undefined) updateData.activo = activo === 'true' || activo === true;
    if (orden !== undefined) updateData.orden = parseInt(orden);
    if (esOferta !== undefined) updateData.esOferta = esOferta === 'true' || esOferta === true;
    if (precioAnterior !== undefined) updateData.precioAnterior = parseFloat(precioAnterior);

    if (req.file) {
      updateData.imagen = req.file.path;
    }

    const productoActualizado = await Product.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!productoActualizado) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto actualizado con éxito', producto: productoActualizado });
  } catch (error) {
    console.error("Error en actualizarProducto:", error);
    res.status(500).json({ mensaje: 'Error al actualizar el producto' });
  }
};

// Eliminar Producto
exports.eliminarProducto = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Producto eliminado con éxito' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar el producto' });
  }
};