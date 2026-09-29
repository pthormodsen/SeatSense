export const stableHash = (input: string) => {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

export const hashToRange = (seed: string, min: number, max: number) => {
  const span = max - min + 1;
  return min + (stableHash(seed) % span);
};

export const hashToBoolean = (seed: string, truePercent: number) =>
  stableHash(seed) % 100 < truePercent;

export const pickFromHash = <T,>(seed: string, values: T[]) =>
  values[stableHash(seed) % values.length];

export const slugifyDemoId = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'mazemap-room';
