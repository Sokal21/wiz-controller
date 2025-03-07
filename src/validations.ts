import { z } from 'zod';

export const MAC_ADDRESS_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;

/**
 * Regular expression to validate usernames.
 *
 * Usernames are used for naming policies, which restrict characters to the pattern [^\w+=,.@-].
 * To avoid restricting usernames from different countries, we allow Unicode characters, Unicode numbers, as well as '.' and '@'.
 * This regular expression ensures that only Unicode letters, numbers, '.' and '@' are allowed.
 *
 * For normalization, we replace Unicode characters with their canonical equivalents.
 * Refer to the function `normalizeUsernameForPolicy` in `mqtt.ts` for more details.
 *
 * This is the cognito restriction pattern: /^[\p{L}\p{M}\p{S}\p{N}\p{P}\S*]+$/u;
 *
 * expected when we moved utf8 to unicode in db schema
 * export const USERNAME_REGEX = /^[\p{L}\p{N}@.]+$/u;
 *
 * meanwhile, only ascii letters and numbers
 */
export const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;

/**
 * Validations
 */
export const isValidEmail = (value: string) => {
  const result = z.string().email().safeParse(value);

  return result.success;
};

export const macAddressSchema = z.string().regex(MAC_ADDRESS_REGEX);

export const isValidMACAddress = (value: string): boolean => {
  return macAddressSchema.safeParse(value).success;
};

/**
 * assertions
 */
export function validateNotNil<T> (value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new TypeError('Value is nil');
  }
}

export function validateString (value: unknown): asserts value is string {
  if (!z.string().safeParse(value).success) {
    throw new Error('Value is not a string');
  }
}

export function validateNumber (value: unknown): asserts value is number {
  validateNotNil(value);

  if (!z.number().safeParse(value).success) {
    throw new Error('Value is not a number');
  }
}

export function validateDate (value: unknown): asserts value is Date {
  validateNotNil(value);

  if (!z.date().safeParse(value).success) {
    throw new Error('Value is not a date');
  }
}

export function validateArray (value: unknown): asserts value is Array<unknown> {
  validateNotNil<unknown>(value);

  if (!z.array(z.any()).safeParse(value).success) {
    throw new Error('Value is not an array');
  }
}

export function validateNonEmptyObject (value: unknown): asserts value is Record<string, unknown> {
  validateNotNil(value);

  if (typeof value !== 'object') {
    throw new TypeError('Value is not an object');
  }

  if (Object.keys(value as object).length === 0) {
    throw new TypeError('Value is an empty object');
  }
}

export function validateObjectKey<T extends object> (obj: T, key: string): asserts obj is T {
  validateNonEmptyObject(obj);

  if (!(key in obj)) {
    throw new TypeError(`Missing key ${String(key)}`);
  }
}

export const validateMACAddress = (value: unknown): asserts value is string => {
  validateString(value);

  if (!macAddressSchema.safeParse(value).success) {
    throw new Error('Value is not a MAC Address');
  }
};
export function assertUnreachable (message: string, value: never): never {
  throw new Error(`${message} ${value as string}`);
}
