// utils/normalize.js

// Words that don't help brand identification
// Remove mall/location/noise words
const STOPWORDS = new Set([
  "mall",
  "store",
  "exclusive",
  "outlet",
  "world",
  "shop",
  "showroom",
  "the",
  "and",
  "co",
  "company",
  "pvt",
  "ltd",
  "limited",
  "india",
  "shopping",
  "centre",
  "center",
  "plaza",
  "complex",
  "city",
  "road",
  "floor",
  "level",
  "unit"
]);

/**
 * Normalize text:
 * - lowercase
 * - remove punctuation
 * - remove stopwords
 * - collapse spaces
 */
function normalize(str = "") {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // remove punctuation
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/**
 * Token overlap similarity score (0-100)
 * Works well for store name variations:
 * e.g. "Titan World Orion Mall" vs "Titan"
 */
function tokenOverlapScore(a, b) {
  const A = new Set(normalize(a).split(" ").filter(Boolean));
  const B = new Set(normalize(b).split(" ").filter(Boolean));

  if (!A.size || !B.size) return 0;

  let common = 0;
  for (const t of A) {
    if (B.has(t)) common++;
  }

  return Math.round((2 * common / (A.size + B.size)) * 100);
}

module.exports = {
  normalize,
  tokenOverlapScore
};
