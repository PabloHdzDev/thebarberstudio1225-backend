// Reglas que comparten servicios y productos: posiciones sin repetir,
// categorías escritas siempre igual y cambios de precio programados.

// "3" -> 3; vacío, 0 o texto -> null (va al final)
const leerPosicion = (valor) => {
  const n = parseInt(valor, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// Deja las posiciones en 1, 2, 3… sin huecos ni repetidos. Si se indica un
// elemento, se coloca en esa posición y los demás se recorren; sin posición,
// se queda al final.
const reacomodar = async (Modelo, id = null, posicion = null) => {
  const todos = await Modelo.find({}, 'orden nombre').sort({ orden: 1, nombre: 1, _id: 1 }).lean();
  let lista = todos;

  if (id) {
    const actual = todos.find((d) => String(d._id) === String(id));
    if (actual) {
      lista = todos.filter((d) => d !== actual);
      const destino = Math.min(posicion || lista.length + 1, lista.length + 1);
      lista.splice(destino - 1, 0, actual);
    }
  }

  const cambios = lista
    .map((d, i) => ({ d, orden: i + 1 }))
    .filter(({ d, orden }) => d.orden !== orden)
    .map(({ d, orden }) => ({ updateOne: { filter: { _id: d._id }, update: { $set: { orden } } } }));

  if (cambios.length) await Modelo.bulkWrite(cambios);
};

// "  cortes " -> "Cortes" si ya existe así; así no salen dos pestañas que sólo
// cambian en mayúsculas
const normalizarCategoria = async (Modelo, texto) => {
  const limpia = String(texto ?? '').trim().replace(/\s+/g, ' ');
  if (!limpia) return '';
  const existentes = await Modelo.distinct('categoria');
  return existentes.find((c) => c && c.toLowerCase() === limpia.toLowerCase()) || limpia;
};

// "2026-12-01" -> 1 de diciembre a las 00:00 en Guadalajara (UTC-6 todo el año)
const inicioDelDia = (fecha) => (
  /^\d{4}-\d{2}-\d{2}$/.test(String(fecha || '')) ? new Date(`${fecha}T00:00:00-06:00`) : null
);

// Cuando llega la fecha de un cambio programado, el precio nuevo pasa a ser
// el precio. Se revisa cada vez que alguien consulta el catálogo, así no hace
// falta ninguna tarea programada en el servidor.
const aplicarPreciosProgramados = (Modelo) => Modelo.collection.updateMany(
  { precioNuevo: { $ne: null }, precioNuevoDesde: { $lte: new Date() } },
  [{ $set: { precio: '$precioNuevo', precioNuevo: null, precioNuevoDesde: null } }],
);

module.exports = { leerPosicion, reacomodar, normalizarCategoria, inicioDelDia, aplicarPreciosProgramados };
