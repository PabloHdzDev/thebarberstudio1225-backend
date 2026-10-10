const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const User = require('../models/User');
const calendar = require('../config/googleCalendar');
const { paginar, construirRegex } = require('../utils/paginacion');
const socket = require('../socket/socket');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const ID_CALENDARIO = process.env.ID_CALENDARIO;
const META_VISITAS_PREMIO = 5;

// Las descripciones de Google vienen en HTML. El panel las muestra como texto,
// nunca como HTML, así que aquí se quitan las etiquetas.
const textoPlano = (html) => String(html || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li)>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n\s*\n+/g, '\n')
  .trim();

// Lo que el cliente llenó al reservar en la página de citas de Google. La
// descripción trae "<b>Programada por</b>" con nombre, correo y teléfono, y una
// sección por pregunta ("<b>Servicio</b>", por ejemplo). Después sigue el texto
// fijo de la página de reservas, que es igual en todas y se descarta.
const leerReservaGoogle = (descripcion) => {
  const reserva = { nombre: '', email: '', telefono: '', respuestas: [] };

  for (const seccion of String(descripcion || '').split(/<br\s*\/?>/i)) {
    const campo = seccion.trim().match(/^<b>([^<]+)<\/b>([\s\S]*)$/i);
    if (!campo) break;

    const etiqueta = textoPlano(campo[1]);
    const lineas = textoPlano(campo[2]).split('\n').map((l) => l.trim()).filter(Boolean);
    const correo = lineas.find((l) => l.includes('@'));

    if (correo) {
      reserva.email = correo;
      reserva.telefono = lineas.find((l) => /^\+?[\d\s()-]{7,}$/.test(l)) || '';
      reserva.nombre = lineas.find((l) => l !== correo && l !== reserva.telefono) || '';
    } else if (lineas.length) {
      reserva.respuestas.push({ etiqueta, valor: lineas.join(' ') });
    }
  }

  return reserva;
};

const recortar = (texto, max) => (texto.length > max ? `${texto.slice(0, max - 1)}…` : texto);

// Convierte un evento de Google Calendar al formato de cita del panel.
// Las reservas hechas desde la página de citas de Google llegan tituladas
// "Agenda Barbería 💈 (Nombre del cliente)": se rescata el nombre para que el
// panel muestre a la persona y no el nombre de la agenda.
const formatearEventoGoogle = (evento) => {
  const desdeAgenda = Boolean(evento.extendedProperties?.shared?.['goo.createdByAvailId']);
  const titulo = (evento.summary || '').trim();
  const entreParentesis = titulo.match(/\(([^)]+)\)\s*$/);
  const reserva = desdeAgenda ? leerReservaGoogle(evento.description) : null;
  const pedido = reserva?.respuestas.find((r) => /servicio/i.test(r.etiqueta));
  const otrasRespuestas = reserva ? reserva.respuestas.filter((r) => r !== pedido) : [];

  const nombre = ((desdeAgenda && entreParentesis?.[1]) || reserva?.nombre || titulo)
    .replace(/\s+/g, ' ')
    .trim();

  const inicio = new Date(evento.start.dateTime || evento.start.date);
  const fin = new Date(evento.end?.dateTime || evento.end?.date || inicio);

  let nombreServicio = desdeAgenda ? 'Reservada en tu agenda de Google' : 'Evento de Google Calendar';
  if (pedido?.valor) nombreServicio = recortar(pedido.valor, 80);

  return {
    _id: evento.id,
    fechaHora: inicio,
    fin,
    duracionMinutos: Math.max(Math.round((fin - inicio) / 60000), 15),
    nombreInvitado: nombre || 'Bloqueo de Google',
    cliente: null,
    servicio: { nombre: nombreServicio },
    notas: desdeAgenda
      ? otrasRespuestas.map((r) => `${r.etiqueta}: ${r.valor}`).join('\n')
      : recortar(textoPlano(evento.description), 500),
    contacto: reserva ? { telefono: reserva.telefono, email: reserva.email } : null,
    esExterno: true,
    origen: desdeAgenda ? 'agenda-google' : 'google',
  };
};

