let profile = {};
let catalog = {};

const datasetMeta = document.querySelector('#dataset-meta');
const catalogMeta = document.querySelector('#catalog-meta');
const toneList = document.querySelector('#tone-list');
const ctaList = document.querySelector('#cta-list');
const examplesEl = document.querySelector('#examples');
const outputEl = document.querySelector('#output');
const inspirationEl = document.querySelector('#inspiration');
const form = document.querySelector('#generator-form');
const copyBtn = document.querySelector('#copy-output');
const copyHtmlBtn = document.querySelector('#copy-html-output');
const productSearchEl = document.querySelector('#product-search');
const productResultsEl = document.querySelector('#product-results');
const selectedProductsEl = document.querySelector('#selected-products');
const selectedProductsInput = document.querySelector('#selected-products-input');
const advancedToggleBtn = document.querySelector('#advanced-toggle');
const advancedPanelEl = document.querySelector('#advanced-panel');
const manualProductInput = document.querySelector('#manual-product-input');
const manualProductHint = document.querySelector('#manual-product-hint');
const catalogSelectionHint = document.querySelector('#catalog-selection-hint');
const focusBox = document.querySelector('.focus-box');

let lastDraft = null;
let selectedCatalogProducts = [];

bootstrap().catch(handleBootstrapError);

async function bootstrap() {
  ensureRequiredDom();
  setLoadingState();
  [profile, catalog] = await Promise.all([
    loadJson('../data/current/style-profile.json', 'datasetu kampaní'),
    loadJson('../data/current/product-catalog.json', 'produktového katalogu')
  ]);

  renderSidebar();
  renderExamples('cz', 'promo');
  renderInspiration([]);
  renderProductPicker();
  updateInputMode();
  bindEvents();
}

function bindEvents() {
  advancedToggleBtn?.addEventListener('click', () => {
    advancedPanelEl?.classList.toggle('hidden');
    advancedToggleBtn.textContent = advancedPanelEl?.classList.contains('hidden') ? 'Zobrazit advanced' : 'Skrýt advanced';
  });

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    syncSelectedProductsInput();
    const data = Object.fromEntries(new FormData(form).entries());
    const draft = generateNewsletter(data);
    lastDraft = draft;

    outputEl?.classList.remove('empty');
    outputEl.textContent = formatDraft(draft, data.language);
    renderExamples(data.language, data.campaignType);
    renderInspiration(draft.inspiration);
  });

  productSearchEl?.addEventListener('input', () => renderProductPicker(productSearchEl.value));
  manualProductInput?.addEventListener('input', () => updateInputMode());

  copyBtn?.addEventListener('click', async () => {
    if (!outputEl?.textContent.trim()) return;
    await navigator.clipboard.writeText(outputEl.textContent);
    flashButton(copyBtn, 'Zkopírováno');
  });

  copyHtmlBtn?.addEventListener('click', async () => {
    if (!lastDraft?.html) return;
    await navigator.clipboard.writeText(lastDraft.html);
    flashButton(copyHtmlBtn, 'HTML zkopírováno');
  });
}

function ensureRequiredDom() {
  const missing = [
    ['#dataset-meta', datasetMeta],
    ['#catalog-meta', catalogMeta],
    ['#tone-list', toneList],
    ['#cta-list', ctaList],
    ['#examples', examplesEl],
    ['#output', outputEl],
    ['#inspiration', inspirationEl],
    ['#generator-form', form],
    ['#product-results', productResultsEl],
    ['#selected-products', selectedProductsEl],
    ['#selected-products-input', selectedProductsInput]
  ].filter(([, node]) => !node);

  if (missing.length) {
    throw new Error(`Chybí povinné DOM prvky: ${missing.map(([selector]) => selector).join(', ')}`);
  }
}

