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
    assert.doesNotMatch(output.textContent, /právě teď dává smysl/i);
    assert.doesNotMatch(output.textContent, /klikni na chci/i);
  }
);

await runScenario(
  'theme-only-nongift',
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

    theme.value = 'Jarní restart pleti';
    brief.value = 'Zdůrazni benefity a krátkou zkušenost zákaznice.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.doesNotMatch(output.textContent, /tip na dárek/i);
    assert.doesNotMatch(output.textContent, /klikni na chci/i);
    assert.match(output.textContent, /Chci si vybrat/);
  }
);

await runScenario(
  'brief-product-inference',
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

    theme.value = 'Jarní restart pleti';
    brief.value = 'Napiš newsletter na produkt Aloe Vera šťáva, 500 ml. Zdůrazni benefity a krátkou zkušenost zákaznice.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /Aloe Vera šťáva, 500 ml/);
    assert.doesNotMatch(output.textContent, /Chci si vybrat/);
    assert.match(output.textContent, /Chci to mít doma|Chci vyzkoušet produkt|Chci objednat/);
    assert.match(output.textContent, /PŘEDMĚT: Aloe Vera šťáva(:|, 500 ml: ) (podpora|co oceníš|benefit)/);
    assert.doesNotMatch(output.textContent, /právě teď dává smysl/i);
  }
);

await runScenario(
  'manual-priority-over-brief',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const theme = document.querySelector('input[name="theme"]');
    const brief = document.querySelector('textarea[name="brief"]');
    const manual = document.querySelector('#manual-product-input');
    const form = document.querySelector('#generator-form');
    const output = document.querySelector('#output');

    theme.value = 'Jarní restart pleti';
    manual.value = 'Aquagel na oči a obličej';
    brief.value = 'Napiš newsletter na produkt Aloe Vera šťáva, 500 ml. Zdůrazni benefity.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /Aquagel na oči a obličej/);
    assert.doesNotMatch(output.textContent, /Aloe Vera šťáva, 500 ml/);
  }
);

await runScenario(
  'urgency-style-copy',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const theme = document.querySelector('input[name="theme"]');
    const brief = document.querySelector('textarea[name="brief"]');
    const offer = document.querySelector('input[name="offer"]');
    const form = document.querySelector('#generator-form');
    const output = document.querySelector('#output');

    theme.value = 'Jarní restart pleti';
    brief.value = 'Napiš newsletter na produkt Aloe Vera šťáva, 500 ml. Zdůrazni benefity.';
    offer.value = '20 % sleva do neděle';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /20 % sleva do neděle/i);
    assert.match(output.textContent, /dokud je nabídka aktuální|jen teď|otevři detail/i);
  }
);

await runScenario(
  'slaviton-no-meta-copy',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const theme = document.querySelector('input[name="theme"]');
    const brief = document.querySelector('textarea[name="brief"]');
    const manual = document.querySelector('#manual-product-input');
    const form = document.querySelector('#generator-form');
    const output = document.querySelector('#output');

    theme.value = 'Slaviton';
    manual.value = 'Fytogel Slaviton';
    brief.value = 'Napiš prodejní newsletter na Fytogel Slaviton.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /Fytogel Slaviton/);
    assert.match(output.textContent, /PŘEDMĚT: Fytogel Slaviton: (úleva|když chceš dopřát tělu větší komfort)/);
    assert.match(output.textContent, /Když máš za sebou dlouhý den/);
    assert.match(output.textContent, /Příjemně se nanáší, rychle zpříjemní chvíle po námaze/);
    assert.match(output.textContent, /Chci dopřát úlevu/);
    assert.doesNotMatch(output.textContent, /stavíme na jasném přínosu|prodává ho hlavně|text držíme|tlačíme na jasný|komunikujeme tak, aby|v textu proto funguje|právě proto umí rychle prodat|rychle dává smysl/i);
  }
);

await runScenario(
  'aloe-product-bank',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const theme = document.querySelector('input[name="theme"]');
    const brief = document.querySelector('textarea[name="brief"]');
    const manual = document.querySelector('#manual-product-input');
    const form = document.querySelector('#generator-form');
    const output = document.querySelector('#output');

    theme.value = 'Aloe Vera';
    manual.value = 'Aloe Vera šťáva, 500 ml';
    brief.value = 'Napiš prodejní newsletter na Aloe Vera šťáva, 500 ml. Zdůrazni benefity.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /PŘEDMĚT: Aloe Vera šťáva: podpora, kterou snadno zařadíš do dne/);
    assert.match(output.textContent, /HEADLINE: Aloe Vera šťáva: podpora pro každý den/);
    assert.match(output.textContent, /Aloe Vera šťáva je příjemný tip pro každého/);
    assert.match(output.textContent, /Používá se snadno, nezatěžuje rutinu/);
    assert.match(output.textContent, /Chci to mít doma/);
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

await runScenario(
  'cordyceps-product-bank',
  async (url) => {
    if (String(url).includes('style-profile.json')) return fakeResponse(profile);
    if (String(url).includes('product-catalog.json')) return fakeResponse(catalog);
    throw new Error(`Unexpected fetch ${url}`);
  },
  async (window) => {
    const { document } = window;
    const theme = document.querySelector('input[name="theme"]');
    const brief = document.querySelector('textarea[name="brief"]');
    const manual = document.querySelector('#manual-product-input');
    const form = document.querySelector('#generator-form');
    const output = document.querySelector('#output');

    theme.value = 'Cordyceps';
    manual.value = 'Cordyceps';
    brief.value = 'Napiš prodejní newsletter na Cordyceps. Vytáhni hlavní benefity pro zákazníka.';
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitForTick();

    assert.match(output.textContent, /Cordyceps se hodí přesně do dnů, kdy toho máš hodně/);
    assert.match(output.textContent, /Používá se snadno, nezdržuje/);
    assert.doesNotMatch(output.textContent, /rychle ukáže přínos|funguje nejlépe tehdy|dává smysl každému/i);
  }
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
