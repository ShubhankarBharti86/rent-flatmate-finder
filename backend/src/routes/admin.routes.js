const express = require('express');
const prisma = require('../prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate, authorize('ADMIN'));

router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.get('/listings', async (req, res, next) => {
  try {
    const listings = await prisma.listing.findMany({
      include: { owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(listings);
  } catch (err) {
    next(err);
  }
});

router.delete('/listings/:id', async (req, res, next) => {
  try {
    await prisma.listing.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Basic platform activity / stats dashboard
router.get('/stats', async (req, res, next) => {
  try {
    const [userCount, tenantCount, ownerCount, listingCount, filledCount, interestCount, chatCount, messageCount] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: 'TENANT' } }),
        prisma.user.count({ where: { role: 'OWNER' } }),
        prisma.listing.count(),
        prisma.listing.count({ where: { isFilled: true } }),
        prisma.interest.count(),
        prisma.chat.count(),
        prisma.message.count(),
      ]);
    res.json({
      users: { total: userCount, tenants: tenantCount, owners: ownerCount },
      listings: { total: listingCount, filled: filledCount, open: listingCount - filledCount },
      interests: interestCount,
      chats: chatCount,
      messages: messageCount,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