async function loadJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Nepodařilo se načíst ${label} (${response.status})`);
  }
  return response.json();
}

function setLoadingState() {
  datasetMeta && (datasetMeta.textContent = 'Načítám dataset…');
  catalogMeta && (catalogMeta.textContent = 'Načítám katalog…');
  outputEl && (outputEl.textContent = 'Načítám data generátoru…');
}

function handleBootstrapError(error) {
  console.error('[newsletter-studio] bootstrap failed', error);
  datasetMeta && (datasetMeta.innerHTML = '<span class="error-text">Dataset se nepodařilo načíst.</span>');
  catalogMeta && (catalogMeta.innerHTML = '<span class="error-text">Katalog se nepodařilo načíst.</span>');
  if (outputEl) {
    outputEl.classList.remove('empty');
    outputEl.textContent = `Modul se nepodařilo spustit. ${error.message || 'Zkus obnovit stránku nebo zkontrolovat data.'}`;
  }
  copyBtn && (copyBtn.disabled = true);
  copyHtmlBtn && (copyHtmlBtn.disabled = true);
}

function flashButton(button, text) {
  if (!button) return;
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => (button.textContent = original), 1500);
}

function renderSidebar() {
  const langInfo = Object.entries(profile.languageBreakdown || {}).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ') || 'Bez jazykových dat';
  const typeInfo = Object.entries(profile.campaignTypeBreakdown || {}).map(([key, value]) => `${key}: ${value}`).join(' · ') || 'Bez typologických dat';
  const profileGeneratedAt = profile.generatedAt ? new Date(profile.generatedAt).toLocaleString('cs-CZ') : 'neznámý';
  const catalogGeneratedAt = catalog.generatedAt ? new Date(catalog.generatedAt).toLocaleString('cs-CZ') : 'neznámý';

  datasetMeta.innerHTML = `
    <strong>${profile.campaignCount || 0}</strong> kampaní<br />
    <span>Poslední build: ${profileGeneratedAt}</span><br />
    <span>${langInfo}</span><br />
    <span>${typeInfo}</span><br />
    <strong>Mode:</strong> High-seller default
  `;

  catalogMeta.innerHTML = `
    <strong>${catalog.counts?.total || 0}</strong> produktů<br />
    <span>Viditelných: ${catalog.counts?.visible || 0}</span><br />
    <span>S cenou: ${catalog.counts?.withPrice || 0}</span><br />
    <span>Build: ${catalogGeneratedAt}</span>
  `;

  toneList.innerHTML = '';
  ctaList.innerHTML = '';
  (profile.tone?.voice || ['dataset zatím nevrátil tonalitu']).forEach((item) => appendListItem(toneList, item));
  (profile.tone?.ctaPatterns || ['Chci zjistit víc']).forEach((item) => appendListItem(ctaList, item));
}

function renderProductPicker(query = '') {
  renderSelectedProducts();
  const matches = searchCatalog(query);
  productResultsEl.innerHTML = '';

  if (!matches.length) {
    productResultsEl.innerHTML = `<div class="empty-state">${query ? 'Nic jsem nenašel. Zkus název, kód, EAN nebo kratší dotaz.' : 'Začni psát a vyber produkty z katalogu.'}</div>`;
    return;
  }

  matches.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'product-result';
    row.innerHTML = `
      <div class="product-result-top">
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <div class="product-result-meta">${escapeHtml(item.code || 'bez kódu')} · ${item.price?.withVat ?? '–'} ${escapeHtml(item.price?.currency || 'CZK')} · ${item.visible ? 'viditelný' : 'skrytý'}</div>
        </div>
        <button type="button" data-add-product="${escapeHtml(item.code || item.title)}">Přidat</button>
      </div>
      <div class="product-result-meta">${escapeHtml(item.url || '')}</div>
    `;
    row.querySelector('button')?.addEventListener('click', () => addSelectedProduct(item));
    productResultsEl.appendChild(row);
  });
}

function renderSelectedProducts() {
  selectedProductsEl.innerHTML = '';
  if (!selectedCatalogProducts.length) {
    selectedProductsEl.innerHTML = '<div class="empty-state">Zatím není vybraný žádný katalogový produkt.</div>';
    syncSelectedProductsInput();
    updateInputMode();
    return;
  }

  selectedCatalogProducts.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'product-chip';
    chip.innerHTML = `<span>${escapeHtml(item.title)}</span><button type="button" aria-label="Odebrat">×</button>`;
    chip.querySelector('button')?.addEventListener('click', () => removeSelectedProduct(item.code || item.title));
    selectedProductsEl.appendChild(chip);
  });
  syncSelectedProductsInput();
  updateInputMode();
}

function searchCatalog(query = '') {
  const cleaned = cleanField(query).toLowerCase();
  const baseItems = (catalog.items || [])
    .filter((item) => !isPlaceholderProduct(item))
    .filter((item) => !selectedCatalogProducts.some((selected) => (selected.code || selected.title) === (item.code || item.title)));
  if (!cleaned) return baseItems.filter((item) => item.visible).slice(0, 12);
  return baseItems
    .map((item) => ({ item, score: scoreCatalogMatch(item, cleaned) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ item }) => item);
}

function scoreCatalogMatch(item, query) {
  const hay = [item.title, item.code, item.ean, item.url, ...(item.search || [])].map((value) => cleanField(value).toLowerCase());
  let score = 0;
  hay.forEach((field) => {
    if (!field) return;
    if (field === query) score += 100;
    else if (field.startsWith(query)) score += 40;
    else if (field.includes(query)) score += 20;
  });
  if (item.visible) score += 10;
  if (item.code === query || (item.search || []).some((entry) => cleanField(entry) === query)) score += 60;
  return score;
}

function addSelectedProduct(item) {
  if (selectedCatalogProducts.some((selected) => (selected.code || selected.title) === (item.code || item.title))) return;
  selectedCatalogProducts = [...selectedCatalogProducts, item];
  renderProductPicker(productSearchEl.value);
}

function removeSelectedProduct(key) {
  selectedCatalogProducts = selectedCatalogProducts.filter((item) => (item.code || item.title) !== key);
  renderProductPicker(productSearchEl.value);
}

function syncSelectedProductsInput() {
  selectedProductsInput.value = JSON.stringify(selectedCatalogProducts.map((item) => ({
    code: item.code,
    title: item.title,
    url: item.url,
    price: item.price,
    visible: item.visible
  })));
}

function updateInputMode() {
  const hasCatalogSelection = selectedCatalogProducts.length > 0;
  if (manualProductInput) {
    manualProductInput.disabled = hasCatalogSelection;
    if (hasCatalogSelection) manualProductInput.value = '';
  }
  focusBox?.classList.toggle('disabled', hasCatalogSelection);
  if (manualProductHint) {
    manualProductHint.textContent = hasCatalogSelection
      ? 'Produktový focus teď řídí vybraný katalog. Ruční pole je vypnuté.'
      : 'Tohle pole použij jen jako fallback, když nechceš vybírat produkt z katalogu.';
  }
  if (catalogSelectionHint) {
    catalogSelectionHint.textContent = hasCatalogSelection
      ? `${selectedCatalogProducts.length} produktů vybráno, generátor pojede primárně z katalogu.`
      : 'Bez vybraného produktu bude výstup slabší.';
    catalogSelectionHint.classList.toggle('ready', hasCatalogSelection);
  }
}

function renderExamples(language, campaignType) {
  examplesEl.innerHTML = '';
  const examples = (profile.examples || []).filter((example) => example.language === language && example.campaignType === campaignType).slice(0, 6);
  const fallback = examples.length ? examples : (profile.examples || []).slice(0, 6);

  fallback.forEach((example) => {
    const div = document.createElement('div');
    div.className = 'example';
    div.innerHTML = `<strong>${example.subject}</strong><p>${example.headline}</p><small>${example.cta || ''}</small>`;
    examplesEl.appendChild(div);
  });
}

function renderInspiration(items) {
  inspirationEl.innerHTML = '';
  if (!items.length) {
    inspirationEl.innerHTML = '<div class="example muted">Po vygenerování tady uvidíš nejpodobnější minulé kampaně.</div>';
    return;
  }
  items.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'example';
    div.innerHTML = `<strong>${item.subject}</strong><p>${item.headline}</p><small>score ${item.score} · ${item.campaignType}/${item.language} · ${item.cta || ''}</small>`;
    inspirationEl.appendChild(div);
  });
}

function appendListItem(target, text) {
  const li = document.createElement('li');
  li.textContent = text;
  target.appendChild(li);
}

function generateNewsletter(data) {
  const tuned = prepareNewsletterInput({ ...data, mode: 'high-seller', tonePreset: normalizeTone(data) });
  const subset = pickSubset(tuned);
  const inspiration = findInspiration(tuned);
  let cta = buildCta(tuned, subset, inspiration);
  let subjectAngles = scoreSubjectAngles(buildSubjectAngles(tuned, subset), tuned, inspiration);
  let primarySubject = subjectAngles[0];
  let preheader = buildPreheader(tuned, subset, primarySubject.angle);
  let headline = buildHeadline(tuned, subset, primarySubject.angle, inspiration);
  let blocks = buildBlocks(tuned, cta, primarySubject.angle, inspiration);
  let salesScore = scoreDraft({ tuned, primarySubject, preheader, headline, cta, blocks });

  if (salesScore.total < 80) {
    ({ primarySubject, subjectAngles, preheader, headline, cta, blocks, salesScore } = strengthenDraft({ tuned, subset, inspiration, subjectAngles, cta, preheader, headline, blocks }));
  }

  const finalDraft = finalizeDraft({ tuned, primarySubject, subjectAngles, preheader, headline, cta, blocks, salesScore, inspiration });
  const body = finalDraft.paragraphs.join('\n\n');
  const salesChecks = buildSalesChecks(tuned, finalDraft.primarySubject.angle, finalDraft.cta, finalDraft.salesScore);
  const html = buildHtmlDraft({ data: tuned, preheader: finalDraft.preheader, headline: finalDraft.headline, cta: finalDraft.cta, paragraphs: finalDraft.paragraphs });
  return {
    subject: finalDraft.primarySubject.text,
    subjectAngles: finalDraft.subjectAngles,
    preheader: finalDraft.preheader,
    headline: finalDraft.headline,
    body,
    cta: finalDraft.cta,
    blocks: finalDraft.blocks,
    paragraphs: finalDraft.paragraphs,
    html,
    salesChecks,
    inspiration,
    salesScore: finalDraft.salesScore
  };
}

function strengthenDraft({ tuned, subset, inspiration, subjectAngles, cta, preheader, headline, blocks }) {
  const strongerAngles = subjectAngles.sort((a, b) => {
    const aBoost = ['urgency', 'benefit', 'offer', 'deadline'].includes(a.angle) ? 20 : 0;
    const bBoost = ['urgency', 'benefit', 'offer', 'deadline'].includes(b.angle) ? 20 : 0;
    return (b.score + bBoost) - (a.score + aBoost);
  });
  const primarySubject = strongerAngles[0];
  const strongerCta = strengthenCta(tuned, cta);
  const strongerPreheader = strengthenPreheader(tuned, preheader);
  const strongerHeadline = strengthenHeadline(tuned, headline);
  const strongerBlocks = strengthenBlocks(tuned, blocks, strongerCta);
  const salesScore = scoreDraft({ tuned, primarySubject, preheader: strongerPreheader, headline: strongerHeadline, cta: strongerCta, blocks: strongerBlocks });
  return {
    primarySubject,
    subjectAngles: strongerAngles,
    preheader: strongerPreheader,
    headline: strongerHeadline,
    cta: strongerCta,
    blocks: strongerBlocks,
    salesScore
  };
}

function formatDraft(draft, language) {
  return [
    `${label('subject', language)}: ${draft.subject}`,
    '',
    `${label('subject_variants', language)}:`,
    ...draft.subjectAngles.slice(0, 5).map((item, index) => `${index + 1}. ${item.text}`),
    '',
    `${label('preheader', language)}: ${draft.preheader}`,
    '',
    `${label('headline', language)}: ${draft.headline}`,
    '',
    `${label('body', language)}:`,
    ...draft.paragraphs,
    '',
    `${label('cta', language)}: ${draft.cta}`,
    '',
    `${label('html', language)}: ${language === 'sk' ? 'pripravené na kopírovanie tlačidlom' : 'připraveno ke kopírování tlačítkem'}`
  ].join('\n');
}

function normalizeTone(data) {
  if (data.tonePreset === 'warm') return 'warm-sell';
  if (data.tonePreset === 'direct') return 'hard-sell';
  if (data.tonePreset === 'urgent') return 'urgency-sell';
  if (data.tonePreset === 'educational') return 'education-sell';
  if (data.campaignType === 'education') return 'education-sell';
  if (data.campaignType === 'urgency' || data.offer) return 'urgency-sell';
  return data.tonePreset || 'hard-sell';
}

function pickSubset(data) {
  return profile.byCampaignType?.[data.campaignType] || profile.byLanguage?.[data.language] || {};
}

function findInspiration(data) {
  const tokens = tokenize(`${data.theme} ${data.product} ${getProductNames(data).join(' ')} ${data.offer || ''}`);
  return (profile.examples || [])
    .filter((item) => item.language === data.language)
    .map((item) => ({ ...item, score: similarityScore(tokens, item) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function similarityScore(tokens, item) {
  const hay = tokenize(`${item.subject} ${item.headline} ${item.previewText || ''} ${item.cta || ''}`);
  let score = 0;
  tokens.forEach((token) => {
    if (hay.includes(token)) score += 2;
  });
  if (item.campaignType) score += 1;
  return score;
}

function tokenize(value) {
  return value.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((item) => item.length > 2);
}

function buildSubjectAngles(data, subset) {
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(getThemeFocus(data));
  const line = capitalize(getProductLine(data, 3));
  const offer = cleanField(data.offer);
  const isMulti = getSelectedProducts(data).length > 1;
  const isGift = isGiftOccasion(data);
  const isTheme = data.copyPlan?.leadType === 'theme';
  const category = data.copyPlan?.category || 'general';
  const mode = data.copyPlan?.styleMode || 'hard-sell';

  const baseBank = data.language === 'sk'
    ? {
        benefit: [offer ? `${focus}: ${offer}` : `${focus}: tip, ktorý sa oplatí otvoriť`, `${focus}: čo z neho robí silný tip`, `${focus}: prečo po ňom ľudia siahajú opakovane`],
        urgency: [offer ? `${offer} len teraz` : `${focus}: neodkladaj to na neskôr`, `${focus}: pozri sa naň skôr, než ho minieš`, `${focus}: teraz je správny čas otvoriť detail`],
        curiosity: [isMulti ? `${line}: ako vybrať kombináciu, ktorá funguje` : `${focus}: prečo si ho ľudia dávajú do košíka opakovane`, `${focus}: čo na ňom zaujme po prvom kliknutí`, `${focus}: čo z neho robí rýchly favorit`],
        result: [`${focus}: čo môže priniesť pri pravidelnom používaní`, `${focus}: efekt, ktorý chceš cítiť čo najskôr`, `${focus}: výsledok, kvôli ktorému stojí za pozornosť`],
        offer: [offer ? `${focus}: ${offer}` : `${focus}: vyber si ho skôr, než zapadne`, `${focus}: ponuka, ktorú je škoda nechať bez kliknutia`, `${focus}: rýchly tip s jasným dôvodom kúpy`],
        usefulness: [`${theme}: čo sa oplatí vybrať`, `${theme}: krátko, jasne a bez omáčky`, `${theme}: čo stojí za otvorenie`],
        number: [`3 dôvody, prečo otvoriť ${theme.toLowerCase()}`],
        novelty: [`Novinka: ${focus}`, `${focus}: nový tip, ktorý stojí za pozornosť`],
        deadline: [`${focus}: posledná šanca otvoriť detail`, `${focus}: nenechávaj to na poslednú chvíľu`]
      }
    : {
        benefit: [offer ? `${focus}: ${offer}` : `${focus}: tip, který se vyplatí otevřít`, `${focus}: co z něj dělá silný tip`, `${focus}: proč po něm lidé sahají opakovaně`],
        urgency: [offer ? `${offer} jen teď` : `${focus}: neodkládej to na později`, `${focus}: podívej se na něj dřív, než ho mineš`, `${focus}: teď je správný čas otevřít detail`],
        curiosity: [isMulti ? `${line}: jak vybrat kombinaci, která funguje` : `${focus}: proč si ho lidé dávají do košíku opakovaně`, `${focus}: co na něm zaujme po prvním kliknutí`, `${focus}: co z něj dělá rychlého favorita`],
        result: [`${focus}: co může přinést při pravidelném používání`, `${focus}: efekt, který chceš cítit co nejdřív`, `${focus}: výsledek, kvůli kterému stojí za pozornost`],
        offer: [offer ? `${focus}: ${offer}` : `${focus}: vyber si ho dřív, než zapadne`, `${focus}: nabídka, kterou je škoda nechat bez kliknutí`, `${focus}: rychlý tip s jasným důvodem koupě`],
        usefulness: [`${theme}: co se vyplatí vybrat`, `${theme}: stručně, jasně a bez omáčky`, `${theme}: co stojí za otevření`],
        number: [`3 důvody, proč otevřít ${theme.toLowerCase()}`],
        novelty: [`Novinka: ${focus}`, `${focus}: nový tip, který stojí za pozornost`],
        deadline: [`${focus}: poslední šance otevřít detail`, `${focus}: nenechávej to na poslední chvíli`]
      };

  const categoryBank = getCategorySubjectPack(data.language, category, focus, theme);
  const modeBank = getStyleModeSubjectPack(data.language, mode, focus, theme, offer);
  const bank = mergeSubjectBanks(baseBank, categoryBank, modeBank);

  const angleOrder = isTheme
    ? ['usefulness', 'offer', 'curiosity', 'benefit', 'number']
    : data.campaignType === 'education'
      ? ['usefulness', 'benefit', 'curiosity', 'result', 'number']
      : data.campaignType === 'launch'
        ? ['novelty', 'benefit', 'offer', 'result', 'curiosity']
        : data.campaignType === 'event'
          ? ['deadline', 'urgency', 'benefit', 'curiosity', 'offer']
          : data.campaignType === 'urgency'
            ? ['urgency', 'deadline', 'offer', 'benefit', 'curiosity']
            : ['benefit', 'offer', 'urgency', 'result', 'curiosity'];

  if (isGift && isTheme) {
    bank.benefit = data.language === 'sk'
      ? [`${theme}: tip na darček, ktorý poteší`, `${theme}: čo vybrať pre mamu`, `${theme}: výber, ktorý nepôsobí obyčajne`]
      : [`${theme}: tip na dárek, který potěší`, `${theme}: co vybrat pro maminku`, `${theme}: výběr, který nepůsobí obyčejně`];
  }

  const librarySubjects = data.copyPlan?.copyLibrary?.subjects || [];

  return [...librarySubjects.map((text) => ({ angle: 'benefit', text: cleanSubject(text) })), ...angleOrder
    .flatMap((angle) => (bank[angle] || []).map((text) => ({ angle, text: cleanSubject(text) })))]
    .filter((item) => item.text.length >= 8)
    .filter((item, index, array) => array.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) === index)
    .slice(0, 5);
}

function scoreSubjectAngles(angles, data, inspiration) {
  return angles
    .map((item) => ({ ...item, score: scoreAngle(item.angle, data, inspiration) }))
    .sort((a, b) => b.score - a.score);
}

function scoreAngle(angle, data, inspiration) {
  let score = 50;
  if (data.campaignType === 'promo' && ['benefit', 'offer', 'urgency'].includes(angle)) score += 25;
  if (data.campaignType === 'education' && ['usefulness', 'number', 'curiosity'].includes(angle)) score += 25;
  if (data.campaignType === 'launch' && ['novelty', 'benefit', 'result'].includes(angle)) score += 25;
  if (data.campaignType === 'event' && ['deadline', 'urgency'].includes(angle)) score += 25;
  if (data.campaignType === 'urgency' && ['urgency', 'deadline', 'offer'].includes(angle)) score += 25;
  if (data.offer && ['offer', 'urgency', 'benefit'].includes(angle)) score += 10;
  if (data.copyPlan?.styleMode === 'urgency-sell' && ['urgency', 'deadline'].includes(angle)) score += 10;
  if (data.copyPlan?.styleMode === 'education-sell' && ['usefulness', 'number'].includes(angle)) score += 10;
  if (data.copyPlan?.styleMode === 'hard-sell' && ['benefit', 'offer', 'result'].includes(angle)) score += 8;
  if (shouldLeadWithTheme(data) && ['benefit', 'curiosity', 'offer'].includes(angle)) score += 18;
  if (shouldLeadWithTheme(data) && ['urgency', 'deadline'].includes(angle) && !data.offer) score -= 12;
  if (inspiration[0]?.subject && inspiration[0].score > 0 && ['benefit', 'curiosity', 'offer'].includes(angle)) score += 5;
  return score;
}

function buildPreheader(data, subset, angle) {
  const focus = getPrimaryFocus(data);
  const theme = getThemeFocus(data);
  const offer = normalizeSentence(data.offer);
  const multiLead = getSelectedProducts(data).length > 1 ? buildMultiModeLead(data) : '';
  const base = isGiftOccasion(data)
    ? (data.language === 'sk' ? `${theme} je za rohom. Vyber tip, ktorý poteší a zároveň dáva zmysel.` : `${theme} je za rohem. Vyber tip, který potěší a zároveň dává smysl.`)
    : shouldLeadWithTheme(data)
      ? (data.language === 'sk' ? `${theme} je dobrá príležitosť ukázať krátky, konkrétny a užitočný výber.` : `${theme} je dobrá příležitost ukázat krátký, konkrétní a užitečný výběr.`)
      : (offer || multiLead || (data.language === 'sk' ? `${focus} stručne, jasne a s dôvodom, prečo ho riešiť práve teraz.` : `${focus} stručně, jasně a s důvodem, proč ho řešit právě teď.`));
  return truncate(cleanCopy(base), subset.avgSubjectLength ? Math.max(58, subset.avgSubjectLength + 25) : 88);
}

function strengthenPreheader(data, preheader) {
  if (preheader && !isMetaCopy(preheader) && !isInstructionSentence(preheader)) return preheader;
  const focus = getPrimaryFocus(data).toLowerCase();
  const theme = getThemeFocus(data);
  if (data.offer) return data.language === 'sk' ? `${data.offer}. Pozri sa dovnútra, čo sa oplatí vybrať.` : `${data.offer}. Podívej se dovnitř, co se teď vyplatí vybrat.`;
  if (shouldLeadWithTheme(data)) return isGiftOccasion(data)
    ? (data.language === 'sk' ? `${theme} je skvelá príležitosť vybrať darček, ktorý poteší.` : `${theme} je skvělá příležitost vybrat dárek, který potěší.`)
    : (data.language === 'sk' ? `${theme} je dobrá príležitosť ukázať užitočný výber bez zbytočnej omáčky.` : `${theme} je dobrá příležitost ukázat užitečný výběr bez zbytečné omáčky.`);
  return data.language === 'sk' ? `Vo vnútri nájdeš krátky a konkrétny tip k ${focus}.` : `Uvnitř najdeš krátký a konkrétní tip k ${focus}.`;
}

function buildHeadline(data, subset, angle, inspiration) {
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(getThemeFocus(data));
  const multiHeadline = getSelectedProducts(data).length > 1 ? buildMultiHeadline(data) : null;
  if (multiHeadline) return cleanCopy(multiHeadline);
  const libraryHeadline = data.copyPlan?.copyLibrary?.headlines?.[0];
  if (libraryHeadline) return cleanCopy(libraryHeadline);
  if (isGiftOccasion(data) && data.copyPlan?.leadType !== 'theme') {
    return cleanCopy(data.language === 'sk' ? `${focus}: darčekový tip, ktorý poteší` : `${focus}: dárkový tip, který potěší`);
  }
  if (shouldLeadWithTheme(data)) {
    return cleanCopy(isGiftOccasion(data)
      ? (data.language === 'sk' ? `${theme}: tip na darček, ktorý poteší` : `${theme}: tip na dárek, který potěší`)
      : (data.language === 'sk' ? `${theme}: čo sa oplatí otvoriť` : `${theme}: co se vyplatí otevřít`));
  }
  return cleanCopy(subset.examples?.[0]?.headline || `${theme} a ${focus}`);
}

function strengthenHeadline(data, headline) {
  if (headline && !isMetaCopy(headline) && !isInstructionSentence(headline)) return headline;
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(getThemeFocus(data));
  if (getSelectedProducts(data).length > 1) return buildMultiHeadline(data) || focus;
  if (shouldLeadWithTheme(data)) return isGiftOccasion(data)
    ? (data.language === 'sk' ? `${theme}: tip na darček, ktorý poteší` : `${theme}: tip na dárek, který potěší`)
    : (data.language === 'sk' ? `${theme}: stručne a prakticky` : `${theme}: stručně a prakticky`);
  return data.language === 'sk' ? `${focus}, ktoré sa oplatí pozrieť práve teraz` : `${focus}, které stojí za pozornost právě teď`;
}

function buildBlocks(data, cta, angle, inspiration) {
  const focus = getPrimaryFocus(data);
  const offer = normalizeSentence(data.offer);
  const detail = getBriefLead(data);
  const detail2 = getBriefSupport(data);
  const whyNow = buildWhyNow(data, data.language, angle);
  const proofLine = buildProof(data, data.language);
  const multiIntro = getSelectedProducts(data).length > 1 ? buildMultiIntro(data) : '';
  const multiSupport = getSelectedProducts(data).length > 1 ? buildMultiSupport(data) : '';
  const actionLead = isSoftOffer(data.offer) ? '' : offer;
  const extraParagraphs = buildLengthParagraphs(data, inspiration);

  const blocks = data.language === 'sk'
    ? [
        { title: 'ÚVOD', text: cleanCopy(`${capitalize(focus)} je práve teraz téma, ktorá si zaslúži pozornosť. ${buildConcreteOpening(data) || whyNow}`) },
        { title: 'DETAIL', text: cleanCopy(detail || multiIntro || `${capitalize(focus)} komunikujeme stručne, konkrétne a s jasným benefitom pre čitateľa.`) },
        { title: 'DÔVOD', text: cleanCopy(detail2 || multiSupport || proofLine) },
        ...extraParagraphs.map((text, index) => ({ title: index === 0 ? 'DOPLNENIE' : 'VIAC', text: cleanCopy(text) })),
        { title: 'AKCIA', text: cleanCopy(`${actionLead ? `${actionLead} ` : ''}${cta}.`) }
      ]
    : [
        { title: 'ÚVOD', text: cleanCopy(`${capitalize(focus)} je právě teď téma, které si zaslouží pozornost. ${buildConcreteOpening(data) || whyNow}`) },
        { title: 'DETAIL', text: cleanCopy(detail || multiIntro || `${capitalize(focus)} komunikujeme stručně, konkrétně a s jasným benefitem pro čtenáře.`) },
        { title: 'DŮVOD', text: cleanCopy(detail2 || multiSupport || proofLine) },
        ...extraParagraphs.map((text, index) => ({ title: index === 0 ? 'DOPLNĚNÍ' : 'VÍC', text: cleanCopy(text) })),
        { title: 'AKCE', text: cleanCopy(`${actionLead ? `${actionLead} ` : ''}${cta}.`) }
      ];

  if (data.length === 'short') return blocks.slice(0, 3);
  return blocks;
}

function strengthenBlocks(data, blocks, cta) {
  const focus = getPrimaryFocus(data);
  const theme = getThemeFocus(data);
  const offer = normalizeSentence(data.offer);
  const support = buildConcreteSupport(data);
  const actionLine = offer ? `${offer} ${cta}.` : `${cta}.`;

  return blocks.map((block, index) => {
    if (index === 0) {
      return {
        ...block,
        text: data.language === 'sk'
          ? cleanCopy(`${capitalize(shouldLeadWithTheme(data) ? theme : focus)} je tip, ktorý sa práve teraz oplatí otvoriť. ${offer || buildConcreteOpening(data)}`)
          : cleanCopy(`${capitalize(shouldLeadWithTheme(data) ? theme : focus)} je tip, který se právě teď vyplatí otevřít. ${offer || buildConcreteOpening(data)}`)
      };
    }
    if (index === 1) {
      return {
        ...block,
        text: cleanCopy(support[0] || block.text)
      };
    }
    if (index === 2) {
      return {
        ...block,
        text: cleanCopy(support[1] || block.text)
      };
    }
    if (index === blocks.length - 1) {
      return {
        ...block,
        text: cleanCopy(actionLine)
      };
    }
    return { ...block, text: cleanCopy(block.text) };
  });
}

function scoreDraft({ tuned, primarySubject, preheader, headline, cta, blocks }) {
  const openPotential = scoreOpenPotential(primarySubject, preheader);
  const clickPotential = scoreClickPotential(cta, blocks);
  const salesClarity = scoreSalesClarity(blocks, headline);
  const urgencyStrength = scoreUrgencyStrength(tuned, primarySubject, preheader, blocks);
  const total = Math.round((openPotential + clickPotential + salesClarity + urgencyStrength) / 4);
  return { total, openPotential, clickPotential, salesClarity, urgencyStrength };
}

function scoreOpenPotential(subject, preheader) {
  let score = 55;
  if (subject.text.length >= 22 && subject.text.length <= 52) score += 15;
  if (/(sleva|zľava|novinka|poslední|posledná|teď|teraz|proč|prečo|%)/i.test(subject.text)) score += 15;
  if (preheader && preheader !== subject.text) score += 10;
  return Math.min(score, 100);
}

function scoreClickPotential(cta, blocks) {
  let score = 55;
  if (cta.length >= 4 && cta.length <= 28) score += 15;
  if (!/(zobrazit|pozrieť|podívat|podivat)/i.test(cta)) score += 10;
  if (blocks.some((block) => /hlavní akce|hlavná akcia|cta/i.test(block.text))) score += 15;
  return Math.min(score, 100);
}

function scoreSalesClarity(blocks, headline) {
  let score = 55;
  if (headline.length <= 65) score += 10;
  if (blocks.length >= 3) score += 10;
  if (blocks.some((block) => /nabídka|ponuka|benefit|přínos|prínos/i.test(block.text))) score += 15;
  if (blocks.some((block) => /důvod|dovod|věřit|veriť/i.test(block.title + ' ' + block.text))) score += 10;
  return Math.min(score, 100);
}

function scoreUrgencyStrength(tuned, subject, preheader, blocks) {
  let score = tuned.offer ? 60 : 45;
  if (/(končí|brzy|teď|teraz|poslední|posledná|deadline|šance)/i.test(subject.text)) score += 20;
  if (/(jednat právě teď|konať práve teraz|časově citlivá|časovo citlivá)/i.test(preheader)) score += 15;
  if (blocks.some((block) => /teď|teraz|čas|časové|časovo/i.test(block.text))) score += 10;
  return Math.min(score, 100);
}

function buildWhyNow(data, language, angle) {
  const theme = getThemeFocus(data);
  const focus = getPrimaryFocus(data);
  const dateHint = data.briefSignals?.occasionDate ? (language === 'sk' ? ` Blíži sa ${data.briefSignals.occasionDate}.` : ` Blíží se ${data.briefSignals.occasionDate}.`) : '';
  const map = {
    cz: {
      benefit: shouldLeadWithTheme(data) ? `${theme} je dobrý moment připomenout tip, který se hodí jako dárek.${dateHint}` : `${focus} je právě teď dobrý tip pro zákazníky, kteří chtějí něco konkrétního a srozumitelného.`,
      urgency: data.offer ? `${data.offer} Proto dává smysl jednat teď.` : `${focus} má smysl připomenout právě teď.`,
      curiosity: `Uvnitř rychle ukážeme, proč se na ${focus.toLowerCase()} podívat blíž.`,
      result: `Hned vysvětlíme, co může ${focus.toLowerCase()} přinést.`,
      usefulness: `Čtenář má hned pochopit, proč je to pro něj užitečné.`,
      novelty: `Novinku spojujeme s jasným důvodem, proč ji řešit už teď.`,
      number: `Krátký přehled pomůže rychle pochopit hlavní hodnotu.`,
      deadline: `Když je nabídka omezená, musí to být z textu hned cítit.`,
      offer: `Hned nahoře musí být jasné, co zákazník získá.`
    },
    sk: {
      benefit: shouldLeadWithTheme(data) ? `${theme} je dobrý moment pripomenúť tip, ktorý sa hodí ako darček.${dateHint}` : `${focus} je práve teraz dobrý tip pre zákazníkov, ktorí chcú niečo konkrétne a zrozumiteľné.`,
      urgency: data.offer ? `${data.offer} Preto dáva zmysel konať teraz.` : `${focus} má zmysel pripomenúť práve teraz.`,
      curiosity: `Vo vnútri rýchlo ukážeme, prečo sa na ${focus.toLowerCase()} pozrieť bližšie.`,
      result: `Hneď vysvetlíme, čo môže ${focus.toLowerCase()} priniesť.`,
      usefulness: `Čitateľ má hneď pochopiť, prečo je to pre neho užitočné.`,
      novelty: `Novinku spájame s jasným dôvodom, prečo ju riešiť už teraz.`,
      number: `Krátky prehľad pomôže rýchlo pochopiť hlavnú hodnotu.`,
      deadline: `Keď je ponuka obmedzená, musí to byť z textu hneď cítiť.`,
      offer: `Hneď hore musí byť jasné, čo zákazník získa.`
    }
  };
  return map[language]?.[angle] || map[language].benefit;
}

function buildProof(data, language) {
  const focus = getPrimaryFocus(data).toLowerCase();
  if (data.briefSignals?.mentionReview) {
    return language === 'sk'
      ? `Doplň krátku skúsenosť zákazníčky, ktorá vysvetlí, prečo si ${focus} obľúbila.`
      : `Doplň krátkou zkušenost zákaznice, která vysvětlí, proč si ${focus} oblíbila.`;
  }
  if (data.campaignType === 'education') {
    return language === 'sk'
      ? `Stručné vysvetlenie pomôže rýchlo pochopiť, prečo dáva ${focus} zmysel.`
      : `Stručné vysvětlení pomůže rychle pochopit, proč dává ${focus} smysl.`;
  }
  if (data.offer || data.briefSignals?.mentionBenefits) {
    return language === 'sk'
      ? `Jasná ponuka a konkrétny benefit pomáhajú rýchlo rozhodnúť, či je ${focus} správna voľba.`
      : `Jasná nabídka a konkrétní benefit pomáhají rychle rozhodnout, jestli je ${focus} správná volba.`;
  }
  return language === 'sk'
    ? `Krátky a konkrétny text pomôže ukázať, prečo sa ${focus} oplatí venovať pozornosť.`
    : `Krátký a konkrétní text pomůže ukázat, proč se ${focus} vyplatí věnovat pozornost.`;
}

function buildRiskOfNoAction(data, language, angle) {
  const map = {
    cz: {
      urgency: 'Bez viditelného tlaku na čas mail ztratí prodejní napětí.',
      benefit: 'Když benefit schováme níž, část publika odpadne dřív, než pochopí hodnotu.',
      curiosity: 'Když zůstaneme jen u zvědavosti, otevření se nemusí proměnit v klik.',
      result: 'Když neukážeme výsledek, produkt bude působit zaměnitelně.',
      usefulness: 'Když nebudeme praktičtí, mail spadne do šedé zóny běžných promo zpráv.',
      novelty: 'Když budeme stát jen na novosti, rychle se vytratí důvod jednat.',
      number: 'Když nepomůžeme rychlou orientací, hodnota mailu se ztratí v prvních sekundách.',
      deadline: 'Když deadline nebude vidět, urgence nebude působit věrohodně.',
      offer: 'Když nabídku nepodáme jasně, zájem se nerozjede do akce.'
    },
    sk: {
      urgency: 'Bez viditeľného tlaku na čas mail stratí predajné napätie.',
      benefit: 'Keď benefit schováme nižšie, časť publika odpadne skôr, než pochopí hodnotu.',
      curiosity: 'Keď zostaneme len pri zvedavosti, otvorenie sa nemusí zmeniť na klik.',
      result: 'Keď neukážeme výsledok, produkt bude pôsobiť zameniteľne.',
      usefulness: 'Keď nebudeme praktickí, mail spadne do šedej zóny bežných promo správ.',
      novelty: 'Keď budeme stáť len na novosti, rýchlo sa vytratí dôvod konať.',
      number: 'Keď nepomôžeme rýchlou orientáciou, hodnota mailu sa stratí v prvých sekundách.',
      deadline: 'Keď deadline nebude vidno, urgencia nebude pôsobiť dôveryhodne.',
      offer: 'Keď ponuku nepodáme jasne, záujem sa nerozbehne do akcie.'
    }
  };
  return map[language]?.[angle] || map[language].benefit;
}

function buildSalesChecks(data, angle, cta, salesScore) {
  return data.language === 'sk'
    ? [
        `Mode je HIGH-SELLER a hlavný angle je ${angle}.`,
        `Predajné skóre je ${salesScore.total}/100.`,
        `Lead type: ${data.copyPlan?.leadType || 'n/a'}, source: ${data.copyPlan?.source || data.productSource || 'n/a'} (${data.copyPlan?.sourceConfidence || 'n/a'}).`,
        'Preheader dopĺňa subject, neopakuje ho doslova.',
        `Mail smeruje k jednému hlavnému CTA: ${cta}.`
      ]
    : [
        `Mode je HIGH-SELLER a hlavní angle je ${angle}.`,
        `Prodejní skóre je ${salesScore.total}/100.`,
        `Lead type: ${data.copyPlan?.leadType || 'n/a'}, source: ${data.copyPlan?.source || data.productSource || 'n/a'} (${data.copyPlan?.sourceConfidence || 'n/a'}).`,
        'Preheader doplňuje subject, neopakuje ho doslova.',
        `Mail směřuje k jednomu hlavnímu CTA: ${cta}.`
      ];
}

function buildCta(data, subset, inspiration) {
  const focus = getPrimaryFocus(data).toLowerCase();
  const selectedCount = getSelectedProducts(data).length;
  const libraryCta = data.copyPlan?.copyLibrary?.ctas?.[0];
  if (data.ctaGoal) return strengthenCta(data, data.language === 'sk' ? `Chcem ${data.ctaGoal}` : `Chci ${data.ctaGoal}`);
  if (selectedCount > 1) return strengthenCta(data, buildMultiCta(data));
  if (libraryCta) return strengthenCta(data, libraryCta);
  if (data.copyPlan?.ctaType === 'offer' || (data.offer && !isSoftOffer(data.offer))) return strengthenCta(data, data.language === 'sk' ? 'Chcem využiť ponuku' : 'Chci využít nabídku');
  if (data.copyPlan?.ctaType === 'gift') return strengthenCta(data, data.language === 'sk' ? 'Chcem vybrať darček' : 'Chci vybrat dárek');
  if (data.copyPlan?.ctaType === 'browse' || shouldLeadWithTheme(data)) {
    return strengthenCta(data, data.language === 'sk' ? 'Chcem si vybrať' : 'Chci si vybrat');
  }
  if (data.campaignType === 'event') return strengthenCta(data, data.language === 'sk' ? 'Chcem si rezervovať miesto' : 'Chci si rezervovat místo');
  if (/(kurz|webinář|webinar|školení|seminář|seminar|konference|vstupenka|vstupenky)/i.test(focus)) {
    return strengthenCta(data, data.language === 'sk' ? 'Chcem rezervovať miesto' : 'Chci rezervovat místo');
  }
  if (focus) return strengthenCta(data, data.language === 'sk' ? 'Chcem objednať' : 'Chci objednat');
  return data.language === 'sk' ? 'Chcem zistiť viac' : 'Chci zjistit víc';
}

function strengthenCta(data, cta) {
  const cleaned = normalizeCta(cleanCopy(cta));
  if (/(zjistit|zistiť|koupit|kúpiť|využít|využiť|chci|chcem|rezervovat|rezervovať|objednat|objednať|přihlásit|prihlásiť)/i.test(cleaned)) return cleaned;
  if (data.offer) return data.language === 'sk' ? 'Chcem využiť ponuku' : 'Chci využít nabídku';
  return data.language === 'sk' ? 'Chcem zistiť viac' : 'Chci zjistit víc';
}

function buildHtmlDraft({ data, preheader, headline, cta, paragraphs }) {
  const ctaHref = '#';
  const paragraphHtml = paragraphs.map((text) => `
    <tr>
      <td style="padding:0 32px 18px 32px;font-family:Arial,sans-serif;color:#1a1a1a;">
        <div style="font-size:16px;line-height:1.7;">${escapeHtml(text)}</div>
      </td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="${data.language}">
  <body style="margin:0;padding:0;background:#f4f6fb;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6fb;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="background:#ffffff;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 12px 32px;font-family:Arial,sans-serif;color:#1a1a1a;">
                <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7c9cff;margin-bottom:10px;">${escapeHtml(data.brand || 'Brand')}</div>
                <h1 style="margin:0;font-size:32px;line-height:1.2;">${escapeHtml(headline)}</h1>
              </td>
            </tr>
            ${paragraphHtml}
            <tr>
              <td style="padding:8px 32px 36px 32px;">
                <a href="${ctaHref}" style="display:inline-block;background:#7c9cff;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:12px;font-family:Arial,sans-serif;font-weight:700;">${escapeHtml(cta)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildNumberSubject(theme, language) {
  return language === 'sk' ? `3 body pre ${theme.toLowerCase()}` : `3 body pro ${theme.toLowerCase()}`;
}

function cleanSubject(value) {
  return truncate(value.replace(/\s+/g, ' ').trim(), 58);
}

function label(key, language) {
  const map = {
    cz: {
      mode: 'REŽIM',
      score: 'HIGH-SELLER SCORE',
      score_breakdown: 'ROZPAD SCORE',
      subject: 'PŘEDMĚT',
      subject_variants: 'VARIANTY PŘEDMĚTU',
      preheader: 'PREHEADER',
      headline: 'HEADLINE',
      body: 'BLOKY NEWSLETTERU',
      cta: 'CTA',
      html: 'HTML EXPORT',
      checks: 'PRODEJNÍ CHECKLIST'
    },
    sk: {
      mode: 'REŽIM',
      score: 'HIGH-SELLER SCORE',
      score_breakdown: 'ROZPAD SCORE',
      subject: 'PREDMET',
      subject_variants: 'VARIANTY PREDMETU',
      preheader: 'PREHEADER',
      headline: 'HEADLINE',
      body: 'BLOKY NEWSLETTERA',
      cta: 'CTA',
      html: 'HTML EXPORT',
      checks: 'PREDAJNÝ CHECKLIST'
    }
  };
  return map[language]?.[key] || key.toUpperCase();
}

function finalizeDraft({ tuned, primarySubject, subjectAngles, preheader, headline, cta, blocks, salesScore, inspiration }) {
  const cleanedSubjectAngles = subjectAngles
    .map((item) => ({ ...item, text: finalizeSalesLine(item.text, tuned, 'subject') }))
    .filter((item, index, array) => array.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) === index);
  const cleanedBlocks = blocks
    .map((block) => ({ ...block, text: finalizeSalesLine(block.text, tuned, 'body') }))
    .filter((block) => block.text && !isMetaCopy(block.text));

  const finalPrimary = { ...primarySubject, text: finalizeSalesLine(primarySubject.text, tuned, 'subject') };
  const finalPreheader = finalizeSalesLine(preheader, tuned, 'preheader');
  const finalHeadline = finalizeSalesLine(headline, tuned, 'headline');
  const finalCta = normalizeCta(finalizeSalesLine(cta, tuned, 'cta'));
  const paragraphs = composeFinalParagraphs(tuned, cleanedBlocks, finalCta)
    .map((text) => finalizeSalesLine(text, tuned, 'body'))
    .filter(Boolean);
  const scoringBlocks = paragraphs.map((text) => ({ title: '', text }));
  const rescored = scoreDraft({ tuned, primarySubject: finalPrimary, preheader: finalPreheader, headline: finalHeadline, cta: finalCta, blocks: scoringBlocks });

  return {
    tuned,
    primarySubject: finalPrimary,
    subjectAngles: cleanedSubjectAngles,
    preheader: finalPreheader,
    headline: finalHeadline,
    cta: finalCta,
    blocks: cleanedBlocks,
    paragraphs,
    salesScore: rescored,
    inspiration
  };
}

