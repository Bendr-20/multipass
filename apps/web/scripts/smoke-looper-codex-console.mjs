#!/usr/bin/env node
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const options = parseArgs(process.argv.slice(2));
const dist = resolve(options.dist ?? './dist');
const output = resolve(options.output ?? './tmp/looper-codex-console-smoke');
const chromiumPath = process.env.CHROMIUM_PATH || '/snap/bin/chromium';
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const relative = pathname.replace(/^\/multipass\/?/u, '') || 'index.html';
    let file = join(dist, relative);
    try { await readFile(file); } catch { file = join(dist, 'index.html'); }
    const bytes = await readFile(file);
    const type = ({ '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml' })[extname(file)] || 'application/octet-stream';
    response.writeHead(200, { 'content-type': type, 'content-length': bytes.length });
    response.end(bytes);
  } catch (error) { response.writeHead(500); response.end(String(error?.message ?? 'error')); }
});
await new Promise((resolveListen, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolveListen); });
const origin = `http://127.0.0.1:${server.address().port}`;
const route = `${origin}/multipass/console?mock=looper`;
let browser;
try {
  browser = await chromium.launch({ executablePath: chromiumPath, headless: true, args: ['--no-sandbox'] });
  const results = [];
  for (const viewport of [{ name:'desktop',width:1440,height:1000 },{ name:'mobile',width:390,height:844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const page = await context.newPage();
    const errors = [];
    let activationRequests = 0;
    let activationActions = 0;
    let messages = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.route('**/api/multipass/console/codex/query', async (requestRoute) => {
      const body = JSON.parse(requestRoute.request().postData() || '{}');
      await requestRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(codexEnvelope(body.operation, Number(body.selectedTokenId))) });
    });
    await page.route('**/api/multipass/console/agent/activate', async (requestRoute) => {
      activationRequests += 1;
      const tokenId = String(JSON.parse(requestRoute.request().postData() || '{}').tokenId || '812');
      await requestRoute.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        profile: { displayName: `Looper #${tokenId}` },
        thread: { transport:'xmtp_local', conversationId:`smoke-${tokenId}`, participants:[{ tokenId }], messages:[] },
        memory: {}, proposals: [],
      }) });
    });
    await page.route('**/api/multipass/console/agent/message', async (requestRoute) => {
      messages += 1;
      const body = JSON.parse(requestRoute.request().postData() || '{}');
      const summary = body.message === '/codex summary';
      const reply = summary ? 'Loopers verified collection summary: 7777 tokens. Artifact aaaaaaaaaaaa.' : 'I am Looper #812, grounded in the verified Codex.';
      await requestRoute.fulfill({ status: 200, contentType:'application/json', body: JSON.stringify({
        profile:{ displayName:'Looper #812' }, room:{},
        thread:{ transport:'xmtp_local', conversationId:'smoke-812', participants:[{ participantId:'812', tokenId:'812', displayName:'Looper #812' }], messages:[{ id:summary ? 'summary-reply' : 'identity-reply', role:'agent', participantId:'812', senderLabel:'Looper #812', text:reply, inferenceProvider: summary ? 'looper_codex' : 'mock' }] },
        memory:{}, proposals:[], missions:[], ...(summary ? { codex: collectionSummaryEnvelope() } : {}),
      }) });
    });
    await page.goto(route, { waitUntil:'domcontentloaded', timeout:30000 });
    await page.waitForSelector('[data-action="select-console-agent"]', { state:'attached', timeout:30000 });
    await page.locator('[data-action="select-console-agent"]').evaluate((selector) => { selector.value = '812'; selector.dispatchEvent(new Event('change', { bubbles:true })); });
    await page.waitForSelector('.console-codex-workspace', { state:'visible', timeout:30000 });
    if (activationRequests !== 0) throw new Error('selection activated chat');
    const drawerCount = await page.locator('details.console-codex-drawer').count();
    if (drawerCount !== 5) throw new Error(`expected five Codex drawers, got ${drawerCount}`);
    const navCount = await page.locator('.console-workspace-nav:visible button').count();
    if (navCount !== 4) throw new Error(`expected four workspace buttons, got ${navCount}`);
    await page.locator('[data-console-view="chat"]:visible').click();
    await page.waitForSelector('.console-activation-gate', { state:'visible' });
    activationActions += 1;
    await page.locator('[data-action="activate-selected-console-agent"]:visible').click();
    await page.waitForSelector('[data-action="send-console-agent-message"]', { state:'visible', timeout:30000 });
    if (await page.locator('.console-activation-gate:visible').count()) throw new Error('activation gate remained after explicit activation');
    for (const text of ['Who are you?', '/codex summary']) {
      const form = page.locator('[data-action="send-console-agent-message"]');
      await form.locator('textarea').fill(text);
      await form.locator('button[type="submit"]').click();
      const expected = text === '/codex summary' ? 'verified collection summary' : 'grounded in the verified Codex';
      await page.waitForTimeout(750);
      const rendered = await page.locator('body').innerText();
      if (!rendered.includes(expected)) throw new Error(`missing ${expected}; rendered tail: ${rendered.slice(-1200)}`);
    }
    for (const view of ['chat','codex','wallet','multipass']) {
      await page.locator(`[data-console-view="${view}"]:visible`).click();
      const currents = await page.locator('.console-workspace-nav:visible [aria-current="page"]').count();
      if (currents !== 1) throw new Error(`workspace ${view} has ${currents} current buttons`);
    }
    await page.locator('[data-console-view="codex"]:visible').click();
    await page.waitForSelector('.console-codex-workspace', { state:'visible' });
    const dimensions = await page.evaluate(() => ({ scrollWidth:document.body.scrollWidth,innerWidth:window.innerWidth }));
    if (dimensions.scrollWidth > dimensions.innerWidth) throw new Error(`overflow ${dimensions.scrollWidth - dimensions.innerWidth}px`);
    if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
    const screenshot = join(output, `codex-console-${viewport.name}.png`);
    await page.screenshot({ path:screenshot, fullPage:true });
    results.push({ viewport:viewport.name, passed:true, overflow:0, errors:0, screenshot, activationActions, activationRequests, messages });
    await context.close();
  }
  console.log(JSON.stringify({ route:'/multipass/console?mock=looper', results }, null, 2));
  console.log('codex-console-smoke=pass desktop=pass mobile=pass overflow=0 errors=0');
} finally {
  await browser?.close().catch(() => {});
  await new Promise((resolveClose) => server.close(resolveClose));
}

