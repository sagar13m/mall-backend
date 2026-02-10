// services/matcher.js
const { normalize, tokenOverlapScore } = require("../utils/normalize");

/**
 * Split variations safely (supports multiple delimiters)
 */
function splitVariations(v) {
  if (!v) return [];
  const s = String(v).trim();
  if (!s) return [];

  const delim = s.includes("|") ? "|"
    : s.includes(";") ? ";"
    : s.includes(",") ? ","
    : s.includes("/") ? "/"
    : null;

  const parts = delim ? s.split(delim) : [s];
  return parts.map(x => String(x).trim()).filter(Boolean);
}

/**
 * Build matching candidates for a brand:
 * - brandName + variations
 * - normalized versions precomputed
 */
function buildCandidates(brandRow) {
  const all = [
    brandRow.brandName,
    ...splitVariations(brandRow.variations)
  ]
    .map(x => String(x || "").trim())
    .filter(Boolean);

  return all
    .map(raw => ({ raw, norm: normalize(raw) }))
    .filter(x => x.norm);
}

/**
 * Extra safety rules to avoid false positives for very short brands like "W"
 * - If brand normalized length <= 2 or token count == 1 and token length <= 2:
 *   require store to contain the exact token as a whole word AND also require a stronger score.
 */
function isVeryShortBrand(normBrand) {
  const tokens = normBrand.split(" ").filter(Boolean);
  if (tokens.length === 0) return true;
  if (tokens.length === 1 && tokens[0].length <= 2) return true;
  if (normBrand.length <= 2) return true;
  return false;
}

function hasWholeWord(storeRaw, token) {
  // whole word match (case-insensitive)
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  return re.test(String(storeRaw || ""));
}

/**
 * Main matcher
 * @param {string[]} stores - mall directory store names
 * @param {Array<{brandName:string, productId:string, variations?:string, offlineRedeemUrl?:string}>} brandRows
 * @param {number} threshold - default 70 is reasonable
 */
function matchMall(stores, brandRows, threshold = 70) {
  const storeNorm = (stores || [])
    .map(s => ({ raw: s, norm: normalize(s) }))
    .filter(x => x.norm);

  const results = [];
  const seen = new Set(); // dedupe by productId or brandName

  for (const brand of brandRows) {
    const brandName = String(brand.brandName || "").trim();
    const productId = String(brand.productId || "").trim();
    if (!brandName || !productId) continue;

    const dedupeKey = productId ? `PID#${productId}` : `BN#${brandName.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;

    const candidates = buildCandidates(brand);
    if (!candidates.length) continue;

    let best = { score: 0, matchedStoreName: "", matchedVariant: "" };

    for (const st of storeNorm) {
      for (const cand of candidates) {
        // base score from token overlap
        const score = tokenOverlapScore(st.norm, cand.norm);

        // For very short brands, add stricter checks
        if (isVeryShortBrand(cand.norm)) {
          // require exact whole-word presence of the short token in the raw store name
          const token = cand.norm.split(" ")[0] || cand.norm;
          if (!token || token.length <= 2) {
            if (!hasWholeWord(st.raw, token)) continue;
            // require higher confidence for short brands
            if (score < Math.max(threshold, 85)) continue;
          }
        }

        if (score > best.score) {
          best = {
            score,
            matchedStoreName: st.raw,
            matchedVariant: cand.raw
          };
        }
      }
    }

    if (best.score >= threshold) {
      seen.add(dedupeKey);
      results.push({
        brandName,
        productId,
        matchedStoreName: best.matchedStoreName,
        matchedVariant: best.matchedVariant,
        score: best.score,
        // keep this available if you want it later (job currently doesn't store it)
        offlineRedeemUrl: brand.offlineRedeemUrl || ""
      });
    }
  }

  return results;
}

module.exports = { matchMall };
