const { chromium } = require('playwright');
const fs = require('fs');
const [S, OUT, ICONS, APP] = process.argv.slice(2);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const tight = async (file) => {
    const svg = fs.readFileSync(file, 'utf8');
    await p.setContent(svg);
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.width, r.height]; });
    const pad = 0;
    const vb = bb.map((v) => +v.toFixed(3));
    const inner = svg.replace(/<svg[^>]*>/, '').replace('</svg>', '').trim();
    return { vb, inner };
  };
  const out = {};
  for (const [name, file, label] of [['logo-full', 'full-c.svg', 'Quest Meals'], ['logo-full-reversed', 'rev-c.svg', 'Quest Meals'], ['logo-mark', 'mark-c.svg', 'Quest Meals'], ['logo-horizontal', 'hz-c.svg', 'Quest'], ['logo-horizontal-reversed', 'hzrev-c.svg', 'Quest']]) {
    const { vb, inner } = await tight(`${S}/${file}`);
    out[name] = { vb, inner };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" role="img" aria-label="${label}">\n<title>${label}</title>\n${inner}\n</svg>\n`;
    fs.writeFileSync(`${OUT}/${name}.svg`, svg);
    // 512 px PNG on the long edge, transparent
    const scale = 512 / Math.max(vb[2], vb[3]);
    const w = Math.round(vb[2] * scale), h = Math.round(vb[3] * scale);
    await p.setViewportSize({ width: w, height: h });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${w}" height="${h}" `)}</body></html>`);
    await p.screenshot({ path: `${OUT}/${name}.png`, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
  }
  // Icons from the mark
  const m = out['logo-mark'];
  const iconSvg = (size, safe, bg, rounded) => {
    const [x, y, w, h] = m.vb; const side = Math.max(w, h) / safe; const cx = x + w / 2, cy = y + h / 2;
    const vx = cx - side / 2, vy = cy - side / 2;
    const rect = bg ? `<rect x="${vx}" y="${vy}" width="${side}" height="${side}" ${rounded ? `rx="${side * 0.22}"` : ''} fill="${bg}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${[vx, vy, side, side].map((v) => +v.toFixed(3)).join(' ')}"${size ? ` width="${size}" height="${size}"` : ''}>${rect}${m.inner}</svg>`;
  };
  // Mark leaf is Deep Forest, so the standard icon sits on Morning Mist; maskable sits on Deep Forest with the reversed (lime + white) leaf.
  const markRev = (s) => s.replace(/(<path[^>]*)#11301A/g, '$1#FFFFFF');
  fs.writeFileSync(`${ICONS}/icon.svg`, iconSvg(0, 0.7, '#F3F9EB', true) + '\n');
  fs.writeFileSync(`${ICONS}/maskable.svg`, markRev(iconSvg(0, 0.8 * 0.8, '#11301A', false)) + '\n');
  const shot = async (svg, size, file) => {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
    await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await shot(iconSvg(192, 0.7, '#F3F9EB', true), 192, `${ICONS}/icon-192.png`);
  await shot(iconSvg(512, 0.7, '#F3F9EB', true), 512, `${ICONS}/icon-512.png`);
  await shot(markRev(iconSvg(512, 0.64, '#11301A', false)), 512, `${ICONS}/maskable-512.png`);
  await shot(iconSvg(180, 0.7, '#F3F9EB', false), 180, `${ICONS}/apple-touch-icon.png`);
  for (const s of [16, 32, 48]) await shot(iconSvg(s, 0.86, '#F3F9EB', true), s, `${S}/fav-${s}.png`);
  await b.close();
})();
