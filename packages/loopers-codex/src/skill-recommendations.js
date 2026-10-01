export const LOOPER_SKILL_RECOMMENDATION_MAP_VERSION = 'looper-skill-map-v01';

const RECOMMENDATIONS = Object.freeze({
  'CEO / Operator': Object.freeze([
    Object.freeze({ skillFamily: 'operations', reason: 'Coordinates goals, resources, and accountable execution.' }),
    Object.freeze({ skillFamily: 'planning', reason: 'Turns broad missions into bounded delivery plans.' }),
  ]),
  'Mercenary / Fixer': Object.freeze([
    Object.freeze({ skillFamily: 'incident-response', reason: 'Biases toward diagnosis, containment, and repair.' }),
    Object.freeze({ skillFamily: 'security-review', reason: 'Tests assumptions and closes exploitable gaps.' }),
  ]),
  'Trader / Broker': Object.freeze([
    Object.freeze({ skillFamily: 'market-intelligence', reason: 'Evaluates opportunities, counterparties, and market signals.' }),
    Object.freeze({ skillFamily: 'deal-routing', reason: 'Matches capital, intent, and execution paths.' }),
  ]),
  'Builder / Engineer': Object.freeze([
    Object.freeze({ skillFamily: 'software-engineering', reason: 'Builds and verifies deterministic systems.' }),
    Object.freeze({ skillFamily: 'technical-operations', reason: 'Maintains reliable tools and production workflows.' }),
  ]),
  'Creator / Propagandist': Object.freeze([
    Object.freeze({ skillFamily: 'content-creation', reason: 'Shapes narratives into clear public artifacts.' }),
    Object.freeze({ skillFamily: 'distribution', reason: 'Adapts messages for channels and audiences.' }),
  ]),
  'Researcher / Archivist': Object.freeze([
    Object.freeze({ skillFamily: 'research', reason: 'Collects evidence and separates fact from interpretation.' }),
    Object.freeze({ skillFamily: 'knowledge-management', reason: 'Preserves provenance and retrievable context.' }),
  ]),
  'Seer / Signal Hunter': Object.freeze([
    Object.freeze({ skillFamily: 'signal-analysis', reason: 'Finds meaningful patterns in noisy inputs.' }),
    Object.freeze({ skillFamily: 'forecasting', reason: 'Frames uncertainty without overstating confidence.' }),
  ]),
  'Diplomat / Connector': Object.freeze([
    Object.freeze({ skillFamily: 'coordination', reason: 'Connects people and agents around shared intent.' }),
    Object.freeze({ skillFamily: 'communications', reason: 'Maintains precise, context-aware communication.' }),
  ]),
});

export function getRecommendedSkills(sourceClass) {
  const entries = RECOMMENDATIONS[sourceClass];
  if (!entries) throw new RangeError(`unknown class: ${sourceClass}`);
  return Object.freeze(entries.map(({ skillFamily, reason }) => Object.freeze({
    skillFamily,
    reason,
    sourceClass,
    mapVersion: LOOPER_SKILL_RECOMMENDATION_MAP_VERSION,
    status: 'recommended',
  })));
}
