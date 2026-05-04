const [profile, catalog] = await Promise.all([
  fetch('../data/current/style-profile.json').then((r) => r.json()),
  fetch('../data/current/product-catalog.json').then((r) => r.json())
]);

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

let lastDraft = null;
let selectedCatalogProducts = [];

renderSidebar();
renderExamples('cz', 'promo');
renderInspiration([]);
renderProductPicker();

form.addEventListener('submit', (event) => {
  event.preventDefault();
  syncSelectedProductsInput();
  const data = Object.fromEntries(new FormData(form).entries());
  const draft = generateNewsletter(data);
  lastDraft = draft;

  outputEl.classList.remove('empty');
  outputEl.textContent = formatDraft(draft, data.language);
  renderExamples(data.language, data.campaignType);
  renderInspiration(draft.inspiration);
});

productSearchEl?.addEventListener('input', () => renderProductPicker(productSearchEl.value));

copyBtn.addEventListener('click', async () => {
  if (!outputEl.textContent.trim()) return;
  await navigator.clipboard.writeText(outputEl.textContent);
  flashButton(copyBtn, 'Zkopírováno');
});

copyHtmlBtn.addEventListener('click', async () => {
  if (!lastDraft?.html) return;
  await navigator.clipboard.writeText(lastDraft.html);
  flashButton(copyHtmlBtn, 'HTML zkopírováno');
});

function flashButton(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => (button.textContent = original), 1500);
}

