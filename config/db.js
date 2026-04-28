const mongoose = require('mongoose');

const conectarDB = async () => {
  try {
    // 👇 Debe tener process.env.MONGO_URI, no una URL quemada ni localhost
    const uri = process.env.MONGO_URI; 
    
    if (!uri) {
      console.error("❌ ERROR: No se encontró la variable MONGO_URI");
      process.exit(1);
    }

    await mongoose.connect(uri);
    console.log('✅ Conectado a MongoDB Atlas exitosamente');
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
    process.exit(1);
  }
};

module.exports = conectarDB;