exports.crearCita = async (req, res) => {
  try {
    const { servicio, fechaHora, notas, cliente, nombreInvitado, esPremio } = req.body;
    const citaFecha = new Date(fechaHora);
    const ahora = new Date();

    // --- RESTRICCIÓN DE TIEMPO ---
    const diferenciaCreacion = (citaFecha - ahora) / (1000 * 60 * 60);
    if (req.user.rol !== 'barbero' && diferenciaCreacion < 1) {
      return res.status(400).json({
        mensaje: 'Las citas deben agendarse con al menos 1 hora de anticipación.'
      });
    }

    // --- VALIDACIÓN DE PREMIO (solo clientes, no barberos) ---
    if (esPremio && req.user.rol !== 'barbero') {
      // req.user viene del middleware con datos frescos de BD
      if (!req.user.premioPendiente) {
        return res.status(403).json({ mensaje: 'No tienes un premio disponible para canjear.' });
      }
    }

    const servicioBD = await Service.findById(servicio);
    if (!servicioBD) return res.status(404).json({ mensaje: 'Servicio no encontrado' });

    // El premio solo cubre cortes sencillos, nunca paquetes ni tratamientos
    if (esPremio && req.user.rol !== 'barbero' && !servicioBD.aplicaPremio) {
      return res.status(400).json({
        mensaje: 'El premio de lealtad solo aplica en Corte de Cabello o Corte de Niño.'
      });
    }

    const duracion = servicioBD.duracionMinutos || 30;
    const finCita = new Date(citaFecha.getTime() + duracion * 60000);

    // --- LÓGICA DE IDENTIFICACIÓN ---
    let clienteId = req.user._id;
    let nombreParaGoogle = req.user.nombre;
    let telefonoParaGoogle = req.user.whatsapp || 'No registrado';

    if (req.user.rol === 'barbero') {
      if (cliente) {
        const clienteRegistrado = await User.findById(cliente);
        clienteId = cliente;
        nombreParaGoogle = clienteRegistrado ? clienteRegistrado.nombre : 'Cliente';
        telefonoParaGoogle = clienteRegistrado ? clienteRegistrado.whatsapp : 'No registrado';
      } else {
        clienteId = null;
        nombreParaGoogle = `${nombreInvitado}`;
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

    const premioTexto = esPremio && req.user.rol !== 'barbero' ? ' 🎁 PREMIO 50% OFF' : '';

    // Insertar en Google Calendar
    const googleRes = await calendar.events.insert({
      calendarId: ID_CALENDARIO,
      resource: {
        summary: `💈 Corte: ${nombreParaGoogle}${premioTexto}`,
        description: `📱 WhatsApp: ${telefonoParaGoogle}\n✂️ Servicio: ${servicioBD.nombre}\n📝 Notas: ${notas || 'Ninguna'}`,
        start: { dateTime: citaFecha.toISOString(), timeZone: 'America/Mexico_City' },
        end: { dateTime: finCita.toISOString(), timeZone: 'America/Mexico_City' },
      }
    });

    const citaEsPremio = Boolean(esPremio && req.user.rol !== 'barbero');

    // Guardar en MongoDB
    const nuevaCita = await Appointment.create({
      servicio,
      cliente: clienteId,
      nombreInvitado: clienteId ? null : nombreInvitado,
      fechaHora,
      notas,
      googleEventId: googleRes.data.id,
      esPremio: citaEsPremio
    });

    // Si es premio de cliente, limpiar el flag en el usuario
    if (citaEsPremio && clienteId) {
      await User.findByIdAndUpdate(clienteId, { premioPendiente: false });
    }

    // --- ENVIAR NOTIFICACIÓN POR CORREO (AL BARBERO) CON RESEND ---
    const fechaLegible = new Date(fechaHora).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
    });

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: process.env.EMAIL_USER,
        subject: `✅ NUEVA CITA: ${nombreParaGoogle}${premioTexto}`,
        html: `
          <div style="font-family: sans-serif; border: 2px solid #d4af37; padding: 20px; border-radius: 10px; max-w: 600px;">
            <h2 style="color: #d4af37; margin-top: 0;">¡Tienes un nuevo turno agendado!</h2>
            <p><strong>Cliente:</strong> ${nombreParaGoogle}</p>
            <p><strong>Servicio:</strong> ${servicioBD.nombre} ($${servicioBD.precio})</p>
            ${citaEsPremio ? '<p style="color:#d4af37;font-weight:bold;">🎁 CITA CON PREMIO 50% OFF</p>' : ''}
            <p><strong>Fecha y Hora:</strong> ${fechaLegible}</p>
            <p><strong>WhatsApp:</strong> ${telefonoParaGoogle}</p>
            <p><strong>Notas:</strong> ${notas || 'Sin notas adicionales'}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #888;">Mensaje automático del panel de Barber Studio.</p>
          </div>
        `
      });
    } catch (emailError) {
      console.error("⚠️ Error enviando correo de nueva cita:", emailError);
    }

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

    // Un cliente sólo puede mover sus propias citas
    const esSuya = citaPrevia.cliente && String(citaPrevia.cliente._id) === String(req.user._id);
    if (req.user.rol !== 'barbero' && !esSuya) {
      return res.status(403).json({ mensaje: 'No puedes modificar esta cita.' });
    }

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

    const nombreParaGoogle = citaPrevia.cliente ? citaPrevia.cliente.nombre : `${citaPrevia.nombreInvitado}`;
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

    // --- ENVIAR NOTIFICACIÓN DE REPROGRAMACIÓN ---
    const fechaAntiguaLegible = new Date(citaPrevia.fechaHora).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
    const fechaNuevaLegible = new Date(nuevaFecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
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
      });
    } catch (emailError) {
      console.error("⚠️ Error enviando correo de reprogramación:", emailError);
    }

    socket.getIo().emit('notificar_cita', citaActualizada);
    res.json({ mensaje: 'Cita actualizada correctamente', cita: citaActualizada });

  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al actualizar.' });
  }
};

