import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSavedRequest } from '../core/defaults.ts';
import { workspaceStorage } from '../lib/idb-storage.ts';
import { useWorkspace } from './workspace.ts';

vi.mock('../lib/idb-storage.ts', () => ({
  workspaceStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

describe('saved requests', () => {
  beforeEach(async () => {
    await useWorkspace.persist.rehydrate();
    useWorkspace.getState().resetWorkspace(true);
  });

  it('deletes only the selected request when new requests omit their IDs', () => {
    const workspace = useWorkspace.getState();
    const first = workspace.saveRequest({ id: undefined, name: 'First' });
    const second = workspace.saveRequest({ id: undefined, name: 'Second' });
    workspace.removeRequest(first.id);

    expect(first.id).toMatch(/^req_/);
    expect(second.id).toMatch(/^req_/);
    expect(useWorkspace.getState().requests).toEqual([second]);
  });

  it('repairs missing saved request IDs when loading an older workspace', async () => {
    const existing = createSavedRequest({ id: 'existing' });
    vi.mocked(workspaceStorage.getItem).mockResolvedValueOnce(JSON.stringify({
      version: 1,
      state: { requests: [existing, { ...existing, id: undefined }, { ...existing, id: undefined }] },
    }));
    await useWorkspace.persist.rehydrate();

    const [first, second, third] = useWorkspace.getState().requests;
    expect(first).toEqual(existing);
    expect(second?.id).toMatch(/^req_/);
    expect(third?.id).toMatch(/^req_/);
    expect(second?.id).not.toEqual(third?.id);
  });
});
