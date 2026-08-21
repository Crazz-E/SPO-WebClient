const fs=require('fs');
const F='/home/crazz/SPO-WebClient/src/shared/building-details/template-groups.ts';
const lines=fs.readFileSync(F,'utf8').split('\n');
let group=null,label=null,inCmds=false;
const out=[];
for(let i=0;i<lines.length;i++){
  const L=lines[i];
  let m=L.match(/^\s*id:\s*'([^']+)'/); if(m&&!inCmds){group=m[1];label=null;continue;}
  m=L.match(/^\s*(label|title|name):\s*'([^']+)'/); if(m&&!label&&group){label=m[2];}
  if(/^\s*rdoCommands:\s*\{/.test(L)){inCmds=true;continue;}
  if(inCmds){ if(/^\s*\},?\s*$/.test(L)){inCmds=false;continue;}
    const c=L.match(/^\s*'?([A-Za-z_]\w*)'?\s*:\s*(.*)$/);
    if(c) out.push({group,label,key:c[1],spec:c[2].replace(/\s+/g,' ').trim(),line:i+1});
  }
}
console.log(JSON.stringify(out,null,1));
