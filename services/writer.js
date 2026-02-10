// services/writer.js
const { PutCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb } = require("../ddb"); // keep your same import path

const TABLE = process.env.DDB_TABLE;

/**
 * Saves ONE record per mall (META item) with the expected structure:
 * - mallName, city, state
 * - products: [{ brandName, productId, storeName }]
 *
 * This matches the brief's expected output format. :contentReference[oaicite:1]{index=1}
 */
async function putMallMeta({ mallKey, mall, products }) {
  if (!TABLE) throw new Error("Missing env DDB_TABLE");
  if (!mallKey) throw new Error("Missing mallKey");
  if (!mall) throw new Error("Missing mall");

  // Enforce "Each record must have at least one product"
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error(`Refusing to save mall=${mall?.Name} because products[] is empty`);
  }

  // Deduplicate products by productId (or brandName fallback)
  const dedup = new Map();
  for (const p of products) {
    const pid = p?.productId ? String(p.productId) : "";
    const bn = p?.brandName ? String(p.brandName) : "";
    const key = pid ? `PID#${pid}` : `BN#${bn.toLowerCase()}`;
    if (!dedup.has(key)) dedup.set(key, p);
  }
  const uniqueProducts = [...dedup.values()];

  const now = new Date().toISOString();

  const item = {
    pk: `MALL#${mallKey}`,
    sk: "META",
    mallName: mall.Name,
    city: mall.City,
    state: mall.State,

    // Optional (not required by brief, but safe to keep if you want)
    // url: mall.URL,

    products: uniqueProducts.map(p => ({
      brandName: String(p.brandName || "").trim(),
      productId: String(p.productId || "").trim(),
      storeName: String(p.storeName || "").trim()
    })),

    createdAt: now
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

module.exports = { putMallMeta };
