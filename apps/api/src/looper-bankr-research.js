export function createLooperBankrResearchFacade({ enabled = false } = {}) {
  if (enabled) throw new Error('Looper Bankr research is disabled in this release.');
  return Object.freeze({
    enabled: false,
    async research() {
      throw new Error('Looper Bankr research is disabled in this release.');
    },
  });
}
