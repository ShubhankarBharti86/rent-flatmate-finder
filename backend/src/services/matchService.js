const prisma = require('../prisma/client');
const { computeCompatibility } = require('./compatibilityService');

/**
 * Returns the cached Match (score+explanation) for a tenant/listing pair,
 * computing and persisting it via the LLM (or rule-based fallback) only if
 * it doesn't already exist. This satisfies the requirement that scores are
 * "stored in DB, not recomputed on every request".
 */
async function getOrComputeMatch(tenantProfile, listing) {
  const existing = await prisma.match.findUnique({
    where: { tenantId_listingId: { tenantId: tenantProfile.id, listingId: listing.id } },
  });
  if (existing) return existing;

  const result = await computeCompatibility(listing, tenantProfile);

  return prisma.match.create({
    data: {
      tenantId: tenantProfile.id,
      listingId: listing.id,
      score: result.score,
      explanation: result.explanation,
      scoreSource: result.scoreSource,
    },
  });
}

/**
 * Recompute (overwrite) a match - used by an optional "refresh score" action.
 */
async function recomputeMatch(tenantProfile, listing) {
  const result = await computeCompatibility(listing, tenantProfile);
  return prisma.match.upsert({
    where: { tenantId_listingId: { tenantId: tenantProfile.id, listingId: listing.id } },
    update: { score: result.score, explanation: result.explanation, scoreSource: result.scoreSource },
    create: {
      tenantId: tenantProfile.id,
      listingId: listing.id,
      score: result.score,
      explanation: result.explanation,
      scoreSource: result.scoreSource,
    },
  });
}

module.exports = { getOrComputeMatch, recomputeMatch };