function renderSidebar() {
  const langInfo = Object.entries(profile.languageBreakdown || {}).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ');
  const typeInfo = Object.entries(profile.campaignTypeBreakdown || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');

  datasetMeta.innerHTML = `
    <strong>${profile.campaignCount}</strong> kampaní<br />
    <span>Poslední build: ${new Date(profile.generatedAt).toLocaleString('cs-CZ')}</span><br />
    <span>${langInfo}</span><br />
    <span>${typeInfo}</span><br />
    <strong>Mode:</strong> High-seller default
  `;

  catalogMeta.innerHTML = `
    <strong>${catalog.counts?.total || 0}</strong> produktů<br />
    <span>Viditelných: ${catalog.counts?.visible || 0}</span><br />
    <span>S cenou: ${catalog.counts?.withPrice || 0}</span><br />
    <span>Build: ${new Date(catalog.generatedAt).toLocaleString('cs-CZ')}</span>
  `;

  profile.tone.voice.forEach((item) => appendListItem(toneList, item));
  profile.tone.ctaPatterns.forEach((item) => appendListItem(ctaList, item));
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
  const tuned = sanitizeInput({ ...data, mode: 'high-seller', tonePreset: normalizeTone(data) });
  tuned.multiProductMode = resolveMultiProductMode(tuned);
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
  if (data.tonePreset === 'warm') return 'direct';
  if (data.campaignType === 'education') return 'educational';
  if (data.campaignType === 'urgency' || data.offer) return 'urgent';
  return data.tonePreset || 'direct';
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
  const offer = data.offer?.trim();
  const product = capitalize(getPrimaryFocus(data));
  const productLine = capitalize(getProductLine(data, 3));
  const theme = capitalize(data.theme);
  const themeFocus = capitalize(getThemeFocus(data));
  const isThemeLed = shouldLeadWithTheme(data);
  const isMulti = getSelectedProducts(data).length > 1;
  const deadlineWord = data.language === 'sk' ? 'končí čoskoro' : 'končí brzy';
  const moreSense = data.language === 'sk' ? 'práve teraz dáva zmysel' : 'právě teď dává smysl';
  const youNeed = data.language === 'sk' ? 'čo potrebuješ vedieť' : 'co potřebuješ vědět';
  const benefitVerb = data.language === 'sk' ? 'pomôže' : 'pomůže';
  const curiosity = isMulti
    ? (data.language === 'sk' ? `Ako poskladať výber: ${productLine}` : `Jak poskládat výběr: ${productLine}`)
    : isThemeLed
      ? (data.language === 'sk' ? `${themeFocus} sa blíži` : `${themeFocus} se blíží`)
      : (data.language === 'sk' ? `Prečo si ${product.toLowerCase()} berie stále viac ľudí` : `Proč si ${product.toLowerCase()} bere stále víc lidí`);
  const promoOffer = offer ? `${isThemeLed ? themeFocus : product}: ${offer}` : isMulti ? `${productLine} ${moreSense}` : isThemeLed ? `${themeFocus} ${moreSense}` : `${product} ${moreSense}`;
  const urgencyOffer = offer ? `${offer} ${deadlineWord}` : `${isThemeLed ? themeFocus : product} ${deadlineWord}`;
  const educationAngle = `${theme}: ${youNeed}`;
  const resultAngle = isMulti
    ? (data.language === 'sk' ? `${productLine}, ktoré spolu dávajú zmysel` : `${productLine}, které spolu dávají smysl`)
    : isThemeLed
      ? (data.language === 'sk' ? `${themeFocus} a tip, ktorý ${benefitVerb} s výberom` : `${themeFocus} a tip, který ${benefitVerb} s výběrem`)
      : (data.language === 'sk' ? `${product}, ktorý ${benefitVerb} práve teraz` : `${product}, který ${benefitVerb} právě teď`);
  const launchAngle = `Novinka: ${product}`;
  const eventAngle = data.language === 'sk' ? `${themeFocus}, ktoré sa blíži` : `${themeFocus}, které se blíží`;

  const base = {
    promo: [
      { angle: 'benefit', text: promoOffer },
      { angle: 'urgency', text: urgencyOffer },
      { angle: 'curiosity', text: curiosity },
      { angle: 'result', text: resultAngle },
      { angle: 'offer', text: offer || subset.examples?.[0]?.subject || promoOffer }
    ],
    education: [
      { angle: 'usefulness', text: educationAngle },
      { angle: 'curiosity', text: curiosity },
      { angle: 'benefit', text: resultAngle },
      { angle: 'number', text: buildNumberSubject(theme, data.language) },
      { angle: 'offer', text: promoOffer }
    ],
    launch: [
      { angle: 'novelty', text: launchAngle },
      { angle: 'benefit', text: promoOffer },
      { angle: 'curiosity', text: curiosity },
      { angle: 'result', text: resultAngle },
      { angle: 'offer', text: offer ? `${launchAngle} ${offer}` : launchAngle }
    ],
    event: [
      { angle: 'deadline', text: eventAngle },
      { angle: 'urgency', text: urgencyOffer },
      { angle: 'curiosity', text: curiosity },
      { angle: 'benefit', text: promoOffer },
      { angle: 'offer', text: offer ? `${theme}: ${offer}` : eventAngle }
    ],
    urgency: [
      { angle: 'urgency', text: urgencyOffer },
      { angle: 'benefit', text: promoOffer },
      { angle: 'deadline', text: data.language === 'sk' ? `Posledná šanca pre ${product.toLowerCase()}` : `Poslední šance pro ${product.toLowerCase()}` },
      { angle: 'curiosity', text: curiosity },
      { angle: 'offer', text: offer || urgencyOffer }
    ]
  };

  return (base[data.campaignType] || base.promo)
    .map((rule) => ({ angle: rule.angle, text: cleanSubject(rule.text) }))
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
  if (data.tonePreset === 'urgent' && ['urgency', 'deadline'].includes(angle)) score += 10;
  if (data.tonePreset === 'educational' && ['usefulness', 'number'].includes(angle)) score += 10;
  if (shouldLeadWithTheme(data) && ['benefit', 'curiosity', 'offer'].includes(angle)) score += 18;
  if (shouldLeadWithTheme(data) && ['urgency', 'deadline'].includes(angle) && !data.offer) score -= 12;
  if (inspiration[0]?.subject && inspiration[0].score > 0 && ['benefit', 'curiosity', 'offer'].includes(angle)) score += 5;
  return score;
}

function buildPreheader(data, subset, angle) {
  const focus = getPrimaryFocus(data);
  const offer = normalizeSentence(data.offer);
  const briefLead = getBriefLead(data);
  const multiLead = getSelectedProducts(data).length > 1 ? buildMultiModeLead(data) : '';
  const map = {
    cz: {
      benefit: offer || multiLead || `${focus} v krátkém a srozumitelném mailu bez omáčky.`,
      urgency: offer ? `${offer} Platí teď, proto mrkni dovnitř.` : `${focus} řešíme stručně a rovnou k věci.`,
      curiosity: briefLead || `Uvnitř najdeš konkrétní důvod, proč se na ${focus.toLowerCase()} podívat právě teď.`,
      result: `Ukážeme, co ${focus.toLowerCase()} přinese a pro koho dává smysl.`,
      usefulness: `Stručně, jasně a prakticky k tématu ${data.theme}.`,
      novelty: `Novinka, benefit a jasný důvod kliknout v jednom mailu.`,
      number: `Rychlý přehled toho nejdůležitějšího bez zbytečné vaty.`,
      deadline: offer ? `${offer} Pokud o tom uvažuješ, teď je správný moment.` : `Pokud tě ${focus.toLowerCase()} zajímá, neodkládej to.`,
      offer: offer || `Konkrétní důvod otevřít mail je uvnitř hned nahoře.`
    },
    sk: {
      benefit: offer || multiLead || `${focus} v krátkom a zrozumiteľnom maile bez omáčky.`,
      urgency: offer ? `${offer} Platí teraz, preto sa pozri dovnútra.` : `${focus} riešime stručne a rovno k veci.`,
      curiosity: briefLead || `Vo vnútri nájdeš konkrétny dôvod, prečo sa na ${focus.toLowerCase()} pozrieť práve teraz.`,
      result: `Ukážeme, čo ${focus.toLowerCase()} prinesie a pre koho dáva zmysel.`,
      usefulness: `Stručne, jasne a prakticky k téme ${data.theme}.`,
      novelty: `Novinka, benefit a jasný dôvod kliknúť v jednom maile.`,
      number: `Rýchly prehľad toho najdôležitejšieho bez zbytočnej vaty.`,
      deadline: offer ? `${offer} Ak o tom uvažuješ, teraz je správny moment.` : `Ak ťa ${focus.toLowerCase()} zaujíma, neodkladaj to.`,
      offer: offer || `Konkrétny dôvod otvoriť mail je vo vnútri hneď hore.`
    }
  };
  const base = map[data.language]?.[angle] || map[data.language]?.benefit || '';
  return truncate(cleanCopy(base), subset.avgSubjectLength ? Math.max(58, subset.avgSubjectLength + 25) : 88);
}

function strengthenPreheader(data, preheader) {
  if (preheader && !isMetaCopy(preheader) && !isInstructionSentence(preheader)) return preheader;
  const focus = getPrimaryFocus(data).toLowerCase();
  const theme = getThemeFocus(data);
  if (data.offer) return data.language === 'sk' ? `${data.offer}. Pozri sa dovnútra, čo sa oplatí vybrať.` : `${data.offer}. Podívej se dovnitř, co se teď vyplatí vybrat.`;
  if (shouldLeadWithTheme(data)) return data.language === 'sk' ? `${theme} je skvelá príležitosť vybrať darček, ktorý poteší.` : `${theme} je skvělá příležitost vybrat dárek, který potěší.`;
  return data.language === 'sk' ? `Vo vnútri nájdeš krátky a konkrétny tip k ${focus}.` : `Uvnitř najdeš krátký a konkrétní tip k ${focus}.`;
}

function buildHeadline(data, subset, angle, inspiration) {
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(data.theme);
  const multiHeadline = getSelectedProducts(data).length > 1 ? buildMultiHeadline(data) : null;
  const angleMap = {
    cz: {
      benefit: `${focus} teď dává smysl otevřít`,
      urgency: `${focus}, které nechceš prošvihnout`,
      curiosity: `Proč právě teď řešit ${focus.toLowerCase()}`,
      result: `Co ti ${focus.toLowerCase()} může přinést`,
      usefulness: `${theme} stručně a prakticky`,
      novelty: `Novinka kolem ${focus.toLowerCase()}`,
      number: `${theme} v několika jasných bodech`,
      deadline: `${focus} nebude takhle výhodné dlouho`,
      offer: data.offer ? `${focus} a nabídka, kterou je škoda minout` : `${focus} bez zbytečné omáčky`
    },
    sk: {
      benefit: `${focus} teraz dáva zmysel otvoriť`,
      urgency: `${focus}, ktoré nechceš zmeškať`,
      curiosity: `Prečo práve teraz riešiť ${focus.toLowerCase()}`,
      result: `Čo ti ${focus.toLowerCase()} môže priniesť`,
      usefulness: `${theme} stručne a prakticky`,
      novelty: `Novinka okolo ${focus.toLowerCase()}`,
      number: `${theme} v niekoľkých jasných bodoch`,
      deadline: `${focus} nebude takto výhodné dlho`,
      offer: data.offer ? `${focus} a ponuka, ktorú je škoda minúť` : `${focus} bez zbytočnej omáčky`
    }
  };
  return cleanCopy(multiHeadline || angleMap[data.language]?.[angle] || subset.examples?.[0]?.headline || `${theme} a ${focus}`);
}

function strengthenHeadline(data, headline) {
  if (headline && !isMetaCopy(headline) && !isInstructionSentence(headline)) return headline;
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(getThemeFocus(data));
  if (getSelectedProducts(data).length > 1) return buildMultiHeadline(data) || focus;
  if (shouldLeadWithTheme(data)) return data.language === 'sk' ? `${theme}: tip na darček, ktorý poteší` : `${theme}: tip na dárek, který potěší`;
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
        'Preheader dopĺňa subject, neopakuje ho doslova.',
        `Mail smeruje k jednému hlavnému CTA: ${cta}.`,
        'Slabší draft sa automaticky pritvrdí do predajnejšej verzie.'
      ]
    : [
        `Mode je HIGH-SELLER a hlavní angle je ${angle}.`,
        `Prodejní skóre je ${salesScore.total}/100.`,
        'Preheader doplňuje subject, neopakuje ho doslova.',
        `Mail směřuje k jednomu hlavnímu CTA: ${cta}.`,
        'Slabší draft se automaticky přitvrdí do prodejnější verze.'
      ];
}

