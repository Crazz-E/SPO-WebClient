const fs=require('fs'),path=require('path');
const SRC='/home/crazz/SPO-WebClient/src';
const files=[];(function w(d){for(const x of fs.readdirSync(d,{withFileTypes:true})){const f=path.join(d,x.name);
 if(x.isDirectory()){if(['node_modules','__tests__','__mocks__','mock-server'].includes(x.name))continue;w(f)}
 else if(/\.tsx?$/.test(x.name)&&!/\.test\.tsx?$/.test(x.name))files.push(f)}})(SRC);
const hits=[];
for(const f of files){
  const txt=fs.readFileSync(f,'utf8'); const lines=txt.split('\n');
  for(let i=0;i<lines.length;i++){
    for(const m of lines[i].matchAll(/\brdo(Call|Get|Set)\(\s*(?:\/\*[^*]*\*\/\s*)?([^,)\s]*)/g)){
      let arg=m[2];
      if(!arg){ arg=(lines[i+1]||'').trim().split(/[,)]/)[0]; }
      hits.push({file:path.relative(SRC,f),line:i+1,verb:m[1].toLowerCase(),arg:arg.replace(/['"]/g,'')});
    }
  }
}
fs.writeFileSync('webclient-hits.json',JSON.stringify(hits,null,1));
const lit=hits.filter(h=>/^[A-Za-z_]\w*$/.test(h.arg)&&/^[A-Z]/.test(h.arg));
const dyn=hits.filter(h=>!lit.includes(h));
console.log('total',hits.length,'literal',lit.length);
console.log('--- dynamic sites:'); for(const h of dyn) console.log(h.file+':'+h.line,h.verb,JSON.stringify(h.arg));