function parseArgs(args) { const result={}; for(let i=0;i<args.length;i+=1){ if(args[i]==='--dist') result.dist=args[++i]; else if(args[i]==='--output') result.output=args[++i]; else throw new Error('Unknown argument: '+args[i]); } return result; }
function evidence(tokenId, operation){ const base=[{id:`token:${tokenId}`,kind:'token',label:'collection_fact'}]; return operation==='explainTraits' ? [...base,{id:'trait:background',kind:'trait',label:'codex_interpretation'},{id:'trait:background',kind:'trait',label:'collection_fact'}] : base; }
function codexEnvelope(operation, tokenId){
  const common={schemaVersion:'1.0.0',artifactHash:'a'.repeat(64),codexVersion:'traits-v1',operation,subjectIds:[tokenId],evidence:evidence(tokenId,operation)};
  if(operation==='getTokenProfile') return {...common,result:{identity:{tokenId,canonicalName:`Looper #${tokenId}`,description:'Verified Looper.',image:{url:'https://turbo-gateway.com/example',id:'example'},externalUrl:'https://helixa.xyz/multipass'},visualTraits:[{type:'Background',value:'Nebula'}],interpretation:{primaryClass:'Researcher / Archivist',secondaryClass:'Builder / Engineer',specialization:'signal cartographer',risk:{value:4,label:'Balanced'},autonomy:{value:6,label:'Guided'},voice:'Precise',quirks:['Maps signals'],communicationStyle:['Short and clear'],values:['Evidence'],humor:['Dry'],origin:'Forged in the archive',missionBias:'Trace signal',shortLore:'Keeps receipts.',longLore:'A verified story.',activationSeed:'674e832692e7a526177d9cdd7bf67eb6',firstMission:'Map the signal',firstMissions:['Map the signal'],recommendedSkills:[{skillFamily:'research',reason:'Collects evidence.',sourceClass:'Researcher / Archivist',mapVersion:'looper-skill-map-v01',status:'recommended'}]},versions:{traitCodexVersion:'traits-v1',classModelVersion:'classes-v1'}}};
  if(operation==='explainTraits') return {...common,result:{tokenId,traits:[{type:'Background',value:'Nebula',frequency:{numerator:4,denominator:7777,ppm:514},evidenceId:'trait:background',interpretation:{archetype:'signal watcher',role:'worldview',narrativeSeed:'maps signals',voice:'precise',values:'evidence',missionBias:'trace signal',riskDelta:1,autonomyDelta:0,label:'codex_interpretation'}}]}};
  if(operation==='findSimilar') return {...common,result:{tokenId,items:[{tokenId:700,canonicalName:'Looper #700',intersectionWeight:'12',unionWeight:'20',scorePpm:600000,sharedTraits:[{type:'Background',value:'Nebula'}]}]}};
  return collectionSummaryEnvelope();
}
function collectionSummaryEnvelope(){return {schemaVersion:'1.0.0',artifactHash:'a'.repeat(64),codexVersion:'traits-v1',operation:'getCollectionSummary',subjectIds:[],evidence:[{id:'collection:a',kind:'collection',label:'collection_fact'}],result:{collection:{name:'Loopers',chainId:8453,count:7777},traitTypes:[],versions:{traitCodexVersion:'traits-v1'}}};}
