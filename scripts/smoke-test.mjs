import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const rootDir = path.resolve(new URL('..', import.meta.url).pathname);
const appHtml = await fs.readFile(path.join(rootDir, 'app/index.html'), 'utf8');
const profile = JSON.parse(await fs.readFile(path.join(rootDir, 'data/current/style-profile.json'), 'utf8'));
const catalog = JSON.parse(await fs.readFile(path.join(rootDir, 'data/current/product-catalog.json'), 'utf8'));
const mainJsUrl = pathToFileURL(path.join(rootDir, 'app/main.js')).href;

async function runScenario(name, fetchImpl, verify, options = {}) {
  const dom = new JSDOM(appHtml, {
    url: 'http://localhost/app/index.html',
    pretendToBeVisual: true
  });

  const { window } = dom;
  const originalConsole = global.console;
  global.window = window;
  global.document = window.document;
  Object.defineProperty(global, 'navigator', {
    configurable: true,
    value: {
      clipboard: {
        writeText: async () => {}
      }
    }
  });
  global.FormData = window.FormData;
  global.fetch = fetchImpl;
  global.console = options.quietErrors
    ? { ...console, error: () => {} }
    : console;

  await import(`${mainJsUrl}?scenario=${encodeURIComponent(name)}&ts=${Date.now()}`);
  await waitForTick();
  await verify(window);
  global.console = originalConsole;
  dom.window.close();
}

function waitForTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

await runScenario(
  'happy-path',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const theme = document.querySelector('input[name="theme"]');
    const brief = document.querySelector('textarea[name="brief"]');
    const form = document.querySelector('#generator-form');
    const output = document.querySelector('#output');

    theme.value = 'Den matek';
    brief.value = 'Blíží se Den matek 10. 5. Chci tip na dárek pro maminku. Zdůrazni benefity a krátkou zkušenost zákaznice.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /PŘEDMĚT:/);
    assert.match(output.textContent, /PREHEADER:/);
    assert.match(output.textContent, /CTA:/);
  }
);

await runScenario(
  'load-error',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse({ message: 'missing' }, { ok: false, status: 500 });
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const output = document.querySelector('#output');
    const copyHtmlBtn = document.querySelector('#copy-html-output');
    assert.match(output.textContent, /Modul se nepodařilo spustit/i);
    assert.equal(copyHtmlBtn.disabled, true);
  },
  { quietErrors: true }
);

console.log('Smoke tests passed');

function fakeResponse(json, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return json;
    }
  };
}
