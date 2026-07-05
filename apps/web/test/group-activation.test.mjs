import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  createGroupActivationPayload,
  normalizeGroupMemberInput,
  renderGroupActivationError,
  renderGroupActivationPanel,
  renderGroupActivationPreview,
  renderGroupActivationSuccess,
} from '../src/group-activation.js';

const emojiPattern = /[\u{1F300}-\u{1FAFF}]/u;
const forbiddenAuthorityClaims = /owns member|acts for member|acts on behalf|executes tools|releases credentials|payment proves trust|buys trust|custody transferred|transfer ownership|grants authority/i;
const redesignCopy = /cinematic|reimagined|visual overhaul|bold new design|immersive redesign/i;

function parse(html) {
  return new JSDOM(`<!doctype html><main>${html}</main>`).window.document.querySelector('main');
}

test('normalizeGroupMemberInput splits comma and newline member IDs', () => {
  assert.deepEqual(normalizeGroupMemberInput('1, 81\n1066'), ['1', '81', '1066']);
});

test('createGroupActivationPayload returns public snake_case group activation keys', () => {
  const dom = new JSDOM(`<!doctype html><form>
    <select name="subject_type"><option value="swarm" selected>Swarm</option></select>
    <input name="display_name" value=" Helixa Swarm ">
    <textarea name="summary"> Public parent Multipass for core agents. </textarea>
    <textarea name="member_ids">1, 81\n1066</textarea>
    <textarea name="shared_policy_note"> Owner approval required for shared routes. </textarea>
  </form>`);
  const form = dom.window.document.querySelector('form');

  assert.deepEqual(createGroupActivationPayload(new dom.window.FormData(form)), {
    subject_type: 'swarm',
    display_name: 'Helixa Swarm',
    summary: 'Public parent Multipass for core agents.',
    shared_policy_note: 'Owner approval required for shared routes.',
    member_ids: ['1', '81', '1066'],
  });
});

test('renderGroupActivationPanel renders required form controls, preview action, disabled save, and safety copy', () => {
  const html = renderGroupActivationPanel({ status: 'idle' });
  const root = parse(html);
  const text = root.textContent;

  assert.match(text, /Activate collection or swarm/);
  assert.match(text, /Preview group Multipass/);
  assert.match(text, /Activate group Multipass/);
  assert.equal(root.querySelector('[name="subject_type"]')?.hasAttribute('required'), true);
  assert.equal(root.querySelector('[name="display_name"]')?.hasAttribute('required'), true);
  assert.equal(root.querySelector('[name="summary"]')?.hasAttribute('required'), true);
  assert.equal(root.querySelector('[name="member_ids"]')?.hasAttribute('required'), true);
  assert.equal(root.querySelector('[name="shared_policy_note"]')?.hasAttribute('required'), true);
  assert.equal(root.querySelector('[data-action="save-group-multipass"]')?.hasAttribute('disabled'), true);
  assert.match(text, /public parent Multipass metadata only/i);
  assert.match(text, /does not transfer custody/i);
  assert.match(text, /does not call tools/i);
  assert.match(text, /does not expose private credentials/i);
  assert.match(text, /does not execute payments/i);
  assert.doesNotMatch(text, forbiddenAuthorityClaims);
  assert.equal(emojiPattern.test(html), false);
  assert.doesNotMatch(text, redesignCopy);
});

test('renderGroupActivationPreview renders parent profile, group type, members, Cred context, and safety copy', () => {
  const html = renderGroupActivationPreview({
    record: {
      profile: {
        display_name: 'Helixa Swarm',
        subject_type: 'swarm',
      },
    },
    members: [
      { name: 'Bendr 2.0', token_id: '1', canonical_id: '8453:1', cred_score: 82, cred_tier: 'Prime', source_status: 'resolved' },
      { name: 'Quigbot', token_id: '81', canonical_id: '8453:81', cred_score: 76, cred_tier: 'Prime', source_status: 'resolved' },
    ],
  });
  const root = parse(html);
  const text = root.textContent;

  assert.match(text, /Helixa Swarm/);
  assert.match(text, /swarm/);
  assert.match(text, /Bendr 2\.0/);
  assert.match(text, /Quigbot/);
  assert.match(text, /Token ID 1/);
  assert.match(text, /Token ID 81/);
  assert.match(text, /Cred 82 Prime/);
  assert.match(text, /Cred 76 Prime/);
  assert.match(text, /public parent Multipass metadata only/i);
  assert.match(text, /does not transfer custody/i);
  assert.doesNotMatch(text, forbiddenAuthorityClaims);
  assert.equal(emojiPattern.test(html), false);
});

