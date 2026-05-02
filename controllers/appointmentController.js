const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const calendar = require('../config/googleCalendar');
const socket = require('../socket/socket');
const transporter = require('../config/mailer'); // 👈 Tu nuevo sistema de notificaciones

const ID_CALENDARIO = process.env.ID_CALENDARIO;

exports.crearCita = async (req, res) => {
  try {
    const { servicio, fechaHora, notas, cliente, nombreInvitado } = req.body;
    const citaFecha = new Date(fechaHora);
    const ahora = new Date();

    // --- RESTRICCIÓN DE TIEMPO ---
    const diferenciaCreacion = (citaFecha - ahora) / (1000 * 60 * 60);
    if (req.user.rol !== 'barbero' && diferenciaCreacion < 4) {
      return res.status(400).json({ 
        mensaje: 'Las citas deben agendarse con al menos 4 horas de anticipación.' 
      });
    }

    const servicioBD = await Service.findById(servicio);
    if (!servicioBD) return res.status(404).json({ mensaje: 'Servicio no encontrado' });
    
    const duracion = servicioBD.duracionMinutos || 30;
    const finCita = new Date(citaFecha.getTime() + duracion * 60000);

    // --- LÓGICA DE IDENTIFICACIÓN ---
    let clienteId = req.user._id;
    let nombreParaGoogle = req.user.nombre;
    let telefonoParaGoogle = req.user.whatsapp || 'No registrado'; 

    if (req.user.rol === 'barbero') {
      if (cliente) {
        const User = require('../models/User'); 
        const clienteRegistrado = await User.findById(cliente);
        clienteId = cliente;
        nombreParaGoogle = clienteRegistrado ? clienteRegistrado.nombre : 'Cliente';
        telefonoParaGoogle = clienteRegistrado ? clienteRegistrado.whatsapp : 'No registrado'; 
      } else {
        clienteId = null;
        nombreParaGoogle = `${nombreInvitado} (Walk-in)`;
        telefonoParaGoogle = 'Cliente de paso'; 
      }
    }

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
      return res.status(400).json({ mensaje: 'Este horario ya está ocupado en el calendario.' });
    }

    // Insertar en Google Calendar
    const googleRes = await calendar.events.insert({
      calendarId: ID_CALENDARIO,
      resource: {
        summary: `💈 Corte: ${nombreParaGoogle}`,
        description: `📱 WhatsApp: ${telefonoParaGoogle}\n✂️ Servicio: ${servicioBD.nombre}\n📝 Notas: ${notas || 'Ninguna'}`,
        start: { dateTime: citaFecha.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: finCita.toISOString(), timeZone: 'America/Mexico_City' },
      }
    });

    // Guardar en MongoDB
    const nuevaCita = await Appointment.create({
      servicio,
      cliente: clienteId,
      nombreInvitado: clienteId ? null : nombreInvitado,
      fechaHora,
      notas,
      googleEventId: googleRes.data.id
    });

    // --- ENVIAR NOTIFICACIÓN POR CORREO (AL BARBERO) ---
    const fechaLegible = new Date(fechaHora).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

    const mailOptions = {
      from: `"Barber Imperio Bot 💈" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `✅ NUEVA CITA: ${nombreParaGoogle}`,
      html: `
        <div style="font-family: sans-serif; border: 2px solid #d4af37; padding: 20px; border-radius: 10px; max-w: 600px;">
          <h2 style="color: #d4af37; margin-top: 0;">¡Tienes un nuevo turno agendado!</h2>
          <p><strong>Cliente:</strong> ${nombreParaGoogle}</p>
          <p><strong>Servicio:</strong> ${servicioBD.nombre} ($${servicioBD.precio})</p>
          <p><strong>Fecha y Hora:</strong> ${fechaLegible}</p>
          <p><strong>WhatsApp:</strong> ${telefonoParaGoogle}</p>
          <p><strong>Notas:</strong> ${notas || 'Sin notas adicionales'}</p>
          <hr style="border: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 11px; color: #888;">Mensaje automático del panel de Barber Imperio.</p>
        </div>
      `
    };
    transporter.sendMail(mailOptions).catch(err => console.error("Error enviando email:", err));

    const citaPoblada = await Appointment.findById(nuevaCita._id)
      .populate('servicio', 'nombre precio')
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

    const citaPrevia = await Appointment.findById(id).populate('servicio cliente');
    if (!citaPrevia) return res.status(404).json({ mensaje: 'Cita no encontrada' });

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

    if (citaPrevia.googleEventId) {
      try {
        await calendar.events.delete({ calendarId: ID_CALENDARIO, eventId: citaPrevia.googleEventId });
      } catch (e) { console.log("Evento de Google no encontrado para borrar"); }
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
      return res.status(400).json({ mensaje: 'Ese nuevo horario está ocupado.' });
    }

    const nombreParaGoogle = citaPrevia.cliente ? citaPrevia.cliente.nombre : `${citaPrevia.nombreInvitado} (Walk-in)`;
    const telefonoParaGoogle = citaPrevia.cliente ? citaPrevia.cliente.whatsapp : 'Cliente de paso';

    const googleRes = await calendar.events.insert({
      calendarId: ID_CALENDARIO,
      resource: {
        summary: `💈 Corte: ${nombreParaGoogle} ${req.user.rol === 'barbero' ? '(Modificado)' : ''}`,
        description: `📱 WhatsApp: ${telefonoParaGoogle}\n✂️ Servicio: ${citaPrevia.servicio.nombre}\n📝 Notas: ${notas || 'Ninguna'}`,
        start: { dateTime: nuevaFecha.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: finNuevaCita.toISOString(), timeZone: 'America/Mexico_City' },
      }
    });

    const citaActualizada = await Appointment.findByIdAndUpdate(
      id,
      { fechaHora: nuevaFecha, notas, googleEventId: googleRes.data.id },
      { new: true }
    ).populate('servicio cliente');

    // --- ENVIAR NOTIFICACIÓN DE REPROGRAMACIÓN (AL BARBERO) ---
    const fechaAntiguaLegible = new Date(citaPrevia.fechaHora).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const fechaNuevaLegible = new Date(nuevaFecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const mailOptions = {
      from: `"Barber Imperio Bot 💈" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `🔄 REPROGRAMACIÓN: ${nombreParaGoogle}`,
      html: `
        <div style="font-family: sans-serif; border: 2px solid #2196F3; padding: 20px; border-radius: 10px; max-w: 600px;">
          <h2 style="color: #2196F3; margin-top: 0;">Cita Reprogramada</h2>
          <p><strong>Cliente:</strong> ${nombreParaGoogle}</p>
          <p><strong>Día anterior:</strong> <strike>${fechaAntiguaLegible}</strike></p>
          <p><strong>Nuevo Horario:</strong> <strong>${fechaNuevaLegible}</strong></p>
          <p><strong>Notas actualizadas:</strong> ${notas || 'Sin notas'}</p>
        </div>
      `
    };
    transporter.sendMail(mailOptions).catch(err => console.log(err));

    socket.getIo().emit('notificar_cita', citaActualizada);
    res.json({ mensaje: 'Cita actualizada correctamente', cita: citaActualizada });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar.' });
  }
};

