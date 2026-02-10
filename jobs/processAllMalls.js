require("dotenv").config();

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parse } = require("csv-parse/sync");

const { matchMall } = require("../services/matcher");
const { putMallMeta } = require("../services/writer"); // ✅ only META writer (one record per mall)

function normKey(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildMallKey(mall) {
  // One record per mall key (stable + deterministic)
  return `${normKey(mall.Name)}|${normKey(mall.City)}|${normKey(mall.State)}`;
}

// ---- CSV column auto-detection ----
function pickColumn(row, candidates) {
  if (!row) return "";
  const keys = Object.keys(row);
  const lowerMap = new Map(keys.map(k => [k.toLowerCase().trim(), k]));

  // exact key match
  for (const c of candidates) {
    const found = lowerMap.get(c.toLowerCase());
    if (found && row[found] != null && String(row[found]).trim() !== "") return row[found];
  }

  // contains match fallback
  for (const k of keys) {
    const lk = k.toLowerCase();
    for (const c of candidates) {
      if (lk.includes(c.toLowerCase())) {
        const v = row[k];
        if (v != null && String(v).trim() !== "") return v;
      }
    }
  }

  return "";
}

function stableIdFromName(name) {
  // Deterministic productId derived from brand name (no external data)
  return crypto
    .createHash("sha1")
    .update(String(name || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 12);
}

function mapBrandRow(row) {
  // Your CSV headers are: name, offline_redeemurl
  // but we keep detection for other datasets too.
  const brandName = pickColumn(row, [
    "name", "brandname", "brand_name", "brand", "productname", "product_name", "title"
  ]);

  // If CSV does not contain productId, generate one from brandName
  const productIdFromCsv = pickColumn(row, [
    "productid", "product_id", "product id", "id", "pid"
  ]);

  const variations = pickColumn(row, [
    "variations", "variation", "known variations", "aliases", "alias", "synonyms"
  ]);

  const offlineRedeemUrl = pickColumn(row, [
    "offline_redeemurl", "offline redeem url", "redeemurl", "redeem_url", "url"
  ]);

  const bn = String(brandName || "").trim();
  const pid = String(productIdFromCsv || "").trim() || (bn ? stableIdFromName(bn) : "");

  return {
    brandName: bn,
    productId: pid,
    variations: String(variations || "").trim(),
    offlineRedeemUrl: String(offlineRedeemUrl || "").trim()
  };
}

async function run() {
  const mallsPath = path.join(__dirname, "1252_malls_final (2).json");
  const brandsPath = path.join(__dirname, "Offlinedump-new(Sheet1).csv");

  const malls = JSON.parse(fs.readFileSync(mallsPath, "utf8"));
  const csvText = fs.readFileSync(brandsPath, "utf8");

  const rawBrands = parse(csvText, { columns: true, skip_empty_lines: true });

  // Debug (prints once)
  console.log("CSV rows:", rawBrands.length);
  console.log("CSV headers:", rawBrands[0] ? Object.keys(rawBrands[0]) : "NO ROWS");
  console.log("First mall store sample:", malls[0]?.directory?.slice(0, 10));

  const brandRows = rawBrands
    .map(mapBrandRow)
    .filter(b => b.brandName && b.productId);

  console.log("Mapped brandRows:", brandRows.length);
  console.log("Mapped first brandRow:", brandRows[0]);

  if (!brandRows.length) {
    throw new Error(
      "No brands mapped from CSV. Your CSV must include at least 'name'. " +
      "Current headers printed above."
    );
  }

  const threshold = Number(process.env.MATCH_THRESHOLD || 70);

  let saved = 0;
  let skipped = 0;

  for (const mall of malls) {
    const stores = Array.isArray(mall.directory) ? mall.directory : [];
    if (!stores.length) {
      skipped++;
      continue;
    }

    const mallKey = buildMallKey(mall);

    // Find brand matches in this mall
    const matches = matchMall(stores, brandRows, threshold);

    // Skip malls with no brands (as per brief) :contentReference[oaicite:1]{index=1}
    if (!matches.length) {
      skipped++;
      continue;
    }

    // Save ONE record per mall with products list (expected format) :contentReference[oaicite:2]{index=2}
    await putMallMeta({
      mallKey,
      mall,
      products: matches.map(m => ({
        brandName: m.brandName,
        productId: String(m.productId),
        storeName: m.matchedStoreName // <-- store name where found
      }))
    });

    saved++;
  }

  console.log(`Done. saved=${saved} skipped=${skipped} total=${malls.length} threshold=${threshold}`);
}

run().catch(err => {
  console.error("Job failed:", err);
  process.exit(1);
});
