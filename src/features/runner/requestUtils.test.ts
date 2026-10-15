import { describe, expect, it } from 'vitest';
import { diagnoseFailure, patternFromUrl, tryPrettyJson } from './requestUtils.ts';

describe('patternFromUrl', () => {
  it('strips the origin for same-origin URLs and keeps it otherwise', () => {
    expect(patternFromUrl('/api/users?page=2', 'http://localhost:5173')).toBe('/api/users');
    expect(patternFromUrl('http://localhost:5173/api/a', 'http://localhost:5173')).toBe('/api/a');
    expect(patternFromUrl('https://api.example.com/v1/x?y=1', 'http://localhost:5173')).toBe('https://api.example.com/v1/x');
  });
});

describe('diagnoseFailure', () => {
  const origin = 'https://studio.dev';
  it('detects mixed content', () => {
    expect(diagnoseFailure('http://api.example.com/x', origin, 'https:').title).toMatch(/mixed content/i);
    expect(diagnoseFailure('http://localhost:8080/x', origin, 'https:').title).toMatch(/CORS/);
  });
  it('separates same-origin failures from cross-origin ones', () => {
    expect(diagnoseFailure('/api/x', origin, 'https:').title).toMatch(/before a response/);
    expect(diagnoseFailure('https://other.dev/x', origin, 'https:').causes[0]).toContain('https://other.dev');
  });
});

describe('tryPrettyJson', () => {
  it('formats JSON and leaves other text untouched', () => {
    expect(tryPrettyJson('{"a":1}')).toEqual({ pretty: '{\n  "a": 1\n}', isJson: true });
    expect(tryPrettyJson('<html>')).toEqual({ pretty: '<html>', isJson: false });
  });
});
