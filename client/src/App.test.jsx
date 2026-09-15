import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AuthProvider } from './context/AuthContext';
import App from './App';

describe('App and AuthContext smoke test', () => {
  it('App component evaluates without reference errors', () => {
    expect(typeof App).toBe('function');
    const element = App();
    expect(element).toBeDefined();
  });

  it('AuthProvider renders without crashing via SSR renderToString', () => {
    expect(() => {
      renderToString(
        <AuthProvider>
          <div>Test Auth Consumer</div>
        </AuthProvider>
      );
    }).not.toThrow();
  });
});
