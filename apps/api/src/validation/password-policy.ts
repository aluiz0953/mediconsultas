const MIN_LENGTH = 10;

export function isStrongPassword(password: string): boolean {
  if (password.length < MIN_LENGTH) return false;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  return hasLower && hasUpper && hasDigit && hasSpecial;
}
