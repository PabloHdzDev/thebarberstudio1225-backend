// backend/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { enviarCorreo } = require('../config/mailer');
const { escaparRegex } = require('../utils/paginacion');
const { saludoPara, correoConBoton } = require('../utils/correos');

// El enlace de recuperación vive 24 horas; el de confirmar el correo, 7 días
const VIGENCIA_RESET_MS = 24 * 60 * 60 * 1000;
const VIGENCIA_VERIFICACION_MS = 7 * 24 * 60 * 60 * 1000;
// Tiempo mínimo entre dos correos con enlace para la misma cuenta
const ESPERA_ENTRE_ENLACES_MS = 5 * 60 * 1000;

const hashearToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const normalizarCorreo = (correo) => String(correo || '').trim().toLowerCase();

// Busca el correo sin importar mayúsculas: hay cuentas viejas guardadas con
// mayúscula inicial, y así nadie se queda fuera por cómo lo teclea
const filtroCorreo = (correo) => ({
  email: new RegExp(`^${escaparRegex(normalizarCorreo(correo))}$`, 'i'),
});

const enlaceDelSitio = (ruta) => `${process.env.FRONTEND_URL || 'http://localhost:5173'}${ruta}`;

// Enlace nuevo para confirmar el correo: el token viaja en el enlace y en la
// base sólo queda su hash
const nuevaVerificacion = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return {
    enlace: enlaceDelSitio(`/verificar-correo/${token}`),
    campos: {
      verificacionTokenHash: hashearToken(token),
      verificacionExpira: new Date(Date.now() + VIGENCIA_VERIFICACION_MS),
    },
  };
};

const enviarCorreoVerificacion = (usuario, enlace) => {
  const saludo = saludoPara(usuario.nombre);
  return enviarCorreo({
    to: usuario.email,
    subject: 'Confirma tu correo · The Barber Studio 1225',
    text: [
      `${saludo}:`,
      '',
      'Gracias por registrarte en The Barber Studio 1225. Confirma que este correo es tuyo desde este enlace:',
      enlace,
      '',
      'Así podremos enviarte el enlace para recuperar tu contraseña si algún día la olvidas.',
      'El enlace vence en 7 días. Si no creaste esta cuenta, ignora este correo.',
    ].join('\n'),
    html: correoConBoton({
      saludo,
      parrafos: [
        'Gracias por registrarte en The Barber Studio 1225.',
        'Confirma que este correo es tuyo para que podamos enviarte el enlace de recuperación si algún día olvidas tu contraseña.',
      ],
      boton: 'Confirmar mi correo',
      enlace,
      nota: 'El enlace vence en 7 días. Si no creaste esta cuenta, ignora este correo.',
    }),
  });
};

// Función auxiliar para generar el Token
const generarToken = (id, rol) => {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, {
    expiresIn: '30d', // El gafete dura 30 días
  });
};

// 1. REGISTRAR USUARIO
exports.registrarUsuario = async (req, res) => {
  const { nombre, password } = req.body;
  const email = normalizarCorreo(req.body.email);
  const whatsapp = String(req.body.whatsapp || '').trim();

  try {
    // 1. Revisar si el email ya existe (con o sin mayúsculas)
    const emailExiste = await User.findOne(filtroCorreo(email));
    if (emailExiste) {
      return res.status(400).json({ mensaje: 'Este correo electrónico ya está registrado.' });
    }

    // 2. Revisar si el WhatsApp ya existe
    const whatsappExiste = await User.findOne({ whatsapp });
    if (whatsappExiste) {
      return res.status(400).json({ mensaje: 'Este número de WhatsApp ya está vinculado a otra cuenta.' });
    }

    // 3. Si todo está limpio, crear el usuario con su enlace para confirmar el correo
    const verificacion = nuevaVerificacion();
    const usuario = await User.create({ nombre, email, password, whatsapp, ...verificacion.campos });

    // El correo sale sin hacer esperar al registro. Si no llega, el cliente
    // puede pedir otro desde "Mis citas".
    enviarCorreoVerificacion(usuario, verificacion.enlace);

    res.status(201).json({
      _id: usuario._id,
      nombre: usuario.nombre,
      rol: usuario.rol,
      token: generarToken(usuario._id, usuario.rol)
    });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ mensaje: 'Error al procesar el registro' });
  }
};

// 2. INICIAR SESIÓN (LOGIN)
exports.iniciarSesion = async (req, res) => {
  const { password } = req.body;
  const identificador = String(req.body.identificador || '').trim();

  try {
    // Buscamos al usuario que coincida con el email O con el whatsapp
    const usuario = await User.findOne({
      $or: [filtroCorreo(identificador), { whatsapp: identificador }]
    });

    if (usuario && (await usuario.matchPassword(password))) {
      if (usuario.activo === false) {
        return res.status(403).json({ mensaje: 'Tu cuenta ha sido suspendida. Contacta a la barbería.' });
      }
      res.json({
        _id: usuario._id,
        nombre: usuario.nombre,
        rol: usuario.rol,
        token: generarToken(usuario._id, usuario.rol),
      });
    } else {
      res.status(401).json({ mensaje: 'Credenciales inválidas. Revisa tu correo/celular o contraseña.' });
    }
  } catch (error) {
    res.status(500).json({ mensaje: 'Error en el servidor' });
  }
};

