import { describe, expect, it } from 'vitest';
import { createRule } from '../defaults.ts';
import { compilePattern, describePattern, findMatchingRule, matchRoute, patternToRegExpSource } from './match.ts';

const url = (href: string) => new URL(href, 'http://localhost:5173');

describe('matchRoute', () => {
  it('matches static paths and ignores trailing slashes', () => {
    expect(matchRoute('/api/users', url('/api/users'))).not.toBeNull();
    expect(matchRoute('/api/users', url('/api/users/'))).not.toBeNull();
    expect(matchRoute('/api/users', url('/api/user'))).toBeNull();
    expect(matchRoute('/api/users', url('/api/users/1'))).toBeNull();
  });

  it('extracts Express-style and OpenAPI-style params', () => {
    expect(matchRoute('/api/users/:id', url('/api/users/42'))?.params).toEqual({ id: '42' });
    expect(matchRoute('/api/users/{userId}/posts/{postId}', url('/api/users/7/posts/9'))?.params).toEqual({ userId: '7', postId: '9' });
  });

  it('decodes percent-encoded segments', () => {
    expect(matchRoute('/files/:name', url('/files/hello%20world.txt'))?.params).toEqual({ name: 'hello world.txt' });
  });

  it('supports optional params', () => {
    expect(matchRoute('/api/items/:id?', url('/api/items'))?.params).toEqual({});
    expect(matchRoute('/api/items/:id?', url('/api/items/3'))?.params).toEqual({ id: '3' });
  });

  it('supports trailing wildcards', () => {
    expect(matchRoute('/static/*', url('/static/a/b/c.js'))?.params).toEqual({ '*': 'a/b/c.js' });
    expect(matchRoute('/static/*', url('/static'))?.params).toEqual({ '*': '' });
    expect(compilePattern('/a/*/b').error).toBeDefined();
  });

  it('pins absolute URL patterns to their origin', () => {
    expect(matchRoute('https://api.example.com/v1/users/:id', url('https://api.example.com/v1/users/5'))?.params).toEqual({ id: '5' });
    expect(matchRoute('https://API.example.com/v1/users/:id', url('https://api.example.com/v1/users/5'))).not.toBeNull();
    expect(matchRoute('https://api.example.com/v1/users/:id', url('https://evil.example.com/v1/users/5'))).toBeNull();
    expect(matchRoute('https://api.example.com:443/ping', url('https://api.example.com/ping'))).not.toBeNull();
  });

  it('lifts a query string in the pattern into equality matchers', () => {
    expect(matchRoute('/search?type=user', url('/search?type=user&q=ada'))).not.toBeNull();
    expect(matchRoute('/search?type=user', url('/search?type=org'))).toBeNull();
    expect(matchRoute('/search?debug', url('/search?debug=1'))).not.toBeNull();
    expect(matchRoute('/search?debug', url('/search'))).toBeNull();
  });

  it('applies explicit query matchers', () => {
    const regex = [{ key: 'page', value: '^\\d+$', mode: 'regex' as const }];
    expect(matchRoute('/list', url('/list?page=2'), regex)).not.toBeNull();
    expect(matchRoute('/list', url('/list?page=two'), regex)).toBeNull();
    expect(matchRoute('/list', url('/list?draft=1'), [{ key: 'draft', value: '', mode: 'absent' }])).toBeNull();
    expect(matchRoute('/list', url('/list?page=1'), [{ key: 'page', value: '(', mode: 'regex' }])).toBeNull();
  });
});

describe('findMatchingRule', () => {
  const rules = [
    createRule({ id: 'catch-all', pattern: '/api/*', method: 'ANY' }),
    createRule({ id: 'by-id', pattern: '/api/users/:id' }),
    createRule({ id: 'me', pattern: '/api/users/me' }),
    createRule({ id: 'admins', pattern: '/api/users', query: [{ key: 'role', value: 'admin', mode: 'equals' }] }),
    createRule({ id: 'list', pattern: '/api/users' }),
    createRule({ id: 'post', pattern: '/api/users', method: 'POST' }),
    createRule({ id: 'off', pattern: '/api/off', enabled: false }),
  ];
  const find = (method: string, path: string) => findMatchingRule(rules, method, `http://localhost${path}`)?.rule.id;

  it('prefers the most specific rule regardless of order', () => {
    expect(find('GET', '/api/users/me')).toBe('me');
    expect(find('GET', '/api/users/12')).toBe('by-id');
    expect(find('GET', '/api/users?role=admin')).toBe('admins');
    expect(find('GET', '/api/users')).toBe('list');
    expect(find('GET', '/api/orders/1')).toBe('catch-all');
  });

  it('filters by method and enabled state', () => {
    expect(find('post', '/api/users')).toBe('post');
    expect(find('DELETE', '/api/users')).toBe('catch-all');
    expect(find('GET', '/api/off')).toBe('catch-all');
    expect(find('GET', '/other')).toBeUndefined();
  });

  it('returns null for unparsable URLs', () => {
    expect(findMatchingRule(rules, 'GET', 'not a url')).toBeNull();
  });
});

describe('pattern helpers', () => {
  it('describes params', () => {
    expect(describePattern('/a/:x/b/{y}/*').params).toEqual(['x', 'y', '*']);
  });

  it('compiles to an equivalent RegExp for code generation', () => {
    const re = new RegExp(patternToRegExpSource('/api/users/:id/files/*'));
    expect(re.exec('/api/users/3/files/a/b.txt')?.groups).toEqual({ id: '3', wildcard: 'a/b.txt' });
    expect(re.test('/api/users')).toBe(false);
    expect(new RegExp(patternToRegExpSource('/v1.0/items')).test('/v1x0/items')).toBe(false);
    expect(() => new RegExp(patternToRegExpSource('/a/:id/b/:id'))).not.toThrow();
  });
});