function prepareNewsletterInput(data) {
  const tuned = sanitizeInput(data);
  tuned.multiProductMode = resolveMultiProductMode(tuned);
  tuned.productContext = resolveProductContext(tuned);
  tuned.copyPlan = buildCopyPlan(tuned);
  return tuned;
}

function sanitizeInput(data) {
  const selectedProducts = parseSelectedProducts(data.selectedProducts);
  const brief = cleanField(data.brief);
  const manualProduct = cleanField(data.product);
  const inferredProduct = inferProductFromBrief(brief, { manualProduct, selectedProducts });
  const resolvedProduct = manualProduct || inferredProduct?.title || '';
  return {
    ...data,
    theme: cleanField(data.theme),
    product: resolvedProduct,
    manualProduct,
    inferredProduct,
    productSource: selectedProducts.length ? 'catalog' : manualProduct ? 'manual' : inferredProduct ? 'brief' : 'theme',
    offer: cleanField(data.offer),
    brief,
    segment: cleanField(data.segment),
    ctaGoal: cleanField(data.ctaGoal),
    brand: cleanField(data.brand),
    multiProductMode: cleanField(data.multiProductMode) || 'auto',
    selectedProducts,
    productNames: selectedProducts.map((item) => item.title).filter(Boolean),
    briefSignals: extractBriefSignals(brief)
  };
}

