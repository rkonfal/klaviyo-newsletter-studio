import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const workspaceRoot = path.resolve(root, '..');
const snapshotsRoot = path.join(workspaceRoot, 'reporting-v2', 'data', 'snapshots');
const outPath = path.join(root, 'data', 'current', 'product-catalog.json');

const snapshotDir = await findLatestSnapshotDir(snapshotsRoot);
if (!snapshotDir) {
  throw new Error(`No reporting-v2 snapshot found in ${snapshotsRoot}`);
}

const combinedIndexPath = path.join(snapshotDir, 'combined_product_index.json');
const wpjProductsPath = path.join(snapshotDir, 'wpj_products.json');

const combinedIndex = JSON.parse(await fs.readFile(combinedIndexPath, 'utf8'));
const wpjProducts = JSON.parse(await fs.readFile(wpjProductsPath, 'utf8'));

const wpjByCode = new Map((wpjProducts.items || []).map((item) => [normalizeCode(item.code), item]));

const items = (combinedIndex.items || [])
  .map((item) => normalizeProduct(item, wpjByCode.get(normalizeCode(item.code))))
  .sort((a, b) => a.title.localeCompare(b.title, 'cs'));

const catalog = {
  generatedAt: new Date().toISOString(),
  source: {
    snapshotDir: path.relative(root, snapshotDir),
    combinedIndex: path.relative(root, combinedIndexPath),
    wpjProducts: path.relative(root, wpjProductsPath)
  },
  counts: {
    total: items.length,
    visible: items.filter((item) => item.visible).length,
    hidden: items.filter((item) => !item.visible).length,
    withPrice: items.filter((item) => item.price?.withVat != null).length,
    withEan: items.filter((item) => !!item.ean).length
  },
  items
};

await fs.writeFile(outPath, JSON.stringify(catalog, null, 2) + '\n');
console.log(`Built product catalog with ${items.length} items -> ${path.relative(root, outPath)}`);

function normalizeProduct(item, wpjFallback = {}) {
  const wpj = item.wpj || {};
  const fourpx = item.fourpx || {};
  const stores = Array.isArray(wpj.stores) ? wpj.stores.map((store) => ({
    id: store.storeId,
    name: store.storeName,
    stock: numberOrNull(store.inStore)
  })) : Array.isArray(wpjFallback.stores) ? wpjFallback.stores.map((store) => ({
    id: store.storeId,
    name: store.storeName,
    stock: numberOrNull(store.inStore)
  })) : [];

  const sourceCodes = unique([
    ...(Array.isArray(fourpx.sourceCodes) ? fourpx.sourceCodes : []),
    ...(Array.isArray(fourpx.cz?.sourceCodes) ? fourpx.cz.sourceCodes : []),
    ...(Array.isArray(fourpx.sk?.sourceCodes) ? fourpx.sk.sourceCodes : [])
  ]).map(normalizeCode).filter(Boolean);

  return {
    code: normalizeCode(item.code),
    title: cleanText(item.title),
    slug: extractSlug(item.url),
    url: item.url || null,
    visible: Boolean(item.visible),
    ean: cleanText(item.ean) || null,
    flags: unique((item.flags || []).map(cleanText).filter(Boolean)),
    price: {
      withVat: numberOrNull(wpj.priceWithVat ?? wpjFallback.price?.withVat ?? wpjFallback.price?.value),
      currency: wpjFallback.price?.currency || 'CZK'
    },
    stock: {
      wpjInStore: numberOrNull(wpj.inStore ?? wpjFallback.inStore),
      fourpxStoreTotal: numberOrNull(wpj.fourpxStoreTotal),
      fourpxAvailableTotal: numberOrNull(fourpx.availableTotal),
      stockDelta: numberOrNull(item.stockDelta),
      stores,
      fourpx: {
        czAvailable: numberOrNull(fourpx.cz?.availableStock),
        skAvailable: numberOrNull(fourpx.sk?.availableStock),
        czOnway: numberOrNull(fourpx.cz?.onwayStock),
        skOnway: numberOrNull(fourpx.sk?.onwayStock)
      }
    },
    sales: {
      yesterdayUnits: numberOrNull(item.yesterdaySales?.units),
      yesterdayRevenueWithVat: numberOrNull(item.yesterdaySales?.revenueWithVat),
      yesterdayOutboundShipments: numberOrNull(item.yesterdayOutbound?.shipments)
    },
    sourceCodes,
    search: buildSearchTokens(item, wpjFallback, sourceCodes)
  };
}

function buildSearchTokens(item, wpjFallback, sourceCodes) {
  return unique([
    item.title,
    item.code,
    item.ean,
    extractSlug(item.url),
    ...sourceCodes,
    ...(Array.isArray(item.flags) ? item.flags : []),
    ...(Array.isArray(wpjFallback.stores) ? wpjFallback.stores.map((store) => store.storeName) : [])
  ].map(cleanText).filter(Boolean));
}

function extractSlug(url = '') {
  const cleaned = cleanText(url);
  if (!cleaned) return null;
  const match = cleaned.match(/\/([^/?#]+)\/?$/);
  return match ? match[1] : null;
}

function normalizeCode(value) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function numberOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

async function findLatestSnapshotDir(baseDir) {
  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const dir of dirs) {
    const full = path.join(baseDir, dir);
    try {
      await fs.access(path.join(full, 'combined_product_index.json'));
      await fs.access(path.join(full, 'wpj_products.json'));
      return full;
    } catch {}
  }
  return null;
}
