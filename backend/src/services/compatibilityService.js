/**
 * Compatibility Scoring Service
 * ------------------------------
 * Computes a 0-100 compatibility score (+ explanation) between a tenant profile
 * and a room listing.
 *
 * Primary path: Anthropic LLM (Claude) is prompted to return strict JSON.
 * Fallback path: deterministic rule-based scorer, used when:
 *   - ANTHROPIC_API_KEY is not configured
 *   - the LLM call fails/times out
 *   - the LLM response cannot be parsed as valid JSON in the expected shape
 *
 * The caller is responsible for persisting the result (see matchService.js) so the
 * score is never recomputed on every request.
 */

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 10000;

function buildPrompt(listing, tenantProfile) {
  const listingSummary = {
    location: listing.location,
    rent: listing.rent,
    roomType: listing.roomType,
    furnishingStatus: listing.furnishingStatus,
    availableFrom: listing.availableFrom,
    description: listing.description || '',
  };
  const tenantSummary = {
    preferredLocation: tenantProfile.preferredLocation,
    budgetMin: tenantProfile.budgetMin,
    budgetMax: tenantProfile.budgetMax,
    moveInDate: tenantProfile.moveInDate,
    bio: tenantProfile.bio || '',
  };

  return `Given this room listing: ${JSON.stringify(listingSummary)} and this tenant profile: ${JSON.stringify(
    tenantSummary
  )}, compute a compatibility score from 0 to 100 based on budget and location match. Also briefly factor in move-in date alignment and room type/furnishing fit if mentioned in the tenant bio. Return JSON only, no markdown, no preamble, in exactly this shape: { "score": number, "explanation": string }. The explanation must be 1-2 sentences.`;
}

/**
 * Deterministic rule-based fallback scorer.
 * Weighting: budget match 60%, location match 30%, move-in date proximity 10%.
 */
function ruleBasedScore(listing, tenantProfile) {
  let score = 0;
  const reasons = [];

  // Budget (60 points)
  if (listing.rent >= tenantProfile.budgetMin && listing.rent <= tenantProfile.budgetMax) {
    score += 60;
    reasons.push('rent fits comfortably within the tenant budget');
  } else {
    const nearestBound =
      listing.rent < tenantProfile.budgetMin ? tenantProfile.budgetMin : tenantProfile.budgetMax;
    const diff = Math.abs(listing.rent - nearestBound);
    const pctOver = diff / Math.max(nearestBound, 1);
    if (pctOver <= 0.1) {
      score += 40;
      reasons.push('rent is close to the tenant budget (within 10%)');
    } else if (pctOver <= 0.25) {
      score += 20;
      reasons.push('rent is somewhat outside the tenant budget');
    } else {
      reasons.push('rent is significantly outside the tenant budget');
    }
  }

  // Location (30 points) - case-insensitive substring match
  const listingLoc = (listing.location || '').toLowerCase().trim();
  const tenantLoc = (tenantProfile.preferredLocation || '').toLowerCase().trim();
  if (listingLoc && tenantLoc && (listingLoc.includes(tenantLoc) || tenantLoc.includes(listingLoc))) {
    score += 30;
    reasons.push('location matches tenant preference');
  } else {
    reasons.push('location does not match tenant preference');
  }

  // Move-in date proximity (10 points) - within 30 days = full credit
  try {
    const availableFrom = new Date(listing.availableFrom);
    const moveIn = new Date(tenantProfile.moveInDate);
    const diffDays = Math.abs((availableFrom - moveIn) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      score += 10;
      reasons.push('move-in dates align closely');
    } else if (diffDays <= 30) {
      score += 5;
      reasons.push('move-in dates are reasonably close');
    }
  } catch (e) {
    // ignore date parsing issues, no points awarded
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const explanation = `Rule-based estimate: ${reasons.join('; ')}.`;
  return { score, explanation, scoreSource: 'RULE_BASED' };
}

async function callLLM(listing, tenantProfile) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        max_tokens: 300,
        messages: [{ role: 'user', content: buildPrompt(listing, tenantProfile) }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Anthropic API returned ${response.status}: ${text}`);
    }

    const data = await response.json();
    const textBlock = (data.content || []).find((c) => c.type === 'text');
    if (!textBlock) throw new Error('No text content in LLM response');

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.score !== 'number' || typeof parsed.explanation !== 'string') {
      throw new Error('LLM response missing required fields');
    }

    const score = Math.max(0, Math.min(100, Math.round(parsed.score)));
    return { score, explanation: parsed.explanation, scoreSource: 'LLM' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Public entry point. Always resolves (never throws) - falls back internally.
 */
async function computeCompatibility(listing, tenantProfile) {
  try {
    return await callLLM(listing, tenantProfile);
  } catch (err) {
    console.warn('[compatibilityService] LLM scoring failed, falling back to rule-based:', err.message);
    return ruleBasedScore(listing, tenantProfile);
  }
}

module.exports = { computeCompatibility, ruleBasedScore, buildPrompt };
