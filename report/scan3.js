const fs=require('fs'),path=require('path');
const ROOT='/home/crazz/SPO-Original';
const SKIP_DIR=/^(Voyager|Voyager\.1|Rdo\.BIN|Rdo\.IS|Borland|Bins|IB|DirectX Sources|Installer|InstallerSplash|Tests|log2|sponlinemon|Explorer)$/i;
const SKIP_FILE=/(Kernel[0-9]\.pas|Kernel\.(ok|Iroel|last)\.pas|^Copy of |OLE DirectoryServer\.pas|Backup\.pas$)/i;
const VCL=/^(Utils\/Vcl|Utils\/Network|Memory|Utils\/Rtl)/i;
const files=[];(function w(d){let e;try{e=fs.readdirSync(d,{withFileTypes:true})}catch{return}
 for(const x of e){const f=path.join(d,x.name);
  if(x.isDirectory()){ if(SKIP_DIR.test(x.name))continue; w(f);} 
  else if(/\.pas$/i.test(x.name)&&!SKIP_FILE.test(x.name)) files.push(f)}})(ROOT);
const VIS=/^\s*(private|protected|public|published|automated)\s*(\/\/.*|\{[^}]*\})?\s*$/i;
const out=[];
for(const f of files){
  const relf=path.relative(ROOT,f).replace(/\\/g,'/');
  if(VCL.test(relf)) continue;
  let lines; try{lines=fs.readFileSync(f,'latin1').split(/\r?\n/)}catch{continue}
  let cls=null,vis=null,pending=null;
  for(let i=0;i<lines.length;i++){
    const L=lines[i];
    if(!L.trim()) continue;
    const p=L.match(/^\s*(T[A-Za-z0-9_]+)\s*=\s*$/);
    if(p){pending=p[1];continue;}
    if(pending){ if(/^\s*(packed\s+)?class\b/i.test(L)&&!/^\s*class\s*;/i.test(L)){cls=pending;vis=null;} pending=null; if(/class/i.test(L))continue; }
    const m=L.match(/^\s*(T[A-Za-z0-9_]+)\s*=\s*(packed\s+)?class\b(.*)$/i);
    if(m){ if(!/^\s*;/.test(m[3])){cls=m[1];vis=null;} continue; }
    const v=L.match(VIS); if(v){vis=v[1].toLowerCase();continue;}
    if(vis!=='published'||!cls) continue;
    const d=L.match(/^\s*(function|procedure|property)\s+([A-Za-z_][A-Za-z0-9_]*)(.*)$/i);
    if(!d) continue;
    if(d[3].startsWith('.')) continue;
    let decl=L.trim(),j=i;
    while(!decl.includes(';')&&j+1<lines.length&&j-i<8){j++;decl+=' '+lines[j].trim();}
    decl=decl.replace(/\s+/g,' ');
    let arity=0; const pm=decl.match(/\(([^)]*)\)/);
    if(pm&&pm[1].trim()) arity=pm[1].split(';').reduce((n,g)=>n+g.split(':')[0].split(',').length,0);
    let access=null;
    if(d[1].toLowerCase()==='property'){access=[];if(/\bread\s+\w+/i.test(decl))access.push('get');if(/\bwrite\s+\w+/i.test(decl))access.push('set');}
    out.push({file:relf,line:i+1,cls,kind:d[1].toLowerCase(),name:d[2],arity,access,decl});
  }
}
fs.writeFileSync('legacy-all.json',JSON.stringify(out,null,1));
console.log('files',files.length,'members',out.length,'distinct',new Set(out.map(o=>o.name)).size);
