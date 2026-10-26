import { scanText, sizeBucket, totalFlags } from './scanner';

describe('scanText', () => {
  it('returns zero counts for empty text', () => {
    expect(totalFlags(scanText(''))).toBe(0);
  });

  it('detects emails, valid IBANs, valid cards and fiscal codes', () => {
    const counts = scanText(
      'Scrivi a mario.rossi@example.com. IBAN IT60 X054 2811 1010 0000 0123 456, ' +
        'carta 4111 1111 1111 1111, CF RSSMRA85T10A562S, ip 192.168.1.10',
    );
    expect(counts.email).toBe(1);
    expect(counts.iban).toBe(1);
    expect(counts.creditCard).toBe(1);
    expect(counts.fiscalCode).toBe(1);
    expect(counts.ipAddress).toBe(1);
  });

  it('rejects numbers failing the Luhn / IBAN checksum', () => {
    const counts = scanText('4111 1111 1111 1112 e IT60 X054 2811 1010 0000 0123 457');
    expect(counts.creditCard).toBe(0);
    expect(counts.iban).toBe(0);
  });

  it('detects api keys and phone numbers', () => {
    const counts = scanText('key sk-abcdefghijklmnopqrstuvwx e tel +39 06 1234 5678 oppure 333 1234567');
    expect(counts.apiKey).toBe(1);
    expect(counts.phone).toBe(2);
  });

  it('counts only numbers, never keeping matched values', () => {
    const counts = scanText('a@b.com');
    expect(Object.values(counts).every((v) => typeof v === 'number')).toBe(true);
  });
});

describe('sizeBucket', () => {
  it('buckets by length', () => {
    expect([10, 500, 2000, 10000, 50000].map(sizeBucket)).toEqual(['xs', 's', 'm', 'l', 'xl']);
  });
});