function resolveProductContext(data) {
  const selected = getSelectedProducts(data);
  const manualProduct = cleanField(data.manualProduct);
  const inferredProduct = cleanField(data.inferredProduct?.title);
  const theme = cleanField(data.theme);

  if (selected.length === 1) {
    return { source: 'catalog', confidence: 'high', primaryProduct: selected[0].title, selectedCount: 1 };
  }
  if (selected.length > 1) {
    return { source: 'catalog', confidence: 'high', primaryProduct: theme || getProductLine(data, 2), selectedCount: selected.length };
  }
  if (manualProduct) {
    return { source: 'manual', confidence: 'high', primaryProduct: manualProduct, selectedCount: 0 };
  }
  if (inferredProduct) {
    return { source: 'brief', confidence: 'medium', primaryProduct: inferredProduct, selectedCount: 0 };
  }
  return { source: 'theme', confidence: 'low', primaryProduct: theme || '', selectedCount: 0 };
}

function buildCopyPlan(data) {
  const context = data.productContext || resolveProductContext(data);
  const isMulti = getSelectedProducts(data).length > 1;
  const isGift = isGiftOccasion(data);
  const category = detectProductCategory(context.primaryProduct || getPrimaryFocus(data));
  const leadType = isMulti
    ? 'bundle'
    : context.source === 'theme'
      ? 'theme'
      : isGift
        ? 'gift-product'
        : 'product';
  const ctaType = data.ctaGoal
    ? 'goal'
    : data.offer && !isSoftOffer(data.offer)
      ? 'offer'
      : leadType === 'theme'
        ? 'browse'
        : isGift
          ? 'gift'
          : 'order';
  const proofType = data.briefSignals?.mentionReview
    ? 'review'
    : data.briefSignals?.mentionBenefits
      ? 'benefits'
      : leadType === 'theme'
        ? 'selection-rationale'
        : 'credibility';

  const plan = {
    leadType,
    ctaType,
    proofType,
    styleMode: data.tonePreset || 'hard-sell',
    category,
    sourceConfidence: context.confidence,
    source: context.source,
    audience: isGift && data.briefSignals?.audienceMothers ? 'mothers' : 'general',
    primaryProduct: context.primaryProduct || '',
    selectedCount: context.selectedCount || 0
  };

  plan.copyLibrary = buildCopyLibrary(data, plan);
  return plan;
}

