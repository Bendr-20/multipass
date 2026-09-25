import { compareLooperTokenIds } from './console-looper-selection.js';

export const CONSOLE_AGENT_GALLERY_SORTS = Object.freeze([
  'token-asc',
  'token-desc',
  'name-asc',
  'name-desc',
]);

export function createConsoleAgentGalleryModel({ agents = [], query = '', sort = 'token-asc' } = {}) {
  const source = Array.isArray(agents) ? agents.filter(Boolean) : [];
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase();
  const normalizedSort = CONSOLE_AGENT_GALLERY_SORTS.includes(sort) ? sort : 'token-asc';
  const visible = source
    .filter((agent) => matchesGalleryQuery(agent, normalizedQuery))
    .slice()
    .sort(createGalleryComparator(normalizedSort));

  return {
    total: source.length,
    visible,
    query: String(query ?? '').trim(),
    sort: normalizedSort,
    emptyKind: source.length === 0 ? 'owned' : visible.length === 0 ? 'filtered' : null,
  };
}

function matchesGalleryQuery(agent, query) {
  if (!query) return true;
  const tokenId = String(agent?.tokenId ?? '').toLocaleLowerCase();
  const name = String(agent?.name ?? '').toLocaleLowerCase();
  return tokenId.includes(query) || name.includes(query);
}

function createGalleryComparator(sort) {
  const tokenDirection = sort === 'token-desc' ? -1 : 1;
  const nameDirection = sort === 'name-desc' ? -1 : 1;
  if (sort === 'name-asc' || sort === 'name-desc') {
    return (left, right) => {
      const byName = String(left?.name ?? '').localeCompare(String(right?.name ?? ''), undefined, { sensitivity: 'base', numeric: true });
      return byName !== 0 ? byName * nameDirection : compareGalleryTokenIds(left, right);
    };
  }
  return (left, right) => compareGalleryTokenIds(left, right) * tokenDirection;
}

function compareGalleryTokenIds(left, right) {
  const byTokenId = compareLooperTokenIds(left?.tokenId, right?.tokenId);
  return byTokenId !== 0
    ? byTokenId
    : String(left?.name ?? '').localeCompare(String(right?.name ?? ''), undefined, { sensitivity: 'base', numeric: true });
}
