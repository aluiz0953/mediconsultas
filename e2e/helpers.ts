// Mirrors the check-digit algorithm in apps/api/src/validation/cpf.ts so the
// E2E suite can generate fresh, valid, unique CPFs against a persistent
// Postgres database (unlike the unit tests, nothing here gets reset between runs).
function checkDigit(digits: number[]): number {
  const weightStart = digits.length + 1;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits[i] * (weightStart - i);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function generateValidCpf(): string {
  let base: number[];
  do {
    base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  } while (base.every((d) => d === base[0])); // all-repeated-digit CPFs are rejected as invalid

  const d1 = checkDigit(base);
  const d2 = checkDigit([...base, d1]);
  return [...base, d1, d2].join('');
}

export function uniqueSuffix(): string {
  return `${Date.now()}${Math.floor(Math.random() * 1000)}`;
}
