require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const registerChatSocket = require('./sockets/chatSocket');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN || '*' },
});

registerChatSocket(io);

server.listen(PORT, () => {
  console.log(`Rent & Flatmate Finder API listening on port ${PORT}`);
});
