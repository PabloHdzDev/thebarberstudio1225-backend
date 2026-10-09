// Paginación reutilizable para cualquier modelo de Mongoose.
// Centraliza el cálculo de saltos, los límites y el conteo total, para que
// cada controlador sólo describa QUÉ quiere listar y no CÓMO paginarlo.

const LIMITE_POR_DEFECTO = 12;
const LIMITE_MAXIMO = 60;

// Lo que escribe el usuario se usa dentro de una expresión regular, así que
// hay que neutralizar los caracteres especiales: sin esto, buscar "(" revienta
// la consulta y ".*" traería todos los registros.
const escaparRegex = (texto) => String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const construirRegex = (texto) => new RegExp(escaparRegex(texto.trim()), 'i');

// Arma el $or de búsqueda sobre campos propios del documento
const filtroDeBusqueda = (texto, campos = []) => {
  const limpio = String(texto || '').trim();
  if (!limpio || !campos.length) return null;
  const regex = construirRegex(limpio);
  return { $or: campos.map((campo) => ({ [campo]: regex })) };
};

const paginar = async (Modelo, opciones = {}) => {
  const {
    pagina = 1,
    limite = LIMITE_POR_DEFECTO,
    filtro = {},
    buscar = '',
    campos = [],
    orden = {},
    seleccion = null,
    poblar = null,
    // Algunos modelos exponen virtuales (por ejemplo el nivel de fidelidad)
    // que no viajan en el JSON si no se piden explícitamente
    virtuales = false,
  } = opciones;

  const paginaActual = Math.max(1, parseInt(pagina, 10) || 1);
  const porPagina = Math.min(
    LIMITE_MAXIMO,
    Math.max(1, parseInt(limite, 10) || LIMITE_POR_DEFECTO)
  );

  // El filtro de búsqueda se combina con $and para no pisar un $or que el
  // controlador ya haya puesto en el filtro base
  const consulta = { ...filtro };
  const busqueda = filtroDeBusqueda(buscar, campos);
  if (busqueda) {
    consulta.$and = [...(consulta.$and || []), busqueda];
  }

  let query = Modelo.find(consulta)
    .sort(orden)
    .skip((paginaActual - 1) * porPagina)
    .limit(porPagina);

  if (seleccion) query = query.select(seleccion);
  if (poblar) query = query.populate(poblar);

  const [documentos, total] = await Promise.all([
    query.exec(),
    Modelo.countDocuments(consulta),
  ]);

  return {
    datos: virtuales ? documentos.map((d) => d.toObject({ virtuals: true })) : documentos,
    total,
    pagina: paginaActual,
    limite: porPagina,
    totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
  };
};

module.exports = {
  paginar,
  construirRegex,
  escaparRegex,
  LIMITE_POR_DEFECTO,
  LIMITE_MAXIMO,
};
