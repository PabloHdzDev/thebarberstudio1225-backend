const Service = require('../models/Service');

exports.crearServicio = async (req, res) => {
  try {
    const { nombre, descripcion, precio, duracionMinutos, activo } = req.body;

    // Si Multer procesó una imagen, estará en req.file
    const urlImagen = req.file ? req.file.path : '';

    const nuevoServicio = new Service({
      nombre,
      descripcion,
      precio,
      duracionMinutos,
      // Si activo viene en FormData, llega como string "true" o "false"
      activo: activo !== undefined ? (activo === 'true' || activo === true) : true, 
      imagen: urlImagen
    });

    await nuevoServicio.save();

    res.status(201).json({ 
      mensaje: 'Servicio creado con éxito', 
      servicio: nuevoServicio 
    });
  } catch (error) {
    console.error("Error en crearServicio:", error);
    res.status(500).json({ mensaje: 'Error al crear el servicio' });
  }
};

// Obtener todos los servicios
exports.obtenerServicios = async (req, res) => {
  try {
    let filtro = { activo: true };
    if (req.query.admin === 'true') {
      filtro = {}; 
    }

    const servicios = await Service.find(filtro);
    res.status(200).json(servicios);

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al obtener los servicios' });
  }
};

// Obtener un solo servicio por su ID
exports.obtenerUnServicio = async (req, res) => {
  try {
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
    const { nombre, descripcion, precio, duracionMinutos, activo } = req.body;

    let updateData = { nombre, descripcion, precio, duracionMinutos };

    // Convertimos el string a booleano
    if (activo !== undefined) {
      updateData.activo = activo === 'true' || activo === true;
    }

    // Si el barbero subió una foto nueva, actualizamos el link
    if (req.file) {
      updateData.imagen = req.file.path;
    }

    const servicioActualizado = await Service.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    );

    if (!servicioActualizado) {
      return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    }

    res.json({ mensaje: 'Servicio actualizado con éxito', servicio: servicioActualizado });
  } catch (error) {
    console.error("Error en actualizarServicio:", error);
    res.status(500).json({ mensaje: 'Error al actualizar el servicio' });
  }
};

// Eliminar Servicio
exports.eliminarServicio = async (req, res) => {
  try {
    const { id } = req.params;
    await Service.findByIdAndDelete(id);
    res.json({ mensaje: 'Servicio eliminado con éxito' });
  } catch (error) {
    console.error("Error en eliminarServicio:", error);
    res.status(500).json({ mensaje: 'Error al eliminar el servicio' });
  }
};