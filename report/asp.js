const fs=require('fs'),path=require('path');
const ROOT='/home/crazz/SPO-ASP';
const legAll=require('./legacy-all.json');
const NAMES=new Set(legAll.map(o=>o.name));
const LOCAL=new Set(['SetWorld','SetObjectOfWorld','SetConnection','BindTo','TimeOut','Timeout','Connect','Server','Port','CreateObject','Write','Expires']);
const files=[];(function w(d){for(const x of fs.readdirSync(d,{withFileTypes:true})){
  if(x.name==='.git')continue; const f=path.join(d,x.name);
  if(x.isDirectory())w(f); else if(/\.(asp|inc|asa|asmx)$/i.test(x.name))files.push(f);}})(ROOT);

const by={}; const seen=new Set();
const add=(name,page,how)=>{
  if(LOCAL.has(name)) return;
  const k=how+'|'+page.replace(/^Five\/[0-9]+\//,'Five/*/')+'|'+name; if(seen.has(k))return; seen.add(k);
  (by[name]??=[]).push({file:page,how});
};
for(const f of files){
  const rel=path.relative(ROOT,f).replace(/\\/g,'/');
  // Dedupe across the six world instances, but cite Five/0 — the instance the
  // gateway fetches and the one doc/ has always cited. A page missing from Five/0
  // keeps the <world> marker so the citation is never a dead path.
  // The bare Five/<path> template duplicates the per-world pages; skip it whenever
  // Five/0 carries the same page (memory: its line numbers land elsewhere anyway).
  if(/^Five\/(?![0-9]+\/)/.test(rel) && fs.existsSync(path.join(ROOT,rel.replace(/^Five\//,'Five/0/')))) continue;
  const norm=rel.replace(/^Five\/[0-9]+\//,'Five/<world>/');
  const zero=norm.replace('Five/<world>/','Five/0/');
  const page = norm===rel ? rel
             : fs.existsSync(path.join(ROOT,zero)) ? zero : norm;
  const txt=fs.readFileSync(f,'latin1');
  const proxy=new Set(), cache=new Set(['Obj']);
  for(const m of txt.matchAll(/set\s+([A-Za-z_]\w*)\s*=\s*Server\.CreateObject\(\s*"RDOClient\.RDOObjectProxy"\s*\)/gi)){ proxy.add(m[1]); cache.delete(m[1]); }
  for(const m of txt.matchAll(/set\s+([A-Za-z_]\w*)\s*=\s*Server\.CreateObject\(\s*"CacheManager\.[A-Za-z]+"\s*\)/gi)) cache.add(m[1]);
  // ASP.NET (.asmx) form: Dim x = Server.CreateObject("RDOClient.RDOObjectProxy")
  for(const m of txt.matchAll(/Dim\s+([A-Za-z_]\w*)\s*=\s*Server\.CreateObject\(\s*"RDOClient\.RDOObjectProxy"\s*\)/gi)){ proxy.add(m[1]); cache.delete(m[1]); }

  const mk=set=>set.size?new RegExp('\\b('+[...set].join('|')+')\\.([A-Za-z_]\\w*)','g'):null;
  const rp=mk(proxy), rc=mk(cache);
  if(rp) for(const m of txt.matchAll(rp)) add(m[2],page,'call');
  for(const m of txt.matchAll(/\.\s*((?:RDO|Rdo)[A-Za-z_]\w*)/g)) add(m[1],page,'call');
  if(rc) for(const m of txt.matchAll(rc)) if(NAMES.has(m[2])) add(m[2],page,'read');
  for(const m of txt.matchAll(/"([A-Za-z_][A-Za-z0-9_]{2,})"/g)) if(NAMES.has(m[1])) add(m[1],page,'read');
}
fs.writeFileSync('asp-hits.json',JSON.stringify(by,null,1));
const calls=Object.values(by).filter(v=>v.some(h=>h.how==='call')).length;
console.log('files',files.length,'distinct members',Object.keys(by).length,'with call evidence',calls,
            'sites',Object.values(by).reduce((n,v)=>n+v.length,0));
