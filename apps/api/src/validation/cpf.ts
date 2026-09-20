export function normalizeCpf(rawCpf: string): string {
  return rawCpf.replace(/\D/g, '');
}

function calcCheckDigit(digits: number[]): number {
  const weightStart = digits.length + 1;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    sum += digits[i] * (weightStart - i);
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

export function isValidCpf(rawCpf: string): boolean {
  const cpf = normalizeCpf(rawCpf);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // all repeated digits, e.g. 111.111.111-11

  const digits = cpf.split('').map(Number);
  const firstCheck = calcCheckDigit(digits.slice(0, 9));
  const secondCheck = calcCheckDigit(digits.slice(0, 10));

  return firstCheck === digits[9] && secondCheck === digits[10];
}
