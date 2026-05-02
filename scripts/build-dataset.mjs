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
const previews = raw.map((item) => item.previewText).filter(Boolean);
const languages = raw.map((item) => item.language || 'cz');
const types = raw.map((item) => item.campaignType || 'promo');

const unique = (items) => [...new Set(items.filter(Boolean))];
const avg = (items) => items.length ? Math.round(items.reduce((acc, item) => acc + item.length, 0) / items.length) : 0;

const profile = {
  generatedAt: new Date().toISOString(),
  sourceFile: path.relative(root, rawPath),
  campaignCount: raw.length,
  languageBreakdown: countMap(languages),
  campaignTypeBreakdown: countMap(types),
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
    ctaPatterns: ranked(cleanCtas(unique(ctas)), ctas).slice(0, 12)
  },
  commonOffers: ranked(unique(offers), offers).slice(0, 10),
  structure: {
    sections: ['hero', 'reason-to-care', 'offer/details', 'cta'],
    bodyParagraphTarget: Math.max(2, Math.min(4, Math.round(bodyParagraphs.length / Math.max(raw.length, 1))))
  },
  defaults: {
    brands: ['Království tianDe'],
    languages: ['cz', 'sk'],
    lengths: ['short', 'medium', 'long']
  },
  byLanguage: buildLanguageProfiles(raw),
  byCampaignType: buildTypeProfiles(raw),
  examples: raw
    .filter((item) => item.subject && item.template?.headline)
    .slice(0, 18)
    .map((item) => ({
      subject: item.subject,
      headline: item.template.headline,
      previewText: item.previewText || '',
      cta: item.template?.cta || '',
      language: item.language || 'cz',
      campaignType: item.campaignType || 'promo'
    }))
};

await fs.writeFile(outPath, JSON.stringify(profile, null, 2) + '\n');
console.log(`Built dataset from ${raw.length} campaigns -> ${path.relative(root, outPath)}`);

function countMap(values) {
  return Object.fromEntries(ranked(unique(values), values).map((value) => [value, values.filter((item) => item === value).length]));
}

function buildLanguageProfiles(items) {
  return Object.fromEntries(['cz', 'sk'].map((language) => {
    const rows = items.filter((item) => (item.language || 'cz') === language);
    return [language, summarizeSubset(rows)];
  }));
}

function buildTypeProfiles(items) {
  return Object.fromEntries(unique(types).map((type) => {
    const rows = items.filter((item) => (item.campaignType || 'promo') === type);
    return [type, summarizeSubset(rows)];
  }));
}

function summarizeSubset(rows) {
  const subsetSubjects = rows.map((item) => item.subject).filter(Boolean);
  const subsetHeadlines = rows.map((item) => item.template?.headline).filter(Boolean);
  const subsetCtas = rows.flatMap((item) => item.template?.ctas?.length ? item.template.ctas : item.template?.cta ? [item.template.cta] : []);
  const subsetOffers = rows.flatMap((item) => item.offers || []);
  return {
    count: rows.length,
    avgSubjectLength: avg(subsetSubjects),
    avgHeadlineLength: avg(subsetHeadlines),
    topCtas: ranked(cleanCtas(unique(subsetCtas)), subsetCtas).slice(0, 6),
    topOffers: ranked(unique(subsetOffers), subsetOffers).slice(0, 6),
    examples: rows.slice(0, 6).map((item) => ({
      subject: item.subject,
      headline: item.template?.headline || '',
      previewText: item.previewText || '',
      cta: item.template?.cta || ''
    }))
  };
}

function cleanCtas(items) {
  return items
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 40)
    .filter((item) => !/[,.]$/.test(item))
    .filter((item) => !/(nové balíčky|nové balicky|s darčekmi|s dárky|limitované zľavy|limitované slevy)/i.test(item));
}

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
