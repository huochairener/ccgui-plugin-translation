const page = await fetch('https://cn.bing.com/translator', { signal: AbortSignal.timeout(20000) });
const html = await page.text();
const params = html.match(/params_AbusePreventionHelper\s*=\s*\[\s*(\d+)\s*,\s*"([^"\r\n]+)"/);
const ig = html.match(/IG:"([^"]+)"/)?.[1];
const iid = html.match(/data-iid="([^"]+)"/)?.[1];
console.log({ pageStatus: page.status, pageHost: new URL(page.url).host, hasParams: !!params, authAgeSeconds: params ? Math.round((Date.now() - Number(params[1])) / 1000) : null, hasIg: !!ig, hasIid: !!iid });
if (params && ig && iid) {
  const query = new URLSearchParams({ isVertical: '1', IG: ig, IID: iid + '.1' });
  const body = new URLSearchParams({ fromLang: 'en', to: 'zh-Hans', text: 'Hello, world!', token: params[2], key: params[1] });
  const response = await fetch('https://cn.bing.com/ttranslatev3?' + query, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://cn.bing.com/translator' }, body: body.toString(), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  console.log({ status: response.status, host: new URL(response.url).host, type: response.headers.get('content-type'), length: text.length, prefix: text.slice(0, 200) });
}