test('renderGroupActivationSuccess renders share path, safe profile link, and unclaimed management copy', () => {
  const html = renderGroupActivationSuccess({
    sharePath: '/multipass/helixa-swarm-9c41a2',
    slug: 'helixa-swarm-9c41a2',
    profile: { display_name: 'Helixa Swarm' },
  });
  const root = parse(html);
  const link = root.querySelector('a[href="/multipass/helixa-swarm-9c41a2"]');
  const text = root.textContent;

  assert.match(text, /\/multipass\/helixa-swarm-9c41a2/);
  assert.equal(link?.textContent.includes('Open parent Multipass'), true);
  assert.match(text, /unclaimed management/i);
  assert.match(text, /Claim management when ready/i);
  assert.doesNotMatch(text, forbiddenAuthorityClaims);
  assert.equal(emojiPattern.test(html), false);
});

test('preview and success helpers render nothing without real data', () => {
  assert.equal(renderGroupActivationPreview(), '');
  assert.equal(renderGroupActivationSuccess(), '');
});

test('group activation helpers escape adversarial content and reject unsafe share paths', () => {
  const previewHtml = renderGroupActivationPreview({
    record: {
      profile: {
        display_name: '<img src=x onerror=alert(1)>',
        subject_type: 'swarm<script>alert(1)</script>',
      },
    },
    members: [
      {
        name: '<svg onload=alert(1)>',
        token_id: '1<script>',
        cred_score: '<b>99</b>',
        cred_tier: 'Prime<script>',
        source_status: 'resolved<script>',
      },
    ],
  });
  const previewRoot = parse(previewHtml);
  assert.equal(previewRoot.querySelector('img, svg, script'), null);
  assert.doesNotMatch(previewHtml, /<img|<svg|<script/i);
  assert.match(previewHtml, /&lt;img/);
  assert.match(previewHtml, /&lt;svg/);

  for (const unsafePath of [
    'https://evil.example/multipass/group-1234abcd',
    '/multipass/../admin',
    '/multipass/group%2fadmin',
    'javascript:alert(1)',
  ]) {
    const successHtml = renderGroupActivationSuccess({
      sharePath: unsafePath,
      slug: 'group-1234abcd',
      profile: { display_name: '<b>Group</b>' },
    });
    const root = parse(successHtml);
    assert.equal(root.querySelector('a'), null);
    assert.doesNotMatch(successHtml, /href="https?:|href="javascript:|<b>/i);
    assert.match(successHtml, /&lt;b&gt;Group&lt;\/b&gt;/);
  }
});

test('renderGroupActivationError handles structured API errors', () => {
  const html = renderGroupActivationError({
    details: {
      status: 400,
      body: {
        error: {
          code: 'invalid_group_activation',
          message: 'Member IDs are required.',
          details: { field: 'member_ids' },
        },
      },
    },
  });
  const text = parse(html).textContent;

  assert.match(text, /Member IDs are required\./);
  assert.match(text, /invalid_group_activation/);
  assert.match(text, /member_ids/);
  assert.equal(emojiPattern.test(html), false);
});

test('group activation helper render output has no emojis or broad redesign copy', () => {
  const combined = [
    renderGroupActivationPanel({ status: 'idle' }),
    renderGroupActivationPreview({ record: { profile: { display_name: 'Group', subject_type: 'collection' } }, members: [] }),
    renderGroupActivationSuccess({ sharePath: '/multipass/group-1234abcd', slug: 'group-1234abcd' }),
    renderGroupActivationError(new Error('Could not preview group.')),
  ].join('\n');

  assert.equal(emojiPattern.test(combined), false);
  assert.doesNotMatch(combined, redesignCopy);
});
