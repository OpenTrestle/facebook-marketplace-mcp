// Pure, read-only price-change analysis for exact consecutive saved snapshots.
// Marketplace prices are user-provided asking prices, not verified transaction values.
export type PriceSnapshotListing = {
  id: string;
  title: string;
  price: string;
  url: string;
  kind: string;
  location: string;
  distanceStatus?: string;
};

export type PriceDrop = {
  id: string;
  title: string;
  oldPrice: string;
  newPrice: string;
  oldPriceValue: number;
  newPriceValue: number;
  decrease: number;
  percentDecrease: number;
  url: string;
  kind: string;
  location: string;
  distanceStatus: string;
};

export function parseAskingPrice(price: string): number | null {
  if (typeof price !== "string" || /free|trade|obo|contact|call for|each/i.test(price)) return null;
  const match = price.replace(/,/g, "").trim().match(/^\$\s*(\d+(?:\.\d{1,2})?)$/);
  const value = match ? Number(match[1]) : NaN;
  // Exclude $0 and $1 placeholders; do not auto-promote them as bargains.
  return Number.isFinite(value) && value > 1 ? value : null;
}

export function detectPriceDrops(
  previous: readonly PriceSnapshotListing[] | null,
  current: readonly PriceSnapshotListing[],
): PriceDrop[] | null {
  if (previous === null) return null;
  const byId = new Map(previous.map((item) => [item.id, item]));
  return current.flatMap((item): PriceDrop[] => {
    const prior = byId.get(item.id);
    if (!prior || item.kind !== prior.kind) return [];
    const before = parseAskingPrice(prior.price);
    const after = parseAskingPrice(item.price);
    if (before === null || after === null || after >= before) return [];
    return [{
      id: item.id,
      title: item.title,
      oldPrice: prior.price,
      newPrice: item.price,
      oldPriceValue: before,
      newPriceValue: after,
      decrease: Math.round((before - after) * 100) / 100,
      percentDecrease: Math.round((before - after) / before * 1000) / 10,
      url: item.url,
      kind: item.kind,
      location: item.location,
      distanceStatus: item.distanceStatus ?? "unverified",
    }];
  }).sort((a, b) => b.decrease - a.decrease || a.title.localeCompare(b.title));
}
