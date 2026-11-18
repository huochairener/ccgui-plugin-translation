import { build } from 'esbuild';
import { readFile, copyFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id)) throw new Error('Invalid plugin ID');
await build({ entryPoints: ['src/main.js'], bundle: true, format: 'esm', target: 'es2022', outfile: 'main.js', charset: 'utf8', legalComments: 'none', loader: { '.css': 'text' } });
// This small release directory is the one users select in CC GUI.
for (const file of ['manifest.json', 'main.js', 'styles.css', 'README.md']) await copyFile(file, `plugin/${file}`);
// 展示素材用仓库内相对路径声明：本地目录安装时也把它们带上，图标才不会回落成首字母瓷砖。
// 市场安装由宿主按索引镜像下载，不依赖这些副本。
for (const rel of [manifest.icon, ...(manifest.screenshots ?? [])].filter(p => p && !/^https:/i.test(p))) {
  await mkdir(dirname(`plugin/${rel}`), { recursive: true });
  await copyFile(rel, `plugin/${rel}`);
}
await writeFile('plugin/BUILD.txt', `轻译 ${manifest.version}\nSDK: ${manifest.sdkVersion}\n`);
console.log(`插件已生成：${process.cwd()}/plugin`);
