const profile = await fetch('../data/current/style-profile.json').then((r) => r.json());

const datasetMeta = document.querySelector('#dataset-meta');
const toneList = document.querySelector('#tone-list');
const ctaList = document.querySelector('#cta-list');
const examplesEl = document.querySelector('#examples');
const outputEl = document.querySelector('#output');
const inspirationEl = document.querySelector('#inspiration');
const form = document.querySelector('#generator-form');
const copyBtn = document.querySelector('#copy-output');
const copyHtmlBtn = document.querySelector('#copy-html-output');

let lastDraft = null;

renderSidebar();
renderExamples('cz', 'promo');
renderInspiration([]);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const draft = generateNewsletter(data);
  lastDraft = draft;

  outputEl.classList.remove('empty');
  outputEl.textContent = formatDraft(draft, data.language);
  renderExamples(data.language, data.campaignType);
  renderInspiration(draft.inspiration);
});

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

  profile.tone.voice.forEach((item) => appendListItem(toneList, item));
  profile.tone.ctaPatterns.forEach((item) => appendListItem(ctaList, item));
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
  const tuned = { ...data, mode: 'high-seller', tonePreset: normalizeTone(data) };
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

  const body = blocks.map((block) => block.title ? `${block.title}\n${block.text}` : block.text).join('\n\n');
  const salesChecks = buildSalesChecks(tuned, primarySubject.angle, cta, salesScore);
  const html = buildHtmlDraft({ data: tuned, preheader, headline, cta, blocks });
  return { subject: primarySubject.text, subjectAngles, preheader, headline, body, cta, blocks, html, salesChecks, inspiration, salesScore };
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
    `${label('mode', language)}: HIGH-SELLER`,
    `${label('score', language)}: ${draft.salesScore.total}/100`,
    `${label('score_breakdown', language)}: open ${draft.salesScore.openPotential}, click ${draft.salesScore.clickPotential}, clarity ${draft.salesScore.salesClarity}, urgency ${draft.salesScore.urgencyStrength}`,
    '',
    `${label('subject', language)}: ${draft.subject}`,
    '',
    `${label('subject_variants', language)}:`,
    ...draft.subjectAngles.map((item, index) => `${index + 1}. [${item.angle} | ${item.score}] ${item.text}`),
    '',
    `${label('preheader', language)}: ${draft.preheader}`,
    '',
    `${label('headline', language)}: ${draft.headline}`,
    '',
    `${label('body', language)}:`,
    ...draft.blocks.flatMap((block) => block.title ? [`${block.title}:`, block.text, ''] : [block.text, '']),
    `${label('cta', language)}: ${draft.cta}`,
    '',
    `${label('html', language)}: připraveno ke kopírování tlačítkem`,
    '',
    `${label('checks', language)}:`,
    ...draft.salesChecks.map((item) => `- ${item}`)
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
  const tokens = tokenize(`${data.theme} ${data.product} ${data.offer || ''}`);
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
  const product = capitalize(data.product);
  const theme = capitalize(data.theme);
  const deadlineWord = data.language === 'sk' ? 'končí čoskoro' : 'končí brzy';
  const moreSense = data.language === 'sk' ? 'práve teraz dáva zmysel' : 'právě teď dává smysl';
  const youNeed = data.language === 'sk' ? 'čo potrebuješ vedieť' : 'co potřebuješ vědět';
  const benefitVerb = data.language === 'sk' ? 'pomôže' : 'pomůže';
  const curiosity = data.language === 'sk' ? `Prečo si ${product.toLowerCase()} berie stále viac ľudí` : `Proč si ${product.toLowerCase()} bere stále víc lidí`;
  const promoOffer = offer ? `${product}: ${offer}` : `${product} ${moreSense}`;
  const urgencyOffer = offer ? `${offer} ${deadlineWord}` : `${product} ${deadlineWord}`;
  const educationAngle = `${theme}: ${youNeed}`;
  const resultAngle = data.language === 'sk' ? `${product}, ktorý ${benefitVerb} práve teraz` : `${product}, který ${benefitVerb} právě teď`;
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
  const segment = data.segment || (data.language === 'sk' ? 'odberateľov' : 'odběratelů');
  const offerPart = data.offer ? `${data.offer}. ` : '';
  const angleLine = {
    cz: {
      benefit: 'Hned v úvodu říkáme hlavní přínos a proč se vyplatí kliknout.',
      urgency: 'Jasně říkáme, proč je potřeba jednat právě teď.',
      curiosity: 'Doplňujeme subject o konkrétní důvod, proč se podívat dovnitř.',
      result: 'Rychle ukazujeme, jaký výsledek může tahle nabídka přinést.',
      usefulness: 'Hned je jasné, co si z mailu čtenář odnese.',
      novelty: 'Zdůrazňujeme, co je nové a proč to stojí za pozornost.',
      number: 'Krátce naznačujeme, co konkrétního se čtenář dozví.',
      deadline: 'Je z něj cítit časové omezení a konkrétní důvod otevřít mail.',
      offer: 'Doplňujeme subject o konkrétní obchodní důvod otevření.'
    },
    sk: {
      benefit: 'Hneď v úvode hovoríme hlavný prínos a prečo sa oplatí kliknúť.',
      urgency: 'Jasne hovoríme, prečo treba konať práve teraz.',
      curiosity: 'Dopĺňame subject o konkrétny dôvod, prečo sa pozrieť dovnútra.',
      result: 'Rýchlo ukazujeme, aký výsledok môže táto ponuka priniesť.',
      usefulness: 'Hneď je jasné, čo si čitateľ odnesie.',
      novelty: 'Zdôrazňujeme, čo je nové a prečo to stojí za pozornosť.',
      number: 'Stručne naznačujeme, čo konkrétne sa čitateľ dozvie.',
      deadline: 'Je z neho cítiť časové obmedzenie a konkrétny dôvod otvoriť mail.',
      offer: 'Dopĺňame subject o konkrétny obchodný dôvod otvorenia.'
    }
  };
  const base = `${offerPart}${angleLine[data.language]?.[angle] || ''} ${data.language === 'sk' ? `Pre segment ${segment}.` : `Pro segment ${segment}.`}`.trim();
  return truncate(base, subset.avgSubjectLength ? Math.max(58, subset.avgSubjectLength + 25) : 88);
}

