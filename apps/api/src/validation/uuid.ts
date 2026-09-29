const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Path ids reach uuid columns; a malformed one would surface as a database
// error (500) instead of a plain "not found".
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}
