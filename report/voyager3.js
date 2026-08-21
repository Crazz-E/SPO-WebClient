const fs=require('fs'),path=require('path');
const ROOT='/home/crazz/SPO-Original/Voyager';
const legAll=require('./legacy-all.json');
const NAMES=new Set(legAll.map(o=>o.name));
const files=[];(function w(d){for(const x of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,x.name); if(x.isDirectory())w(f); else if(/\.pas$/i.test(x.name))files.push(f)}})(ROOT);
const LOCAL=new Set(['BindTo','Connect','Disconnect','Connected','Free','Create','ObjectId','ServerId','RDOId','Reset','Bind','Unbind','ClientId','WaitForAnswer','TimeOut','Timeout','SetConnection','RemoteObjectId','Properties','ClearProperties','AddProperty','SetProxy','GetProxy']);
const by={};
const add=(name,file,line,how)=>{ if(LOCAL.has(name))return; (by[name]??=[]).push({file,line,how}); };
for(const f of files){
  const txt=fs.readFileSync(f,'latin1'); const lines=txt.split(/\r?\n/); const rel=path.relative(ROOT,f);
  const vars=new Set();
  for(const m of txt.matchAll(/^\s*([A-Za-z_][\w\s,]*?)\s*:\s*OleVariant\s*;/gmi)) for(const v of m[1].split(',')) vars.add(v.trim());
  for(const m of txt.matchAll(/\b(\w*Proxy\w*)\s*:/g)) vars.add(m[1]);
  const list=[...vars].map(v=>v.replace(/[^\w]/g,'')).filter(Boolean);
  const re=list.length?new RegExp('\\b('+list.join('|')+')\\.([A-Za-z_]\\w*)','g'):null;
  for(let i=0;i<lines.length;i++){
    const L=lines[i];
    if(re) for(const m of L.matchAll(re)) add(m[2],rel,i+1,'call');
    for(const m of L.matchAll(/\.\s*(RDO[A-Za-z_]\w*|Rdo[A-Za-z_]\w*)\s*\(/g)) add(m[1],rel,i+1,'call');
    for(const m of L.matchAll(/'([A-Za-z_][A-Za-z0-9_]{2,})'/g)) if(NAMES.has(m[1])) add(m[1],rel,i+1,'read');
  }
}
for(const k of Object.keys(by)){
  const seen=new Set();
  by[k]=by[k].filter(h=>{const s=h.how+'|'+h.file+':'+h.line; if(seen.has(s))return false; seen.add(s); return true;});
}
fs.writeFileSync('voyager-hits.json',JSON.stringify(by,null,1));
const calls=Object.values(by).filter(v=>v.some(h=>h.how==='call')).length;
console.log('distinct',Object.keys(by).length,'with call evidence',calls,'sites',Object.values(by).reduce((n,v)=>n+v.length,0));
