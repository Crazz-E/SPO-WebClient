const fs=require('fs'),path=require('path');
const ROOT='/home/crazz/SPO-Original';
const DPRS=['Model Server/FIVEModelServer.dpr','Interface Server/FIVEInterfaceServer.dpr','Directory Server/FIVEDirectoryServer.dpr','Cache Server/FIVECacheServer.dpr','Mail Server/FIVEMailServer.dpr'];
// index every .pas by basename
const all=[]; (function w(d){let e;try{e=fs.readdirSync(d,{withFileTypes:true})}catch{return}
 for(const x of e){const f=path.join(d,x.name); if(x.isDirectory()){if(/^(Voyager|Voyager\.1|Rdo\.BIN|Rdo\.IS|Borland|Bins|IB)$/i.test(x.name))continue; w(f)} else if(/\.pas$/i.test(x.name)) all.push(f)}})(ROOT);
const byBase={}; for(const f of all){const b=path.basename(f,path.extname(f)).toLowerCase(); (byBase[b]??=[]).push(f);} 
const resolved=new Map(); // unitLower -> file
const queue=[];
for(const d of DPRS){
  const txt=fs.readFileSync(path.join(ROOT,d),'latin1');
  for(const m of txt.matchAll(/^\s+(\w+) in '([^']+)'/gm)){
    const p=path.resolve(path.join(ROOT,path.dirname(d)), m[2].replace(/\\/g,'/'));
    if(fs.existsSync(p)){ resolved.set(m[1].toLowerCase(),p); queue.push(p); }
  }
}
const seen=new Set(queue);
while(queue.length){
  const f=queue.pop();
  const txt=fs.readFileSync(f,'latin1');
  const iface=txt.split(/^\s*implementation\s*$/mi)[0];
  for(const part of [iface, txt]){
    for(const m of part.matchAll(/\buses\b([\s\S]*?);/gi)){
      for(const u of m[1].split(',')){
        const name=u.trim().split(/\s+/)[0].replace(/[^A-Za-z0-9_]/g,'');
        if(!name) continue; const k=name.toLowerCase();
        if(resolved.has(k)) continue;
        const cand=byBase[k]; if(!cand) continue;
        // prefer a candidate whose "unit X;" matches exactly
        let pick=cand.find(c=>new RegExp('^\\s*unit\\s+'+name+'\\s*;','mi').test(fs.readFileSync(c,'latin1').slice(0,400)))||cand[0];
        resolved.set(k,pick); if(!seen.has(pick)){seen.add(pick);queue.push(pick);}
      }
    }
    break; // only interface uses
  }
}
const files=[...new Set(resolved.values())].sort();
fs.writeFileSync('server-units.json',JSON.stringify(files,null,1));
console.log('units in server closure:',files.length);
console.log(files.filter(f=>/Kernel/i.test(f)).map(f=>path.relative(ROOT,f)).join('\n'));
