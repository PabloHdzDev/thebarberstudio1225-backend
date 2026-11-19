// Uso único: pasa la categoría única ("categoria") a la lista de categorías
// ("categorias"), para que un servicio pueda estar en varias pestañas.
//
// Desde la carpeta backend:
//   node scripts/migrar-categorias.js              (sólo muestra)
//   node scripts/migrar-categorias.js --aplicar    (copia a la lista nueva)
//   node scripts/migrar-categorias.js --limpiar    (borra el campo viejo; al final)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const mongoose = require('mongoose');

const aplicar = process.argv.includes('--aplicar');
const limpiar = process.argv.includes('--limpiar');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  try {
    for (const nombreColeccion of ['services', 'products']) {
      const coleccion = mongoose.connection.db.collection(nombreColeccion);
      console.log(`── ${nombreColeccion}`);

      if (limpiar) {
        const r = await coleccion.updateMany({ categoria: { $exists: true } }, { $unset: { categoria: '' } });
        console.log(`   campo viejo borrado en ${r.modifiedCount}`);
        continue;
      }

      // Sólo los que todavía no tienen la lista nueva
      const pendientes = await coleccion
        .find({ categorias: { $exists: false } })
        .project({ nombre: 1, categoria: 1 })
        .sort({ orden: 1 })
        .toArray();

      for (const d of pendientes) {
        const lista = d.categoria ? [d.categoria] : [];
        console.log(`   ${d.nombre}: ${JSON.stringify(lista)}`);
        if (aplicar) await coleccion.updateOne({ _id: d._id }, { $set: { categorias: lista } });
      }
      if (!pendientes.length) console.log('   nada pendiente');
    }

    if (!aplicar && !limpiar) console.log('\nNada guardado: agrega --aplicar para guardar.');
  } finally {
    await mongoose.disconnect();
  }
})().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
