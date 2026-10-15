import type { Rng } from '../random.ts';
import {
  AVATAR_COLORS,
  CITIES,
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  CURRENCIES,
  FIRST_NAMES,
  JOB_TITLES,
  LAST_NAMES,
  LOREM,
  PRODUCT_ADJECTIVES,
  PRODUCT_NOUNS,
  STREET_NAMES,
  STREET_SUFFIXES,
  TLDS,
} from './corpus.ts';
import type { FakerKind } from './kinds.ts';

export interface Persona {
  firstName: string;
  lastName: string;
  company: string;
  domain: string;
  city: (typeof CITIES)[number];
}

/**
 * One persona is shared by every field of the same generated object, so a record's
 * name, username, email and avatar initials stay mutually consistent.
 */
export interface FakerContext {
  rng: Rng;
  index: number;
  persona: () => Persona;
  min?: number;
  max?: number;
  baseTime?: number;
}

const DAY_MS = 86_400_000;
const DEFAULT_BASE_TIME = Date.UTC(2026, 0, 1);

export function createPersona(rng: Rng): Persona {
  const company = `${rng.pick(COMPANY_PREFIXES)} ${rng.pick(COMPANY_SUFFIXES)}`;
  const domainStem = company.split(' ')[0]?.toLowerCase().replace(/[^a-z]/g, '') || 'example';
  return {
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    company,
    domain: `${domainStem}.${rng.pick(TLDS)}`,
    city: rng.pick(CITIES),
  };
}

export function createContext(rng: Rng, index = 0, baseTime = DEFAULT_BASE_TIME): FakerContext {
  let persona: Persona | undefined;
  return {
    rng,
    index,
    baseTime,
    persona: () => (persona ??= createPersona(rng)),
  };
}

export function uuidV4(rng: Rng): string {
  const hex = rng.hex(32).split('');
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function words(rng: Rng, count: number): string[] {
  return Array.from({ length: count }, () => rng.pick(LOREM));
}

function sentence(rng: Rng): string {
  return `${capitalize(words(rng, rng.int(6, 12)).join(' '))}.`;
}

function avatar(persona: Persona, rng: Rng): string {
  const initials = `${persona.firstName.charAt(0)}${persona.lastName.charAt(0)}`;
  const color = rng.pick(AVATAR_COLORS);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="48" fill="${color}"/>` +
    `<text x="48" y="58" font-family="sans-serif" font-size="34" fill="#fff" text-anchor="middle">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function range(ctx: FakerContext, fallbackMin: number, fallbackMax: number): [number, number] {
  const min = ctx.min ?? fallbackMin;
  const max = ctx.max ?? Math.max(min, fallbackMax);
  return [min, max];
}

function timestampMs(ctx: FakerContext): number {
  const base = ctx.baseTime ?? DEFAULT_BASE_TIME;
  if (ctx.min !== undefined && ctx.max !== undefined && ctx.max > ctx.min) {
    return Math.floor(ctx.min + ctx.rng.next() * (ctx.max - ctx.min));
  }
  return base - ctx.rng.int(0, 365) * DAY_MS - ctx.rng.int(0, DAY_MS - 1);
}

export function fake(kind: FakerKind, ctx: FakerContext): unknown {
  const { rng } = ctx;
  switch (kind) {
    case 'sequence':
      return ctx.index + 1;
    case 'uuid':
      return uuidV4(rng);
    case 'objectId':
      return rng.hex(24);
    case 'fullName': {
      const p = ctx.persona();
      return `${p.firstName} ${p.lastName}`;
    }
    case 'firstName':
      return ctx.persona().firstName;
    case 'lastName':
      return ctx.persona().lastName;
    case 'username': {
      const p = ctx.persona();
      return `${p.firstName}.${p.lastName}`.toLowerCase() + (ctx.index > 0 ? String(ctx.index) : '');
    }
    case 'email': {
      const p = ctx.persona();
      return `${p.firstName}.${p.lastName}${ctx.index > 0 ? ctx.index : ''}@${p.domain}`.toLowerCase();
    }
    case 'phone':
      return `+1-${rng.int(200, 989)}-${rng.int(200, 999)}-${String(rng.int(0, 9999)).padStart(4, '0')}`;
    case 'avatar':
      return avatar(ctx.persona(), rng);
    case 'jobTitle':
      return rng.pick(JOB_TITLES);
    case 'companyName':
      return ctx.persona().company;
    case 'streetAddress':
      return `${rng.int(1, 9999)} ${rng.pick(STREET_NAMES)} ${rng.pick(STREET_SUFFIXES)}`;
    case 'city':
      return ctx.persona().city[0];
    case 'country':
      return ctx.persona().city[1];
    case 'countryCode':
      return ctx.persona().city[2];
    case 'zipCode':
      return String(rng.int(10000, 99999));
    case 'latitude':
      return rng.float(-90, 90, 6);
    case 'longitude':
      return rng.float(-180, 180, 6);
    case 'url':
      return `https://www.${ctx.persona().domain}/${slugify(words(rng, 2).join(' '))}`;
    case 'domain':
      return ctx.persona().domain;
    case 'ipv4':
      return [rng.int(1, 223), rng.int(0, 255), rng.int(0, 255), rng.int(1, 254)].join('.');
    case 'slug':
      return slugify(words(rng, rng.int(2, 4)).join(' '));
    case 'hexColor':
      return `#${rng.hex(6)}`;
    case 'token':
      return rng.hex(32);
    case 'productName':
      return `${rng.pick(PRODUCT_ADJECTIVES)} ${rng.pick(PRODUCT_NOUNS)}`;
    case 'price': {
      const [min, max] = range(ctx, 1, 999);
      return rng.float(min, max, 2);
    }
    case 'currency':
      return rng.pick(CURRENCIES);
    case 'isoDateTime':
      return new Date(timestampMs(ctx)).toISOString();
    case 'date':
      return new Date(timestampMs(ctx)).toISOString().slice(0, 10);
    case 'unixSeconds':
      return Math.floor(timestampMs({ ...ctx, min: ctx.min && ctx.min * 1000, max: ctx.max && ctx.max * 1000 }) / 1000);
    case 'unixMillis':
      return timestampMs(ctx);
    case 'word':
      return rng.pick(LOREM);
    case 'title':
      return words(rng, rng.int(2, 5)).map(capitalize).join(' ');
    case 'sentence':
      return sentence(rng);
    case 'paragraph':
      return Array.from({ length: rng.int(3, 5) }, () => sentence(rng)).join(' ');
    case 'integer': {
      const [min, max] = range(ctx, 0, 1000);
      return rng.int(min, max);
    }
    case 'float': {
      const [min, max] = range(ctx, 0, 1000);
      return rng.float(min, max, 2);
    }
    case 'percentage':
      return rng.int(0, 100);
    case 'boolean':
      return rng.bool();
  }
}