function buildCta(data, subset, inspiration) {
  const focus = getPrimaryFocus(data).toLowerCase();
  const selectedCount = getSelectedProducts(data).length;
  if (data.ctaGoal) return strengthenCta(data, data.language === 'sk' ? `Chcem ${data.ctaGoal}` : `Chci ${data.ctaGoal}`);
  if (selectedCount > 1) {
    return strengthenCta(data, buildMultiCta(data));
  }
  if (data.offer) return strengthenCta(data, data.language === 'sk' ? 'Chcem využiť ponuku' : 'Chci využít nabídku');
  if (data.campaignType === 'event') return strengthenCta(data, data.language === 'sk' ? 'Chcem si rezervovať miesto' : 'Chci si rezervovat místo');
  if (/(kurz|webinář|webinar|školení|seminář|seminar|konference|vstupenka|vstupenky)/i.test(focus)) {
    return strengthenCta(data, data.language === 'sk' ? 'Chcem rezervovať miesto' : 'Chci rezervovat místo');
  }
  if (inspiration[0]?.cta) return strengthenCta(data, inspiration[0].cta);
  if (subset.topCtas?.length) return strengthenCta(data, subset.topCtas[0]);
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
  const cleanedSubjectAngles = subjectAngles.map((item) => ({ ...item, text: cleanCopy(item.text) })).filter((item, index, array) => array.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) === index);
  const cleanedBlocks = blocks
    .map((block) => ({ ...block, text: cleanCopy(block.text) }))
    .filter((block) => block.text && !isMetaCopy(block.text));

  const finalPrimary = { ...primarySubject, text: cleanCopy(primarySubject.text) };
  const finalPreheader = cleanCopy(preheader);
  const finalHeadline = cleanCopy(headline);
  const finalCta = normalizeCta(cleanCopy(cta));
  const paragraphs = composeFinalParagraphs(tuned, cleanedBlocks, finalCta);
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