exports.obtenerUsuarios = async (req, res) => {
  try {
    // Buscamos todos los usuarios, pero EXCLUIMOS la contraseña por seguridad
    const usuarios = await User.find().select('-password');
    // Con los virtuales viaja el nivel de fidelidad, que el panel usa para
    // mostrar la insignia al elegir cliente en una cita
    res.json(usuarios.map(u => u.toObject({ virtuals: true })));
  } catch (error) {
    console.error("Error al obtener usuarios:", error);
    res.status(500).json({ mensaje: 'Error al obtener la lista de clientes' });
  }
};

exports.obtenerPerfil = async (req, res) => {
  try {
    const usuario = await User.findById(req.user._id).select('-password');
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    // toObject({ virtuals: true }) incluye el virtual "nivel"
    res.json(usuario.toObject({ virtuals: true }));
  } catch (error) {
    res.status(500).json({ mensaje: 'Error al obtener el perfil' });
  }
};

exports.cambiarPassword = async (req, res) => {
  try {
    const { contrasenaActual, nuevaContrasena } = req.body;

    // 1. Validación básica
    if (!contrasenaActual || !nuevaContrasena) {
      return res.status(400).json({ mensaje: 'Por favor, envía ambas contraseñas' });
    }
    if (nuevaContrasena.length < 6) {
      return res.status(400).json({ mensaje: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // 2. Buscamos al usuario (usamos select('+password') por si lo tienes oculto por defecto)
    const usuario = await User.findById(req.user._id).select('+password');
    if (!usuario) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    // 3. Verificamos usando TU método personalizado
    const esCorrecta = await usuario.matchPassword(contrasenaActual);
    if (!esCorrecta) {
      return res.status(401).json({ mensaje: 'La contraseña actual es incorrecta' });
    }

    // 4. Asignamos la nueva contraseña (¡Tu modelo se encarga de encriptarla!)
    usuario.password = nuevaContrasena;
    await usuario.save(); // Aquí se dispara tu UserSchema.pre('save') automáticamente

    res.json({ mensaje: 'Contraseña actualizada con éxito' });

  } catch (error) {
    console.error('Error al cambiar contraseña:', error);
    res.status(500).json({ mensaje: 'Hubo un error al procesar el cambio de contraseña' });
  }
};
// ── RECUPERACIÓN DE CONTRASEÑA ──────────────────────────────────────────────
// El cliente pide recuperar y le llega a su correo un enlace de un solo uso
// para elegir su nueva contraseña.

exports.solicitarReset = async (req, res) => {
  try {
    const { identificador } = req.body;

    if (!identificador || !identificador.trim()) {
      return res.status(400).json({ mensaje: 'Escribe tu correo o tu WhatsApp.' });
    }

    const busqueda = identificador.trim();
    const usuario = await User.findOne({
      $or: [filtroCorreo(busqueda), { whatsapp: busqueda }]
    });

    // Respuesta idéntica exista o no la cuenta, para no revelar quién está registrado
    const respuestaGenerica = {
      mensaje: 'Si la cuenta existe, te enviamos un correo con un enlace para crear una contraseña nueva. Revisa también la carpeta de spam.'
    };

    if (!usuario || usuario.activo === false) {
      return res.json(respuestaGenerica);
    }

    // Si la cuenta acaba de recibir un enlace, no se manda otro: así nadie puede
    // llenar de correos la bandeja de un cliente escribiendo su número una y otra vez
    const emitido = usuario.resetTokenExpira ? usuario.resetTokenExpira.getTime() - VIGENCIA_RESET_MS : 0;
    if (Date.now() - emitido < ESPERA_ENTRE_ENLACES_MS) {
      return res.json(respuestaGenerica);
    }

    // El token viaja en el enlace; en la base solo queda su hash
    const token = crypto.randomBytes(32).toString('hex');
    usuario.resetTokenHash = hashearToken(token);
    usuario.resetTokenExpira = new Date(Date.now() + VIGENCIA_RESET_MS);
    await usuario.save();

    const enlace = enlaceDelSitio(`/restablecer/${token}`);
    const saludo = saludoPara(usuario.nombre);

    await enviarCorreo({
      to: usuario.email,
      subject: 'Crea tu nueva contraseña · The Barber Studio 1225',
      text: [
        `${saludo}:`,
        '',
        'Recibimos una solicitud para cambiar la contraseña de tu cuenta en The Barber Studio 1225. Crea una nueva desde este enlace:',
        enlace,
        '',
        'El enlace vence en 24 horas y solo funciona una vez.',
        'Si no pediste este cambio, ignora este correo: tu contraseña sigue igual.',
      ].join('\n'),
      html: correoConBoton({
        saludo,
        parrafos: [
          'Recibimos una solicitud para cambiar la contraseña de tu cuenta.',
          'Pulsa el botón para crear una nueva:',
        ],
        boton: 'Crear nueva contraseña',
        enlace,
        nota: 'El enlace vence en 24 horas y solo funciona una vez. Si no pediste este cambio, ignora este correo: tu contraseña sigue igual.',
      }),
    });

    res.json(respuestaGenerica);
  } catch (error) {
    console.error('Error al solicitar recuperación:', error);
    res.status(500).json({ mensaje: 'Error al procesar la solicitud' });
  }
};

// Permite a la página saber si el enlace sigue sirviendo antes de pedir la contraseña
exports.verificarTokenReset = async (req, res) => {
  try {
    const usuario = await User.findOne({
      resetTokenHash: hashearToken(req.params.token),
      resetTokenExpira: { $gt: new Date() }
    });

    if (!usuario) {
      return res.status(400).json({ valido: false, mensaje: 'Este enlace ya venció o no es válido.' });
    }

    res.json({ valido: true, nombre: usuario.nombre });
  } catch (error) {
    console.error('Error al verificar token:', error);
    res.status(500).json({ valido: false, mensaje: 'Error al verificar el enlace' });
  }
};

exports.restablecerPassword = async (req, res) => {
  try {
    const { nuevaContrasena } = req.body;

    if (!nuevaContrasena || nuevaContrasena.length < 6) {
      return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const usuario = await User.findOne({
      resetTokenHash: hashearToken(req.params.token),
      resetTokenExpira: { $gt: new Date() }
    });

    if (!usuario) {
      return res.status(400).json({ mensaje: 'Este enlace ya venció o no es válido.' });
    }

    // El hook pre('save') del modelo se encarga de encriptarla
    usuario.password = nuevaContrasena;
    // Se invalida el enlace para que no pueda reutilizarse
    usuario.resetTokenHash = null;
    usuario.resetTokenExpira = null;
    // El enlace llegó a su correo y lo abrió: eso también confirma que es suyo
    usuario.emailVerificado = true;
    usuario.verificacionTokenHash = null;
    usuario.verificacionExpira = null;
    await usuario.save();

    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({ mensaje: 'Error al restablecer la contraseña' });
  }
};

// ── CONFIRMACIÓN DEL CORREO ─────────────────────────────────────────────────
// Al registrarse le llega al cliente un enlace para confirmar su correo. No
// bloquea nada: mientras no lo confirme, "Mis citas" le muestra un recordatorio.

exports.verificarCorreo = async (req, res) => {
  try {
    const usuario = await User.findOne({
      verificacionTokenHash: hashearToken(req.params.token),
      verificacionExpira: { $gt: new Date() }
    });

    if (!usuario) {
      return res.status(400).json({
        mensaje: 'Este enlace ya se usó o venció. Si tu correo ya está confirmado, no tienes que hacer nada; si no, pide otro desde "Mis citas".'
      });
    }

    usuario.emailVerificado = true;
    usuario.verificacionTokenHash = null;
    usuario.verificacionExpira = null;
    await usuario.save();

    res.json({ mensaje: 'Tu correo quedó confirmado. ¡Gracias!' });
  } catch (error) {
    console.error('Error al confirmar correo:', error);
    res.status(500).json({ mensaje: 'Error al confirmar el correo' });
  }
};

// El cliente con sesión iniciada pide otro enlace desde "Mis citas"
exports.reenviarVerificacion = async (req, res) => {
  try {
    const usuario = await User.findById(req.user._id);
    if (!usuario) return res.status(404).json({ mensaje: 'Usuario no encontrado' });

    if (usuario.emailVerificado) {
      return res.json({ mensaje: 'Tu correo ya está confirmado.', verificado: true });
    }

    const emitido = usuario.verificacionExpira
      ? usuario.verificacionExpira.getTime() - VIGENCIA_VERIFICACION_MS
      : 0;
    if (Date.now() - emitido < ESPERA_ENTRE_ENLACES_MS) {
      return res.status(429).json({
        mensaje: 'Ya te enviamos un enlace hace un momento. Revisa tu correo y la carpeta de spam.'
      });
    }

    const verificacion = nuevaVerificacion();
    Object.assign(usuario, verificacion.campos);
    await usuario.save();

    const { error } = await enviarCorreoVerificacion(usuario, verificacion.enlace);
    if (error) {
      return res.status(502).json({ mensaje: 'No pudimos enviar el correo. Intenta de nuevo en un rato.' });
    }

    res.json({ mensaje: `Te enviamos un enlace a ${usuario.email}.` });
  } catch (error) {
    console.error('Error al reenviar confirmación:', error);
    res.status(500).json({ mensaje: 'Error al enviar el enlace' });
  }
};
