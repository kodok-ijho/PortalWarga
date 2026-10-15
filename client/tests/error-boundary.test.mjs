import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Bundle ErrorBoundary to temporary ESM for isolated Node testing
const srcPath = path.resolve(__dirname, '../src/components/ErrorBoundary.jsx');
const tmpBuildPath = path.resolve(__dirname, './.error-boundary.test-build.mjs');

await esbuild.build({
  entryPoints: [srcPath],
  bundle: true,
  outfile: tmpBuildPath,
  format: 'esm',
  packages: 'external',
  plugins: [{
    name: 'react-icons-resolver',
    setup(build) {
      build.onResolve({ filter: /^react-icons\/ai$/ }, () => {
        return { path: 'react-icons/ai/index.js', external: true };
      });
    }
  }]
});

// Setup minimal browser DOM environment
global.window = { location: { href: '/previous-page' } };

const mod = await import(tmpBuildPath);
const ErrorBoundary = mod.default;

// Clean up temporary build artifact immediately after loading
try {
  fs.unlinkSync(tmpBuildPath);
} catch {
  // ignore
}

function createInstance(props = {}) {
  const instance = new ErrorBoundary(props);
  // Attach state updater for Node testing environment
  instance.setState = function(updater) {
    const next = typeof updater === 'function' ? updater(this.state) : updater;
    this.state = { ...this.state, ...next };
  };
  return instance;
}

test('ErrorBoundary initializes with healthy state and renders children without interference', () => {
  const instance = createInstance({ children: 'Healthy Palm Village App' });
  assert.equal(instance.state.hasError, false);
  assert.equal(instance.state.error, null);
  assert.equal(instance.state.errorInfo, null);
  assert.equal(instance.state.showDetails, false);
  assert.equal(instance.render(), 'Healthy Palm Village App');
});

test('getDerivedStateFromError catches error properly', () => {
  const dummyError = new Error('Test crash in mobile viewport');
  const derived = ErrorBoundary.getDerivedStateFromError(dummyError);
  assert.equal(derived.hasError, true);
  assert.equal(derived.error, dummyError);
});

test('componentDidCatch captures errorInfo without crashing', () => {
  const instance = createInstance({ children: 'App' });
  const dummyError = new Error('Render fail');
  const dummyInfo = { componentStack: '\n    at BrokenComponent' };
  
  const origError = console.error;
  console.error = () => {};
  try {
    instance.componentDidCatch(dummyError, dummyInfo);
    assert.deepEqual(instance.state.errorInfo, dummyInfo);
  } finally {
    console.error = origError;
  }
});

test('ErrorBoundary renders crash UI with recovery buttons and Palm Village messaging', () => {
  const instance = createInstance({ children: 'App' });
  instance.state = {
    hasError: true,
    error: new Error('Simulated viewport render failure'),
    errorInfo: { componentStack: '\n    at BrokenPage' },
    showDetails: false,
  };
  
  const rendered = instance.render();
  assert.ok(rendered, 'Render output must not be empty or blank');
  
  const stringified = JSON.stringify(rendered);
  assert.ok(stringified.includes('Terjadi Kendala Memuat Halaman'), 'Must contain friendly header');
  assert.ok(stringified.includes('Data warga dan akun Anda tetap tersimpan dengan aman.'), 'Must contain reassurance');
  assert.ok(stringified.includes('Coba Lagi'), 'Must include Coba Lagi button');
  assert.ok(stringified.includes('Kembali ke Beranda'), 'Must include Kembali ke Beranda button');
});

test('handleReset restores state and calls onReset callback', () => {
  let resetCalled = false;
  const instance = createInstance({
    children: 'App',
    onReset: () => { resetCalled = true; },
  });
  instance.state = {
    hasError: true,
    error: new Error('Crash'),
    errorInfo: { componentStack: 'stack' },
    showDetails: true,
  };

  instance.handleReset();
  assert.equal(instance.state.hasError, false);
  assert.equal(instance.state.error, null);
  assert.equal(instance.state.showDetails, false);
  assert.equal(resetCalled, true);
});

test('handleGoHome redirects to root /', () => {
  window.location.href = '/broken-route';
  const instance = createInstance({ children: 'App' });
  instance.state = { hasError: true, error: new Error('Crash') };
  
  instance.handleGoHome();
  assert.equal(instance.state.hasError, false);
  assert.equal(window.location.href, '/');
});

test('toggleDetails toggles technical details display', () => {
  const instance = createInstance({ children: 'App' });
  assert.equal(instance.state.showDetails, false);
  instance.toggleDetails();
  assert.equal(instance.state.showDetails, true);
  instance.toggleDetails();
  assert.equal(instance.state.showDetails, false);
});

test('custom fallback prop is supported for custom crash views', () => {
  const customFallbackFn = ({ error }) => `Custom Error: ${error.message}`;
  const instance = createInstance({ fallback: customFallbackFn });
  instance.state = { hasError: true, error: new Error('Custom boom') };
  assert.equal(instance.render(), 'Custom Error: Custom boom');
});
