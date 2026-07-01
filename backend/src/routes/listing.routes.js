const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma/client');
const { authenticate, authorize } = require('../middleware/auth');
const { getOrComputeMatch, recomputeMatch } = require('../services/matchService');

const router = express.Router();

const listingSchema = z.object({
  location: z.string().min(1),
  rent: z.number().int().positive(),
  availableFrom: z.string(),
  roomType: z.enum(['PRIVATE_ROOM', 'SHARED_ROOM', 'STUDIO', 'ENTIRE_FLAT']),
  furnishingStatus: z.enum(['FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED']),
  photos: z.array(z.string()).optional(),
  description: z.string().optional(),
});

// Owner: create listing
router.post('/', authenticate, authorize('OWNER'), async (req, res, next) => {
  try {
    const parsed = listingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const listing = await prisma.listing.create({
      data: {
        ownerId: req.user.id,
        location: data.location,
        rent: data.rent,
        availableFrom: new Date(data.availableFrom),
        roomType: data.roomType,
        furnishingStatus: data.furnishingStatus,
        photos: data.photos || [],
        description: data.description,
      },
    });
    res.status(201).json(listing);
  } catch (err) {
    next(err);
  }
});

// Owner: list their own listings
router.get('/mine', authenticate, authorize('OWNER'), async (req, res, next) => {
  try {
    const listings = await prisma.listing.findMany({
      where: { ownerId: req.user.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(listings);
  } catch (err) {
    next(err);
  }
});

// Owner: mark listing filled (hides from search)
router.patch('/:id/fill', authenticate, authorize('OWNER'), async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.ownerId !== req.user.id) return res.status(403).json({ error: 'Not your listing' });

    const updated = await prisma.listing.update({
      where: { id: req.params.id },
      data: { isFilled: true },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// Tenant: browse/search listings, filtered by location/budget, ranked by AI compatibility score
router.get('/', authenticate, authorize('TENANT'), async (req, res, next) => {
  try {
    const tenantProfile = await prisma.tenantProfile.findUnique({ where: { userId: req.user.id } });
    if (!tenantProfile) {
      return res.status(400).json({ error: 'Create your tenant profile before browsing listings' });
    }

    const { location, minRent, maxRent } = req.query;

    const where = { isFilled: false };
    if (location) where.location = { contains: String(location), mode: 'insensitive' };
    if (minRent || maxRent) {
      where.rent = {};
      if (minRent) where.rent.gte = Number(minRent);
      if (maxRent) where.rent.lte = Number(maxRent);
    }

    const listings = await prisma.listing.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { name: true } } },
    });

    // Compute (or fetch cached) compatibility score for each listing, then rank descending.
    const ranked = await Promise.all(
      listings.map(async (listing) => {
        const match = await getOrComputeMatch(tenantProfile, listing);
        return {
          ...listing,
          compatibility: {
            score: match.score,
            explanation: match.explanation,
            source: match.scoreSource,
          },
        };
      })
    );

    ranked.sort((a, b) => b.compatibility.score - a.compatibility.score);
    res.json(ranked);
  } catch (err) {
    next(err);
  }
});

// Tenant: force re-score a specific listing (optional utility endpoint)
router.post('/:id/rescore', authenticate, authorize('TENANT'), async (req, res, next) => {
  try {
    const tenantProfile = await prisma.tenantProfile.findUnique({ where: { userId: req.user.id } });
    if (!tenantProfile) return res.status(400).json({ error: 'Create your tenant profile first' });

    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });

    const match = await recomputeMatch(tenantProfile, listing);
    res.json(match);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const listing = await prisma.listing.findUnique({
      where: { id: req.params.id },
      include: { owner: { select: { name: true, email: true } } },
    });
    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    res.json(listing);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
