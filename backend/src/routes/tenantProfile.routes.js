const express = require('express');
const { z } = require('zod');
const prisma = require('../prisma/client');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

const profileSchema = z.object({
  preferredLocation: z.string().min(1),
  budgetMin: z.number().int().nonnegative(),
  budgetMax: z.number().int().positive(),
  moveInDate: z.string(), // ISO date
  bio: z.string().optional(),
});

// Create or update the logged-in tenant's profile (upsert)
router.put('/me', authenticate, authorize('TENANT'), async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const data = parsed.data;
    if (data.budgetMax < data.budgetMin) {
      return res.status(400).json({ error: 'budgetMax must be >= budgetMin' });
    }

    const profile = await prisma.tenantProfile.upsert({
      where: { userId: req.user.id },
      update: {
        preferredLocation: data.preferredLocation,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        moveInDate: new Date(data.moveInDate),
        bio: data.bio,
      },
      create: {
        userId: req.user.id,
        preferredLocation: data.preferredLocation,
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        moveInDate: new Date(data.moveInDate),
        bio: data.bio,
      },
    });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

router.get('/me', authenticate, authorize('TENANT'), async (req, res, next) => {
  try {
    const profile = await prisma.tenantProfile.findUnique({ where: { userId: req.user.id } });
    if (!profile) return res.status(404).json({ error: 'Profile not found. Create one first.' });
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
