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
  if (!cleaned) return (catalog.items || []).filter((item) => item.visible).slice(0, 12);
  return (catalog.items || [])
    .filter((item) => !selectedCatalogProducts.some((selected) => (selected.code || selected.title) === (item.code || item.title)))
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
  const body = finalDraft.blocks.map((block) => block.text).join('\n\n');
  const salesChecks = buildSalesChecks(tuned, finalDraft.primarySubject.angle, finalDraft.cta, finalDraft.salesScore);
  const html = buildHtmlDraft({ data: tuned, preheader: finalDraft.preheader, headline: finalDraft.headline, cta: finalDraft.cta, blocks: finalDraft.blocks });
  return {
    subject: finalDraft.primarySubject.text,
    subjectAngles: finalDraft.subjectAngles,
    preheader: finalDraft.preheader,
    headline: finalDraft.headline,
    body,
    cta: finalDraft.cta,
    blocks: finalDraft.blocks,
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
    ...draft.blocks.map((block) => block.text),
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
  const isMulti = getSelectedProducts(data).length > 1;
  const deadlineWord = data.language === 'sk' ? 'končí čoskoro' : 'končí brzy';
  const moreSense = data.language === 'sk' ? 'práve teraz dáva zmysel' : 'právě teď dává smysl';
  const youNeed = data.language === 'sk' ? 'čo potrebuješ vedieť' : 'co potřebuješ vědět';
  const benefitVerb = data.language === 'sk' ? 'pomôže' : 'pomůže';
  const curiosity = isMulti
    ? (data.language === 'sk' ? `Ako poskladať výber: ${productLine}` : `Jak poskládat výběr: ${productLine}`)
    : (data.language === 'sk' ? `Prečo si ${product.toLowerCase()} berie stále viac ľudí` : `Proč si ${product.toLowerCase()} bere stále víc lidí`);
  const promoOffer = offer ? `${product}: ${offer}` : isMulti ? `${productLine} ${moreSense}` : `${product} ${moreSense}`;
  const urgencyOffer = offer ? `${offer} ${deadlineWord}` : `${product} ${deadlineWord}`;
  const educationAngle = `${theme}: ${youNeed}`;
  const resultAngle = isMulti
    ? (data.language === 'sk' ? `${productLine}, ktoré spolu dávajú zmysel` : `${productLine}, které spolu dávají smysl`)
    : (data.language === 'sk' ? `${product}, ktorý ${benefitVerb} práve teraz` : `${product}, který ${benefitVerb} právě teď`);
  const launchAngle = `Novinka: ${product}`;
  const eventAngle = data.language === 'sk' ? `${theme}, ktoré sa blíži` : `${theme}, které se blíží`;

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
  if (inspiration[0]?.subject && inspiration[0].score > 0 && ['benefit', 'curiosity', 'offer'].includes(angle)) score += 5;
  return score;
}

