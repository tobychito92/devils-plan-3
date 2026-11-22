export const roomGames = {
  13: {size: 2}, 15: {size: 2}, 21: {size: 5, min: 2}, 28: {size: 2},
  30: {size: 2}, 31: {size: 2, max: 4, race: true},
  33: {size: 2, max: 4, race: true}, 34: {size: 2, max: 4, race: true},
  36: {size: 2, max: 4, race: true}, 37: {size: 7, min: 2},
  42: {size: 2, max: 4, race: true}, 44: {size: 2, max: 4, race: true},
  48: {size: 2, max: 4}
};
export function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
