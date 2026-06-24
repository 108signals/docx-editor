import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, beforeAll } from 'bun:test';

beforeAll(() => GlobalRegistrator.register());
afterAll(() => GlobalRegistrator.unregister());

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useDocumentHistory } from './useHistory';

interface TestDocument {
  package?: {
    document?: unknown;
    headers?: unknown;
    footers?: unknown;
  } | null;
}

function createDoc(document: unknown, headers: unknown, footers: unknown): TestDocument {
  return { package: { document, headers, footers } };
}

afterEach(() => {
  cleanup();
});

describe('useDocumentHistory', () => {
  test('does not stringify document bodies when detecting changes', () => {
    const originalStringify = JSON.stringify;
    const stringify = mock((value: unknown) => originalStringify(value));
    JSON.stringify = stringify;

    try {
      const headers = new Map<string, unknown>();
      const footers = new Map<string, unknown>();
      const firstBody = { content: ['first'] };
      const secondBody = { content: ['second'] };

      const { result } = renderHook(() =>
        useDocumentHistory(createDoc(firstBody, headers, footers))
      );

      act(() => {
        result.current.push(createDoc(secondBody, headers, footers));
      });

      expect(stringify).not.toHaveBeenCalled();
      expect(result.current.undoCount).toBe(1);
      expect(result.current.state?.package?.document).toBe(secondBody);
    } finally {
      JSON.stringify = originalStringify;
    }
  });

  test('treats shared document/header/footer identities as unchanged', () => {
    const headers = new Map<string, unknown>();
    const footers = new Map<string, unknown>();
    const body = { content: ['same'] };

    const { result } = renderHook(() => useDocumentHistory(createDoc(body, headers, footers)));

    act(() => {
      result.current.push(createDoc(body, headers, footers));
    });

    expect(result.current.undoCount).toBe(0);
  });
});
