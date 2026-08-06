import { describe, it, expect } from 'vitest';
import { FetchKitError } from '../src/error';

describe('FetchKitError', () => {
  it('creates an error with type and message', () => {
    const error = new FetchKitError('Network failed', { type: 'network' });
    expect(error.message).toBe('Network failed');
    expect(error.type).toBe('network');
    expect(error.name).toBe('FetchKitError');
  });

  it('creates an error with status and data', () => {
    const error = new FetchKitError('Not Found', {
      type: 'http',
      status: 404,
      statusText: 'Not Found',
      data: { message: 'Resource not found' },
    });
    expect(error.status).toBe(404);
    expect(error.statusText).toBe('Not Found');
    expect(error.data).toEqual({ message: 'Resource not found' });
  });

  it('isTimeout() returns true for timeout errors', () => {
    const error = new FetchKitError('Timed out', { type: 'timeout' });
    expect(error.isTimeout()).toBe(true);
    expect(error.isNetworkError()).toBe(false);
    expect(error.isAbort()).toBe(false);
    expect(error.isHttpError()).toBe(false);
  });

  it('isNetworkError() returns true for network errors', () => {
    const error = new FetchKitError('Failed to fetch', { type: 'network' });
    expect(error.isNetworkError()).toBe(true);
    expect(error.isTimeout()).toBe(false);
  });

  it('isAbort() returns true for abort errors', () => {
    const error = new FetchKitError('Aborted', { type: 'abort' });
    expect(error.isAbort()).toBe(true);
  });

  it('isHttpError() returns true for HTTP errors', () => {
    const error = new FetchKitError('Server Error', { type: 'http', status: 500 });
    expect(error.isHttpError()).toBe(true);
  });

  it('is instanceof Error', () => {
    const error = new FetchKitError('Test', { type: 'network' });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(FetchKitError);
  });

  describe('FetchKitError.from()', () => {
    it('returns same error if already FetchKitError', () => {
      const original = new FetchKitError('Test', { type: 'network' });
      const result = FetchKitError.from(original);
      expect(result).toBe(original);
    });

    it('wraps AbortError as abort type', () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      const result = FetchKitError.from(abortError);
      expect(result.type).toBe('abort');
      expect(result.isAbort()).toBe(true);
    });

    it('wraps TypeError as network type', () => {
      const typeError = new TypeError('Failed to fetch');
      const result = FetchKitError.from(typeError);
      expect(result.type).toBe('network');
      expect(result.message).toBe('Failed to fetch');
    });

    it('wraps unknown error as network type', () => {
      const result = FetchKitError.from('something broke');
      expect(result.type).toBe('network');
      expect(result.message).toBe('something broke');
    });
  });

  describe('FetchKitError.fromResponse()', () => {
    it('creates error from JSON error response', async () => {
      const response = new Response(JSON.stringify({ message: 'Bad Request' }), {
        status: 400,
        statusText: 'Bad Request',
        headers: { 'Content-Type': 'application/json' },
      });

      const error = await FetchKitError.fromResponse(response);
      expect(error.type).toBe('http');
      expect(error.status).toBe(400);
      expect(error.statusText).toBe('Bad Request');
      expect(error.data).toEqual({ message: 'Bad Request' });
    });

    it('creates error from text error response', async () => {
      const response = new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error',
        headers: { 'Content-Type': 'text/plain' },
      });

      const error = await FetchKitError.fromResponse(response);
      expect(error.status).toBe(500);
      expect(error.data).toBe('Internal Server Error');
    });

    it('handles response with unparseable body', async () => {
      const response = new Response(null, {
        status: 502,
        statusText: 'Bad Gateway',
      });

      const error = await FetchKitError.fromResponse(response);
      expect(error.status).toBe(502);
    });
  });
});
