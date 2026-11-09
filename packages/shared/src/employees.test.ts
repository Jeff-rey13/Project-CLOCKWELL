import { describe, expect, it } from 'vitest';
import { inviteEmployeeSchema, nextEmployeeCode, suggestUsername } from './schemas/employees.ts';

describe('suggestUsername', () => {
  it('uses the first name in lowercase', () => {
    expect(suggestUsername('Wei Jie Lim', new Set())).toBe('wei');
  });
  it('adds a number when taken', () => {
    expect(suggestUsername('Aisyah Binte Ali', new Set(['aisyah', 'aisyah2']))).toBe('aisyah3');
  });
  it('strips accents and symbols', () => {
    expect(suggestUsername("José-Marie O'Neil", new Set())).toBe('josemarie');
  });
});

describe('nextEmployeeCode', () => {
  it('continues the existing prefix and width', () => {
    expect(nextEmployeeCode(['HL-0142', 'HL-0007'], 'HA')).toBe('HL-0143');
  });
  it('starts from the fallback prefix', () => {
    expect(nextEmployeeCode([], 'MC')).toBe('MC-0001');
  });
});

describe('inviteEmployeeSchema', () => {
  it('normalises the email', () => {
    const r = inviteEmployeeSchema.parse({
      full_name: 'Daniel Tan',
      work_email: ' Daniel.Tan@Harbourline.test ',
      office_id: '30000000-0000-4000-8000-000000000001',
      start_date: '2026-11-09',
      annual_leave: 14,
    });
    expect(r.work_email).toBe('daniel.tan@harbourline.test');
    expect(r.app_role).toBe('employee');
  });
});