exports.eliminarCita = async (req, res) => {
  try {
    const { id } = req.params;

    const esIdMongo = /^[0-9a-fA-F]{24}$/.test(id);

    if (!esIdMongo) {
      // Los eventos sueltos de Google Calendar sólo los toca el barbero
      if (req.user.rol !== 'barbero') {
        return res.status(403).json({ mensaje: 'No puedes eliminar este evento.' });
      }
      try {
        await calendar.events.delete({
          calendarId: ID_CALENDARIO,
          eventId: id,
          sendUpdates: 'all'
        });
        return res.json({ mensaje: 'Evento externo eliminado de Google Calendar' });
      } catch (gErr) {
        console.log("Error borrando evento externo de Google:", gErr);
        return res.status(500).json({ mensaje: 'No se pudo borrar el evento de Google' });
      }
    }

    const cita = await Appointment.findById(id).populate('servicio cliente');
    if (!cita) return res.status(404).json({ mensaje: 'Cita no encontrada' });

    // Un cliente sólo puede cancelar sus propias citas
    const esSuya = cita.cliente && String(cita.cliente._id) === String(req.user._id);
    if (req.user.rol !== 'barbero' && !esSuya) {
      return res.status(403).json({ mensaje: 'No puedes cancelar esta cita.' });
    }

    const ahora = new Date();
    const diferenciaHoras = (cita.fechaHora - ahora) / (1000 * 60 * 60);

    if (diferenciaHoras < 24 && req.user.rol !== 'barbero') {
      return res.status(400).json({
        mensaje: 'Las cancelaciones requieren 24 horas de anticipación.'
      });
    }

    if (cita.googleEventId) {
      try {
        await calendar.events.delete({
          calendarId: ID_CALENDARIO,
          eventId: cita.googleEventId,
          sendUpdates: 'all'
        });
      } catch (gErr) { console.log("No se pudo borrar de Google"); }
    }

    const nombreParaGoogle = cita.cliente ? cita.cliente.nombre : `${cita.nombreInvitado}`;
    const fechaLegible = new Date(cita.fechaHora).toLocaleString('es-MX', {
      timeZone: 'America/Mexico_City', weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
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
      });
    } catch (emailError) {
      console.error("⚠️ Error enviando correo de cancelación:", emailError);
    }

    await Appointment.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Cita eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: 'Error al eliminar.' });
  }
};

// Procesa automáticamente todas las citas pendientes cuya hora ya pasó.
// Se asume que el cliente asistió; actualiza fidelidad y marca como completada.
const procesarCitasPasadas = async () => {
  const pendientes = await Appointment.find({
    estado: { $nin: ['completada', 'cancelada'] },
    esExterno: { $ne: true },
    fechaHora: { $lt: new Date() }
  }).populate('servicio');

  for (const cita of pendientes) {
    cita.estado = 'completada';
    await cita.save();

    if (cita.cliente) {
      const usuario = await User.findById(cita.cliente);
      if (usuario) {
        usuario.contadorVisitas += 1;
        usuario.totalVisitas += 1;
        const precio = cita.esPremio
          ? Math.round((cita.servicio?.precio || 0) / 2)
          : (cita.servicio?.precio || 0);
        usuario.totalGastado += precio;
        usuario.ultimaVisita = cita.fechaHora;
        if (usuario.contadorVisitas >= META_VISITAS_PREMIO) {
          usuario.premioPendiente = true;
          usuario.contadorVisitas = 0;
        }
        await usuario.save();
      }
    }
  }
};

