import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const rawPath = path.join(root, 'data/raw/campaigns.sample.json');
const outPath = path.join(root, 'data/current/style-profile.json');

const raw = JSON.parse(await fs.readFile(rawPath, 'utf8'));
const subjects = raw.map((item) => item.subject).filter(Boolean);
const headlines = raw.map((item) => item.template?.headline).filter(Boolean);
const ctas = raw.map((item) => item.template?.cta).filter(Boolean);
const offers = raw.flatMap((item) => item.offers || []);
const segments = raw.flatMap((item) => item.segments || []);

const unique = (items) => [...new Set(items)];

const profile = {
  generatedAt: new Date().toISOString(),
  campaignCount: raw.length,
  tone: {
    voice: [
      'srozumitelný',
      'přímý',
      'benefit-first',
      raw.length > 20 ? 'ověřený z větší historie' : 'první odhad z MVP datasetu'
    ],
    headlinePatterns: [
      `průměrná délka předmětu ${Math.round(subjects.reduce((acc, item) => acc + item.length, 0) / Math.max(subjects.length, 1))} znaků`,
      'headline s rychlým příslibem nebo výsledkem'
    ],
    ctaPatterns: unique(ctas).slice(0, 6)
  },
  commonOffers: unique(offers).slice(0, 8),
  commonSegments: unique(segments).slice(0, 8),
  structure: {
    sections: ['hero', 'reason-to-care', 'offer/details', 'cta'],
    bodyParagraphTarget: 2
  },
  examples: subjects.slice(0, 8).map((subject, index) => ({
    subject,
    headline: headlines[index] || ''
  }))
};

await fs.writeFile(outPath, JSON.stringify(profile, null, 2) + '\n');
console.log(`Built dataset from ${raw.length} campaigns -> ${path.relative(root, outPath)}`);
