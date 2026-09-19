import { RUNTIME_SUBMISSION } from './runtime-submission-data.js';

export function renderRuntimeSubmission(data = RUNTIME_SUBMISSION) {
  return `
    <main class="runtime-submission" aria-label="${escapeAttribute(data.title)} submission packet">
      <section class="runtime-submission-hero">
        <div class="runtime-submission-hero-copy">
          <p class="eyebrow">${escapeHtml(data.eyebrow)}</p>
          <h1>${escapeHtml(data.headline)}</h1>
          <p class="runtime-submission-lead">${escapeHtml(data.summary)}</p>
          <div class="runtime-submission-actions">
            <a class="homepage-action primary" href="${escapeAttribute(data.links.console)}">Open live Console</a>
            <a class="homepage-action" href="${escapeAttribute(data.links.repository)}" target="_blank" rel="noopener noreferrer">View repository</a>
          </div>
        </div>
        <aside class="runtime-submission-identity" aria-label="Submission identity">
          <span>PROJECT</span>
          <strong>${escapeHtml(data.title)}</strong>
          <small>${escapeHtml(data.event)}</small>
          <em>${escapeHtml(data.deadline)}</em>
        </aside>
      </section>

      <section class="runtime-submission-proof" aria-labelledby="runtime-proof-title">
        <header>
          <p class="eyebrow">Production proof</p>
          <h2 id="runtime-proof-title">One agent loop. Five verifiable rails.</h2>
        </header>
        <div class="runtime-proof-grid">
          ${data.proofs.map(renderProofCard).join('')}
        </div>
      </section>

      <section class="runtime-submission-architecture" aria-labelledby="runtime-architecture-title">
        <div class="runtime-section-heading">
          <p class="eyebrow">Architecture</p>
          <h2 id="runtime-architecture-title">Identity, runtime, memory, review.</h2>
        </div>
        <div class="runtime-architecture-grid">
          ${data.architecture.map(renderArchitectureCard).join('')}
        </div>
      </section>

      <section class="runtime-submission-story-grid">
        <article class="runtime-submission-panel">
          <p class="eyebrow">Two-minute demo</p>
          <h2>From wallet to persistent agent.</h2>
          <ol>${data.demo.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
        </article>
        <article class="runtime-submission-panel runtime-safety-panel">
          <p class="eyebrow">Safety model</p>
          <h2>Useful without custody.</h2>
          <ul>${data.safety.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>
        </article>
      </section>

      <section class="runtime-submission-cta">
        <div>
          <p class="eyebrow">Live product</p>
          <h2>Open the operator surface.</h2>
          <p>The public packet is static. The authenticated Console keeps wallet, runtime, memory, and transport evidence behind the correct holder boundary.</p>
        </div>
        <a class="homepage-action primary" href="${escapeAttribute(data.links.console)}">Open live Console</a>
      </section>
    </main>
  `;
}

function renderProofCard(proof) {
  return `
    <article class="runtime-proof-card">
      <span>${escapeHtml(proof.status)}</span>
      <h3>${escapeHtml(proof.label)}</h3>
      <p>${escapeHtml(proof.detail)}</p>
    </article>
  `;
}

function renderArchitectureCard(item) {
  return `
    <article class="runtime-architecture-card">
      <span>${escapeHtml(item.step)}</span>
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.detail)}</p>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