function cleanField(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeSentence(value = '') {
  const cleaned = cleanField(value);
  if (!cleaned) return '';
  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`;
}

function firstMeaningfulSentence(value = '') {
  return splitSentences(value)[0] || '';
}

function secondMeaningfulSentence(value = '') {
  return splitSentences(value)[1] || '';
}

function splitSentences(value = '') {
  return cleanField(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 12)
    .filter((item) => !isInstructionSentence(item));
}

function parseSelectedProducts(value = '') {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.map((item) => ({
      code: cleanField(item.code),
      title: cleanField(item.title),
      url: cleanField(item.url),
      visible: Boolean(item.visible),
      price: item.price || null
    })).filter((item) => item.title) : [];
  } catch {
    return [];
  }
}

function inferProductFromBrief(brief = '', { manualProduct = '', selectedProducts = [] } = {}) {
  if (selectedProducts.length || cleanField(manualProduct)) return null;
  const cleanedBrief = cleanField(brief);
  if (!cleanedBrief) return null;

  const candidates = (catalog.items || [])
    .filter((item) => !isPlaceholderProduct(item))
    .map((item) => ({ item, score: scoreBriefProductCandidate(cleanedBrief, item) }))
    .filter(({ score }) => score >= 120)
    .sort((a, b) => b.score - a.score || (b.item.title?.length || 0) - (a.item.title?.length || 0));

  return candidates[0]?.item || null;
}

function scoreBriefProductCandidate(brief, item) {
  const normalizedBrief = cleanField(brief).toLowerCase();
  const title = cleanField(item.title).toLowerCase();
  const code = cleanField(item.code).toLowerCase();
  const searchTokens = Array.isArray(item.search) ? item.search.map((entry) => cleanField(entry).toLowerCase()).filter(Boolean) : [];
  let score = 0;

  if (title && normalizedBrief.includes(title)) score += 220;
  if (code && normalizedBrief.includes(code)) score += 180;
  searchTokens.forEach((token) => {
    if (token.length >= 6 && normalizedBrief.includes(token)) score += Math.min(40, token.length * 2);
  });

  const titleWords = title.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length >= 4);
  const matchedWords = titleWords.filter((word) => normalizedBrief.includes(word));
  if (matchedWords.length >= 2) score += matchedWords.length * 25;
  if (item.visible) score += 5;
  return score;
}

function getSelectedProducts(data) {
  return Array.isArray(data.selectedProducts) ? data.selectedProducts : [];
}

function getProductNames(data) {
  const selected = getSelectedProducts(data).map((item) => item.title).filter(Boolean);
  if (selected.length) return selected;
  const manual = cleanField(data.manualProduct || data.product);
  if (manual) return [manual];
  const inferred = cleanField(data.inferredProduct?.title);
  return inferred ? [inferred] : [];
}

function getProductLine(data, limit = 2) {
  const names = getProductNames(data);
  if (!names.length) return data.language === 'sk' ? 'ponuka' : 'nabídka';
  if (names.length === 1) return names[0];
  const shown = names.slice(0, limit);
  const remainder = names.length - shown.length;
  const joined = shown.join(', ');
  if (remainder <= 0) return joined;
  return data.language === 'sk' ? `${joined} a ďalšie ${remainder}` : `${joined} a další ${remainder}`;
}

function buildProductListSentence(data) {
  const names = getProductNames(data);
  if (!names.length) return '';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 3).join(', ')} + ${names.length - 3} další`;
}

function isInstructionSentence(value = '') {
  return /(napiš|napiš mi|napište|zaměř se|zameraj sa|zaměřte se|chceme aby|chceme, aby|potřebuju|potrebuju|přidej|pridej|doplň|dopln|udělej|urob|vypiš|vypis)/i.test(cleanField(value));
}

function extractBriefSignals(brief = '') {
  const cleaned = cleanField(brief);
  const lower = cleaned.toLowerCase();
  return {
    mentionBenefits: /(benefit|benefity|prodejní benefity|predajné benefity)/i.test(cleaned),
    mentionReview: /(recenzi|reference|zkušenost zákazníka|skúsenosť zákazníka|review|testimonial)/i.test(cleaned),
    mentionGift: /(mamink|dárek|darček|potěší|potesi|den matek)/i.test(lower),
    audienceMothers: /(mamink|mamince|maminku|maminkám)/i.test(lower),
    occasionDate: extractOccasionDate(cleaned),
    usableSentences: splitSentences(cleaned)
  };
}

function extractOccasionDate(value = '') {
  const match = cleanField(value).match(/\b(\d{1,2})\.?\s*(\d{1,2})?\.?\b/);
  return match ? match[0] : '';
}

function isPlaceholderProduct(item) {
  return !item || cleanField(item.title) === '...';
}

function rewriteBriefSentence(sentence, data, mode = 'lead') {
  const text = cleanField(sentence).replace(/[.,;:!?]+$/g, '');
  const focus = getPrimaryFocus(data);
  const theme = getThemeFocus(data);
  const lower = text.toLowerCase();

  if (/(blíží se|blizi se|den matek|10\.? ?5\.?)/i.test(lower)) {
    return data.language === 'sk'
      ? `${theme} sa blíži, preto je správny čas pripomenúť tip, ktorý môže potešiť.`
      : `${theme} se blíží, proto je správný čas připomenout tip, který může potěšit.`;
  }
  if (/(benefit|benefity|prodejní benefity|predajné benefity)/i.test(lower) && /(recenzi|reference|zkušenost|skúsenosť|review|testimonial)/i.test(lower)) {
    return data.language === 'sk'
      ? `${focus} v texte stojí hlavne na konkrétnych benefitoch a dôveryhodnosť môže podporiť krátka skúsenosť zákazníčky.`
      : `${focus} v textu stojí hlavně na konkrétních benefitech a důvěryhodnost může podpořit krátká zkušenost zákaznice.`;
  }
  if (/(benefit|benefity|prodejní benefity|predajné benefity)/i.test(lower)) {
    return data.language === 'sk'
      ? `${focus} v texte stojí hlavne na konkrétnych benefitoch a jasnom dôvode kúpy.`
      : `${focus} v textu stojí hlavně na konkrétních benefitech a jasném důvodu koupě.`;
  }
  if (/(recenzi|reference|zkušenost|skúsenosť|review|testimonial)/i.test(lower)) {
    return data.language === 'sk'
      ? `Krátka skúsenosť zákazníčky môže pomôcť vysvetliť, prečo si ${focus} obľúbila.`
      : `Krátká zkušenost zákaznice může pomoct vysvětlit, proč si ${focus} oblíbila.`;
  }

  return mode === 'lead'
    ? (data.language === 'sk' ? `${focus} sa oplatí zaradiť do mailu stručne a konkrétne.` : `${focus} se vyplatí zařadit do mailu stručně a konkrétně.`)
    : (data.language === 'sk' ? `${focus} potrebuje krátky a dôveryhodný argument, prečo si zaslúži pozornosť.` : `${focus} potřebuje krátký a důvěryhodný argument, proč si zaslouží pozornost.`);
}

function isSoftOffer(value = '') {
  return /(den matek|blíží se|blizi se|svátek|svatek|vánoce|vanoce|velikonoce|valentýn|valentin)/i.test(cleanField(value));
}

function normalizeCta(value = '') {
  const cleaned = cleanField(value);
  return cleaned.replace(/^(Chci|Chcem)\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])/u, (_, lead, first) => `${lead} ${first.toLowerCase()}`);
}

function shouldLeadWithTheme(data) {
  const theme = cleanField(data.theme);
  if (!theme) return false;
  if (data.copyPlan?.leadType === 'theme') return true;
  if (isSeasonalTheme(theme)) return true;
  if (!hasConcreteProductFocus(data)) return true;
  return isGenericFocus(cleanField(data.manualProduct || data.product)) && !!theme;
}

function isSeasonalTheme(value = '') {
  return /(den matek|mothers day|valentýn|valentin|vánoce|vanoce|velikonoce|back to school|černý pátek|black friday|svátek|svatek|dárk|darcek)/i.test(cleanField(value));
}

function isGiftOccasion(data) {
  const theme = cleanField(data.theme);
  return /(den matek|mothers day|dárek|darcek|mamink)/i.test(theme) || Boolean(data.briefSignals?.mentionGift);
}

function getThemeFocus(data) {
  return cleanField(data.theme) || getPrimaryFocus(data);
}

function resolveMultiProductMode(data) {
  const selectedCount = getSelectedProducts(data).length;
  if (selectedCount <= 1) return 'single';
  if (data.multiProductMode && data.multiProductMode !== 'auto') return data.multiProductMode;
  if (data.campaignType === 'education') return 'routine';
  if (data.offer) return 'bundle';
  if (selectedCount >= 3) return 'top-picks';
  return 'cross-sell';
}

function buildMultiModeLead(data) {
  const map = {
    cz: {
      bundle: 'Uvnitř je zvýhodněný balíček více produktů, které patří k sobě.',
      routine: 'Uvnitř najdeš rutinu z více produktů poskládanou krok za krokem.',
      'top-picks': 'Uvnitř najdeš rychlý výběr nejsilnějších produktů na jedno téma.',
      'cross-sell': 'Uvnitř najdeš doplňující produkty, které dávají smysl používat spolu.'
    },
    sk: {
      bundle: 'Vo vnútri je zvýhodnený balíček viacerých produktov, ktoré patria k sebe.',
      routine: 'Vo vnútri nájdeš rutinu z viacerých produktov poskladanú krok za krokom.',
      'top-picks': 'Vo vnútri nájdeš rýchly výber najsilnejších produktov na jednu tému.',
      'cross-sell': 'Vo vnútri nájdeš doplnkové produkty, ktoré dáva zmysel používať spolu.'
    }
  };
  return map[data.language]?.[data.multiProductMode] || '';
}

function buildMultiHeadline(data) {
  const line = getProductLine(data, 2);
  const map = {
    cz: {
      bundle: `${line} v jednom výhodném balíčku`,
      routine: `${line} jako rutina krok za krokem`,
      'top-picks': `${line}, které stojí za pozornost`,
      'cross-sell': `${line}, které fungují líp spolu`
    },
    sk: {
      bundle: `${line} v jednom výhodnom balíčku`,
      routine: `${line} ako rutina krok za krokom`,
      'top-picks': `${line}, ktoré stoja za pozornosť`,
      'cross-sell': `${line}, ktoré fungujú lepšie spolu`
    }
  };
  return map[data.language]?.[data.multiProductMode] || null;
}

function buildMultiIntro(data) {
  const list = buildProductListSentence(data);
  const map = {
    cz: {
      bundle: `V tomhle mailu stavíme na balíčku produktů: ${list}. Důležité je ukázat jednu společnou hodnotu a jeden důvod koupit celek.`,
      routine: `V tomhle mailu skládáme rutinu z produktů: ${list}. Copy musí čtenáře provést pořadím a ukázat, proč kroky fungují spolu.`,
      'top-picks': `V tomhle mailu vybíráme top produkty: ${list}. Každý musí mít krátký důvod, proč je ve výběru.`,
      'cross-sell': `V tomhle mailu propojujeme produkty: ${list}. Hlavní je ukázat, proč se vzájemně doplňují.`
    },
    sk: {
      bundle: `V tomto maile staviame na balíčku produktov: ${list}. Dôležité je ukázať jednu spoločnú hodnotu a jeden dôvod kúpiť celok.`,
      routine: `V tomto maile skladáme rutinu z produktov: ${list}. Copy musí čitateľa previesť poradím a ukázať, prečo kroky fungujú spolu.`,
      'top-picks': `V tomto maile vyberáme top produkty: ${list}. Každý musí mať krátky dôvod, prečo je vo výbere.`,
      'cross-sell': `V tomto maile prepájame produkty: ${list}. Hlavné je ukázať, prečo sa navzájom dopĺňajú.`
    }
  };
  return map[data.language]?.[data.multiProductMode] || '';
}

function buildMultiSupport(data) {
  const map = {
    cz: {
      bundle: 'Balíček musí působit jednoduše. Jedna hlavní výhoda, jeden společný výsledek a minimum rozhodování.',
      routine: 'Rutina prodává, když je jasné pořadí, role jednotlivých kroků a výsledek po pravidelném používání.',
      'top-picks': 'Výběr top produktů potřebuje krátké důvody výběru, ne dlouhé katalogové popisy.',
      'cross-sell': 'Cross-sell funguje ve chvíli, kdy je jasné, co je hlavní produkt a co jeho chytré doplnění.'
    },
    sk: {
      bundle: 'Balíček musí pôsobiť jednoducho. Jedna hlavná výhoda, jeden spoločný výsledok a minimum rozhodovania.',
      routine: 'Rutina predáva, keď je jasné poradie, rola jednotlivých krokov a výsledok pri pravidelnom používaní.',
      'top-picks': 'Výber top produktov potrebuje krátke dôvody výberu, nie dlhé katalógové popisy.',
      'cross-sell': 'Cross-sell funguje vo chvíli, keď je jasné, čo je hlavný produkt a čo jeho chytré doplnenie.'
    }
  };
  return map[data.language]?.[data.multiProductMode] || '';
}

