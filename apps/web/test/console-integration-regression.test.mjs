import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function source(relativePath) {
  const url = new URL(relativePath, import.meta.url);
  assert.equal(existsSync(url), true, `${relativePath} must remain present`);
  return readFileSync(url, 'utf8');
}

test('restored Console keeps the latest agent gallery, Looper selection, switcher, and roster UI', () => {
  source('../src/console-agent-gallery.js');
  source('../src/console-looper-selection.js');

  const consoleSource = source('../src/multipass-console.js');
  const appSource = source('../src/app.js');
  const styles = source('../src/styles.css');
  assert.match(consoleSource, /console-agent-switcher/);
  assert.match(consoleSource, /console-roster/);
  assert.match(appSource, /toggle-console-roster-drawer/);
  assert.match(styles, /\.console-agent-switcher-mobile/);
});

test('restored Console keeps secure image chat on the client and API boundary', () => {
  source('../src/console-image-preparation.js');
  const threadSource = source('../src/console-agent-thread.js');
  const apiSource = source('../../api/src/console-image-attachment.js');
  const apiEntry = source('../../api/src/index.js');

  assert.match(threadSource, /data-console-image-input/);
  assert.match(threadSource, /data-console-image-dropzone/);
  assert.match(apiSource, /normalizeConsoleImageAttachment/);
  assert.match(apiEntry, /console-image-attachment\.js/);
});

test('restored Console exposes pinned Bankr marketplace discovery without removing the latest UI', () => {
  const catalogSource = source('../../api/src/bankr-marketplace-catalog.js');
  source('../../api/src/bankr-marketplace-catalog.json');
  const apiEntry = source('../../api/src/index.js');
  const skillCatalog = source('../../api/src/console-skill-catalog.js');
  const proposalLabels = source('../src/console-wallet-proposals.js');

  assert.match(catalogSource, /export function searchBankrMarketplaceSkills/);
  assert.match(apiEntry, /searchBankrMarketplaceSkills/);
  assert.match(apiEntry, /parts\[3\] === 'skills'/);
  assert.match(skillCatalog, /marketplace_skill_discovery/);
  assert.match(skillCatalog, /discover_marketplace_skills/);
  assert.match(proposalLabels, /151 official Bankr native and third-party skills/);
});
