const express = require('express');
const prisma = require('../prisma/client');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// List chats for the logged-in user (tenant or owner)
router.get('/', authenticate, async (req, res, next) => {
  try {
    const chats = await prisma.chat.findMany({
      where: { OR: [{ tenantId: req.user.id }, { ownerId: req.user.id }] },
      include: {
        tenant: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        interest: { include: { listing: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(chats);
  } catch (err) {
    next(err);
  }
});

// Get message history for a chat (REST, for initial load). Live messages arrive over WebSocket.
router.get('/:id/messages', authenticate, async (req, res, next) => {
  try {
    const chat = await prisma.chat.findUnique({ where: { id: req.params.id } });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (chat.tenantId !== req.user.id && chat.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Not a participant in this chat' });
    }

    const messages = await prisma.message.findMany({
      where: { chatId: req.params.id },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true } } },
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
