export function isRecommendationTelegramEligible(publication) {
  return (publication?.is_official === true && publication.status === 'PUBLISHED')
    || (publication?.status === 'SHADOW' && publication.market_context?.publication_gate?.requestedOfficial === true);
}

export function recommendationObservation(publication) {
  if (publication.is_official) return undefined;
  const gate = publication.market_context?.publication_gate || {};
  return { eligibleCount: Number(gate.eligibleCount || 0), requiredCount: Number(gate.requiredCount || 10), reason: gate.reason || null };
}
