// Travel (STOP-GAP: credit-priced launch permits; final travel design is still open).
export const PERMIT_PRICE = { 1: 50, 2: 300, 3: 900, 4: 2000 };

export function permitPrice(meta) {
  return PERMIT_PRICE[Math.min(4, meta.tier)] || 2000;
}

// Shop economy (tune with playtesting).
export const SELL_RATE = { resource: 1.0, tool: 0.4, weapon: 0.4, armor: 0.4 };

export function shopStockTiers(meta) {
  // Tool metals up to the planet's tier (max 3 in M1).
  return Math.min(3, meta.tier);
}