exports.eliminarCita = async (req, res) => {
  try {
    const cita = await Appointment.findById(req.params.id).populate('servicio cliente');
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
      } catch (gErr) { console.log("No se pudo borrar de Google"); }
    }

    // --- ENVIAR NOTIFICACIÓN DE CANCELACIÓN (AL BARBERO) ---
    const nombreParaGoogle = cita.cliente ? cita.cliente.nombre : `${cita.nombreInvitado} (Walk-in)`;
    const fechaLegible = new Date(cita.fechaHora).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    const mailOptions = {
      from: `"Barber Imperio Bot 💈" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_USER,
      subject: `❌ CITA CANCELADA: ${nombreParaGoogle}`,
      html: `
        <div style="font-family: sans-serif; border: 2px solid #F44336; padding: 20px; border-radius: 10px; max-w: 600px;">
          <h2 style="color: #F44336; margin-top: 0;">Un turno se ha liberado</h2>
          <p>El cliente <strong>${nombreParaGoogle}</strong> acaba de cancelar su cita.</p>
          <p><strong>Horario liberado:</strong> ${fechaLegible}</p>
          <p><strong>Servicio:</strong> ${cita.servicio?.nombre || 'No especificado'}</p>
        </div>
      `
    };
    transporter.sendMail(mailOptions).catch(err => console.log(err));

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

exports.consultarDisponibilidad = async (req, res) => {
  try {
    const { fecha } = req.params; 
    
    const timeMin = new Date(`${fecha}T00:00:00-06:00`).toISOString();
    const timeMax = new Date(`${fecha}T23:59:59-06:00`).toISOString();

    const consulta = await calendar.freebusy.query({
      resource: {
        timeMin,
        timeMax,
        timeZone: 'America/Mexico_City',
        items: [{ id: process.env.ID_CALENDARIO }],
      },
    });

    res.json(consulta.data.calendars[process.env.ID_CALENDARIO].busy);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al consultar Google Calendar' });
  }
};