# 展示素材（市场图标与效果图）

- `icon.svg` / `icon.png` —— 市场列表图标（512×512，深靛蓝底 + 青紫渐变对话气泡，内含「文 / A」双语与双向箭头；已在 `manifest.json` 的 `icon` 字段声明，索引登记的是 `docs/icon.png`）。`icon-128.png` 用于核对小尺寸下的可读性。
- `screenshots/panel.png` —— 悬浮翻译面板：语言选择、原文 13 字符、译文「你好，世界！」，底部显示 Bing 与快捷键提示。
- `screenshots/reply.png` —— 单条回复翻译：译文在回复正文下方，代码块原样保留。
- `screenshots/settings.png` —— 插件设置页：引擎、风格、供应商地址与模型。

## 换图规则

1. 图片放本目录，`manifest.json` 用仓库内相对路径引用；
2. 索引仓 `plugins/<id>.json` 的 `icon` / `screenshots` 由机器人登记新版本时从 manifest 镜像；
3. 只换素材、不发版时，提一个只改这两个字段的素材 PR（转人工审核，不走自动合并）；
4. 图片按默认分支（HEAD）读取，替换同名文件不需要发版；换文件名则随下一次发版进索引。

图片格式限 png/jpg/jpeg/webp/gif/svg/avif，效果图 ≤ 5 张，路径不得逃逸仓库。图标建议 ≥ 128×128。

## 重新导出 PNG

```powershell
# 需要本机 Chrome；也可改用任意 SVG → PNG 工具
node -e "
import('playwright').then(async ({ chromium }) => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const { readFileSync, writeFileSync } = await import('node:fs');
  const svg = readFileSync('docs/icon.svg', 'utf8');
  for (const [file, size] of [['docs/icon.png', 512], ['docs/icon-128.png', 128]]) {
    const p = await b.newPage({ viewport: { width: size, height: size } });
    await p.setContent('<html><body style=\"margin:0\">' + svg.replace('width=\"512\" height=\"512\"', 'width=\"' + size + '\" height=\"' + size + '\"') + '</body></html>');
    await p.waitForTimeout(200);
    await p.screenshot({ path: file, omitBackground: true });
    await p.close();
  }
  await b.close();
});"
```
