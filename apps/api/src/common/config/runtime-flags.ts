export function isRuntimeFlagEnabled(
  name: string,
  defaultValue = true,
): boolean {
  const value = process.env[name];

  if (value === undefined || value.trim() === '') {
    return defaultValue;
  }

  return value.trim().toLowerCase() === 'true';
}
