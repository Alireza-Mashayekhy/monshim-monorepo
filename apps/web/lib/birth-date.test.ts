import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  changeBirthDate,
  DEFAULT_BIRTH_DATE,
  formatBirthDate,
  parseBirthDate,
  serializeBirthDate,
} from './birth-date.ts';
import { isoToJalali, jalaliToIso } from './date-utils.ts';
import { jalaliMonthLength } from './jalali.ts';

describe('birth date helpers', () => {
  it('uses the correct lengths and clamps days on month or year changes', () => {
    assert.equal(jalaliMonthLength(1399, 1), 31);
    assert.equal(jalaliMonthLength(1399, 7), 30);
    assert.equal(jalaliMonthLength(1399, 12), 30);
    assert.equal(jalaliMonthLength(1400, 12), 29);
    assert.deepEqual(
      changeBirthDate({ year: 1399, month: 1, day: 31 }, { month: 7 }),
      { year: 1399, month: 7, day: 30 },
    );
    assert.deepEqual(
      changeBirthDate({ year: 1399, month: 12, day: 30 }, { year: 1400 }),
      { year: 1400, month: 12, day: 29 },
    );
  });
  it('parses existing dates and formats a normalized value for submission and review', () => {
    assert.equal(parseBirthDate('1400/12/30'), null);
    assert.equal(parseBirthDate(''), null);
    assert.equal(parseBirthDate('1375/13/01'), null);
    assert.deepEqual(parseBirthDate('۱۳۷۵/۰۱/۰۱'), DEFAULT_BIRTH_DATE);
    assert.equal(serializeBirthDate(DEFAULT_BIRTH_DATE), '1375/01/01');
    assert.equal(formatBirthDate('1375/01/01'), '۱ فروردین ۱۳۷۵');
  });
  it('round trips civil ISO dates in different timezones', () => {
    const original = process.env.TZ;
    try {
      for (const tz of [
        'UTC',
        'Asia/Tehran',
        'America/Los_Angeles',
        'Pacific/Kiritimati',
      ]) {
        process.env.TZ = tz;
        for (const iso of [
          '1996-03-20',
          '2021-03-20',
          '2025-03-20',
          '1990-01-01',
        ]) {
          const jalali = isoToJalali(`${iso}T00:00:00.000Z`);
          assert.equal(jalaliToIso(jalali), iso, `${tz}: ${iso}`);
        }
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
});
