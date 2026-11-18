import { build } from 'esbuild';
import { readFile, copyFile, writeFile } from 'node:fs/promises';
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id)) throw new Error('Invalid plugin ID');
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', target: 'es2022', outfile: 'main.js', charset: 'utf8', legalComments: 'none', loader: { '.css': 'text' } });
// This small release directory is the one users select in CC GUI.
for (const file of ['manifest.json', 'main.js', 'styles.css', 'README.md']) await copyFile(file, `plugin/${file}`);
await writeFile('plugin/BUILD.txt', `轻译 ${manifest.version}\nSDK: ${manifest.sdkVersion}\n`);
console.log(`插件已生成：${process.cwd()}/plugin`);
