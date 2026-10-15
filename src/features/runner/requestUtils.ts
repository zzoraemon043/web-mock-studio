/** Same-origin URLs become path patterns; cross-origin URLs keep their origin so the rule stays pinned. */
export function patternFromUrl(raw: string, origin = typeof location !== 'undefined' ? location.origin : ''): string {
  try {
    const url = new URL(raw, origin || undefined);
    return url.origin === origin ? url.pathname : `${url.origin}${url.pathname}`;
  } catch {
    return raw.split('?')[0] ?? raw;
  }
}

/**
 * Browser fetch rejects with an opaque TypeError for CORS, DNS, TLS, mixed content and
 * offline failures alike. These hints narrow the likely cause from what is observable.
 */
export function diagnoseFailure(rawUrl: string, pageOrigin: string, pageProtocol: string): { title: string; causes: string[] } {
  let url: URL | null = null;
  try {
    url = new URL(rawUrl, pageOrigin);
  } catch {
    return { title: 'The URL is not valid', causes: ['Check the scheme, host and path.'] };
  }
  if (pageProtocol === 'https:' && url.protocol === 'http:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return {
      title: 'Blocked as mixed content',
      causes: ['This page is served over HTTPS, so the browser refuses plain HTTP requests.', 'Use the HTTPS endpoint, or mock this endpoint instead.'],
    };
  }
  if (url.origin === pageOrigin) {
    return {
      title: 'The request failed before a response arrived',
      causes: ['A mock rule may be simulating a network failure for this route.', 'Otherwise the local server is unreachable.'],
    };
  }
  return {
    title: 'Likely blocked by CORS, or the server is unreachable',
    causes: [
      `${url.origin} did not allow requests from ${pageOrigin} (no Access-Control-Allow-Origin header), or the preflight OPTIONS request was rejected.`,
      'The host may be offline, behind a VPN, or using a certificate the browser does not trust.',
      'A mock rule may be simulating a network failure for this URL.',
    ],
  };
}

export function tryPrettyJson(text: string): { pretty: string; isJson: boolean } {
  try {
    return { pretty: JSON.stringify(JSON.parse(text), null, 2), isJson: true };
  } catch {
    return { pretty: text, isJson: false };
  }
}