exports.sincronizarHistorial = async (req, res) => {
  try {
    const pendientes = await Appointment.find({
      estado: { $nin: ['completada', 'cancelada'] },
      esExterno: { $ne: true },
      fechaHora: { $lt: new Date() }
    }).populate('servicio');

    let procesadas = 0;
    for (const cita of pendientes) {
      cita.estado = 'completada';
      await cita.save();
      procesadas++;

      if (cita.cliente) {
        const usuario = await User.findById(cita.cliente);
        if (usuario) {
          usuario.contadorVisitas += 1;
          usuario.totalVisitas += 1;
          const precio = cita.esPremio
            ? Math.round((cita.servicio?.precio || 0) / 2)
            : (cita.servicio?.precio || 0);
          usuario.totalGastado += precio;
          if (!usuario.ultimaVisita || cita.fechaHora > usuario.ultimaVisita) {
            usuario.ultimaVisita = cita.fechaHora;
          }
          if (usuario.contadorVisitas >= META_VISITAS_PREMIO) {
            usuario.premioPendiente = true;
            usuario.contadorVisitas = 0;
          }
          await usuario.save();
        }
      }
    }

    res.json({ mensaje: `Sincronización completa. ${procesadas} cita(s) procesada(s).`, procesadas });
  } catch (error) {
    console.error('Error en sincronización:', error);
    res.status(500).json({ mensaje: 'Error al sincronizar el historial' });
  }
};

