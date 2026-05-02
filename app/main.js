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
  outputEl.textContent = [
    `${label('subject', data.language)}: ${draft.subject}`,
    `${label('preheader', data.language)}: ${draft.preheader}`,
    '',
    `${label('headline', data.language)}: ${draft.headline}`,
    '',
    draft.body,
    '',
    `${label('cta', data.language)}: ${draft.cta}`
  ].join('\n');

  renderExamples(data.language, data.campaignType);
});

copyBtn.addEventListener('click', async () => {
  if (!outputEl.textContent.trim()) return;
  await navigator.clipboard.writeText(outputEl.textContent);
  copyBtn.textContent = 'Zkopírováno';
  setTimeout(() => (copyBtn.textContent = 'Kopírovat'), 1500);
});

function renderSidebar() {
  const langInfo = Object.entries(profile.languageBreakdown || {})
    .map(([key, value]) => `${key.toUpperCase()}: ${value}`)
    .join(' · ');
  const typeInfo = Object.entries(profile.campaignTypeBreakdown || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(' · ');

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
  const examples = (profile.examples || [])
    .filter((example) => example.language === language && example.campaignType === campaignType)
    .slice(0, 6);
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
  const tone = toneSentence(data);
  const cta = buildCta(data, subset);
  const subject = buildSubject(data, subset);
  const preheader = buildPreheader(data, subset);
  const headline = buildHeadline(data, subset);
  const body = buildBody(data, subset, tone, cta);
  return { subject, preheader, headline, body, cta };
}

function pickSubset(data) {
  return profile.byCampaignType?.[data.campaignType] || profile.byLanguage?.[data.language] || {};
}

function buildSubject(data, subset) {
  const offer = data.offer ? ` ${data.offer}` : '';
  const map = {
    cz: {
      promo: `${capitalize(data.product)} právě teď dává smysl${offer}`.trim(),
      education: `${capitalize(data.theme)} jednoduše a bez omáčky`,
      launch: `Novinka: ${capitalize(data.product)}`,
      event: `${capitalize(data.theme)} už se blíží`,
      urgency: `${capitalize(data.product)} končí za chvíli`
    },
    sk: {
      promo: `${capitalize(data.product)} práve teraz dáva zmysel${offer}`.trim(),
      education: `${capitalize(data.theme)} jednoducho a bez omáčky`,
      launch: `Novinka: ${capitalize(data.product)}`,
      event: `${capitalize(data.theme)} sa blíži`,
      urgency: `${capitalize(data.product)} sa končí už čoskoro`
    }
  };
  return map[data.language]?.[data.campaignType] || subset.examples?.[0]?.subject || `${capitalize(data.theme)} | ${data.product}`;
}

function buildPreheader(data, subset) {
  const prefix = data.offer ? `${data.offer}. ` : '';
  const segment = data.segment || (data.language === 'sk' ? 'publikum' : 'publikum');
  const base = data.language === 'sk'
    ? `${prefix}Pripravili sme stručný ${translateType(data.campaignType, 'sk')} newsletter pre segment ${segment}.`
    : `${prefix}Připravili jsme stručný ${translateType(data.campaignType, 'cz')} newsletter pro segment ${segment}.`;
  return truncate(base, subset.avgSubjectLength ? Math.max(55, subset.avgSubjectLength + 18) : 80);
}

function buildHeadline(data, subset) {
  const map = {
    cz: {
      promo: `${capitalize(data.product)} právě teď stojí za pozornost`,
      education: `${capitalize(data.theme)} bez zbytečné složitosti`,
      launch: `Seznam se s ${data.product}`,
      event: `${capitalize(data.theme)} si nechceš nechat ujít`,
      urgency: `Teď je poslední chvíle pro ${data.product}`
    },
    sk: {
      promo: `${capitalize(data.product)} si práve teraz zaslúži pozornosť`,
      education: `${capitalize(data.theme)} bez zbytočnej zložitosti`,
      launch: `Zoznám sa s ${data.product}`,
      event: `${capitalize(data.theme)} si nechceš nechať ujsť`,
      urgency: `Teraz je posledná chvíľa pre ${data.product}`
    }
  };
  return map[data.language]?.[data.campaignType] || subset.examples?.[0]?.headline || `${capitalize(data.theme)} a ${data.product}`;
}

function buildBody(data, subset, tone, cta) {
  const paragraphCount = { short: 2, medium: 3, long: 4 }[data.length] || 3;
  const lines = data.language === 'sk'
    ? buildSkBody(data, tone, cta, paragraphCount, subset)
    : buildCzBody(data, tone, cta, paragraphCount, subset);
  return lines.join('\n\n');
}

function buildCzBody(data, tone, cta, paragraphCount, subset) {
  const lines = [
    'Ahoj,',
    `tenhle newsletter stavíme na tématu ${data.theme} a produktu ${data.product}. ${tone} V první větě proto rovnou říkáme, proč to má být pro čtenáře zajímavé právě teď.`,
    data.offer
      ? `Hlavní nabídka je ${data.offer}. Text má být čitelný i pro člověka, který newsletter jen rychle proletí očima, takže benefit i akce držíme hned nahoře.`
      : `Text má být čitelný i pro člověka, který newsletter jen rychle proletí očima, takže benefit držíme hned nahoře a zbytečně ho neutápíme v omáčce.`,
    `Segment ${data.segment || 'odběratelů'} potřebuje jasný důvod k akci. Proto po úvodu krátce rozbalujeme hlavní argument, přidáváme konkrétní motivaci a vedeme čtenáře k jedné hlavní akci: ${cta}.`,
    data.brief?.trim()
      ? `Do draftu je navíc propsaný i tento brief: ${data.brief.trim()}`
      : `Pokud chceš, tenhle draft už můžeš rovnou vzít jako základ do Klaviyo a jen doladit konkrétní produktové detaily.`
  ];
  return lines.slice(0, paragraphCount + 1);
}

function buildSkBody(data, tone, cta, paragraphCount) {
  const lines = [
    'Ahoj,',
    `tento newsletter staviame na téme ${data.theme} a produkte ${data.product}. ${tone} Hneď v prvej vete preto hovoríme, prečo je to pre čitateľa zaujímavé práve teraz.`,
    data.offer
      ? `Hlavná ponuka je ${data.offer}. Text má byť čitateľný aj pre človeka, ktorý newsletter len rýchlo prebehne očami, takže benefit aj akciu držíme úplne hore.`
      : `Text má byť čitateľný aj pre človeka, ktorý newsletter len rýchlo prebehne očami, takže benefit držíme úplne hore a zbytočne ho neutápame v omáčke.`,
    `Segment ${data.segment || 'odberateľov'} potrebuje jasný dôvod k akcii. Preto po úvode krátko rozvíjame hlavný argument, pridávame konkrétnu motiváciu a vedieme čitateľa k jednej hlavnej akcii: ${cta}.`,
    data.brief?.trim()
      ? `Do draftu je navyše zapracovaný aj tento brief: ${data.brief.trim()}`
      : `Ak chceš, tento draft už môžeš rovno použiť ako základ do Klaviyo a len doladiť konkrétne produktové detaily.`
  ];
  return lines.slice(0, paragraphCount + 1);
}

function buildCta(data, subset) {
  if (data.ctaGoal) return data.language === 'sk' ? `Chcem ${data.ctaGoal}` : `Chci ${data.ctaGoal}`;
  if (subset.topCtas?.length) return subset.topCtas[0];
  if (data.offer) return data.language === 'sk' ? 'Využiť ponuku' : 'Využít nabídku';
  return data.language === 'sk' ? 'Zistiť viac' : 'Zjistit víc';
}

function toneSentence(data) {
  const map = {
    cz: {
      direct: 'Jazyk držíme přímý, stručný a akční.',
      warm: 'Jazyk držíme lidský, vstřícný a pořád dost akční.',
      urgent: 'Jazyk držíme napnutý, rychlý a s jasným důvodem jednat hned.',
      educational: 'Jazyk držíme srozumitelný, vysvětlující a praktický.'
    },
    sk: {
      direct: 'Jazyk držíme priamy, stručný a akčný.',
      warm: 'Jazyk držíme ľudský, prívetivý a stále dosť akčný.',
      urgent: 'Jazyk držíme napätý, rýchly a s jasným dôvodom konať hneď.',
      educational: 'Jazyk držíme zrozumiteľný, vysvetľujúci a praktický.'
    }
  };
  return map[data.language]?.[data.tonePreset] || map.cz.direct;
}

function translateType(type, language) {
  const map = {
    cz: { promo: 'promo', education: 'edukační', launch: 'launch', event: 'eventový', urgency: 'urgentní' },
    sk: { promo: 'promo', education: 'edukačný', launch: 'launch', event: 'eventový', urgency: 'urgentný' }
  };
  return map[language]?.[type] || type;
}

function label(key, language) {
  const map = {
    cz: { subject: 'PŘEDMĚT', preheader: 'PREHEADER', headline: 'HEADLINE', cta: 'CTA' },
    sk: { subject: 'PREDMET', preheader: 'PREHEADER', headline: 'HEADLINE', cta: 'CTA' }
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