function buildMultiCta(data) {
  const map = {
    cz: {
      bundle: 'Chci celý balíček',
      routine: 'Chci tu rutinu',
      'top-picks': 'Chci si vybrat top produkty',
      'cross-sell': 'Chci si vybrat produkty'
    },
    sk: {
      bundle: 'Chcem celý balíček',
      routine: 'Chcem tú rutinu',
      'top-picks': 'Chcem si vybrať top produkty',
      'cross-sell': 'Chcem si vybrať produkty'
    }
  };
  return map[data.language]?.[data.multiProductMode] || (data.language === 'sk' ? 'Chcem si vybrať produkty' : 'Chci si vybrat produkty');
}

function getPrimaryFocus(data) {
  const manualProduct = cleanField(data.manualProduct);
  const inferredProduct = cleanField(data.inferredProduct?.title);
  const product = cleanField(data.product);
  const theme = cleanField(data.theme);
  const selected = getSelectedProducts(data);
  if (selected.length === 1) return selected[0].title;
  if (selected.length > 1) return theme || getProductLine(data, 2);
  if (manualProduct && !isGenericFocus(manualProduct) && manualProduct.toLowerCase() !== theme.toLowerCase()) return manualProduct;
  if (inferredProduct && !isGenericFocus(inferredProduct) && inferredProduct.toLowerCase() !== theme.toLowerCase()) return inferredProduct;
  if (product && !isGenericFocus(product) && product.toLowerCase() !== theme.toLowerCase()) return product;
  if (theme && !isSeasonalTheme(theme)) return theme;
  if (isGiftOccasion(data)) return data.language === 'sk' ? 'tip na darček' : 'tip na dárek';
  if (theme && shouldLeadWithTheme(data)) return data.language === 'sk' ? 'výber produktov' : 'výběr produktů';
  return data.language === 'sk' ? 'produktový tip' : 'produktový tip';
}

function hasConcreteProductFocus(data) {
  if (['catalog', 'manual', 'brief'].includes(data.copyPlan?.source || data.productSource)) return true;
  const selected = getSelectedProducts(data);
  if (selected.length > 0) return true;
  const product = cleanField(data.manualProduct || data.inferredProduct?.title || data.product);
  const theme = cleanField(data.theme);
  return !!product && !isGenericFocus(product) && product.toLowerCase() !== theme.toLowerCase();
}

function isGenericFocus(value = '') {
  return /^(produkt|ponuka|nabídka|newsletter|mail|email|vstupenka|vstupenky)$/i.test(cleanField(value));
}

function buildSupportParagraph(data, inspiration) {
  const fallback = data.language === 'sk'
    ? `${getPrimaryFocus(data)} dávame do mailu tak, aby bol rýchlo pochopiteľný, konkrétny a ľahko vyberateľný.`
    : `${getPrimaryFocus(data)} dáváme do mailu tak, aby byl rychle pochopitelný, konkrétní a snadno vybratelný.`;
  const briefSentence = splitSentences(data.brief)[2];
  return briefSentence ? rewriteBriefSentence(briefSentence, data, 'support') : fallback;
}

function buildConcreteOpening(data) {
  const theme = getThemeFocus(data);
  const focus = getPrimaryFocus(data);
  if (shouldLeadWithTheme(data)) {
    return data.language === 'sk'
      ? `${theme} je dobrá príležitosť pripomenúť tip, ktorý sa hodí ako milý a praktický darček.`
      : `${theme} je dobrá příležitost připomenout tip, který se hodí jako milý a praktický dárek.`;
  }
  return data.language === 'sk'
    ? `${focus} dávame do pozornosti stručne a bez zbytočnej omáčky.`
    : `${focus} dáváme do pozornosti stručně a bez zbytečné omáčky.`;
}

function buildLengthParagraphs(data, inspiration) {
  if (data.length === 'short') return [];
  const paragraphs = [buildSupportParagraph(data, inspiration)];
  if (data.length === 'long') paragraphs.push(buildExtraLongParagraph(data));
  return paragraphs.filter(Boolean);
}

function buildExtraLongParagraph(data) {
  const focus = getPrimaryFocus(data);
  if (shouldLeadWithTheme(data)) {
    return data.language === 'sk'
      ? `${focus} môže fungovať ako milý a praktický tip pre tých, ktorí nechcú siahať po obyčajnom darčeku bez nápadu.`
      : `${focus} může fungovat jako milý a praktický tip pro ty, kdo nechtějí sáhnout po obyčejném dárku bez nápadu.`;
  }
  return data.language === 'sk'
    ? `${focus} si zaslúži v maile ešte jednu konkrétnu vetu navyše, aby bol dôvod kúpy úplne jasný aj pri rýchlom prečítaní.`
    : `${focus} si zaslouží v mailu ještě jednu konkrétní větu navíc, aby byl důvod koupě úplně jasný i při rychlém přečtení.`;
}

function getBriefLead(data) {
  const usable = data.briefSignals?.usableSentences || [];
  if (usable[0]) return rewriteBriefSentence(usable[0], data, 'lead');
  if (data.briefSignals?.mentionGift) {
    return data.language === 'sk'
      ? `${getPrimaryFocus(data)} môže byť pekným tipom pre tých, ktorí chcú mamke vybrať niečo milé a užitočné.`
      : `${getPrimaryFocus(data)} může být hezkým tipem pro ty, kdo chtějí mamince vybrat něco milého a užitečného.`;
  }
  return '';
}

function getBriefSupport(data) {
  const usable = data.briefSignals?.usableSentences || [];
  if (usable[1]) return rewriteBriefSentence(usable[1], data, 'support');
  if (data.briefSignals?.mentionBenefits && data.briefSignals?.mentionReview) {
    return data.language === 'sk'
      ? `${getPrimaryFocus(data)} stojí za pozornosť hlavne kvôli svojim benefitom a dôveru môže podporiť aj krátka skúsenosť zákazníčky.`
      : `${getPrimaryFocus(data)} stojí za pozornost hlavně kvůli svým benefitům a důvěru může podpořit i krátká zkušenost zákaznice.`;
  }
  if (data.briefSignals?.mentionBenefits) {
    return data.language === 'sk'
      ? `${getPrimaryFocus(data)} dáva pri tejto príležitosti zmysel hlavne vďaka svojim benefitom.`
      : `${getPrimaryFocus(data)} dává při této příležitosti smysl hlavně díky svým benefitům.`;
  }
  if (data.briefSignals?.mentionReview) {
    return data.language === 'sk'
      ? `Krátka skúsenosť zákazníčky môže produktu pridať dôveryhodnosť.`
      : `Krátká zkušenost zákaznice může produktu dodat důvěryhodnost.`;
  }
  return '';
}

function buildConcreteSupport(data) {
  const focus = getPrimaryFocus(data);
  const selected = getSelectedProducts(data);
  if (selected.length > 1) {
    return data.language === 'sk'
      ? [
          `Vybrali sme kombináciu produktov, ktorá spolu dáva zmysel a uľahčuje výber bez zbytočného premýšľania.`,
          `Každý produkt v tomto výbere dopĺňa ostatné, takže celý balíček pôsobí zrozumiteľne a prakticky.`
        ]
      : [
          `Vybrali jsme kombinaci produktů, která spolu dává smysl a usnadňuje výběr bez zbytečného přemýšlení.`,
          `Každý produkt v tomhle výběru doplňuje ostatní, takže celek působí srozumitelně a prakticky.`
        ];
  }
  if (shouldLeadWithTheme(data)) {
    return data.language === 'sk'
      ? [
          `${focus} môže byť príjemným tipom pre tých, ktorí chcú darovať niečo osobné a zároveň užitočné.`,
          data.briefSignals?.mentionReview
            ? `Krátka skúsenosť zákazníčky môže pekne vysvetliť, prečo si tento produkt obľúbila.`
            : `Text preto držíme krátky, zrozumiteľný a zameraný na to, prečo sa tento tip hodí práve k tejto príležitosti.`
        ]
      : [
          `${focus} může být příjemným tipem pro ty, kdo chtějí darovat něco osobního a zároveň užitečného.`,
          data.briefSignals?.mentionReview
            ? `Krátká zkušenost zákaznice může hezky vysvětlit, proč si tenhle produkt oblíbila.`
            : `Text proto držíme krátký, srozumitelný a zaměřený na to, proč se tenhle tip hodí právě k této příležitosti.`
        ];
  }
  return data.language === 'sk'
    ? [
        `${focus} komunikujeme jednoducho, aby bolo hneď jasné, pre koho sa hodí a prečo stojí za pozornosť.`,
        data.briefSignals?.mentionBenefits
          ? `V texte majú byť rýchlo vidieť konkrétne benefity produktu a jasný dôvod kúpy.`
          : `Namiesto dlhého vysvetľovania ideme rovno na konkrétny benefit a jasnú výzvu k akcii.`
      ]
    : [
        `${focus} komunikujeme jednoduše, aby bylo hned jasné, pro koho se hodí a proč stojí za pozornost.`,
        data.briefSignals?.mentionBenefits
          ? `V textu mají být rychle vidět konkrétní benefity produktu a jasný důvod koupě.`
          : `Místo dlouhého vysvětlování jdeme rovnou na konkrétní benefit a jasnou výzvu k akci.`
      ];
}

function composeFinalParagraphs(data, blocks, cta) {
  const generated = getSelectedProducts(data).length > 1
    ? composeMultiProductParagraphs(data, cta)
    : composeSingleProductParagraphs(data, cta);

  const fallback = blocks.map((block) => cleanSentence(block.text)).filter(Boolean);
  const paragraphs = (generated.length ? generated : fallback)
    .map((text) => cleanSentence(text))
    .filter(Boolean);

  return paragraphs.filter((text, index, array) => array.findIndex((other) => other.toLowerCase() === text.toLowerCase()) === index);
}

function composeSingleProductParagraphs(data, cta) {
  const focus = getPrimaryFocus(data);
  const theme = getThemeFocus(data);
  const paragraphs = [];

  if (data.copyPlan?.leadType === 'theme') {
    paragraphs.push(data.language === 'sk'
      ? `${theme} je dobrá príležitosť otvoriť stručný a konkrétny výber, ktorý rýchlo vysvetlí, čo má pre čitateľa zmysel.`
      : `${theme} je dobrá příležitost otevřít stručný a konkrétní výběr, který rychle vysvětlí, co má pro čtenáře smysl.`);
  } else if (isGiftOccasion(data) && !hasConcreteProductFocus(data)) {
    paragraphs.push(data.language === 'sk'
      ? `${theme} sa blíži a v maile preto ponúkame tip na darček pre mamu, ktorý pôsobí osobne, milo a zároveň užitočne.`
      : `${theme} se blíží a v mailu proto nabízíme tip na dárek pro maminku, který působí osobně, mile a zároveň užitečně.`);
  } else if (isGiftOccasion(data)) {
    paragraphs.push(data.language === 'sk'
      ? `${theme} sa blíži a ${focus} môže byť pekným tipom pre tých, ktorí nechcú kupovať len obyčajný darček bez nápadu.`
      : `${theme} se blíží a ${focus} může být hezkým tipem pro ty, kdo nechtějí kupovat jen obyčejný dárek bez nápadu.`);
  } else if (shouldLeadWithTheme(data)) {
    paragraphs.push(data.language === 'sk'
      ? `${theme} je dobrá príležitosť otvoriť stručný a konkrétny výber, ktorý rýchlo vysvetlí, čo má pre čitateľa zmysel.`
      : `${theme} je dobrá příležitost otevřít stručný a konkrétní výběr, který rychle vysvětlí, co má pro čtenáře smysl.`);
  } else {
    paragraphs.push(data.language === 'sk'
      ? `${focus} dávame do pozornosti stručne a bez omáčky, aby bolo hneď jasné, pre koho sa hodí a prečo stojí za otvorenie mailu.`
      : `${focus} dáváme do pozornosti stručně a bez omáčky, aby bylo hned jasné, pro koho se hodí a proč stojí za otevření mailu.`);
  }

  paragraphs.push(buildBenefitParagraph(data));

  if (data.length !== 'short') paragraphs.push(buildTrustParagraph(data));
  if (data.length === 'long') paragraphs.push(buildLongDetailParagraph(data));

  paragraphs.push(buildActionParagraph(data, cta));
  return paragraphs;
}

function composeMultiProductParagraphs(data, cta) {
  const line = getProductLine(data, 3);
  const paragraphs = [
    data.language === 'sk'
      ? `Vybrali sme produkty ${line}, ktoré spolu dávajú zmysel a pomáhajú urobiť výber rýchlejší a zrozumiteľnejší.`
      : `Vybrali jsme produkty ${line}, které spolu dávají smysl a pomáhají udělat výběr rychlejší a srozumitelnější.`,
    buildBenefitParagraph(data)
  ];

  if (data.length !== 'short') paragraphs.push(buildTrustParagraph(data));
  if (data.length === 'long') paragraphs.push(buildLongDetailParagraph(data));
  paragraphs.push(buildActionParagraph(data, cta));
  return paragraphs;
}