function strengthenPreheader(data, preheader) {
  if (/jednat právě teď|konať práve teraz|hlavní přínos|hlavný prínos/i.test(preheader)) return preheader;
  return data.language === 'sk'
    ? `Ponuka je časovo citlivá a hlavný prínos komunikujeme hneď v úvode.`
    : `Nabídka je časově citlivá a hlavní přínos komunikujeme hned v úvodu.`;
}

function buildHeadline(data, subset, angle, inspiration) {
  const product = capitalize(data.product);
  const theme = capitalize(data.theme);
  const inspirationHeadline = inspiration[0]?.headline;
  const angleMap = {
    cz: {
      benefit: `${product} právě teď stojí za pozornost`,
      urgency: `Teď je správný čas pro ${product.toLowerCase()}`,
      curiosity: `${theme}, které nechceš přehlédnout`,
      result: `${product}, který rychle ukáže svůj přínos`,
      usefulness: `${theme} bez zbytečné složitosti`,
      novelty: `Seznam se s ${product}`,
      number: `${theme} v několika jasných bodech`,
      deadline: `${product} nebude takhle výhodný dlouho`,
      offer: data.offer ? `${product} a nabídka, která dává smysl` : `${product} a důvod otevřít právě teď`
    },
    sk: {
      benefit: `${product} si práve teraz zaslúži pozornosť`,
      urgency: `Teraz je správny čas pre ${product.toLowerCase()}`,
      curiosity: `${theme}, ktoré nechceš prehliadnuť`,
      result: `${product}, ktorý rýchlo ukáže svoj prínos`,
      usefulness: `${theme} bez zbytočnej zložitosti`,
      novelty: `Zoznám sa s ${product}`,
      number: `${theme} v niekoľkých jasných bodoch`,
      deadline: `${product} nebude takto výhodný dlho`,
      offer: data.offer ? `${product} a ponuka, ktorá dáva zmysel` : `${product} a dôvod otvoriť práve teraz`
    }
  };
  return angleMap[data.language]?.[angle] || inspirationHeadline || subset.examples?.[0]?.headline || `${theme} a ${product}`;
}

