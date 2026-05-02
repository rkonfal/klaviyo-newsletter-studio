import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const primaryRawPath = path.join(root, 'data/raw/campaigns.json');
const sampleRawPath = path.join(root, 'data/raw/campaigns.sample.json');
const outPath = path.join(root, 'data/current/style-profile.json');

const rawPath = await exists(primaryRawPath) ? primaryRawPath : sampleRawPath;
const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));

const subjects = raw.map((item) => item.subject).filter(Boolean);
const headlines = raw.map((item) => item.template?.headline).filter(Boolean);
const bodyParagraphs = raw.flatMap((item) => item.template?.body || []);
const ctas = raw
  .flatMap((item) => item.template?.ctas?.length ? item.template.ctas : item.template?.cta ? [item.template.cta] : [])
  .filter(Boolean);
const offers = raw.flatMap((item) => item.offers || []);
const segments = raw.flatMap((item) => item.segments || []);
const previews = raw.map((item) => item.previewText).filter(Boolean);

const unique = (items) => [...new Set(items.filter(Boolean))];
const avg = (items) => items.length ? Math.round(items.reduce((acc, item) => acc + item.length, 0) / items.length) : 0;

const profile = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.relative(root, rawPath),
  campaignCount: raw.length,
  tone: {
    voice: [
      avg(subjects) <= 45 ? 'kratší subject lines' : 'delší subject lines',
      avg(previews) <= 70 ? 'stručné preview texty' : 'rozvinutější preview texty',
      avg(bodyParagraphs) <= 180 ? 'kratší odstavce' : 'delší odstavce',
      'benefit-first'
    ],
    headlinePatterns: [
      `průměrná délka předmětu ${avg(subjects)} znaků`,
      `průměrná délka headline ${avg(headlines)} znaků`,
      'headline s rychlým příslibem nebo výsledkem'
    ],
    ctaPatterns: unique(ctas).slice(0, 12)
  },
  commonOffers: ranked(unique(offers), offers).slice(0, 10),
  commonSegments: ranked(unique(segments), segments).filter((item) => !/^[A-Za-z0-9]{5,}$/.test(item)).slice(0, 10),
  structure: {
    sections: ['hero', 'reason-to-care', 'offer/details', 'cta'],
    bodyParagraphTarget: Math.max(2, Math.min(4, Math.round(bodyParagraphs.length / Math.max(raw.length, 1))))
  },
  examples: raw
    .filter((item) => item.subject && item.template?.headline)
    .slice(0, 12)
    .map((item) => ({
      subject: item.subject,
      headline: item.template.headline,
      previewText: item.previewText || '',
      cta: item.template?.cta || ''
    }))
};

await fs.writeFile(outPath, JSON.stringify(profile, null, 2) + '\n');
console.log(`Built dataset from ${raw.length} campaigns -> ${path.relative(root, outPath)}`);

function ranked(values, all) {
  const counts = new Map();
  for (const item of all) counts.set(item, (counts.get(item) || 0) + 1);
  return values.sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0));
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
