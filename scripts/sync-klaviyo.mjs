import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.KLAVIYO_API_KEY;
if (!apiKey) {
  console.error('Missing KLAVIYO_API_KEY');
  process.exit(1);
}

const root = process.cwd();
const outPath = path.join(root, 'data/raw/campaigns.sample.json');
const revision = '2024-10-15';

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: 'application/json',
      Revision: revision
    }
  });

  if (!response.ok) {
    throw new Error(`Klaviyo API ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

const campaignsResponse = await fetchJson('https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,\"email\")&page[size]=50');
const campaigns = campaignsResponse.data || [];

const normalized = campaigns.map((campaign) => ({
  id: campaign.id,
  name: campaign.attributes?.name,
  subject: campaign.attributes?.message || campaign.attributes?.name,
  previewText: campaign.attributes?.preview_text || '',
  sentAt: campaign.attributes?.send_time || null,
  template: {
    headline: campaign.attributes?.name || '',
    body: [campaign.attributes?.message || ''],
    cta: 'Zjistit víc'
  },
  offers: [],
  segments: []
}));

await fs.writeFile(outPath, JSON.stringify(normalized, null, 2) + '\n');
console.log(`Synced ${normalized.length} campaigns to ${path.relative(root, outPath)}`);