function sanitizeInput(data) {
  const selectedProducts = parseSelectedProducts(data.selectedProducts);
  const brief = cleanField(data.brief);
  return {
    ...data,
    theme: cleanField(data.theme),
    product: cleanField(data.product),
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

function getSelectedProducts(data) {
  return Array.isArray(data.selectedProducts) ? data.selectedProducts : [];
}

function getProductNames(data) {
  const selected = getSelectedProducts(data).map((item) => item.title).filter(Boolean);
  if (selected.length) return selected;
  const manual = cleanField(data.product);
  return manual ? [manual] : [];
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
  if (isSeasonalTheme(theme)) return true;
  return isGenericFocus(cleanField(data.product)) && !!theme;
}

function isSeasonalTheme(value = '') {
  return /(den matek|mothers day|valentýn|valentin|vánoce|vanoce|velikonoce|back to school|černý pátek|black friday|svátek|svatek|dárk|darcek)/i.test(cleanField(value));
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
  const product = cleanField(data.product);
  const theme = cleanField(data.theme);
  const selected = getSelectedProducts(data);
  if (selected.length === 1) return selected[0].title;
  if (selected.length > 1) return theme || getProductLine(data, 2);
  if (!product) return theme || (data.language === 'sk' ? 'ponuka' : 'nabídka');
  if (isGenericFocus(product) && theme) return theme;
  return product;
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
  const paragraphs = blocks.map((block) => block.text).filter(Boolean);
  return paragraphs
    .map((text, index) => polishParagraph(text, data, cta, index, paragraphs.length))
    .filter(Boolean);
}

function polishParagraph(text, data, cta, index, total) {
  let result = cleanCopy(text);
  result = result.replace(/^([a-zá-ž])/u, (m) => m.toUpperCase());
  result = result.replace(new RegExp(`\\b${escapeRegExp(cta)}\\.?$`, 'i'), '').trim();
  result = result.replace(/\b(Chci|Chcem)\s+objednat\b/gi, data.language === 'sk' ? 'Chcem objednať' : 'Chci objednat');
  if (index === total - 1) {
    result = result.replace(/[.!?]+$/g, '');
    return result ? `${result}.` : '';
  }
  return /[.!?]$/.test(result) ? result : `${result}.`;
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
