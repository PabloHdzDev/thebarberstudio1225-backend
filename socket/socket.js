// backend/socket/socket.js
let io;

module.exports = {
  init: (httpServer) => {
    io = require('socket.io')(httpServer, {
      cors: {
        // 👇 Agregamos la variable de entorno aquí también
        origin: [
          process.env.FRONTEND_URL || "http://localhost:5173", 
          "http://127.0.0.1:5173"
        ],
        methods: ["GET", "POST", "PUT", "DELETE"],
        credentials: true
      }
    });
    return io;
  },
  getIo: () => {
    if (!io) {
      throw new Error("Socket.io no inicializado!");
    }
    return io;
  }
};