import { describe, it, expect } from 'vitest';
import App from './App';

describe('App smoke test', () => {
  it('App component function evaluates without reference errors', () => {
    expect(typeof App).toBe('function');
    let element;
    expect(() => {
      element = App();
    }).not.toThrow();
    expect(element).toBeDefined();
  });
});