function buildBenefitParagraph(data) {
  const focus = getPrimaryFocus(data);
  const promise = buildSalesPromise(data);
  const libraryBenefit = data.copyPlan?.copyLibrary?.benefits?.[0];
  if (libraryBenefit && data.copyPlan?.proofType !== 'selection-rationale') {
    return `${libraryBenefit} ${buildCategoryBenefitLine(data)} ${promise}`;
  }
  if (data.copyPlan?.proofType === 'selection-rationale') {
    return data.language === 'sk'
      ? `Nejde o náhodný výber. Vyberáme len to, čo má jasný prínos, rýchlo sa číta a dá sa ľahko preklopiť do objednávky.`
      : `Nejde o náhodný výběr. Vybíráme jen to, co má jasný přínos, rychle se čte a snadno se překlápí do objednávky.`;
  }
  if (isGiftOccasion(data) && !hasConcreteProductFocus(data)) {
    return data.language === 'sk'
      ? `Nejde o darček do počtu. Cieľom je ponúknuť výber, ktorý poteší, pôsobí premyslene a má dôvod, prečo naň kliknúť hneď.`
      : `Nejde o dárek do počtu. Cílem je nabídnout výběr, který potěší, působí promyšleně a má důvod, proč na něj kliknout hned.`;
  }
  if (isGiftOccasion(data)) {
    return data.language === 'sk'
      ? `${focus} tu predávame ako darčekový tip, ktorý má konkrétny efekt, pôsobí hodnotne a nerobí z nákupu len povinnú položku.`
      : `${focus} tu prodáváme jako dárkový tip, který má konkrétní efekt, působí hodnotně a nedělá z nákupu jen povinnou položku.`;
  }
  if (data.briefSignals?.mentionBenefits || data.copyPlan?.proofType === 'benefits') {
    const categoryLine = buildCategoryBenefitLine(data);
    return data.language === 'sk'
      ? `${focus} staviame na konkrétnom prínose. ${categoryLine} ${promise}`
      : `${focus} stavíme na konkrétním přínosu. ${categoryLine} ${promise}`;
  }
  if (shouldLeadWithTheme(data)) {
    return data.language === 'sk'
      ? `Hlavná sila výberu je v tom, že rýchlo ukáže, čo sa oplatí otvoriť, čo dáva zmysel kúpiť a čo neskončí bez kliknutia.`
      : `Hlavní síla výběru je v tom, že rychle ukáže, co se vyplatí otevřít, co dává smysl koupit a co neskončí bez kliknutí.`;
  }
  return data.language === 'sk'
    ? `${focus} komunikujeme tak, aby bolo po pár sekundách jasné, čo prináša a prečo má zmysel prejsť rovno na detail produktu.`
    : `${focus} komunikujeme tak, aby bylo po pár sekundách jasné, co přináší a proč má smysl přejít rovnou na detail produktu.`;
}

function buildTrustParagraph(data) {
  const libraryTrust = data.copyPlan?.copyLibrary?.trust?.[0];
  if (libraryTrust && !(data.copyPlan?.proofType === 'review' || data.briefSignals?.mentionReview)) {
    return libraryTrust;
  }
  if (data.copyPlan?.proofType === 'review' || data.briefSignals?.mentionReview) {
    return data.language === 'sk'
      ? `Krátka skúsenosť zákazníčky tu neplní len okrasnú rolu. Pomáha znížiť váhanie a ukazuje, prečo sa k produktu ľudia vracajú.`
      : `Krátká zkušenost zákaznice tu nemá jen okrasnou roli. Pomáhá snížit váhání a ukazuje, proč se k produktu lidé vracejí.`;
  }
  if (isGiftOccasion(data)) {
    return data.language === 'sk'
      ? `Pri takejto príležitosti funguje najlepšie text, ktorý je osobný, dôveryhodný a zároveň jasne vedie ku kliknutiu.`
      : `U takové příležitosti funguje nejlépe text, který je osobní, důvěryhodný a zároveň jasně vede ke kliknutí.`;
  }
  return data.language === 'sk'
    ? `Text držíme stručne, konkrétne a bez výplňových viet, aby sa pozornosť nestratila skôr, než príde CTA.`
    : `Text držíme stručně, konkrétně a bez výplňových vět, aby se pozornost neztratila dřív, než přijde CTA.`;
}

function buildLongDetailParagraph(data) {
  const focus = getPrimaryFocus(data);
  const theme = getThemeFocus(data);
  if (shouldLeadWithTheme(data)) {
    return data.language === 'sk'
      ? `${theme} je navyše vhodný priestor ukázať len to najsilnejšie, bez zbytočných odbočiek, aby sa čitateľ dostal čo najrýchlejšie k výberu.`
      : `${theme} je navíc vhodný prostor ukázat jen to nejsilnější, bez zbytečných odboček, aby se čtenář dostal co nejrychleji k výběru.`;
  }
  return data.language === 'sk'
    ? `${focus} si pri dlhšej verzii mailu zaslúži ešte jednu vetu navyše, ktorá doplní konkrétny dôvod kúpy a zvýši šancu na preklik.`
    : `${focus} si u delší verze mailu zaslouží ještě jednu větu navíc, která doplní konkrétní důvod koupě a zvýší šanci na proklik.`;
}

function buildActionParagraph(data, cta) {
  const offer = cleanField(data.offer);
  if (offer && !isSoftOffer(offer)) {
    return data.language === 'sk'
      ? `${offer}. Ak chceš využiť moment, klikni na tlačidlo „${cta}“ a otvor detail skôr, než ponuka zmizne.`
      : `${offer}. Pokud chceš využít moment, klikni na tlačítko „${cta}“ a otevři detail dřív, než nabídka zmizí.`;
  }
  if (isGiftOccasion(data)) {
    return data.language === 'sk'
      ? `Ak chceš vybrať darček, ktorý poteší a nebude pôsobiť obyčajne, klikni na tlačidlo „${cta}“ a pozri sa na detail hneď.`
      : `Jestli chceš vybrat dárek, který potěší a nebude působit obyčejně, klikni na tlačítko „${cta}“ a podívej se na detail hned.`;
  }
  return data.language === 'sk'
    ? `Ak ťa tento tip zaujal, klikni na tlačidlo „${cta}“ a pozri sa na detail skôr, než zapadne medzi ostatné ponuky.`
    : `Jestli tě tenhle tip zaujal, klikni na tlačítko „${cta}“ a podívej se na detail dřív, než zapadne mezi ostatní nabídky.`;
}

function cleanSentence(text = '') {
  let result = finalizeSalesLine(text, {}, 'body');
  result = result.replace(/^([a-zá-ž])/u, (m) => m.toUpperCase());
  result = result.replace(/\b(Chci|Chcem)\s+objednat\b/gi, (m) => m === 'Chcem Objednat' ? 'Chcem objednať' : 'Chci objednat');
  result = result.replace(/\s+/g, ' ').trim();
  if (!result) return '';
  return /[.!?]$/.test(result) ? result : `${result}.`;
}

function finalizeSalesLine(value = '', data = {}, kind = 'body') {
  let result = cleanCopy(value);
  result = stripWeakSalesPhrases(result, data, kind);
  result = rewriteWeakSalesPhrases(result, data, kind);
  result = result.replace(/\s+/g, ' ').trim();
  if (kind === 'subject' || kind === 'headline') return truncate(result, kind === 'subject' ? 58 : 88);
  if (kind === 'preheader') return truncate(result, 88);
  return result;
}

