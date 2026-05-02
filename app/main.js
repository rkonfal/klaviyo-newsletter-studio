const profile = await fetch('../data/current/style-profile.json').then((r) => r.json());

const datasetMeta = document.querySelector('#dataset-meta');
const toneList = document.querySelector('#tone-list');
const ctaList = document.querySelector('#cta-list');
const examplesEl = document.querySelector('#examples');
const outputEl = document.querySelector('#output');
const form = document.querySelector('#generator-form');
const copyBtn = document.querySelector('#copy-output');

renderSidebar();
renderExamples('cz', 'promo');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const draft = generateNewsletter(data);

  outputEl.classList.remove('empty');
  outputEl.textContent = formatDraft(draft, data.language);
  renderExamples(data.language, data.campaignType);
});

copyBtn.addEventListener('click', async () => {
  if (!outputEl.textContent.trim()) return;
  await navigator.clipboard.writeText(outputEl.textContent);
  copyBtn.textContent = 'Zkopírováno';
  setTimeout(() => (copyBtn.textContent = 'Kopírovat'), 1500);
});

function renderSidebar() {
  const langInfo = Object.entries(profile.languageBreakdown || {}).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join(' · ');
  const typeInfo = Object.entries(profile.campaignTypeBreakdown || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');

  datasetMeta.innerHTML = `
    <strong>${profile.campaignCount}</strong> kampaní<br />
    <span>Poslední build: ${new Date(profile.generatedAt).toLocaleString('cs-CZ')}</span><br />
    <span>${langInfo}</span><br />
    <span>${typeInfo}</span>
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

function appendListItem(target, text) {
  const li = document.createElement('li');
  li.textContent = text;
  target.appendChild(li);
}

function generateNewsletter(data) {
  const subset = pickSubset(data);
  const cta = buildCta(data, subset);
  const subjectAngles = buildSubjectAngles(data, subset);
  const primarySubject = subjectAngles[0];
  const preheader = buildPreheader(data, subset, primarySubject.angle);
  const headline = buildHeadline(data, subset, primarySubject.angle);
  const body = buildBody(data, subset, cta, primarySubject.angle);
  const salesChecks = buildSalesChecks(data, primarySubject.angle, cta);
  return { subject: primarySubject.text, subjectAngles, preheader, headline, body, cta, salesChecks };
}

function formatDraft(draft, language) {
  return [
    `${label('subject', language)}: ${draft.subject}`,
    '',
    `${label('subject_variants', language)}:`,
    ...draft.subjectAngles.map((item, index) => `${index + 1}. [${item.angle}] ${item.text}`),
    '',
    `${label('preheader', language)}: ${draft.preheader}`,
    '',
    `${label('headline', language)}: ${draft.headline}`,
    '',
    `${label('body', language)}:`,
    draft.body,
    '',
    `${label('cta', language)}: ${draft.cta}`,
    '',
    `${label('checks', language)}:`,
    ...draft.salesChecks.map((item) => `- ${item}`)
  ].join('\n');
}

function pickSubset(data) {
  return profile.byCampaignType?.[data.campaignType] || profile.byLanguage?.[data.language] || {};
}

function buildSubjectAngles(data, subset) {
  const rules = buildAngleRules(data);
  return rules
    .map((rule) => ({ angle: rule.angle, text: cleanSubject(rule.text) }))
    .filter((item) => item.text.length >= 8)
    .filter((item, index, array) => array.findIndex((other) => other.text.toLowerCase() === item.text.toLowerCase()) === index)
    .slice(0, 5);

  function buildAngleRules(data) {
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
    const launchAngle = data.language === 'sk' ? `Novinka: ${product}` : `Novinka: ${product}`;
    const eventAngle = data.language === 'sk' ? `${theme}, ktoré sa blíži` : `${theme}, které se blíží`;

    const base = {
      promo: [
        { angle: 'benefit', text: promoOffer },
        { angle: 'urgency', text: urgencyOffer },
        { angle: 'curiosity', text: curiosity },
        { angle: 'result', text: resultAngle },
        { angle: 'offer', text: offer ? offer : subset.examples?.[0]?.subject || promoOffer }
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
        { angle: 'offer', text: offer ? offer : urgencyOffer }
      ]
    };

    return base[data.campaignType] || base.promo;
  }
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
      usefulness: 'Hneď je jasné, čo si čitateľ z mailu odnesie.',
      novelty: 'Zdôrazňujeme, čo je nové a prečo to stojí za pozornosť.',
      number: 'Stručne naznačujeme, čo konkrétne sa čitateľ dozvie.',
      deadline: 'Je z neho cítiť časové obmedzenie a konkrétny dôvod otvoriť mail.',
      offer: 'Dopĺňame subject o konkrétny obchodný dôvod otvorenia.'
    }
  };
  const base = `${offerPart}${angleLine[data.language]?.[angle] || ''} ${data.language === 'sk' ? `Pre segment ${segment}.` : `Pro segment ${segment}.`}`.trim();
  return truncate(base, subset.avgSubjectLength ? Math.max(58, subset.avgSubjectLength + 25) : 88);
}

function buildHeadline(data, subset, angle) {
  const product = capitalize(data.product);
  const theme = capitalize(data.theme);
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
  return angleMap[data.language]?.[angle] || subset.examples?.[0]?.headline || `${theme} a ${product}`;
}

function buildBody(data, subset, cta, angle) {
  const paragraphCount = { short: 2, medium: 3, long: 4 }[data.length] || 3;
  const lines = data.language === 'sk'
    ? buildSkSalesBody(data, cta, angle, paragraphCount)
    : buildCzSalesBody(data, cta, angle, paragraphCount);
  return lines.join('\n\n');
}

function buildCzSalesBody(data, cta, angle, paragraphCount) {
  const whyNow = buildWhyNow(data, 'cz', angle);
  const proof = buildProof(data, 'cz');
  const risk = buildRiskOfNoAction(data, 'cz', angle);
  const lines = [
    'Ahoj,',
    `${capitalize(data.product)} je dnes hlavní téma z jednoho jednoduchého důvodu. ${whyNow}`,
    data.offer
      ? `Hlavní nabídka je ${data.offer}. Už v prvních větách proto držíme benefit i nabídku úplně nahoře, aby bylo během pár sekund jasné, co čtenář získá.`
      : `V prvních větách držíme benefit úplně nahoře, aby bylo během pár sekund jasné, co čtenář získá a proč má pokračovat dál.`,
    `${proof} Proto tenhle mail nestavíme jako seznam featurek, ale jako krátkou cestu od relevance přes benefit až k jedné akci.`,
    `${risk} Proto čtenáře vedeme k jedné hlavní akci: ${cta}.`,
    data.brief?.trim() ? `Do copy je zapracovaný i tento brief: ${data.brief.trim()}` : `Text je schválně snadno skenovatelný, prodejní a bez zbytečné omáčky.`
  ];
  return lines.slice(0, paragraphCount + 1);
}

function buildSkSalesBody(data, cta, angle, paragraphCount) {
  const whyNow = buildWhyNow(data, 'sk', angle);
  const proof = buildProof(data, 'sk');
  const risk = buildRiskOfNoAction(data, 'sk', angle);
  const lines = [
    'Ahoj,',
    `${capitalize(data.product)} je dnes hlavná téma z jedného jednoduchého dôvodu. ${whyNow}`,
    data.offer
      ? `Hlavná ponuka je ${data.offer}. Už v prvých vetách preto držíme benefit aj ponuku úplne hore, aby bolo počas pár sekúnd jasné, čo čitateľ získa.`
      : `V prvých vetách držíme benefit úplne hore, aby bolo počas pár sekúnd jasné, čo čitateľ získa a prečo má čítať ďalej.`,
    `${proof} Preto tento mail nestaviame ako zoznam featurek, ale ako krátku cestu od relevancie cez benefit až k jednej akcii.`,
    `${risk} Preto čitateľa vedieme k jednej hlavnej akcii: ${cta}.`,
    data.brief?.trim() ? `Do copy je zapracovaný aj tento brief: ${data.brief.trim()}` : `Text je zámerne ľahko skenovateľný, predajný a bez zbytočnej omáčky.`
  ];
  return lines.slice(0, paragraphCount + 1);
}

function buildWhyNow(data, language, angle) {
  const map = {
    cz: {
      benefit: `Právě teď nejlíp odpovídá na potřebu kolem tématu ${data.theme}.`,
      urgency: `Pokud má čtenář využít nabídku včas, musí její hodnotu pochopit hned.`,
      curiosity: `Nejdřív vzbudíme zájem a hned potom ho otočíme do konkrétního benefitu.`,
      result: `Lidé nekupují jen produkt, ale hlavně výsledek, který jim přinese.`,
      usefulness: `Čtenář musí už z prvních řádků cítit, že dostane něco praktického.`,
      novelty: `Novost sama nestačí, proto ji hned spojujeme s jasným důvodem ke koupi.`,
      number: `Číslo nebo struktura pomáhá rychle pochopit hodnotu mailu.`,
      deadline: `Časové omezení funguje jen tehdy, když je v mailu opravdu cítit.`,
      offer: `Obchodní nabídka musí být pochopitelná bez dlouhého vysvětlování.`
    },
    sk: {
      benefit: `Práve teraz najlepšie odpovedá na potrebu okolo témy ${data.theme}.`,
      urgency: `Ak má čitateľ využiť ponuku včas, musí jej hodnotu pochopiť hneď.`,
      curiosity: `Najprv vzbudíme záujem a hneď potom ho otočíme do konkrétneho benefitu.`,
      result: `Ľudia nekupujú len produkt, ale hlavne výsledok, ktorý im prinesie.`,
      usefulness: `Čitateľ musí už z prvých riadkov cítiť, že dostane niečo praktické.`,
      novelty: `Novosť sama nestačí, preto ju hneď spájame s jasným dôvodom ku kúpe.`,
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
      ? 'Pomáha nám jednoduchá edukácia, pretože znižuje neistotu a zároveň buduje dôveru v ponuku.'
      : 'Pomáhá nám jednoduchá edukace, protože snižuje nejistotu a zároveň buduje důvěru v nabídku.';
  }
  if (data.offer) {
    return language === 'sk'
      ? 'Keď je v hre konkrétna ponuka, najlepšie funguje jasnosť, konkrétnosť a rýchlo pochopiteľná hodnota.'
      : 'Když je ve hře konkrétní nabídka, nejlépe funguje jasnost, konkrétnost a rychle pochopitelná hodnota.';
  }
  return language === 'sk'
    ? 'Najlepšie funguje copy, ktoré ide rýchlo k veci a nenechá čitateľa hádať, prečo má pokračovať.'
    : 'Nejlépe funguje copy, které jde rychle k věci a nenechá čtenáře hádat, proč má pokračovat.';
}

function buildRiskOfNoAction(data, language, angle) {
  const map = {
    cz: {
      urgency: 'Kdybychom tlak na čas neukázali jasně, mail ztratí prodejní napětí.',
      benefit: 'Kdybychom benefit schovali až níž, část publika odpadne dřív, než pochopí hodnotu.',
      curiosity: 'Kdybychom zůstali jen u zvědavosti, otevření by se nemuselo proměnit v klik a nákup.',
      result: 'Kdybychom neukázali výsledek, produkt bude působit zaměnitelně.',
      usefulness: 'Kdybychom nepůsobili prakticky, čtenář si mail vyhodnotí jako další obecnou promo zprávu.',
      novelty: 'Kdybychom stáli jen na novosti, rychle se vytratí obchodní důvod jednat.',
      number: 'Kdybychom nepomohli rychlou orientací, hodnota mailu se ztratí v prvních sekundách.',
      deadline: 'Kdybychom deadline neudělali viditelný, urgence nebude působit věrohodně.',
      offer: 'Kdybychom nabídku nepodali jasně, zájem se nerozjede do akce.'
    },
    sk: {
      urgency: 'Keby sme tlak na čas neukázali jasne, mail stratí predajné napätie.',
      benefit: 'Keby sme benefit schovali až nižšie, časť publika odpadne skôr, než pochopí hodnotu.',
      curiosity: 'Keby sme zostali len pri zvedavosti, otvorenie sa nemusí zmeniť na klik a nákup.',
      result: 'Keby sme neukázali výsledok, produkt bude pôsobiť zameniteľne.',
      usefulness: 'Keby sme nepôsobili prakticky, čitateľ si mail vyhodnotí ako ďalšiu všeobecnú promo správu.',
      novelty: 'Keby sme stáli len na novosti, rýchlo sa vytratí obchodný dôvod konať.',
      number: 'Keby sme nepomohli rýchlou orientáciou, hodnota mailu sa stratí v prvých sekundách.',
      deadline: 'Keby sme deadline neurobili viditeľný, urgencia nebude pôsobiť dôveryhodne.',
      offer: 'Keby sme ponuku nepodali jasne, záujem sa nerozbehne do akcie.'
    }
  };
  return map[language]?.[angle] || map[language].benefit;
}

function buildSalesChecks(data, angle, cta) {
  return data.language === 'sk'
    ? [
        `Subject stojí na jednom hlavnom angle: ${angle}.`,
        'Preheader dopĺňa subject, neopakuje ho doslova.',
        'V prvých 2 vetách je jasný benefit aj dôvod otvoriť mail.',
        `Mail smeruje k jednému hlavnému CTA: ${cta}.`,
        'Copy je písané skenovateľne a predajne.'
      ]
    : [
        `Subject stojí na jednom hlavním angle: ${angle}.`,
        'Preheader doplňuje subject, neopakuje ho doslova.',
        'V prvních 2 větách je jasný benefit i důvod otevřít mail.',
        `Mail směřuje k jednomu hlavnímu CTA: ${cta}.`,
        'Copy je psané skenovatelně a prodejně.'
      ];
}

function buildCta(data, subset) {
  if (data.ctaGoal) return data.language === 'sk' ? `Chcem ${data.ctaGoal}` : `Chci ${data.ctaGoal}`;
  if (subset.topCtas?.length) return subset.topCtas[0];
  if (data.offer) return data.language === 'sk' ? 'Využiť ponuku' : 'Využít nabídku';
  return data.language === 'sk' ? 'Zistiť viac' : 'Zjistit víc';
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
      subject: 'PŘEDMĚT',
      subject_variants: 'VARIANTY PŘEDMĚTU',
      preheader: 'PREHEADER',
      headline: 'HEADLINE',
      body: 'BODY COPY',
      cta: 'CTA',
      checks: 'PRODEJNÍ CHECKLIST'
    },
    sk: {
      subject: 'PREDMET',
      subject_variants: 'VARIANTY PREDMETU',
      preheader: 'PREHEADER',
      headline: 'HEADLINE',
      body: 'BODY COPY',
      cta: 'CTA',
      checks: 'PREDAJNÝ CHECKLIST'
    }
  };
  return map[language]?.[key] || key.toUpperCase();
}

function truncate(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function capitalize(value = '') {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
