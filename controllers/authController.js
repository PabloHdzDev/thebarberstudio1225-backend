// backend/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// El enlace de recuperación vive 1 hora
const VIGENCIA_RESET_MS = 60 * 60 * 1000;

const hashearToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Función auxiliar para generar el Token
const generarToken = (id, rol) => {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, {
    expiresIn: '30d', // El gafete dura 30 días
  });
};

// 1. REGISTRAR USUARIO
exports.registrarUsuario = async (req, res) => {
  const { nombre, email, password, whatsapp } = req.body;

  try {
    // 1. Revisar si el email ya existe
    const emailExiste = await User.findOne({ email });
    if (emailExiste) {
      return res.status(400).json({ mensaje: 'Este correo electrónico ya está registrado.' });
    }

    // 2. Revisar si el WhatsApp ya existe
    const whatsappExiste = await User.findOne({ whatsapp });
    if (whatsappExiste) {
      return res.status(400).json({ mensaje: 'Este número de WhatsApp ya está vinculado a otra cuenta.' });
    }

    // 3. Si todo está limpio, crear el usuario
    const usuario = await User.create({ nombre, email, password, whatsapp });

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
const { identificador, password } = req.body;

  try {
    // Buscamos al usuario que coincida con el email O con el whatsapp
    const usuario = await User.findOne({
      $or: [
        { email: identificador },
        { whatsapp: identificador }
      ]
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
    res.json(usuarios);
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
// El cliente pide recuperar; al barbero le llega un aviso con un enlace de un
// solo uso que él reenvía por WhatsApp. El cliente elige su propia contraseña.

exports.solicitarReset = async (req, res) => {
  try {
    const { identificador } = req.body;

    if (!identificador || !identificador.trim()) {
      return res.status(400).json({ mensaje: 'Escribe tu correo o tu WhatsApp.' });
    }

    const busqueda = identificador.trim();
    const usuario = await User.findOne({
      $or: [{ email: busqueda }, { whatsapp: busqueda }]
    });

    // Respuesta idéntica exista o no la cuenta, para no revelar quién está registrado
    const respuestaGenerica = {
      mensaje: 'Si la cuenta existe, la barbería recibirá tu solicitud y te enviará un enlace por WhatsApp para crear una contraseña nueva.'
    };

    if (!usuario || usuario.activo === false) {
      return res.json(respuestaGenerica);
    }

    // El token viaja en el enlace; en la base solo queda su hash
    const token = crypto.randomBytes(32).toString('hex');
    usuario.resetTokenHash = hashearToken(token);
    usuario.resetTokenExpira = new Date(Date.now() + VIGENCIA_RESET_MS);
    await usuario.save();

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const enlace = `${baseUrl}/restablecer/${token}`;

    const textoWhats = encodeURIComponent(
      `Hola ${usuario.nombre}, aquí puedes crear tu nueva contraseña de The Barber Studio 1225: ${enlace}\n\nEl enlace vence en 1 hora.`
    );
    const enlaceWhats = `https://wa.me/${usuario.whatsapp}?text=${textoWhats}`;

    try {
      await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: process.env.EMAIL_USER,
        subject: `🔑 Recuperación de contraseña: ${usuario.nombre}`,
        html: `
          <div style="font-family: sans-serif; border: 2px solid #d4af37; padding: 20px; border-radius: 10px; max-width: 600px;">
            <h2 style="color: #d4af37; margin-top: 0;">Un cliente quiere recuperar su contraseña</h2>
            <p><strong>Cliente:</strong> ${usuario.nombre}</p>
            <p><strong>Correo:</strong> ${usuario.email}</p>
            <p><strong>WhatsApp:</strong> ${usuario.whatsapp}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="margin-bottom: 18px;">Mándale este enlace para que cree su nueva contraseña:</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${enlaceWhats}" style="background:#25D366;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block;">
                Enviar por WhatsApp
              </a>
            </p>
            <p style="font-size: 12px; color: #888;">O copia y pega el enlace manualmente:</p>
            <p style="font-size: 12px; word-break: break-all; background:#f5f5f5; padding:10px; border-radius:6px;">${enlace}</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 11px; color: #888;">
              El enlace vence en 1 hora y solo se puede usar una vez. Si no reconoces esta solicitud, ignora este correo: sin el enlace no se puede cambiar nada.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      console.error('⚠️ Error enviando correo de recuperación:', emailError);
    }

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
    await usuario.save();

    res.json({ mensaje: 'Contraseña actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('Error al restablecer contraseña:', error);
    res.status(500).json({ mensaje: 'Error al restablecer la contraseña' });
  }
};
