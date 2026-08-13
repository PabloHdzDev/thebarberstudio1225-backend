const Horario = require('../models/Horario');

// Horario que se usa la primera vez, si la colección aún está vacía.
const HORARIO_INICIAL = [
  { diaSemana: 0, abierto: true, apertura: '13:00', cierre: '17:00' },
  { diaSemana: 1, abierto: true, apertura: '11:00', cierre: '19:00' },
  { diaSemana: 2, abierto: true, apertura: '11:00', cierre: '20:00' },
  { diaSemana: 3, abierto: true, apertura: '15:00', cierre: '20:00' },
  { diaSemana: 4, abierto: true, apertura: '11:00', cierre: '20:00' },
  { diaSemana: 5, abierto: true, apertura: '11:00', cierre: '20:00' },
  { diaSemana: 6, abierto: true, apertura: '11:00', cierre: '20:00' },
];

const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Devuelve los 7 días ordenados, sembrando los valores iniciales si no existen.
const cargarHorarios = async () => {
  const existentes = await Horario.find().sort({ diaSemana: 1 });
  if (existentes.length === 7) return existentes;

  // Crea únicamente los días que falten, sin pisar los que ya estén guardados.
  const guardados = new Set(existentes.map(h => h.diaSemana));
  const faltantes = HORARIO_INICIAL.filter(h => !guardados.has(h.diaSemana));
  if (faltantes.length) await Horario.insertMany(faltantes);

  return Horario.find().sort({ diaSemana: 1 });
};

exports.obtenerHorarios = async (req, res) => {
  try {
    const horarios = await cargarHorarios();
    res.json(horarios);
  } catch (error) {
    console.error('Error al obtener horarios:', error);
    res.status(500).json({ mensaje: 'Error al obtener los horarios' });
  }
};

exports.actualizarHorarios = async (req, res) => {
  try {
    const { horarios } = req.body;

    if (!Array.isArray(horarios) || horarios.length === 0) {
      return res.status(400).json({ mensaje: 'Se esperaba una lista de horarios.' });
    }

    // --- Validación previa: no se guarda nada si algún día viene mal ---
    for (const dia of horarios) {
      const { diaSemana, abierto, apertura, cierre } = dia;

      if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
        return res.status(400).json({ mensaje: `Día de la semana inválido: ${diaSemana}` });
      }
      // Un día cerrado no necesita horas válidas.
      if (abierto === false) continue;

      if (!FORMATO_HORA.test(apertura) || !FORMATO_HORA.test(cierre)) {
        return res.status(400).json({
          mensaje: 'Las horas deben tener formato HH:MM en 24 horas (ej. 09:00, 20:30).'
        });
      }
      if (apertura >= cierre) {
        return res.status(400).json({
          mensaje: 'La hora de apertura debe ser anterior a la de cierre.'
        });
      }
    }

    // --- Aplicar ---
    await Promise.all(horarios.map(dia =>
      Horario.updateOne(
        { diaSemana: dia.diaSemana },
        {
          $set: {
            abierto: dia.abierto !== false,
            apertura: dia.apertura,
            cierre: dia.cierre,
          }
        },
        { upsert: true }
      )
    ));

    const actualizados = await Horario.find().sort({ diaSemana: 1 });
    res.json({ mensaje: 'Horarios actualizados correctamente', horarios: actualizados });
  } catch (error) {
    console.error('Error al actualizar horarios:', error);
    res.status(500).json({ mensaje: 'Error al actualizar los horarios' });
  }
};
