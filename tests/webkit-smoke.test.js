'use strict';
/**
 * Unstoppable Mind — headless DOM smoke suite.
 * Drives the real app in happy-dom and asserts that answers persist and that
 * pre-web-kit saved answers survive the retrofit.
 *   node tests/webkit-smoke.test.js [path-to-index.html]
 */
const fs = require('fs');
const path = require('path');
const { Window } = require('happy-dom');

const root = path.join(__dirname, '..');
const file = process.argv[2] || path.join(root, 'index.html');
const html = fs.readFileSync(file, 'utf8');
const wkPath = path.join(path.dirname(file), 'web-kit.js');
const wk = fs.existsSync(wkPath) ? fs.readFileSync(wkPath, 'utf8') : '';

const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const htmlNoScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');

const results = [];
const ok = (name, cond, extra = '') => results.push({ name, pass: !!cond, extra });

function boot(seed) {
  const w = new Window({ url: 'https://local.test/' });
  for (const [k, v] of Object.entries(seed || {})) { try { w.localStorage.setItem(k, v); } catch (e) {} }
  w.document.write(htmlNoScripts);
  if (wk) w.eval(wk);
  for (const s of inline) w.eval(s);
  return w;
}

function snapshot(w) {
  const out = {};
  for (let i = 0; i < w.localStorage.length; i++) {
    const k = w.localStorage.key(i);
    out[k] = w.localStorage.getItem(k);
  }
  return out;
}

(function main() {
  // 1. a saved answer survives a reload (checked checkbox + notes text)
  let w = boot();
  const cb = w.document.querySelector('input[type=checkbox][name="ex0"]');
  const ta = w.document.querySelector('textarea[name="note0"]');
  ok('app rendered: form present', !!w.document.getElementById('app'));
  ok('app rendered: a checkbox exists', !!cb);
  cb.checked = true;
  cb.dispatchEvent(new w.Event('change', { bubbles: true }));
  ta.value = 'did the reps';
  ta.dispatchEvent(new w.Event('input', { bubbles: true }));

  const seed = snapshot(w);
  ok('answer was written to storage', Object.keys(seed).length > 0, JSON.stringify(seed).slice(0, 120));

  let w2 = boot(seed);
  ok('checkbox persists across reload', w2.document.querySelector('input[type=checkbox][name="ex0"]').checked === true);
  ok('notes persist across reload', w2.document.querySelector('textarea[name="note0"]').value === 'did the reps');

  // 2. answers saved before web-kit (legacy key) are still read
  const legacy = { 'unstoppable_companion_v2': JSON.stringify({ ex0: true, t_note0: 'from the old key' }) };
  let w3 = boot(legacy);
  ok('legacy saved answer is read (checkbox)', w3.document.querySelector('input[type=checkbox][name="ex0"]').checked === true);
  ok('legacy saved answer is read (notes)', w3.document.querySelector('textarea[name="note0"]').value === 'from the old key');

  // 3. reset clears the stored answers
  let w4 = boot(seed);
  const form = w4.document.getElementById('app');
  form.dispatchEvent(new w4.Event('reset', { bubbles: true }));
  let w5 = boot(snapshot(w4));
  ok('reset clears stored answers', w5.document.querySelector('input[type=checkbox][name="ex0"]').checked === false);

  const failed = results.filter(r => !r.pass);
  console.log('\n==== RESULTS ====');
  results.forEach(r => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`));
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