exports.obtenerCitas = async (req, res) => {
  try {
    await procesarCitasPasadas();

    const citasBD = await Appointment.find()
      .populate('servicio', 'nombre precio')
      .populate('cliente', 'nombre whatsapp');

    const fechaLimite = new Date();
    fechaLimite.setMonth(fechaLimite.getMonth() - 1);

    const googleRes = await calendar.events.list({
      calendarId: ID_CALENDARIO,
      timeMin: fechaLimite.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const eventosGoogle = googleRes.data.items || [];
    const idsGuardados = citasBD.map(c => c.googleEventId).filter(Boolean);
    const eventosExternos = eventosGoogle.filter(evento => !idsGuardados.includes(evento.id));

    const citasExternasFormateadas = eventosExternos.map(formatearEventoGoogle);

    const todasLasCitas = [...citasBD, ...citasExternasFormateadas];
    todasLasCitas.sort((a, b) => new Date(a.fechaHora) - new Date(b.fechaHora));

    res.status(200).json(todasLasCitas);
  } catch (error) {
    console.error("Error al obtener citas combinadas:", error);
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return res.status(400).json({ mensaje: 'Formato de fecha inválido. Se espera YYYY-MM-DD.' });
    }

    const timeMin = new Date(`${fecha}T00:00:00-06:00`).toISOString();
    const timeMax = new Date(`${fecha}T23:59:59-06:00`).toISOString();

    const consulta = await calendar.freebusy.query({
      resource: {
        timeMin,
        timeMax,
        timeZone: 'America/Mexico_City',
        items: [{ id: ID_CALENDARIO }],
      },
    });

    res.json(consulta.data.calendars[ID_CALENDARIO].busy);
  } catch (error) {
    console.error('Error al consultar disponibilidad:', error);
    res.status(500).json({ mensaje: 'Error al consultar Google Calendar' });
  }
};

// Listado paginado para el panel del barbero.
// Separa próximas de pasadas porque el historial crece sin límite y es el que
// de verdad necesita paginarse; las próximas son pocas por naturaleza.
exports.obtenerCitasPaginadas = async (req, res) => {
  try {
    await procesarCitasPasadas();

    const { pagina = 1, limite, buscar = '', filtro = 'proximas', estado } = req.query;
    const ahora = new Date();
    const esHistorial = filtro === 'pasadas';

    const consulta = {
      fechaHora: esHistorial ? { $lt: ahora } : { $gte: ahora },
    };
    if (estado && estado !== 'todos') consulta.estado = estado;

    // Buscar por nombre de cliente o de servicio obliga a resolver sus ids
    // antes, porque viven en otras colecciones
    const texto = String(buscar).trim();
    if (texto) {
      const regex = construirRegex(texto);
      const [clientes, servicios] = await Promise.all([
        User.find({ nombre: regex }).select('_id').lean(),
        Service.find({ nombre: regex }).select('_id').lean(),
      ]);

      consulta.$or = [
        { nombreInvitado: regex },
        { notas: regex },
        { cliente: { $in: clientes.map((c) => c._id) } },
        { servicio: { $in: servicios.map((s) => s._id) } },
      ];
    }

    const resultado = await paginar(Appointment, {
      pagina,
      limite,
      filtro: consulta,
      // Historial de lo más reciente hacia atrás; próximas, lo más cercano primero
      orden: { fechaHora: esHistorial ? -1 : 1 },
      poblar: [
        { path: 'servicio', select: 'nombre precio duracionMinutos' },
        { path: 'cliente', select: 'nombre whatsapp email' },
      ],
    });

    let externas = [];
    // Los eventos creados directo en Google Calendar sólo importan en la agenda
    // próxima; se añaden en la primera página para no descuadrar el conteo.
    if (!esHistorial && resultado.pagina === 1 && !texto) {
      try {
        const googleRes = await calendar.events.list({
          calendarId: ID_CALENDARIO,
          timeMin: ahora.toISOString(),
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 20,
        });

        const eventos = googleRes.data.items || [];
        const guardadas = await Appointment.find({ googleEventId: { $ne: null } })
          .select('googleEventId')
          .lean();
        const ids = new Set(guardadas.map((c) => c.googleEventId));

        externas = eventos
          .filter((e) => !ids.has(e.id))
          .map(formatearEventoGoogle);
      } catch (googleError) {
        // Que falle Google no debe tumbar la agenda del barbero
        console.error('No se pudieron leer eventos externos:', googleError.message);
      }
    }

    const citas = [...externas, ...resultado.datos].sort(
      (a, b) => (esHistorial ? new Date(b.fechaHora) - new Date(a.fechaHora)
                             : new Date(a.fechaHora) - new Date(b.fechaHora))
    );

    res.json({
      datos: citas,
      total: resultado.total,
      pagina: resultado.pagina,
      totalPaginas: resultado.totalPaginas,
      externas: externas.length,
    });
  } catch (error) {
    console.error('Error al obtener citas paginadas:', error);
    res.status(500).json({ mensaje: 'Error al obtener las citas' });
  }
};

// Citas de un rango de fechas, para la vista de calendario del panel.
// Devuelve inicio y fin ya calculados con la duración real del servicio, para
// que el calendario dibuje cada bloque del alto que le corresponde.
const RANGO_MAXIMO_DIAS = 42;

exports.obtenerCitasRango = async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const formato = /^\d{4}-\d{2}-\d{2}$/;

    if (!formato.test(desde || '') || !formato.test(hasta || '')) {
      return res.status(400).json({ mensaje: 'Usa fechas con formato AAAA-MM-DD en "desde" y "hasta".' });
    }

    const inicio = new Date(`${desde}T00:00:00-06:00`);
    const fin = new Date(`${hasta}T23:59:59-06:00`);

    if (fin < inicio) {
      return res.status(400).json({ mensaje: 'La fecha final no puede ser anterior a la inicial.' });
    }
    // Tope de seis semanas: nadie necesita más en una sola vista y evita
    // consultas desproporcionadas
    if ((fin - inicio) / 86400000 > RANGO_MAXIMO_DIAS) {
      return res.status(400).json({ mensaje: `El rango no puede superar ${RANGO_MAXIMO_DIAS} días.` });
    }

    await procesarCitasPasadas();

    const citasBD = await Appointment.find({ fechaHora: { $gte: inicio, $lte: fin } })
      .sort({ fechaHora: 1 })
      .populate('servicio', 'nombre precio duracionMinutos')
      .populate('cliente', 'nombre whatsapp email')
      .lean();

    const citas = citasBD.map((c) => {
      const duracion = c.servicio?.duracionMinutos || 30;
      return {
        ...c,
        duracionMinutos: duracion,
        fin: new Date(new Date(c.fechaHora).getTime() + duracion * 60000),
      };
    });

    // Eventos creados directo en Google Calendar: ocupan tiempo aunque no
    // vivan en la base, así que también se dibujan
    let externas = [];
    try {
      const googleRes = await calendar.events.list({
        calendarId: ID_CALENDARIO,
        timeMin: inicio.toISOString(),
        timeMax: fin.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      });

      const propios = new Set(citasBD.map((c) => c.googleEventId).filter(Boolean));

      externas = (googleRes.data.items || [])
        // Los eventos de día completo no tienen hora: no caben en la rejilla
        .filter((e) => !propios.has(e.id) && e.start?.dateTime && e.end?.dateTime)
        .map(formatearEventoGoogle);
    } catch (googleError) {
      console.error('No se pudieron leer eventos externos:', googleError.message);
    }

    res.json({ citas: [...citas, ...externas] });
  } catch (error) {
    console.error('Error al obtener citas por rango:', error);
    res.status(500).json({ mensaje: 'Error al obtener las citas' });
  }
};
