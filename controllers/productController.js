const Product = require('../models/Product');
const { paginar } = require('../utils/paginacion');
const { leerPosicion, reacomodar, normalizarCategorias } = require('../utils/catalogo');

// Crear Producto
exports.crearProducto = async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, activo, orden, esOferta, precioAnterior, categorias } = req.body;
    const urlImagen = req.file ? req.file.path : '';

    const nuevoProducto = new Product({
      nombre,
      descripcion,
      precio,
      stock,
      activo: activo !== undefined ? (activo === 'true' || activo === true) : true,
      // Se crea al final; abajo se mueve a la posición pedida
      orden: Number.MAX_SAFE_INTEGER,
      categorias: await normalizarCategorias(Product, categorias),
      esOferta: esOferta === 'true' || esOferta === true,
      precioAnterior: precioAnterior ? parseFloat(precioAnterior) : 0,
      imagen: urlImagen
    });

    await nuevoProducto.save();
    await reacomodar(Product, nuevoProducto._id, leerPosicion(orden));
    res.status(201).json({ mensaje: 'Producto creado con éxito', producto: await Product.findById(nuevoProducto._id) });
  } catch (error) {
    console.error("Error en crearProducto:", error);
    res.status(500).json({ mensaje: 'Error al crear el producto' });
  }
};

// Obtener todos los productos
exports.obtenerProductos = async (req, res) => {
  try {
    const { admin, pagina, buscar, limite, estado } = req.query;
    const esAdmin = admin === 'true';

    let filtro = esAdmin ? {} : { activo: true };
    if (esAdmin && estado === 'visibles') filtro.activo = { $ne: false };
    if (esAdmin && estado === 'ocultos') filtro.activo = false;
    if (esAdmin && estado === 'sinStock') filtro.stock = { $lte: 0 };

    // Igual que en servicios: sin "pagina" ni "buscar" responde el arreglo
    // completo, para no romper la página pública.
    if (!pagina && !buscar) {
      const productos = await Product.find(filtro).sort({ orden: 1, nombre: 1 });
      return res.status(200).json(productos);
    }

    const resultado = await paginar(Product, {
      pagina,
      limite,
      filtro,
      buscar,
      campos: ['nombre', 'descripcion', 'categorias'],
      orden: { orden: 1, nombre: 1 },
    });

    res.status(200).json(resultado);
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
    const { nombre, descripcion, precio, stock, activo, orden, esOferta, precioAnterior, categorias } = req.body;

    let updateData = { nombre, descripcion, precio, stock };

    if (activo !== undefined) updateData.activo = activo === 'true' || activo === true;
    if (esOferta !== undefined) updateData.esOferta = esOferta === 'true' || esOferta === true;
    if (precioAnterior !== undefined) updateData.precioAnterior = parseFloat(precioAnterior);
    if (categorias !== undefined) updateData.categorias = await normalizarCategorias(Product, categorias);

    if (req.file) {
      updateData.imagen = req.file.path;
    }

    const productoActualizado = await Product.findByIdAndUpdate(id, updateData, { new: true });
    
    if (!productoActualizado) return res.status(404).json({ mensaje: 'Producto no encontrado' });
    // Si la posición está ocupada, los demás se recorren
    if (orden !== undefined) await reacomodar(Product, id, leerPosicion(orden));
    res.json({ mensaje: 'Producto actualizado con éxito', producto: await Product.findById(id) });
  } catch (error) {
    console.error("Error en actualizarProducto:", error);
    res.status(500).json({ mensaje: 'Error al actualizar el producto' });
  }
};

// Eliminar Producto
exports.eliminarProducto = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    // Se cierra el hueco que deja en la lista
    await reacomodar(Product);
    res.json({ mensaje: 'Producto eliminado con éxito' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar el producto' });
  }
};