function buildPreheader(data, subset, angle) {
  const focus = getPrimaryFocus(data);
  const offer = normalizeSentence(data.offer);
  const briefLead = firstMeaningfulSentence(data.brief);
  const map = {
    cz: {
      benefit: offer || `${focus} v krátkém a srozumitelném mailu bez omáčky.`,
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
      benefit: offer || `${focus} v krátkom a zrozumiteľnom maile bez omáčky.`,
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
  if (/jednat právě teď|konať práve teraz|hlavní přínos|hlavný prínos/i.test(preheader)) return preheader;
  return data.language === 'sk'
    ? `Ponuka je časovo citlivá a hlavný prínos komunikujeme hneď v úvode.`
    : `Nabídka je časově citlivá a hlavní přínos komunikujeme hned v úvodu.`;
}

function buildHeadline(data, subset, angle, inspiration) {
  const focus = capitalize(getPrimaryFocus(data));
  const theme = capitalize(data.theme);
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
  return cleanCopy(angleMap[data.language]?.[angle] || subset.examples?.[0]?.headline || `${theme} a ${focus}`);
}

function strengthenHeadline(data, headline) {
  if (/teď|teraz|pozornost|výhodný|výhodný/i.test(headline)) return headline;
  return data.language === 'sk'
    ? `${capitalize(data.product)} je ponuka, ktorú sa oplatí otvoriť práve teraz`
    : `${capitalize(data.product)} je nabídka, kterou se vyplatí otevřít právě teď`;
}

function buildBlocks(data, cta, angle, inspiration) {
  const focus = getPrimaryFocus(data);
  const offer = normalizeSentence(data.offer);
  const detail = firstMeaningfulSentence(data.brief);
  const detail2 = secondMeaningfulSentence(data.brief);
  const whyNow = buildWhyNow(data, data.language, angle);
  const proofLine = buildProof(data, data.language);
  const productListSentence = buildProductListSentence(data);
  const multiIntro = getSelectedProducts(data).length > 1
    ? (data.language === 'sk' ? `V tomto maile pracujeme s výberom produktov: ${productListSentence}.` : `V tomhle mailu pracujeme s výběrem produktů: ${productListSentence}.`)
    : '';

  const blocks = data.language === 'sk'
    ? [
        { title: 'ÚVOD', text: cleanCopy(`${capitalize(focus)} je práve teraz téma, ktorá si zaslúži pozornosť. ${offer || whyNow}`) },
        { title: 'DETAIL', text: cleanCopy(detail || multiIntro || `${capitalize(focus)} komunikujeme stručne, konkrétne a s jasným benefitom pre čitateľa.`) },
        { title: 'DÔVOD', text: cleanCopy(detail2 || proofLine) },
        { title: 'AKCIA', text: cleanCopy(`${offer ? `${offer} ` : ''}${cta}.`) }
      ]
    : [
        { title: 'ÚVOD', text: cleanCopy(`${capitalize(focus)} je právě teď téma, které si zaslouží pozornost. ${offer || whyNow}`) },
        { title: 'DETAIL', text: cleanCopy(detail || multiIntro || `${capitalize(focus)} komunikujeme stručně, konkrétně a s jasným benefitem pro čtenáře.`) },
        { title: 'DŮVOD', text: cleanCopy(detail2 || proofLine) },
        { title: 'AKCE', text: cleanCopy(`${offer ? `${offer} ` : ''}${cta}.`) }
      ];

  if (data.length === 'short') return blocks.slice(0, 3);
  if (data.length === 'long') {
    blocks.splice(3, 0, {
      title: data.language === 'sk' ? 'DOPLNENIE' : 'DOPLNĚNÍ',
      text: cleanCopy(buildSupportParagraph(data, inspiration))
    });
  }
  return blocks;
}

function strengthenBlocks(data, blocks, cta) {
  return blocks.map((block, index) => {
    if (index === 0) {
      return {
        ...block,
        text: data.language === 'sk'
          ? `${block.text} Prínos aj dôvod konať musia byť jasné do pár sekúnd.`
          : `${block.text} Přínos i důvod jednat musí být jasné do pár sekund.`
      };
    }
    if (index === blocks.length - 1) {
      return {
        ...block,
        text: `${block.text} ${data.language === 'sk' ? 'CTA nechávame jedno a úplne konkrétne:' : 'CTA necháváme jedno a úplně konkrétní:'} ${cta}.`
      };
    }
    return block;
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
  const map = {
    cz: {
      benefit: `Právě teď nejlíp odpovídá na potřebu kolem tématu ${data.theme}.`,
      urgency: `Pokud má čtenář využít nabídku včas, musí její hodnotu pochopit hned.`,
      curiosity: `Nejdřív vzbudíme zájem a hned potom ho otočíme do konkrétního benefitu.`,
      result: `Lidé nekupují hlavně produkt, ale výsledek, který jim přinese.`,
      usefulness: `Čtenář musí už z prvních řádků cítit, že dostane něco praktického.`,
      novelty: `Novost sama nestačí, proto ji hned spojujeme s důvodem ke koupi.`,
      number: `Číslo nebo struktura pomáhá rychle pochopit hodnotu mailu.`,
      deadline: `Časové omezení funguje jen tehdy, když je v mailu opravdu cítit.`,
      offer: `Obchodní nabídka musí být pochopitelná bez dlouhého vysvětlování.`
    },
    sk: {
      benefit: `Práve teraz najlepšie odpovedá na potrebu okolo témy ${data.theme}.`,
      urgency: `Ak má čitateľ využiť ponuku včas, musí jej hodnotu pochopiť hneď.`,
      curiosity: `Najprv vzbudíme záujem a hneď potom ho otočíme do konkrétneho benefitu.`,
      result: `Ľudia nekupujú hlavne produkt, ale výsledok, ktorý im prinesie.`,
      usefulness: `Čitateľ musí už z prvých riadkov cítiť, že dostane niečo praktické.`,
      novelty: `Novosť sama nestačí, preto ju hneď spájame s dôvodom ku kúpe.`,
      number: `Číslo alebo štruktúra pomáha rýchlo pochopiť hodnotu mailu.`,
      deadline: `Časové obmedzenie funguje len vtedy, keď je v maile naozaj cítiť.`,
      offer: `Obchodná ponuka musí byť pochopiteľná bez dlhého vysvetľovania.`
    }
  };
  return map[language]?.[angle] || map[language].benefit;
}

function buildProof(data, language) {
  if (data.campaignType === 'education') {
    return language === 'sk'
      ? 'Jednoduchá edukácia znižuje neistotu a zároveň buduje dôveru v ponuku.'
      : 'Jednoduchá edukace snižuje nejistotu a zároveň buduje důvěru v nabídku.';
  }
  if (data.offer) {
    return language === 'sk'
      ? 'Pri konkrétnej ponuke najlepšie funguje jasnosť, konkrétnosť a rýchlo pochopiteľná hodnota.'
      : 'Při konkrétní nabídce nejlépe funguje jasnost, konkrétnost a rychle pochopitelná hodnota.';
  }
  return language === 'sk'
    ? 'Najlepšie funguje copy, ktoré ide rýchlo k veci a nenechá čitateľa hádať, prečo má pokračovať.'
    : 'Nejlépe funguje copy, které jde rychle k věci a nenechá čtenáře hádat, proč má pokračovat.';
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
    return strengthenCta(data, data.language === 'sk' ? 'Chcem si vybrať produkty' : 'Chci si vybrat produkty');
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
  const cleaned = cleanCopy(cta);
  if (/(zjistit|zistiť|koupit|kúpiť|využít|využiť|chci|chcem|rezervovat|rezervovať|objednat|objednať|přihlásit|prihlásiť)/i.test(cleaned)) return cleaned;
  if (data.offer) return data.language === 'sk' ? 'Chcem využiť ponuku' : 'Chci využít nabídku';
  return data.language === 'sk' ? 'Chcem zistiť viac' : 'Chci zjistit víc';
}

function buildHtmlDraft({ data, preheader, headline, cta, blocks }) {
  const ctaHref = '#';
  const blockHtml = blocks.map((block) => `
    <tr>
      <td style="padding:0 32px 20px 32px;font-family:Arial,sans-serif;color:#1a1a1a;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#7c9cff;margin-bottom:8px;">${escapeHtml(block.title)}</div>
        <div style="font-size:16px;line-height:1.6;">${escapeHtml(block.text)}</div>
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
            ${blockHtml}
            <tr>
              <td style="padding:0 32px 36px 32px;">
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
  const finalCta = cleanCopy(cta);
  const rescored = scoreDraft({ tuned, primarySubject: finalPrimary, preheader: finalPreheader, headline: finalHeadline, cta: finalCta, blocks: cleanedBlocks });

  return {
    tuned,
    primarySubject: finalPrimary,
    subjectAngles: cleanedSubjectAngles,
    preheader: finalPreheader,
    headline: finalHeadline,
    cta: finalCta,
    blocks: cleanedBlocks,
    salesScore: rescored,
    inspiration
  };
}

function sanitizeInput(data) {
  const selectedProducts = parseSelectedProducts(data.selectedProducts);
  return {
    ...data,
    theme: cleanField(data.theme),
    product: cleanField(data.product),
    offer: cleanField(data.offer),
    brief: cleanField(data.brief),
    segment: cleanField(data.segment),
    ctaGoal: cleanField(data.ctaGoal),
    brand: cleanField(data.brand),
    selectedProducts,
    productNames: selectedProducts.map((item) => item.title).filter(Boolean)
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
    .filter((item) => item.length >= 12);
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
    ? 'Ak máš konkrétny bonus, termín alebo limit, daj ho sem ako samostatnú vetu.'
    : 'Pokud máš konkrétní bonus, termín nebo limit, dej ho sem jako samostatnou větu.';
  const briefSentence = splitSentences(data.brief)[2];
  return briefSentence || fallback;
}

function cleanCopy(value = '') {
  return cleanField(value)
    .replace(/\b(HERO|ÚVOD|DETAIL|DŮVOD|DÔVOD|AKCE|AKCIA|DOPLNĚNÍ|DOPLNENIE):/gi, '')
    .replace(/\b(benefit držíme úplně nahoře|benefit držíme úplne hore)\b/gi, '')
    .replace(/\b(hlavní akce je|hlavná akcia je)\b:?/gi, '')
    .replace(/\b(Podobné kampaně nejčastěji stály na promise typu|Podobné kampane najčastejšie stáli na promise typu):?[^.]*\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMetaCopy(value = '') {
  return /(benefit držíme|hlavní akce je|hlavná akcia je|promise typu|mode je high-seller|prodejní skóre|predajné skóre)/i.test(value);
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