function strengthenHeadline(data, headline) {
  if (/teď|teraz|pozornost|výhodný|výhodný/i.test(headline)) return headline;
  return data.language === 'sk'
    ? `${capitalize(data.product)} je ponuka, ktorú sa oplatí otvoriť práve teraz`
    : `${capitalize(data.product)} je nabídka, kterou se vyplatí otevřít právě teď`;
}

function buildBlocks(data, cta, angle, inspiration) {
  const proofLine = buildProof(data, data.language);
  const whyNow = buildWhyNow(data, data.language, angle);
  const risk = buildRiskOfNoAction(data, data.language, angle);
  const social = inspiration[0]?.headline
    ? (data.language === 'sk' ? `Podobné kampane najčastejšie stáli na promise typu: ${inspiration[0].headline}` : `Podobné kampaně nejčastěji stály na promise typu: ${inspiration[0].headline}`)
    : (data.language === 'sk' ? 'Sľub musí byť čitateľný už pri rýchlom prebehnutí očami.' : 'Slib musí být čitelný už při rychlém přeběhnutí očima.');

  const blocks = data.language === 'sk'
    ? [
        { title: 'HERO', text: `${capitalize(data.product)} je dnes hlavná téma. ${whyNow}` },
        { title: 'PREČO TO MÁ ZMYSEL', text: data.offer ? `Hlavná ponuka je ${data.offer}. Benefit aj ponuku držíme úplne hore.` : `Benefit držíme úplne hore, aby bolo hneď jasné, čo čitateľ získa.` },
        { title: 'DÔVOD VERIŤ', text: `${proofLine} ${social}` },
        { title: 'AKCIA TERAZ', text: `${risk} Hlavná akcia je: ${cta}.` }
      ]
    : [
        { title: 'HERO', text: `${capitalize(data.product)} je dnes hlavní téma. ${whyNow}` },
        { title: 'PROČ TO DÁVÁ SMYSL', text: data.offer ? `Hlavní nabídka je ${data.offer}. Benefit i nabídku držíme úplně nahoře.` : `Benefit držíme úplně nahoře, aby bylo hned jasné, co čtenář získá.` },
        { title: 'DŮVOD VĚŘIT', text: `${proofLine} ${social}` },
        { title: 'AKCE TEĎ', text: `${risk} Hlavní akce je: ${cta}.` }
      ];

  if (data.length === 'short') return blocks.slice(0, 3);
  if (data.length === 'long') {
    blocks.splice(3, 0, {
      title: data.language === 'sk' ? 'DOPLNENIE' : 'DOPLNĚNÍ',
      text: data.brief?.trim() || (data.language === 'sk' ? 'Text môžeš ešte doplniť o konkrétny detail produktu, bonus alebo termín.' : 'Text můžeš ještě doplnit o konkrétní detail produktu, bonus nebo termín.')
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
  if (data.ctaGoal) return strengthenCta(data, data.language === 'sk' ? `Chcem ${data.ctaGoal}` : `Chci ${data.ctaGoal}`);
  if (inspiration[0]?.cta) return strengthenCta(data, inspiration[0].cta);
  if (subset.topCtas?.length) return strengthenCta(data, subset.topCtas[0]);
  if (data.offer) return data.language === 'sk' ? 'Využiť ponuku' : 'Využít nabídku';
  return data.language === 'sk' ? 'Zistiť viac' : 'Zjistit víc';
}

function strengthenCta(data, cta) {
  if (/(zjistit|zistiť|koupit|kúpiť|využít|využiť|chci|chcem)/i.test(cta)) return cta;
  if (data.offer) return data.language === 'sk' ? 'Využiť ponuku teraz' : 'Využít nabídku teď';
  return data.language === 'sk' ? 'Chcem to využiť' : 'Chci toho využít';
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
