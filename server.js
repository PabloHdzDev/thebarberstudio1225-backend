require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io'); 
const conectarDB = require('./config/db');
const socketHelper = require('./socket/socket');

// --- INICIALIZACIÓN ---
const app = express();
const server = http.createServer(app); 
const io = socketHelper.init(server);

// --- CONEXIÓN BD ---
conectarDB();

// 👇 Configuramos CORS para proteger la API y aceptar tu frontend en Vercel
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
};
app.use(cors(corsOptions));

app.use(express.json());

// Guardamos 'io' en app para poder usarlo en los controladores
app.set('socketio', io);

// --- RUTAS ---
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/citas', require('./routes/appointmentRoutes'));
app.use('/api/servicios', require('./routes/serviceRoutes'));
app.use('/api/productos', require('./routes/productRoutes'));

// --- LÓGICA DE SOCKETS ---
io.on('connection', (socket) => {
  console.log('📱 Cliente conectado al sistema de notificaciones');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor y WebSockets corriendo en el puerto ${PORT}`);
});