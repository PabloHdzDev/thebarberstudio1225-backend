const mongoose = require('mongoose');
const Service = require('../models/Service');
const { paginar } = require('../utils/paginacion');
const {
  leerPosicion, reacomodar, normalizarCategorias, inicioDelDia, aplicarPreciosProgramados,
} = require('../utils/catalogo');

exports.crearServicio = async (req, res) => {
  try {
    const { nombre, descripcion, precio, duracionMinutos, activo, orden, esOferta, precioAnterior, categorias } = req.body;

    // Si Multer procesó una imagen, estará en req.file
    const urlImagen = req.file ? req.file.path : '';

    const nuevoServicio = new Service({
      nombre,
      descripcion,
      precio,
      duracionMinutos,
      // Convertimos todo correctamente ya que FormData manda puros Strings
      activo: activo !== undefined ? (activo === 'true' || activo === true) : true,
      // Se crea al final; abajo se mueve a la posición pedida
      orden: Number.MAX_SAFE_INTEGER,
      categorias: await normalizarCategorias(Service, categorias),
      esOferta: esOferta === 'true' || esOferta === true,
      precioAnterior: precioAnterior ? parseFloat(precioAnterior) : 0,
      imagen: urlImagen
    });

    await nuevoServicio.save();
    await reacomodar(Service, nuevoServicio._id, leerPosicion(orden));

    res.status(201).json({
      mensaje: 'Servicio creado con éxito',
      servicio: await Service.findById(nuevoServicio._id)
    });
  } catch (error) {
    console.error("Error en crearServicio:", error);
    res.status(500).json({ mensaje: 'Error al crear el servicio' });
  }
};

// Obtener todos los servicios
exports.obtenerServicios = async (req, res) => {
  try {
    await aplicarPreciosProgramados(Service);

    const { admin, pagina, buscar, limite, estado } = req.query;
    const esAdmin = admin === 'true';

    let filtro = esAdmin ? {} : { activo: true };
    // En el panel se puede filtrar por visibles u ocultos
    if (esAdmin && estado === 'visibles') filtro.activo = { $ne: false };
    if (esAdmin && estado === 'ocultos') filtro.activo = false;

    // La paginación es opcional: sin el parámetro "pagina" responde el arreglo
    // completo, que es lo que espera el sitio público.
    if (!pagina && !buscar) {
      const servicios = await Service.find(filtro).sort({ orden: 1, nombre: 1 });
      return res.status(200).json(servicios);
    }

    const resultado = await paginar(Service, {
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
    res.status(500).json({ mensaje: 'Error al obtener los servicios' });
  }
};

// Obtener un solo servicio por su ID
exports.obtenerUnServicio = async (req, res) => {
  try {
    await aplicarPreciosProgramados(Service);

    const { id } = req.params;
    const servicio = await Service.findById(id);

    if (!servicio) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    }

    res.status(200).json(servicio);
  } catch (error) {
    console.error("Error al obtener un servicio:", error);
    res.status(500).json({ mensaje: 'Error al buscar el servicio' });
  }
};

// Actualizar Servicio
exports.actualizarServicio = async (req, res) => {
  try {
    const { id } = req.params;

    const { nombre, descripcion, precio, duracionMinutos, activo, orden, esOferta, precioAnterior, categorias } = req.body;

    let updateData = { nombre, descripcion, precio, duracionMinutos };

    // Convertimos los datos asegurando que no sobreescribimos con "undefined" si no los enviaron
    if (activo !== undefined) updateData.activo = activo === 'true' || activo === true;
    if (esOferta !== undefined) updateData.esOferta = esOferta === 'true' || esOferta === true;
    if (precioAnterior !== undefined) updateData.precioAnterior = parseFloat(precioAnterior);
    if (categorias !== undefined) updateData.categorias = await normalizarCategorias(Service, categorias);

    // Si el barbero subió una foto nueva, actualizamos el link
    if (req.file) {
      updateData.imagen = req.file.path;
    }

    const servicioActualizado = await Service.findByIdAndUpdate(id, updateData, { new: true });

    if (!servicioActualizado) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    }

    // Si la posición está ocupada, los demás se recorren
    if (orden !== undefined) await reacomodar(Service, id, leerPosicion(orden));

    res.json({ mensaje: 'Servicio actualizado con éxito', servicio: await Service.findById(id) });
  } catch (error) {
    console.error("Error en actualizarServicio:", error);
    res.status(500).json({ mensaje: 'Error al actualizar el servicio' });
  }
};

// Cambia el precio de varios servicios a la vez. Con fecha futura el cambio
// queda programado; sin fecha, o con una que ya pasó, se aplica de inmediato.
// Un precio vacío cancela el cambio programado de ese servicio.
exports.actualizarPrecios = async (req, res) => {
  try {
    const { desde, cambios } = req.body;
    if (!Array.isArray(cambios)) {
      return res.status(400).json({ mensaje: 'Faltan los precios a cambiar.' });
    }

    const fecha = desde ? inicioDelDia(desde) : null;
    if (desde && !fecha) {
      return res.status(400).json({ mensaje: 'La fecha no es válida.' });
    }
    const programar = Boolean(fecha && fecha > new Date());

    const operaciones = [];
    for (const { id, precioNuevo } of cambios) {
      if (!mongoose.isValidObjectId(id)) continue;

      if (precioNuevo === null || precioNuevo === '' || precioNuevo === undefined) {
        operaciones.push({ updateOne: { filter: { _id: id }, update: { $set: { precioNuevo: null, precioNuevoDesde: null } } } });
        continue;
      }

      const precio = Number(precioNuevo);
      if (!Number.isFinite(precio) || precio <= 0) {
        return res.status(400).json({ mensaje: 'Los precios deben ser números mayores a cero.' });
      }

      const cambio = programar
        ? { precioNuevo: precio, precioNuevoDesde: fecha }
        : { precio, precioNuevo: null, precioNuevoDesde: null };
      operaciones.push({ updateOne: { filter: { _id: id }, update: { $set: cambio } } });
    }

    if (operaciones.length) await Service.bulkWrite(operaciones);

    res.json({
      mensaje: programar ? 'Cambio de precios programado.' : 'Precios actualizados.',
      programado: programar,
    });
  } catch (error) {
    console.error("Error en actualizarPrecios:", error);
    res.status(500).json({ mensaje: 'Error al actualizar los precios' });
  }
};

// Eliminar Servicio
exports.eliminarServicio = async (req, res) => {
  try {
    const { id } = req.params;
    await Service.findByIdAndDelete(id);
    // Se cierra el hueco que deja en la lista
    await reacomodar(Service);
    res.json({ mensaje: 'Servicio eliminado con éxito' });
  } catch (error) {
    console.error("Error en eliminarServicio:", error);
    res.status(500).json({ mensaje: 'Error al eliminar el servicio' });
  }
};
