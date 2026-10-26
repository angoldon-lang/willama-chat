export type ScanCategory =
  | 'email'
  | 'phone'
  | 'iban'
  | 'creditCard'
  | 'fiscalCode'
  | 'ipAddress'
  | 'apiKey';

export type ScanCounts = Record<ScanCategory, number>;

export type SizeBucket = 'xs' | 's' | 'm' | 'l' | 'xl';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?<![\w.])(?:\+|00)\d{1,3}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4}){2,3}(?!\w)|(?<![\w.])3\d{2}[\s.-]?\d{6,7}(?!\w)/g;
const IBAN = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}(?:\s?[A-Z0-9]{1,4})?\b/g;
const CARD = /\b(?:\d[ -]?){13,19}\b/g;
const FISCAL_CODE = /\b[A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z]\b/gi;
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const API_KEY =
  /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35})\b/g;

export function emptyCounts(): ScanCounts {
  return {
    email: 0,
    phone: 0,
    iban: 0,
    creditCard: 0,
    fiscalCode: 0,
    ipAddress: 0,
    apiKey: 0,
  };
}

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) {
        n -= 9;
      }
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function ibanValid(raw: string): boolean {
  const iban = raw.replace(/\s/g, '').toUpperCase();
  if (iban.length < 15 || iban.length > 34) {
    return false;
  }
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const value = char >= 'A' ? char.charCodeAt(0) - 55 : char.charCodeAt(0) - 48;
    remainder = Number(`${remainder}${value}`) % 97;
  }
  return remainder === 1;
}

function countMatches(text: string, pattern: RegExp, accept?: (match: string) => boolean): number {
  let count = 0;
  for (const match of text.matchAll(pattern)) {
    if (!accept || accept(match[0])) {
      count++;
    }
  }
  return count;
}

/**
 * Counts sensitive-data patterns in `text`. Returns only numbers: the matched
 * values are never retained, so the result is safe to aggregate anonymously.
 */
export function scanText(text: string): ScanCounts {
  const counts = emptyCounts();
  if (!text) {
    return counts;
  }
  counts.email = countMatches(text, EMAIL);
  counts.iban = countMatches(text, IBAN, ibanValid);
  counts.creditCard = countMatches(text, CARD, (m) => {
    const digits = m.replace(/[ -]/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhn(digits);
  });
  counts.fiscalCode = countMatches(text, FISCAL_CODE);
  counts.ipAddress = countMatches(text, IPV4);
  counts.apiKey = countMatches(text, API_KEY);
  counts.phone = countMatches(text, PHONE);
  return counts;
}

export function totalFlags(counts: ScanCounts): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function sizeBucket(chars: number): SizeBucket {
  if (chars < 200) {
    return 'xs';
  }
  if (chars < 1000) {
    return 's';
  }
  if (chars < 5000) {
    return 'm';
  }
  if (chars < 20000) {
    return 'l';
  }
  return 'xl';
}
