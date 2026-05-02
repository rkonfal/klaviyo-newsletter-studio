const profile = await fetch('../data/current/style-profile.json').then((r) => r.json());

const datasetMeta = document.querySelector('#dataset-meta');
const toneList = document.querySelector('#tone-list');
const ctaList = document.querySelector('#cta-list');
const examplesEl = document.querySelector('#examples');
const outputEl = document.querySelector('#output');
const form = document.querySelector('#generator-form');
const copyBtn = document.querySelector('#copy-output');

datasetMeta.innerHTML = `
  <strong>${profile.campaignCount}</strong> kampaní<br />
  <span>Poslední build: ${new Date(profile.generatedAt).toLocaleString('cs-CZ')}</span>
`;
profile.tone.voice.forEach((item) => {
  const li = document.createElement('li');
  li.textContent = item;
  toneList.appendChild(li);
});
profile.tone.ctaPatterns.forEach((item) => {
  const li = document.createElement('li');
  li.textContent = item;
  ctaList.appendChild(li);
});
profile.examples.forEach((example) => {
  const div = document.createElement('div');
  div.className = 'example';
  div.innerHTML = `<strong>${example.subject}</strong><p>${example.headline}</p>`;
  examplesEl.appendChild(div);
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(form).entries());
  const cta = buildCta(data);
  const subject = buildSubject(data);
  const preheader = buildPreheader(data);
  const headline = buildHeadline(data);
  const body = buildBody(data);

  outputEl.classList.remove('empty');
  outputEl.textContent = [
    `PŘEDMĚT: ${subject}`,
    `PREHEADER: ${preheader}`,
    '',
    `HEADLINE: ${headline}`,
    '',
    body,
    '',
    `CTA: ${cta}`
  ].join('\n');
});

copyBtn.addEventListener('click', async () => {
  if (!outputEl.textContent.trim()) return;
  await navigator.clipboard.writeText(outputEl.textContent);
  copyBtn.textContent = 'Zkopírováno';
  setTimeout(() => (copyBtn.textContent = 'Kopírovat'), 1500);
});

function buildSubject(data) {
  const starters = {
    promo: `Teď je správná chvíle pro ${data.product}`,
    education: `${capitalize(data.theme)} jednoduše a srozumitelně`,
    launch: `Novinka: ${data.product}`,
    reactivation: `${data.product} ti možná zbytečně uniká`
  };
  return starters[data.campaignType] || `${capitalize(data.theme)} | ${data.product}`;
}

function buildPreheader(data) {
  const offer = data.offer ? `${data.offer}. ` : '';
  return `${offer}Pro segment ${data.segment || 'odběratelů'} jsme připravili stručný a akční newsletter.`;
}

function buildHeadline(data) {
  const base = {
    promo: `${capitalize(data.product)} právě dává největší smysl`,
    education: `${capitalize(data.theme)} bez zbytečné složitosti`,
    launch: `Seznam se s ${data.product}`,
    reactivation: `Možná je čas vrátit ${data.product} zpět do hry`
  };
  return base[data.campaignType] || `${capitalize(data.theme)} a ${data.product}`;
}

function buildBody(data) {
  const segment = data.segment || 'tvoje publikum';
  const offerSentence = data.offer ? `Právě teď navíc platí ${data.offer}.` : 'Tentokrát stavíme hlavně na jasném benefitu a jednoduchém sdělení.';
  const brief = data.brief?.trim() ? `\n\nDo draftu jsme propsali i tento brief: ${data.brief.trim()}` : '';

  return [
    `Ahoj,`,
    '',
    `připravili jsme newsletter k tématu ${data.theme}, jehož hlavní fokus je ${data.product}. Cílem je oslovit segment ${segment} jazykem, který je přímý, srozumitelný a rychle vysvětlí, proč má tahle zpráva smysl právě teď.`,
    '',
    `${offerSentence} V úvodu proto rovnou říkáme hlavní benefit, potom krátce rozvíjíme důvod, proč se o nabídku zajímat, a nakonec vedeme čtenáře k jedné jasné akci.`,
    '',
    `Pokud hledáš jednoduchý první draft, tenhle text už můžeš rovnou vzít, upravit podle konkrétních produktových detailů a poslat dál do Klaviyo.${brief}`,
    '',
    `Měj se krásně`
  ].join('\n');
}

function buildCta(data) {
  if (data.ctaGoal) return `Chci ${data.ctaGoal}`;
  if (data.offer) return 'Využít nabídku';
  return 'Zjistit víc';
}

function capitalize(value = '') {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}
