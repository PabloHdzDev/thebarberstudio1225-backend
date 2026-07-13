const User = require('../models/User');
const Appointment = require('../models/Appointment');

const META_VISITAS_PREMIO = 5;
const LIMITE_DIRECTORIO = 12;

exports.obtenerDirectorio = async (req, res) => {
  try {
    const { pagina = 1, buscar = '', orden = 'nombre' } = req.query;
    const skip = (parseInt(pagina) - 1) * LIMITE_DIRECTORIO;

    const filtro = { rol: 'cliente' };
    if (buscar.trim()) {
      filtro.$or = [
        { nombre: { $regex: buscar.trim(), $options: 'i' } },
        { email: { $regex: buscar.trim(), $options: 'i' } },
        { whatsapp: { $regex: buscar.trim(), $options: 'i' } }
      ];
    }

    const ordenMap = {
      nombre:       { nombre: 1 },
      totalVisitas: { totalVisitas: -1 },
      totalGastado: { totalGastado: -1 },
      ultimaVisita: { ultimaVisita: -1 },
      recientes:    { createdAt: -1 }
    };

    const [clientes, total] = await Promise.all([
      User.find(filtro)
        .sort(ordenMap[orden] || { nombre: 1 })
        .skip(skip)
        .limit(LIMITE_DIRECTORIO)
        .select('-password'),
      User.countDocuments(filtro)
    ]);

    res.json({
      clientes: clientes.map(c => c.toObject({ virtuals: true })),
      totalPaginas: Math.ceil(total / LIMITE_DIRECTORIO),
      paginaActual: parseInt(pagina),
      total
    });
  } catch (error) {
    console.error('Error en directorio:', error);
    res.status(500).json({ mensaje: 'Error al obtener el directorio' });
  }
};

exports.accionAdmin = async (req, res) => {
  try {
    const { accion } = req.body;
    const usuario = await User.findById(req.params.id);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    if (usuario.rol === 'barbero') return res.status(403).json({ mensaje: 'No puedes modificar al barbero' });

    if (accion === 'bloquear') {
      usuario.activo = false;
    } else if (accion === 'desbloquear') {
      usuario.activo = true;
    } else if (accion === 'resetear_contador') {
      usuario.contadorVisitas = 0;
      usuario.premioPendiente = false;
    } else {
      return res.status(400).json({ mensaje: 'Acción no reconocida' });
    }

    await usuario.save();
    res.json({ mensaje: 'Hecho', usuario: usuario.toObject({ virtuals: true }) });
  } catch (error) {
    console.error('Error en acción admin:', error);
    res.status(500).json({ mensaje: 'Error al ejecutar la acción' });
  }
};

exports.obtenerEstadisticasClientes = async (req, res) => {
  try {
    const hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const hace60dias = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [
      clientesFrecuentes,
      clientesNuevos,
      clientesInactivos,
      clientesConPremio,
      totalClientes,
      serviciosTop,
      resumenIngresos
    ] = await Promise.all([

      // Top 5 clientes por visitas totales
      User.find({ rol: 'cliente', totalVisitas: { $gt: 0 } })
          .sort({ totalVisitas: -1 })
          .limit(5)
          .select('-password'),

      // Clientes registrados en los últimos 30 días
      User.find({ rol: 'cliente', createdAt: { $gte: hace30dias } })
          .sort({ createdAt: -1 })
          .limit(10)
          .select('-password'),

      // Clientes que no han vuelto en más de 60 días
      User.find({
        rol: 'cliente',
        ultimaVisita: { $lt: hace60dias, $ne: null }
      }).sort({ ultimaVisita: 1 }).limit(10).select('-password'),

      // Clientes con premio sin canjear
      User.find({ rol: 'cliente', premioPendiente: true })
          .select('-password'),

      // Total de clientes registrados
      User.countDocuments({ rol: 'cliente' }),

      // Servicios más solicitados en citas completadas
      Appointment.aggregate([
        { $match: { estado: 'completada' } },
        { $group: { _id: '$servicio', total: { $sum: 1 } } },
        { $sort: { total: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'services',
            localField: '_id',
            foreignField: '_id',
            as: 'info'
          }
        },
        { $unwind: { path: '$info', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            nombre: '$info.nombre',
            precio: '$info.precio',
            total: 1
          }
        }
      ]),

      // Ingresos de citas completadas
      Appointment.aggregate([
        { $match: { estado: 'completada' } },
        {
          $lookup: {
            from: 'services',
            localField: 'servicio',
            foreignField: '_id',
            as: 'info'
          }
        },
        { $unwind: { path: '$info', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: null,
            total: { $sum: '$info.precio' },
            cantidad: { $sum: 1 }
          }
        }
      ])
    ]);

    // Incluir el virtual "nivel" en la serialización
    const frecuentesConNivel = clientesFrecuentes.map(c => c.toObject({ virtuals: true }));
    const premioConNivel = clientesConPremio.map(c => c.toObject({ virtuals: true }));

    res.json({
      resumen: {
        totalClientes,
        clientesConPremio: clientesConPremio.length,
        clientesNuevosEsteMes: clientesNuevos.length,
        clientesInactivos: clientesInactivos.length,
        ingresosTotalesCompletadas: resumenIngresos[0]?.total || 0,
        citasCompletadas: resumenIngresos[0]?.cantidad || 0,
        metaVisitas: META_VISITAS_PREMIO
      },
      clientesFrecuentes: frecuentesConNivel,
      clientesNuevos,
      clientesInactivos,
      clientesConPremio: premioConNivel,
      serviciosTop
    });

  } catch (error) {
    console.error('Error en estadísticas de clientes:', error);
    res.status(500).json({ mensaje: 'Error al obtener estadísticas de clientes' });
  }
};
