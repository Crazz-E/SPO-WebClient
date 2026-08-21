/**
 * Builds report/rdo-surface-coverage.html from rdo-inventory.json (produced by
 * build.js) and the three page fragments. Run from report/ after the pipeline:
 *
 *   node scan3.js && node voyager3.js && node asp.js && node webclient.js \
 *     && node build.js && node assemble.js
 *
 * The fragments are hand-written: head.html carries the design tokens and CSS,
 * body.html the prose and the hard-coded headline figures, script.html the
 * table rendering. Numbers quoted in body.html prose do NOT update themselves —
 * assemble.js prints the current counts so a drift is visible, not silent.
 */
const fs = require('fs');

const rows = require('./rdo-inventory.json');

const compact = rows.map(x => ({
  n: x.name, k: x.kind, a: x.arity, ac: x.access ? x.access.join('/') : null,
  ar: x.area, am: x.account,
  o: x.owners.slice(0, 3).map(o => `${o.cls} — ${o.file}:${o.line}`),
  d: x.owners[0] ? x.owners[0].decl.slice(0, 160) : null,
  vc: x.voyagerCalls, vr: x.voyagerReads, vs: x.voyagerSheets.slice(0, 3),
  pc: x.aspCalls, pr: x.aspReads, ps: x.aspPages.slice(0, 3),
  og: x.origin, w: x.wcCount, ui: x.ui, s: x.status,
}));

const out = fs.readFileSync('head.html', 'utf8')
  + fs.readFileSync('body.html', 'utf8')
  + '<script>window.__RDO__=' + JSON.stringify(compact) + ';</script>'
  + fs.readFileSync('script.html', 'utf8');
fs.writeFileSync('rdo-surface-coverage.html', out);

const n = s => compact.filter(x => x.s === s).length;
const og = o => compact.filter(x => x.og === o).length;
const acc = g => {
  const r = compact.filter(x => g ? x.am === g : x.am);
  return `${r.filter(x => x.s === 'wired').length}/${r.length}`;
};
console.log(`wrote rdo-surface-coverage.html (${out.length} bytes)

CHECK these against the prose in body.html — they are hard-coded there:
  in scope        ${compact.length}
  wired           ${n('wired')}  (${(100 * n('wired') / compact.length).toFixed(1)}%)
  remaining       ${n('gap')}
  origins         voyager ${og('voyager')} / asp ${og('asp')} / both ${og('both')} / neither ${og('none')}
  remaining ASP   ${compact.filter(x => x.s === 'gap' && x.og === 'asp').length}
  account mgmt    ${acc(null)}  (directory ${acc('directory')}, session ${acc('session')}, company ${acc('company')})
  ASP pages cited ${new Set(compact.flatMap(x => x.ps)).size}
  undeclared      ${rows.filter(x => !x.owners.length).map(x => x.name).join(', ') || 'none'}`);
