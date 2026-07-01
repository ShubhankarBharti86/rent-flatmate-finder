const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');

/**
 * Wires up Socket.IO for real-time chat.
 * Auth: client connects with `auth: { token }` (JWT from login/register).
 * Events:
 *   - "join_chat"   { chatId }                 -> joins the room, validates participant
 *   - "send_message" { chatId, content }        -> persists + broadcasts "new_message"
 *   - "typing"      { chatId }                  -> broadcasts "typing" to the other participant
 */
function registerChatSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = payload;
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_chat', async ({ chatId }) => {
      try {
        const chat = await prisma.chat.findUnique({ where: { id: chatId } });
        if (!chat) return socket.emit('error_event', { message: 'Chat not found' });
        if (chat.tenantId !== socket.user.id && chat.ownerId !== socket.user.id) {
          return socket.emit('error_event', { message: 'Not a participant in this chat' });
        }
        socket.join(chatId);
        socket.emit('joined_chat', { chatId });
      } catch (err) {
        socket.emit('error_event', { message: 'Failed to join chat' });
      }
    });

    socket.on('send_message', async ({ chatId, content }) => {
      try {
        if (!content || !content.trim()) return;
        const chat = await prisma.chat.findUnique({ where: { id: chatId } });
        if (!chat) return socket.emit('error_event', { message: 'Chat not found' });
        if (chat.tenantId !== socket.user.id && chat.ownerId !== socket.user.id) {
          return socket.emit('error_event', { message: 'Not a participant in this chat' });
        }

        const message = await prisma.message.create({
          data: { chatId, senderId: socket.user.id, content: content.trim() },
          include: { sender: { select: { id: true, name: true } } },
        });

        io.to(chatId).emit('new_message', message);
      } catch (err) {
        socket.emit('error_event', { message: 'Failed to send message' });
      }
    });

    socket.on('typing', ({ chatId }) => {
      socket.to(chatId).emit('typing', { userId: socket.user.id, name: socket.user.name });
    });
  });
}

module.exports = registerChatSocket;
