const vm = require('vm');

let ivm = null;
try { ivm = require('isolated-vm'); } catch {}

const BLOCKED_PATTERNS = [
  /require\s*\(/,
  /process\./,
  /child_process/,
  /fs\./,
  /eval\s*\(/,
  /Function\s*\(/,
  /while\s*\(\s*true\s*\)/,
  /for\s*\(\s*;\s*;\s*\)/,
];

function validateCode(code) {
  if (typeof code !== 'string' || code.length > 10000) throw new Error('code too large (max 10KB)');
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(code)) throw new Error(`blocked pattern: ${pat}`);
  }
  // quick syntax check (async aware)
  try { const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor; new AsyncFunction('data','config', `"use strict"; ${code}`); } catch (e) { throw new Error(`syntax: ${e.message}`); }
}

async function runWithVM(code, data, config, timeoutMs = 2000) {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  // Create a limited context
  const sandbox = {
    data: JSON.parse(JSON.stringify(data)),
    config: JSON.parse(JSON.stringify(config)),
    console: { log: (...a)=> console.log('[sandbox]', ...a), warn: (...a)=> console.warn('[sandbox]', ...a), error: (...a)=> console.error('[sandbox]', ...a) },
    JSON,
    Math,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    fetch: global.fetch ? global.fetch.bind(global) : undefined,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
  };
  const context = vm.createContext(sandbox);
  const wrapped = `(async (data, config) => { "use strict"; ${code} })(data, config)`;
  const script = new vm.Script(wrapped, { displayErrors: true });
  const result = await script.runInContext(context, { timeout: timeoutMs, displayErrors: true });
  // result may be a promise
  if (result && typeof result.then === 'function') {
    return await Promise.race([
      result,
      new Promise((_, rej)=> setTimeout(()=> rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs + 100))
    ]);
  }
  return result;
}

async function runWithIsolatedVM(code, data, config, timeoutMs = 2000) {
  if (!ivm) throw new Error('isolated-vm not available');
  const isolate = new ivm.Isolate({ memoryLimit: 32 });
  const context = await isolate.createContext();
  const jail = context.global;
  // Provide limited globals
  await jail.set('global', jail.derefInto());
  // Helper to copy data/config as JSON (structured clone)
  const dataJson = JSON.stringify(data);
  const configJson = JSON.stringify(config);
  const codeToRun = `
    const data = JSON.parse('${dataJson.replace(/'/g, "\\'")}');
    const config = JSON.parse('${configJson.replace(/'/g, "\\'")}');
    (async () => { "use strict"; ${code} })()
  `;
  const script = await isolate.compileScript(codeToRun);
  const result = await script.run(context, { timeout: timeoutMs });
  // result is a Reference, need to copy
  let out;
  if (result && typeof result.copy === 'function') {
    out = await result.copy();
  } else {
    out = result;
  }
  isolate.dispose();
  return out;
}

async function runSandboxed(code, data = {}, config = {}, opts = {}) {
  const timeoutMs = Math.min(Math.max(opts.timeoutMs || 2000, 100), 5000);
  validateCode(code);
  // Prefer isolated-vm for timeout/memory isolation, fallback to vm
  if (ivm) {
    try {
      return await runWithIsolatedVM(code, data, config, timeoutMs);
    } catch (e) {
      // If isolated-vm fails due to missing fetch etc, fallback to vm
      if (String(e.message).includes('fetch') || String(e.message).includes('not available')) {
        return await runWithVM(code, data, config, timeoutMs);
      }
      throw e;
    }
  }
  return await runWithVM(code, data, config, timeoutMs);
}

module.exports = { runSandboxed, validateCode };
