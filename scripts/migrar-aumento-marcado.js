// Uso único: los servicios que se marcaron como "oferta" para avisar del
// aumento guardan el precio nuevo en "precio anterior". Este script los pasa a
// un cambio de precio programado, que se aplica solo en la fecha indicada.
//
// Desde la carpeta backend:
//   node scripts/migrar-aumento-marcado.js 2026-12-01            (sólo muestra)
//   node scripts/migrar-aumento-marcado.js 2026-12-01 --aplicar  (guarda)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');
const Service = require('../models/Service');
const { inicioDelDia } = require('../utils/catalogo');

const fecha = inicioDelDia(process.argv[2]);
const aplicar = process.argv.includes('--aplicar');

if (!fecha) {
  console.error('Uso: node scripts/migrar-aumento-marcado.js AAAA-MM-DD [--aplicar]');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const marcados = await Service.find({ esOferta: true, precioAnterior: { $gt: 0 } }).sort({ orden: 1 });
    // Sólo los que suben: un precio anterior más bajo sería una oferta de verdad
    const aumentos = marcados.filter((s) => s.precioAnterior > s.precio);

    for (const s of aumentos) {
      console.log(`${s.nombre}: $${s.precio} -> $${s.precioAnterior} desde ${process.argv[2]}`);
    }
    const ofertas = marcados.length - aumentos.length;
    if (ofertas) console.log(`(${ofertas} con oferta de verdad: no se tocan)`);

    if (!aplicar) {
      console.log(`\n${aumentos.length} servicios. Nada guardado: agrega --aplicar para guardar.`);
      return;
    }

    for (const s of aumentos) {
      s.precioNuevo = s.precioAnterior;
      s.precioNuevoDesde = fecha;
      s.esOferta = false;
      s.precioAnterior = 0;
      await s.save();
    }
    console.log(`\nListo: ${aumentos.length} cambios programados.`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
