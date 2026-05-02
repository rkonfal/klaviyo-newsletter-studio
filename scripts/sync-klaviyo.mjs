import fs from 'node:fs/promises';
import path from 'node:path';

const apiKey = process.env.KLAVIYO_API_KEY;
if (!apiKey) {
  console.error('Missing KLAVIYO_API_KEY');
  process.exit(1);
}

const root = process.cwd();
const outPath = path.join(root, 'data/raw/campaigns.json');
const revision = '2024-10-15';
const maxCampaigns = Number(process.env.KLAVIYO_SYNC_LIMIT || 150);

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

async function fetchAllCampaigns() {
  let url = 'https://a.klaviyo.com/api/campaigns?filter=equals(messages.channel,%22email%22)';
  const rows = [];

  while (url && rows.length < maxCampaigns) {
    const json = await fetchJson(url);
    rows.push(...(json.data || []));
    url = json.links?.next || null;
  }

  return rows.slice(0, maxCampaigns);
}

function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, '\n')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{2,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractLinkTexts(html = '') {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => stripHtml(match[1]))
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 60)
    .filter((item) => !/^https?:/i.test(item))
    .filter((item) => !/@/.test(item))
    .filter((item) => !/^\+?[0-9 ()-]{7,}$/.test(item))
    .filter((item) => !/(ochrana osobních údajů|ochrana osobnych údajov|privacy|unsubscribe|odhlásit|odhlásiť|manage preferences|zobrazit v prohlížeči|zobraziť v prehliadači)/i.test(item))
    .filter((item) => /[A-Za-zÁ-ž]/.test(item));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function firstMeaningfulLine(text = '') {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8)
    .find((line) => line.length <= 120) || '';
}

function extractBody(text = '') {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 40)
    .slice(0, 3);
}

function extractOffers(text = '') {
  const lower = text.toLowerCase();
  const offers = [];
  if (/(sleva|zľava|discount|akce|akcia)/i.test(lower)) offers.push('promo');
  if (/(jen dnes|jen do|iba do|poslední šance|končí|končí dnes)/i.test(lower)) offers.push('urgency');
  if (/%/.test(text)) offers.push('percent-off');
  if (/(dárek|darček|gift)/i.test(lower)) offers.push('gift');
  if (/(novinka|new|launch)/i.test(lower)) offers.push('launch');
  if (/(tip|návod|routine|krok)/i.test(lower)) offers.push('education');
  return unique(offers);
}

async function fetchCampaignMessage(campaignId) {
  const json = await fetchJson(`https://a.klaviyo.com/api/campaigns/${campaignId}/campaign-messages/`);
  return (json.data || []).find((item) => item.attributes?.channel === 'email') || null;
}

async function fetchTemplate(templateId) {
  if (!templateId) return null;
  const json = await fetchJson(`https://a.klaviyo.com/api/templates/${templateId}`);
  return json.data || null;
}

const campaigns = await fetchAllCampaigns();
const normalized = [];

for (const campaign of campaigns) {
  const message = await fetchCampaignMessage(campaign.id);
  const templateId = message?.relationships?.template?.data?.id || null;
  const template = await fetchTemplate(templateId);
  const html = template?.attributes?.html || '';
  const text = stripHtml(html);
  const ctas = unique(extractLinkTexts(html)).slice(0, 8);

  normalized.push({
    id: campaign.id,
    name: campaign.attributes?.name || '',
    status: campaign.attributes?.status || '',
    subject: message?.attributes?.content?.subject || campaign.attributes?.name || '',
    previewText: message?.attributes?.content?.preview_text || '',
    sentAt: campaign.attributes?.send_time || campaign.attributes?.scheduled_at || null,
    segments: [],
    template: {
      id: templateId,
      name: template?.attributes?.name || '',
      editorType: template?.attributes?.editor_type || '',
      headline: firstMeaningfulLine(text),
      body: extractBody(text),
      cta: ctas[0] || 'Zjistit víc',
      ctas,
      text
    },
    offers: extractOffers(`${message?.attributes?.content?.subject || ''}\n${message?.attributes?.content?.preview_text || ''}\n${text}`)
  });
}

await fs.writeFile(outPath, JSON.stringify(normalized, null, 2) + '\n');
console.log(`Synced ${normalized.length} campaigns to ${path.relative(root, outPath)}`);