function cleanCopy(value = '') {
  return cleanField(value)
    .replace(/\b(HERO|ÚVOD|DETAIL|DŮVOD|DÔVOD|AKCE|AKCIA|DOPLNĚNÍ|DOPLNENIE|VÍC|VIAC):/gi, '')
    .replace(/\b(benefit držíme úplně nahoře|benefit držíme úplne hore)\b/gi, '')
    .replace(/\b(hlavní akce je|hlavná akcia je)\b:?/gi, '')
    .replace(/\b(Podobné kampaně nejčastěji stály na promise typu|Podobné kampane najčastejšie stáli na promise typu):?[^.]*\.?/gi, '')
    .replace(/\bse blíží končí brzy\b/gi, 'se blíží')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripWeakSalesPhrases(value = '', data = {}, kind = 'body') {
  return cleanField(value)
    .replace(/\bprávě teď dává smysl\b/gi, 'stojí za pozornost')
    .replace(/\btip na dárek může být hezkým tipem\b/gi, 'je tip, který může potěšit')
    .replace(/\bklikni na chci\b/gi, 'klikni na tlačítko')
    .replace(/\btenhle tip\b/gi, 'tento tip')
    .replace(/\btohle\b/gi, kind === 'subject' ? 'to' : 'tohle')
    .replace(/\bstručně a bez omáčky\b/gi, 'jasně')
    .replace(/\bbez omáčky\b/gi, 'jasně')
    .replace(/\bprávě při této příležitosti\b/gi, 'právě teď')
    .replace(/\bpráve pri tejto príležitosti\b/gi, 'práve teraz');
}

function rewriteWeakSalesPhrases(value = '', data = {}, kind = 'body') {
  let result = cleanField(value);
  const focus = cleanField(getPrimaryFocus(data) || 'produkt');
  result = result
    .replace(new RegExp(`${escapeRegExp(focus)}[, ]+který pomůže právě teď`, 'i'), `${focus}, který stojí za pozornost`)
    .replace(new RegExp(`${escapeRegExp(focus)}[, ]+ktorý pomôže práve teraz`, 'i'), `${focus}, ktorý stojí za pozornosť`)
    .replace(/\bco může pomoct právě teď\b/gi, 'co stojí za otevření')
    .replace(/\bčo môže pomôcť práve teraz\b/gi, 'čo stojí za otvorenie')
    .replace(/\bco funguje právě teď\b/gi, 'co stojí za výběr')
    .replace(/\bčo funguje práve teraz\b/gi, 'čo stojí za výber')
    .replace(/\bpodívej se na detail hned\b/gi, 'otevři detail a rozhodni se rychleji')
    .replace(/\bpozri sa na detail hneď\b/gi, 'otvor detail a rozhodni sa rýchlejšie');
  return result;
}

function buildCategoryBenefitLine(data) {
  const category = data.copyPlan?.category || detectProductCategory(getPrimaryFocus(data));
  const lines = {
    cz: {
      skincare: 'Prodává ho hlavně příslib lepšího pocitu z pleti, snadného použití a rychle pochopitelného benefitu.',
      supplement: 'Prodává ho hlavně jednoduché zařazení do dne, jasný účel a důvod vracet se k němu opakovaně.',
      bundle: 'Prodává ho hlavně to, že šetří rozhodování a skládá víc kroků do jednoho smysluplného výběru.',
      general: 'Prodává ho hlavně jasný přínos, rychlé pochopení hodnoty a jednoduchý důvod kliknout dál.'
    },
    sk: {
      skincare: 'Predáva ho hlavne prísľub lepšieho pocitu z pleti, jednoduchého použitia a rýchlo pochopiteľného benefitu.',
      supplement: 'Predáva ho hlavne jednoduché zaradenie do dňa, jasný účel a dôvod vracať sa k nemu opakovane.',
      bundle: 'Predáva ho hlavne to, že šetrí rozhodovanie a skladá viac krokov do jedného zmysluplného výberu.',
      general: 'Predáva ho hlavne jasný prínos, rýchle pochopenie hodnoty a jednoduchý dôvod kliknúť ďalej.'
    }
  };
  return lines[data.language]?.[category] || lines[data.language]?.general || '';
}

function buildSalesPromise(data) {
  const category = data.copyPlan?.category || detectProductCategory(getPrimaryFocus(data));
  const mode = data.copyPlan?.styleMode || 'hard-sell';
  const base = {
    skincare: data.language === 'sk'
      ? 'Stojí na rýchlom pochopení benefitu, príjemnom používaní a dôvode pridať ho do rutiny ešte dnes.'
      : 'Stojí na rychlém pochopení benefitu, příjemném používání a důvodu zařadit ho do rutiny ještě dnes.',
    supplement: data.language === 'sk'
      ? 'Predávame ho cez jasný úžitok, jednoduché zaradenie do dňa a dôvod vrátiť sa k nemu opakovane.'
      : 'Prodáváme ho přes jasný užitek, jednoduché zařazení do dne a důvod vracet se k němu opakovaně.',
    bundle: data.language === 'sk'
      ? 'Silu má v tom, že šetrí rozhodovanie a spája viac krokov do jedného jednoduchého výberu.'
      : 'Sílu má v tom, že šetří rozhodování a spojuje víc kroků do jednoho jednoduchého výběru.',
    general: data.language === 'sk'
      ? 'Text má hneď ukázať prínos, dôvod kúpy a jasný impulz prekliknúť sa na detail.'
      : 'Text má hned ukázat přínos, důvod koupě a jasný impuls prokliknout se na detail.'
  };
  const modeBoost = {
    'hard-sell': data.language === 'sk'
      ? 'Tlačíme na jasný výsledok, dôvod kúpy a rýchle rozhodnutie.'
      : 'Tlačíme na jasný výsledek, důvod koupě a rychlé rozhodnutí.',
    'warm-sell': data.language === 'sk'
      ? 'Nechávame priestor pre dôveru, ale stále držíme jasný benefit a smer ku kliknutiu.'
      : 'Necháváme prostor pro důvěru, ale pořád držíme jasný benefit a směr ke kliknutí.',
    'education-sell': data.language === 'sk'
      ? 'Najprv vysvetlíme prečo, hneď potom dávame dôvod prekliknúť sa na detail.'
      : 'Nejdřív vysvětlíme proč, hned potom dáváme důvod prokliknout se na detail.',
    'urgency-sell': data.language === 'sk'
      ? 'Text musí vytvoriť pocit, že odklad znižuje šancu využiť ponuku naplno.'
      : 'Text musí vytvořit pocit, že odklad snižuje šanci využít nabídku naplno.'
  };
  return `${base[category] || base.general} ${modeBoost[mode] || modeBoost['hard-sell']}`;
}

function detectProductCategory(value = '') {
  const lower = cleanField(value).toLowerCase();
  if (/(balíček|balicek|set|sada|rutina)/i.test(lower)) return 'bundle';
  if (/(šťáva|stava|kapky|doplněk|doplnok|vitam|bylinn|ashwagandha|aloe vera)/i.test(lower)) return 'supplement';
  if (/(krém|krem|gel|serum|maska|peeling|pleť|plet|oči|oci|šampon|sampon|vlasy|kůž|kož)/i.test(lower)) return 'skincare';
  return 'general';
}

function buildCopyLibrary(data, plan) {
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(getThemeFocus(data));
  const offer = cleanField(data.offer);
  const language = data.language;
  const category = plan.category;
  const mode = plan.styleMode;
  const leadType = plan.leadType;

  const library = {
    subjects: buildSubjectLibrary(language, { focus, theme, offer, category, mode, leadType }),
    headlines: buildHeadlineLibrary(language, { focus, theme, offer, category, mode, leadType }),
    benefits: buildBenefitLibrary(language, { focus, theme, offer, category, mode, leadType }),
    trust: buildTrustLibrary(language, { focus, theme, offer, category, mode, leadType, review: plan.proofType === 'review' }),
    ctas: buildCtaLibrary(language, { focus, theme, offer, category, mode, leadType, ctaType: plan.ctaType })
  };

  return library;
}

function buildSubjectLibrary(language, ctx) {
  const common = language === 'sk'
    ? [
        `${ctx.focus}: prečo stojí za otvorenie`,
        `${ctx.focus}: čo z neho robí silný tip`,
        `${ctx.focus}: dôvod kliknúť práve dnes`
      ]
    : [
        `${ctx.focus}: proč stojí za otevření`,
        `${ctx.focus}: co z něj dělá silný tip`,
        `${ctx.focus}: důvod kliknout právě dnes`
      ];
  const byMode = {
    'hard-sell': language === 'sk'
      ? [ctx.offer ? `${ctx.focus}: ${ctx.offer}` : `${ctx.focus}: otvor detail a rozhodni sa rýchlejšie`]
      : [ctx.offer ? `${ctx.focus}: ${ctx.offer}` : `${ctx.focus}: otevři detail a rozhodni se rychleji`],
    'warm-sell': language === 'sk'
      ? [`${ctx.focus}: tip, ktorý pôsobí prirodzene a predáva`, `${ctx.focus}: voľba, ktorá dáva zmysel bez tlačenia`]
      : [`${ctx.focus}: tip, který působí přirozeně a prodává`, `${ctx.focus}: volba, která dává smysl bez tlačení`],
    'education-sell': language === 'sk'
      ? [`${ctx.focus}: najprv pochopíš prečo, potom klikneš`, `${ctx.theme}: čo potrebuješ vedieť pred výberom`]
      : [`${ctx.focus}: nejdřív pochopíš proč, potom klikneš`, `${ctx.theme}: co potřebuješ vědět před výběrem`],
    'urgency-sell': language === 'sk'
      ? [ctx.offer ? `${ctx.offer}: otvor detail hneď` : `${ctx.focus}: čas rozhodnúť sa teraz`]
      : [ctx.offer ? `${ctx.offer}: otevři detail hned` : `${ctx.focus}: čas rozhodnout se teď`]
  };
  const byCategory = {
    skincare: language === 'sk'
      ? [`${ctx.focus}: prečo ho zaradiť do rutiny`, `${ctx.focus}: efekt, ktorý chceš vidieť čo najskôr`]
      : [`${ctx.focus}: proč ho zařadit do rutiny`, `${ctx.focus}: efekt, který chceš vidět co nejdřív`],
    supplement: language === 'sk'
      ? [`${ctx.focus}: prečo sa oplatí mať ho doma`, `${ctx.focus}: jasný úžitok bez zložitého vysvetľovania`]
      : [`${ctx.focus}: proč se vyplatí mít ho doma`, `${ctx.focus}: jasný užitek bez složitého vysvětlování`],
    bundle: language === 'sk'
      ? [`${ctx.focus}: výber, ktorý šetrí rozhodovanie`, `${ctx.focus}: kombinácia, ktorá dáva zmysel ako celok`]
      : [`${ctx.focus}: výběr, který šetří rozhodování`, `${ctx.focus}: kombinace, která dává smysl jako celek`],
    general: []
  };
  return [...common, ...(byMode[ctx.mode] || []), ...(byCategory[ctx.category] || [])];
}

function buildHeadlineLibrary(language, ctx) {
  return language === 'sk'
    ? [
        `${ctx.focus}: prečo stojí za pozornosť`,
        `${ctx.focus}: čo presvedčí k otvoreniu detailu`,
        ctx.leadType === 'theme' ? `${ctx.theme}: čo sa oplatí otvoriť` : `${ctx.focus}: čo môže rozhodnúť o kliknutí`
      ]
    : [
        `${ctx.focus}: proč stojí za pozornost`,
        `${ctx.focus}: co přesvědčí k otevření detailu`,
        ctx.leadType === 'theme' ? `${ctx.theme}: co se vyplatí otevřít` : `${ctx.focus}: co může rozhodnout o kliknutí`
      ];
}

function buildBenefitLibrary(language, ctx) {
  const base = language === 'sk'
    ? [
        `${ctx.focus} staviame na jasnom prínose, rýchlom pochopení hodnoty a dôvode kliknúť bez zbytočného váhania.`,
        `${ctx.focus} musí hneď ukázať, čo prináša, pre koho sa hodí a prečo má zmysel otvoriť detail práve teraz.`
      ]
    : [
        `${ctx.focus} stavíme na jasném přínosu, rychlém pochopení hodnoty a důvodu kliknout bez zbytečného váhání.`,
        `${ctx.focus} musí hned ukázat, co přináší, pro koho se hodí a proč má smysl otevřít detail právě teď.`
      ];
  return [...base];
}

function buildTrustLibrary(language, ctx) {
  if (ctx.review) {
    return language === 'sk'
      ? [`Krátka skúsenosť zákazníčky znižuje váhanie a ukazuje, prečo sa k produktu ľudia vracajú.`]
      : [`Krátká zkušenost zákaznice snižuje váhání a ukazuje, proč se k produktu lidé vracejí.`];
  }
  return language === 'sk'
    ? [`Text držíme bez výplňových viet, aby sa pozornosť nestratila skôr, než príde CTA.`]
    : [`Text držíme bez výplňových vět, aby se pozornost neztratila dřív, než přijde CTA.`];
}

function buildCtaLibrary(language, ctx) {
  const map = {
    cz: {
      goal: ['Chci to teď využít'],
      offer: ['Chci využít nabídku', 'Otevřít nabídku'],
      gift: ['Chci vybrat dárek', 'Podívat se na tip'],
      browse: ['Chci si vybrat', 'Otevřít výběr'],
      order: ['Chci objednat', 'Otevřít detail produktu']
    },
    sk: {
      goal: ['Chcem to teraz využiť'],
      offer: ['Chcem využiť ponuku', 'Otvoriť ponuku'],
      gift: ['Chcem vybrať darček', 'Pozrieť si tip'],
      browse: ['Chcem si vybrať', 'Otvoriť výber'],
      order: ['Chcem objednať', 'Otvoriť detail produktu']
    }
  };
  return map[language]?.[ctx.ctaType] || map[language]?.order || [];
}

function getCategorySubjectPack(language, category, focus, theme) {
  const packs = {
    cz: {
      skincare: {
        benefit: [`${focus}: proč ho zařadit do rutiny`, `${focus}: co udělá pro lepší pocit z pleti`],
        result: [`${focus}: efekt, který chceš vidět co nejdřív`]
      },
      supplement: {
        benefit: [`${focus}: proč se vyplatí mít ho doma`, `${focus}: jasný užitek bez složitého vysvětlování`],
        result: [`${focus}: co přinese při pravidelném používání`]
      },
      bundle: {
        benefit: [`${focus}: výběr, který šetří rozhodování`, `${focus}: kombinace, která dává smysl jako celek`],
        curiosity: [`${focus}: proč funguje lépe dohromady`]
      },
      general: {}
    },
    sk: {
      skincare: {
        benefit: [`${focus}: prečo ho zaradiť do rutiny`, `${focus}: čo spraví pre lepší pocit z pleti`],
        result: [`${focus}: efekt, ktorý chceš vidieť čo najskôr`]
      },
      supplement: {
        benefit: [`${focus}: prečo sa oplatí mať ho doma`, `${focus}: jasný úžitok bez zložitého vysvetľovania`],
        result: [`${focus}: čo prinesie pri pravidelnom používaní`]
      },
      bundle: {
        benefit: [`${focus}: výber, ktorý šetrí rozhodovanie`, `${focus}: kombinácia, ktorá dáva zmysel ako celok`],
        curiosity: [`${focus}: prečo funguje lepšie spolu`]
      },
      general: {}
    }
  };
  return packs[language]?.[category] || {};
}

function getStyleModeSubjectPack(language, mode, focus, theme, offer) {
  const packs = {
    cz: {
      'hard-sell': {
        offer: [offer ? `${focus}: ${offer}` : `${focus}: otevři detail a rozhodni se rychleji`],
        urgency: [`${focus}: nenech si ho utéct mezi ostatními`]
      },
      'warm-sell': {
        benefit: [`${focus}: tip, který působí přirozeně a prodává`, `${focus}: volba, která dává smysl bez tlačení`],
        usefulness: [`${theme}: výběr, který se čte snadno a prodává chytře`]
      },
      'education-sell': {
        usefulness: [`${focus}: nejdřív pochopíš proč, pak klikneš`, `${theme}: co potřebuješ vědět před výběrem`],
        result: [`${focus}: co ti rychle vysvětlí jeho hodnotu`]
      },
      'urgency-sell': {
        urgency: [offer ? `${offer}: otevři detail hned` : `${focus}: čas rozhodnout se teď`],
        deadline: [`${focus}: nečekej, až zapadne nebo zmizí`]
      }
    },
    sk: {
      'hard-sell': {
        offer: [offer ? `${focus}: ${offer}` : `${focus}: otvor detail a rozhodni sa rýchlejšie`],
        urgency: [`${focus}: nenechaj si ho ujsť medzi ostatnými`]
      },
      'warm-sell': {
        benefit: [`${focus}: tip, ktorý pôsobí prirodzene a predáva`, `${focus}: voľba, ktorá dáva zmysel bez tlačenia`],
        usefulness: [`${theme}: výber, ktorý sa číta ľahko a predáva chytro`]
      },
      'education-sell': {
        usefulness: [`${focus}: najprv pochopíš prečo, potom klikneš`, `${theme}: čo potrebuješ vedieť pred výberom`],
        result: [`${focus}: čo ti rýchlo vysvetlí jeho hodnotu`]
      },
      'urgency-sell': {
        urgency: [offer ? `${offer}: otvor detail hneď` : `${focus}: čas rozhodnúť sa teraz`],
        deadline: [`${focus}: nečakaj, kým zapadne alebo zmizne`]
      }
    }
  };
  return packs[language]?.[mode] || {};
}

function mergeSubjectBanks(...banks) {
  const merged = {};
  banks.forEach((bank) => {
    Object.entries(bank || {}).forEach(([key, values]) => {
      merged[key] = [...(merged[key] || []), ...(Array.isArray(values) ? values : [])];
    });
  });
  return merged;
}

function isMetaCopy(value = '') {
  return /(benefit držíme|hlavní akce je|hlavná akcia je|promise typu|mode je high-seller|prodejní skóre|predajné skóre)/i.test(value);
}

function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value = '') {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function capitalize(value = '') {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
