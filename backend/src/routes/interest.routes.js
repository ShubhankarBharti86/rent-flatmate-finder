const express = require('express');
const prisma = require('../prisma/client');
const { authenticate, authorize } = require('../middleware/auth');
const { getOrComputeMatch } = require('../services/matchService');
const { sendHighMatchInterestEmail, sendInterestDecisionEmail } = require('../services/emailService');

const router = express.Router();

const HIGH_MATCH_THRESHOLD = Number(process.env.HIGH_MATCH_THRESHOLD || 80);

// Tenant: express interest in a listing
router.post('/', authenticate, authorize('TENANT'), async (req, res, next) => {
  try {
    const { listingId } = req.body;
    if (!listingId) return res.status(400).json({ error: 'listingId is required' });

    const listing = await prisma.listing.findUnique({ where: { id: listingId }, include: { owner: true } });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.isFilled) return res.status(400).json({ error: 'Listing is already filled' });

    const tenantProfile = await prisma.tenantProfile.findUnique({ where: { userId: req.user.id } });
    if (!tenantProfile) return res.status(400).json({ error: 'Create your tenant profile first' });

    const existing = await prisma.interest.findUnique({
      where: { tenantId_listingId: { tenantId: req.user.id, listingId } },
    });
    if (existing) return res.status(409).json({ error: 'Interest already expressed for this listing' });

    const interest = await prisma.interest.create({
      data: { tenantId: req.user.id, ownerId: listing.ownerId, listingId },
    });

    // Use the cached compatibility score (computed during browse) to decide on high-match email.
    const match = await getOrComputeMatch(tenantProfile, listing);
    if (match.score >= HIGH_MATCH_THRESHOLD) {
      await sendHighMatchInterestEmail({
        ownerEmail: listing.owner.email,
        ownerName: listing.owner.name,
        tenantName: req.user.name,
        listingLocation: listing.location,
        score: match.score,
      });
    }

    res.status(201).json({ interest, compatibilityScore: match.score });
  } catch (err) {
    next(err);
  }
});

// Owner: view interests received
router.get('/received', authenticate, authorize('OWNER'), async (req, res, next) => {
  try {
    const interests = await prisma.interest.findMany({
      where: { ownerId: req.user.id },
      include: {
        listing: true,
        tenant: { select: { id: true, name: true, email: true, tenantProfile: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(interests);
  } catch (err) {
    next(err);
  }
});

// Tenant: view interests sent
router.get('/sent', authenticate, authorize('TENANT'), async (req, res, next) => {
  try {
    const interests = await prisma.interest.findMany({
      where: { tenantId: req.user.id },
      include: { listing: true, owner: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(interests);
  } catch (err) {
    next(err);
  }
});

// Owner: accept or decline an interest. Accepting creates the chat thread.
router.patch('/:id', authenticate, authorize('OWNER'), async (req, res, next) => {
  try {
    const { status } = req.body; // 'ACCEPTED' | 'DECLINED'
    if (!['ACCEPTED', 'DECLINED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ACCEPTED or DECLINED' });
    }

    const interest = await prisma.interest.findUnique({
      where: { id: req.params.id },
      include: { listing: true, tenant: true },
    });
    if (!interest) return res.status(404).json({ error: 'Interest not found' });
    if (interest.ownerId !== req.user.id) return res.status(403).json({ error: 'Not your listing' });
    if (interest.status !== 'PENDING') {
      return res.status(400).json({ error: 'Interest already decided' });
    }

    const updated = await prisma.interest.update({
      where: { id: req.params.id },
      data: { status },
    });

    let chat = null;
    if (status === 'ACCEPTED') {
      chat = await prisma.chat.create({
        data: {
          interestId: interest.id,
          tenantId: interest.tenantId,
          ownerId: interest.ownerId,
        },
      });
    }

    await sendInterestDecisionEmail({
      tenantEmail: interest.tenant.email,
      tenantName: interest.tenant.name,
      listingLocation: interest.listing.location,
      status,
    });

    res.json({ interest: updated, chat });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
