import { isValidElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '../../components/CodeEditor.tsx';
import { createAndSelectRule } from '../../app/actions.ts';
import { CurlImportModal } from './CurlImportModal.tsx';
import { RunnerView } from './RunnerView.tsx';

const ui = vi.hoisted(() => ({
  runnerDraft: null as import('../../store/ui.ts').RunnerDraft | null,
  curlImportOpen: true,
  consumeRunnerDraft() {
    const draft = ui.runnerDraft;
    ui.runnerDraft = null;
    return draft;
  },
  openInRunner(draft: import('../../store/ui.ts').RunnerDraft) {
    ui.runnerDraft = draft;
  },
  setCurlImportOpen: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../store/ui.ts', () => ({ useUi: (select: (s: typeof ui) => unknown) => select(ui) }));
vi.mock('../../store/workspace.ts', () => ({
  useWorkspace: (select: (s: { requests: [] }) => unknown) => select({ requests: [] }),
}));
vi.mock('../../app/actions.ts', () => ({ createAndSelectRule: vi.fn() }));

// Drive the Runner's callbacks without a browser or a real network.
const hooks = vi.hoisted(() => {
  let cursor = 0;
  const states: unknown[] = [];
  function useState<T>(initial: T | (() => T)) {
    const index = cursor++;
    if (!(index in states)) states[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [states[index], (value: T) => { states[index] = value; }];
  }
  return {
    useState,
    useRef: <T,>(current: T) => useState(() => ({ current }))[0],
    render<T>(component: () => T) {
      cursor = 0;
      return component();
    },
    reset() { states.length = 0; },
  };
});

vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  useState: hooks.useState,
  useRef: hooks.useRef,
  useEffect: (effect: () => void) => effect(),
  useMemo: (compute: () => unknown) => compute(),
}));

type Element = ReactElement<Record<string, unknown>>;

function findElement(tree: unknown, matches: (element: Element) => boolean): Element | undefined {
  if (Array.isArray(tree)) {
    for (const child of tree) {
      const found = findElement(child, matches);
      if (found) return found;
    }
  } else if (isValidElement<Element['props']>(tree)) {
    return matches(tree) ? tree : findElement(tree.props.children, matches) ?? findElement(tree.props.footer, matches);
  }
}

function handler<F>(tree: unknown, matches: (element: Element) => boolean, prop: string): F {
  const callback = findElement(tree, matches)?.props[prop];
  if (typeof callback !== 'function') throw new Error(`Missing ${prop} handler`);
  return callback as F;
}

const command = "curl -H 'Content-Type: multipart/form-data' -F 'name=Ada & Bob' -F 'name=Grace' https://example.com/upload";
const isUrl = ({ props }: Element) => props['aria-label'] === 'Request URL';
const submit = () => handler<(event: { preventDefault: () => void }) => void>(
  hooks.render(RunnerView), (element) => element.type === 'form', 'onSubmit',
)({ preventDefault: vi.fn() });

describe('Request Runner', () => {
  const sent: Request[] = [];
  const network = vi.fn(async (url: string, init: RequestInit) => {
    const request = new Request(new URL(url, 'https://studio.example/'), init);
    sent.push(request);
    return new Response(await request.clone().text());
  });

  beforeEach(() => {
    ui.runnerDraft = null;
    hooks.reset();
    sent.length = 0;
    network.mockClear();
    vi.stubGlobal('location', new URL('https://studio.example/'));
    vi.stubGlobal('fetch', network);
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(['paste', 'modal'] as const)('sends imported multipart fields through the %s path', async (path) => {
    if (path === 'paste') {
      handler<(event: { clipboardData: { getData: () => string }; preventDefault: () => void }) => void>(
        hooks.render(RunnerView), isUrl, 'onPaste',
      )({ clipboardData: { getData: () => command }, preventDefault: vi.fn() });
    } else {
      handler<(value: string) => void>(hooks.render(CurlImportModal), (element) => element.type === CodeEditor, 'onChange')(command);
      handler<() => void>(hooks.render(CurlImportModal), ({ props }) => props.children === 'Load into runner', 'onClick')();
      hooks.reset();
      hooks.render(RunnerView);
    }

    submit();
    const request = sent[0];
    expect(request?.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    const body = await request?.formData();
    expect(body?.getAll('name')).toEqual(['Ada & Bob', 'Grace']);
  });

  it('captures the submitted endpoint after the draft URL and method change', async () => {
    const changeUrl = (value: string) => handler<(event: { target: { value: string } }) => void>(
      hooks.render(RunnerView), isUrl, 'onChange',
    )({ target: { value } });
    const capture = ({ props }: Element) => props.children === 'Capture as mock';
    changeUrl('/api/users');
    network.mockResolvedValueOnce(Response.json([{ id: 1 }]));
    submit();
    await vi.waitFor(() => expect(findElement(hooks.render(RunnerView), capture)).toBeDefined());
    changeUrl('/api/orders');
    handler<(event: { target: { value: string } }) => void>(
      hooks.render(RunnerView), ({ props }) => props['aria-label'] === 'HTTP method', 'onChange',
    )({ target: { value: 'POST' } });

    handler<() => void>(hooks.render(RunnerView), capture, 'onClick')();
    expect(createAndSelectRule).toHaveBeenCalledWith(expect.objectContaining({
      name: 'GET /api/users',
      method: 'GET',
      pattern: '/api/users',
      response: expect.objectContaining({ body: JSON.stringify([{ id: 1 }], null, 2) }),
    }));
  });
});
