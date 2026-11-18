// node render.cjs in.svg out.png size [bg]
const { chromium } = require('/workspace/shot-tool/node_modules/playwright');
const fs = require('fs');
const font = fs.readFileSync('/workspace/readme-tools/fonts/ReadexPro.ttf').toString('base64');
(async () => {
  const jobs = JSON.parse(process.argv[2]);
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [svgPath, out, w, h, bg] of jobs) {
    const svg = fs.readFileSync(svgPath, 'utf8');
    await p.setViewportSize({ width: w, height: h || w });
    await p.setContent(`<html><head><style>@font-face{font-family:\"Readex Pro\";src:url(data:font/ttf;base64,${font});font-weight:100 900}</style></head><body style="margin:0;background:${bg || 'transparent'}"><div style="width:${w}px;height:${h || w}px">${svg.replace('<svg ', `<svg width="${w}" height="${h || w}" `)}</div></body></html>`);
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: out, omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h || w } });
  }
  await b.close();
})();
