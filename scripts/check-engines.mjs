import { createTranslator } from '../src/core.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const translator = createTranslator(async (_, args) => {
  if (process.platform === 'win32') {
    // Use Windows' configured network proxy for this standalone smoke test.
    // The installed plugin always uses the SDK bridge, never a child process.
    return new Promise((resolve, reject) => {
      const child = spawn('pwsh', ['-NoProfile', '-File', fileURLToPath(new URL('./http-bridge.ps1', import.meta.url))], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
      child.on('error', reject);
      child.on('close', code => { try { if (code) reject(new Error('Network unavailable')); else resolve(JSON.parse(output)); } catch (error) { reject(error); } });
      child.stdin.end(JSON.stringify(args));
    });
  }
  const response = await fetch(args.url, { method: args.method, headers: args.headers, body: args.body, signal: AbortSignal.timeout(25000) });
  return { status: response.status, body: await response.text() };
});
let failures = 0;
for (const engine of ['bing', 'google']) {
  try {
    const result = await translator.translate('Hello, world!', { engine, source: 'en', target: 'zh-Hans' });
    console.log(`${engine}: ${result.text}`);
    if (!/[\u3400-\u9fff]/.test(result.text)) throw new Error('未返回中文译文');
  } catch (error) { failures++; console.log(`${engine}: FAIL — ${error.message}`); }
}
translator.dispose();
process.exitCode = failures ? 1 : 0;
