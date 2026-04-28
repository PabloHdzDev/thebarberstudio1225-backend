const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const calendar = require('../config/googleCalendar');
const socket = require('../socket/socket');

// ID de tu calendario personal donde manejas tu agenda
exports.crearCita = async (req, res) => {
  try {
    const { servicio, fechaHora, notas } = req.body;
    const citaFecha = new Date(fechaHora);
    const ahora = new Date();

    // --- RESTRICCIÓN DE 4 HORAS PARA NUEVAS CITAS ---
    const diferenciaCreacion = (citaFecha - ahora) / (1000 * 60 * 60);
    if (diferenciaCreacion < 4) {
      return res.status(400).json({ 
        mensaje: 'Las citas deben agendarse con al menos 4 horas de anticipación.' 
      });
    }

    const servicioBD = await Service.findById(servicio);
    if (!servicioBD) return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    
    const duracion = servicioBD.duracionMinutos || 30;
    const finCita = new Date(citaFecha.getTime() + duracion * 60000);

    // Verificar disponibilidad en Google
    const consulta = await calendar.freebusy.query({
      resource: {
        timeMin: citaFecha.toISOString(),
        timeMax: finCita.toISOString(),
        timeZone: 'America/Mexico_City',
        items: [{ id: ID_CALENDARIO }],
      },
    });

    if (consulta.data.calendars[ID_CALENDARIO].busy.length > 0) {
      return res.status(400).json({ mensaje: 'Este horario ya está ocupado.' });
    }

    const googleRes = await calendar.events.insert({
      calendarId: ID_CALENDARIO,
      resource: {
        summary: `💈 Corte: ${req.user.nombre}`,
        description: `Servicio: ${servicioBD.nombre}\nNotas: ${notas}`,
        start: { dateTime: citaFecha.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: finCita.toISOString(), timeZone: 'America/Mexico_City' },
      }
    });

    const nuevaCita = await Appointment.create({
      servicio,
      cliente: req.user._id,
      fechaHora,
      notas,
      googleEventId: googleRes.data.id
    });

    const citaPoblada = await Appointment.findById(nuevaCita._id)
      .populate('servicio', 'nombre')
      .populate('cliente', 'nombre whatsapp');

    socket.getIo().emit('notificar_cita', citaPoblada);
    res.status(201).json({ mensaje: 'Cita agendada con éxito', cita: citaPoblada });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al procesar la cita.' });
  }
};

exports.actualizarCita = async (req, res) => {
  try {
    const { id } = req.params;
    const { fechaHora, notas } = req.body;

    const citaPrevia = await Appointment.findById(id).populate('servicio');
    if (!citaPrevia) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    // Restricción de 24 horas para cambios (Excepción para barbero)
    const ahora = new Date();
    const tiempoCitaOriginal = new Date(citaPrevia.fechaHora);
    const diferenciaHoras = (tiempoCitaOriginal - ahora) / (1000 * 60 * 60);

    if (diferenciaHoras < 24 && req.user.rol !== 'barbero') {
      return res.status(400).json({ 
        mensaje: 'Los cambios requieren 24 horas de anticipación. Contacta a la barbería.' 
      });
    }

    const nuevaFecha = new Date(fechaHora);
    const duracion = citaPrevia.servicio.duracionMinutos || 30;
    const finNuevaCita = new Date(nuevaFecha.getTime() + duracion * 60000);

    // Borrar y Re-verificar disponibilidad
    if (citaPrevia.googleEventId) {
      try {
        await calendar.events.delete({ calendarId: ID_CALENDARIO, eventId: citaPrevia.googleEventId });
      } catch (e) {}
    }

    const consulta = await calendar.freebusy.query({
      resource: {
        timeMin: nuevaFecha.toISOString(),
        timeMax: finNuevaCita.toISOString(),
        timeZone: 'America/Mexico_City',
        items: [{ id: ID_CALENDARIO }],
      },
    });

    if (consulta.data.calendars[ID_CALENDARIO].busy.length > 0) {
      return res.status(400).json({ mensaje: 'Horario ocupado.' });
    }

    const googleRes = await calendar.events.insert({
      calendarId: ID_CALENDARIO,
      resource: {
        summary: `💈 Corte: ${req.user.nombre} ${req.user.rol === 'barbero' ? '(Admin)' : ''}`,
        description: `Servicio: ${citaPrevia.servicio.nombre}\nNotas: ${notas}`,
        start: { dateTime: nuevaFecha.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: finNuevaCita.toISOString(), timeZone: 'America/Mexico_City' },
      }
    });

    const citaActualizada = await Appointment.findByIdAndUpdate(
      id,
      { fechaHora: nuevaFecha, notas, googleEventId: googleRes.data.id },
      { new: true }
    ).populate('servicio cliente');

    socket.getIo().emit('notificar_cita', citaActualizada);
    res.json({ mensaje: 'Cita actualizada correctamente', cita: citaActualizada });

  } catch (error) {
    res.status(500).json({ mensaje: 'Error al actualizar.' });
  }
};

exports.eliminarCita = async (req, res) => {
  try {
    const cita = await Appointment.findById(req.params.id);
    if (!cita) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    const ahora = new Date();
    const diferenciaHoras = (cita.fechaHora - ahora) / (1000 * 60 * 60);

    if (diferenciaHoras < 24 && req.user.rol !== 'barbero') {
      return res.status(400).json({ 
        mensaje: 'Las cancelaciones requieren 24 horas de anticipación.' 
      });
    }

    if (cita.googleEventId) {
      try {
        await calendar.events.delete({ calendarId: ID_CALENDARIO, eventId: cita.googleEventId });
      } catch (gErr) {}
    }

    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Cita eliminada correctamente' });
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al eliminar.' });
  }
};

exports.obtenerCitas = async (req, res) => {
  try {
    const citas = await Appointment.find()
      .sort({ fechaHora: 1 })
      .populate('servicio', 'nombre precio')
      .populate('cliente', 'nombre whatsapp');
    res.status(200).json(citas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener citas' });
  }
};

exports.obtenerMisCitas = async (req, res) => {
  try {
    const citas = await Appointment.find({ cliente: req.user._id })
      .sort({ fechaHora: 1 })
      .populate('servicio', 'nombre precio duracionMinutos');
    res.json(citas);
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener tus citas' });
  }
};