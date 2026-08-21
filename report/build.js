const fs=require('fs');
const S='/home/crazz/SPO-WebClient/src';
const legAll=require('./legacy-all.json');
const voy=require('./voyager-hits.json');
const asp=require('./asp-hits.json');
const hits=require('./webclient-hits.json').filter(h=>!h.file.startsWith('shared/rdo-frame'));

/* ---------- 1. canonical legacy files ---------- */
const FORK=/(^DServer\/|^Cache\/|^Model Extensions\/Mail Server\/|Copy \(|Copy of |DirectoryServer1\.pas|Collection2\.pas|Broadcast2\.pas|ServiceBlock[23]\.pas|IllegalKernel\.pas$)/;
const DROP_DIR=/^(Utils|DSZip|GreedyWork|Persistence)\//;
const canonical=legAll.filter(o=>!DROP_DIR.test(o.file) && !FORK.test(o.file));
// keep Illegal Kernel canonical copy
for(const o of legAll) if(o.file==='Illegal/Illegal Kernel/IllegalKernel.pas') canonical.push(o);

/* ---------- 2. index by member name ---------- */
const legacy=new Map();
for(const o of canonical){
  const k=o.name;
  if(!legacy.has(k)) legacy.set(k,[]);
  const arr=legacy.get(k);
  if(!arr.some(a=>a.cls===o.cls&&a.file===o.file)) arr.push(o);
}

// DServer/ is a second Directory Server project (DServer.dpr) — used only to
// fill members the canonical Directory Server/ project does not declare.
for(const o of legAll){
  if(!o.file.startsWith('DServer/DirectoryServer.pas')) continue;
  if(legacy.has(o.name)) continue;
  legacy.set(o.name,[o]);
}

/* ---------- 3. WebClient emission sites ---------- */
const wcSites=new Map();
const addSite=(n,s)=>{ if(!wcSites.has(n))wcSites.set(n,[]); if(!wcSites.get(n).includes(s))wcSites.get(n).push(s); };
for(const h of hits){ if(/^[A-Z][A-Za-z0-9_]*$/.test(h.arg)) addSite(h.arg, h.file+':'+h.line); }
// dynamic dispatch expansions
for(const p of ['WorldName','WorldURL','DAAddr','DAPort','DALockPort','MailAddr','MailPort','WorldXSize','WorldYSize','WorldSeason'])
  addSite(p,'server/session/login-handler.ts:730 (loop)');
for(const m of ['FindSuppliers','FindClients']) addSite(m,'server/session/politics-handler.ts:1100 (dispatch)');
for(const m of ['AddHeaders']) { addSite(m,'server/session/mail-handler.ts:128'); addSite(m,'server/session/mail-handler.ts:206'); }
addSite('DeleteMessage','server/session/mail-handler.ts:342');
addSite('GetInputNames','server/session/building-details-handler.ts:1147 (gate list)');
addSite('GetOutputNames','server/session/building-details-handler.ts:1147 (gate list)');
const KNOWN=fs.readFileSync(S+'/server/session/building-property-handler.ts','utf8')
  .match(/KNOWN_RDO_COMMANDS[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/)[1]
  .match(/'([^']+)'/g).map(s=>s.slice(1,-1));
for(const m of KNOWN) addSite(m,'server/session/building-property-handler.ts:250,275 (dispatch)');
for(const a of ['Stopped','Name','Rent','Maintenance','Interest','Term','HoursOnAir','Commercials'])
  addSite(a,'server/session/building-property-handler.ts:239,244 (set)');

/* ---------- 4. catalogue ---------- */
const catSrc=fs.readFileSync(S+'/shared/rdo-members.ts','utf8');
const cat=new Map();
for(const m of catSrc.matchAll(/^ {2}([A-Za-z_]\w*):\s+\{ kind: '(\w+)',\s+(?:arity: (\d+)|access: \[([^\]]*)\]) \}/gm))
  cat.set(m[1],{kind:m[2],arity:m[3]?+m[3]:null,access:m[4]?m[4].split(',').map(s=>s.trim().replace(/'/g,'')):null});

/* ---------- 5. UI location map ---------- */
const gj=require('child_process').execSync('node '+__dirname+'/groups.js').toString();
const groupCmds=JSON.parse(gj);
const GROUP_NAME={};
{ const t=fs.readFileSync(S+'/shared/building-details/template-groups.ts','utf8').split('\n');
  let id=null;
  for(const L of t){ let m=L.match(/^\s*id: '([^']+)'/); if(m){id=m[1];continue;}
    m=L.match(/^\s*name: '([^']+)'/); if(m&&id){GROUP_NAME[id]=m[1]; id=null;} } }
const uiFromGroups={};
for(const g of groupCmds){
  const cmd=(g.spec.match(/command: '([^']+)'/)||[])[1]; if(!cmd) continue;
  const member = cmd==='property' ? g.key.replace('Comercials','Commercials') : cmd;
  const label='Inspector ▸ '+(GROUP_NAME[g.group]||g.group)+' ('+g.group+') — '+g.key;
  (uiFromGroups[member]??=new Set()).add(label);
}
const UI={
  RDOMapSegaUser:'Login ▸ Sign-in — account mapping',
  RDOLogonUser:'Login ▸ Sign-in — credential check',
  RDOOpenSession:'Login ▸ Directory session (open)',
  RDOEndSession:'Login ▸ Directory session (close)',
  RDOQueryKey:'Login ▸ World list — world key lookup',
  RDOSearchKey:'Login ▸ World list — world search',
  RDOSetCurrentKey:'Login ▸ World list — select world',
  Logon:'Login ▸ Enter world',
  AccountStatus:'Login ▸ Enter world — account check',
  MailAccount:'Login ▸ Enter world — mail account bootstrap',
  TycoonId:'Login ▸ Enter world — identity bootstrap',
  RDOCnntId:'Login ▸ Enter world — push-channel binding',
  RegisterEventsById:'Login ▸ Enter world — push-channel registration',
  EnableEvents:'Login ▸ Enter world — push-channel enable',
  PickEvent:'HUD — push event drain (no visible control)',
  ClientAware:'Login ▸ Enter world — client-aware handshake',
  ClientNotAware:'Session teardown (logout)',
  SetLanguage:'Login ▸ Enter world — language',
  GetCompanyCount:'Company selector — company count',
  NewCompany:'Company selector ▸ New company',
  GetTycoonCookie:'HUD — restore client settings',
  SetTycoonCookie:'HUD — persist client settings',
  RDOLogonClient:'Map service connect (cache server)',
  LogServerOn:'Mail service connect',
  Logoff:'HUD ▸ Logout',
  KeepAlive:'Session keep-alive (no visible control)',
  ServerBusy:'Session — busy probe (no visible control)',
  WorldName:'Login ▸ Enter world — world bootstrap',
  WorldURL:'Login ▸ Enter world — world bootstrap',
  WorldXSize:'Login ▸ Enter world — world bootstrap',
  WorldYSize:'Login ▸ Enter world — world bootstrap',
  WorldSeason:'Login ▸ Enter world — world bootstrap',
  DAAddr:'Login ▸ Enter world — directory address',
  DAPort:'Login ▸ Enter world — directory port',
  DALockPort:'Login ▸ Enter world — directory lock port',
  MailAddr:'Login ▸ Enter world — mail address',
  MailPort:'Login ▸ Enter world — mail port',
  ObjectAt:'Map — click a building',
  ObjectsInArea:'Map — viewport streaming',
  SegmentsInArea:'Map — road/circuit rendering',
  SetViewedArea:'Map — camera move',
  SwitchFocusEx:'Map — open Building Inspector',
  UnfocusObject:'Building Inspector — close',
  CloneFacility:'Build menu ▸ Clone tool',
  ConnectFacilities:'Inspector ▸ Supplies / Products — Connect',
  DefineZone:'Build menu ▸ Zone tool',
  GetSurface:'Map — surface overlays',
  NewFacility:'Build menu ▸ Place building',
  CreateCircuitSeg:'Road tool ▸ Build road',
  BreakCircuitAt:'Road tool ▸ Demolish road (point)',
  WipeCircuit:'Road tool ▸ Demolish road (area)',
  CreateObject:'Cache navigation (internal)',
  SetObject:'Cache navigation (internal)',
  CloseObject:'Cache navigation (internal)',
  SetPath:'Cache navigation — inspector tab data',
  GetPropertyList:'Inspector — property read',
  GetSubObjectProps:'Inspector ▸ Supplies / Products — gate properties',
  GetInputNames:'Inspector ▸ Supplies — gate list',
  GetOutputNames:'Inspector ▸ Products — gate list',
  Name:'Inspector ▸ General — Rename',
  RDODelFacility:'Inspector — Demolish',
  RDOStartUpgrades:'Inspector ▸ Upgrade — Start',
  RDOStopUpgrade:'Inspector ▸ Upgrade — Stop',
  RDODowngrade:'Inspector ▸ Upgrade — Downgrade',
  RDOVoteOf:'Inspector ▸ Votes — current vote',
  RDOSetRatingFrom:'Politics ▸ Ratings rail',
  RDOSetPublicity:'Politics ▸ Campaign — publicity',
  RDOSetProjectData:'Politics ▸ Campaign — project',
  RDOFavoritesGetSubItems:'Search menu ▸ Towns / Rankings',
  FindSuppliers:'Inspector ▸ Supplies — Search connections',
  FindClients:'Inspector ▸ Products — Search connections',
  RDOGetInvPropsByLang:'Research panel — invention list',
  RDOGetInvDescEx:'Research panel — invention detail',
  NewMail:'Mail ▸ Compose', AddHeaders:'Mail ▸ Compose — headers', AddLine:'Mail ▸ Compose — body',
  Post:'Mail ▸ Send', Save:'Mail ▸ Save draft', OpenMessage:'Mail ▸ Read message',
  GetHeaders:'Mail ▸ Read message — headers', GetLines:'Mail ▸ Read message — body',
  GetAttachment:'Mail ▸ Read message — attachment', GetAttachmentCount:'Mail ▸ Read message — attachments',
  CloseMessage:'Mail ▸ Close message', DeleteMessage:'Mail ▸ Delete', CheckNewMail:'Mail — unread badge',
  RDOLaunchMovie:'Inspector ▸ Films — Launch Movie',
  RDOCancelMovie:'Inspector ▸ Films — Cancel Movie',
  RDOReleaseMovie:'Inspector ▸ Films — Release Movie',
  RdoRepair:'Inspector ▸ General — Repair control (start)',
  RdoStopRepair:'Inspector ▸ General — Repair control (stop)',
  GetUserList:'Chat ▸ User list', GetChannelList:'Chat ▸ Channel list',
  GetChannelInfo:'Chat ▸ Channel info', JoinChannel:'Chat ▸ Join channel',
  SayThis:'Chat ▸ Send message', MsgCompositionChanged:'Chat — typing indicator',
};

/* ---------- 6. area ---------- */
function area(entry){
  const f=entry?entry.file:'', c=entry?entry.cls:'';
  if(/Politics/i.test(f)||/Political|PresidentialHall|Campaign/i.test(c)) return 'Politics';
  if(/Mail/i.test(f)) return 'Mail';
  if(/Inventions|ResearchCenter/i.test(f)) return 'Research';
  if(/Directory Server/i.test(f)||/^DServer\//.test(f)) return 'Directory & Account';
  if(/^Gm\//.test(f)) return 'Game Master';
  if(/Favorites/i.test(f)) return 'Interface Server / Session';
  if(/Interface Server/i.test(f)) return 'Interface Server / Session';
  if(/Cache/i.test(f)) return 'Cache & Object navigation';
  if(/Population|PublicFacility|PopulatedBlock/i.test(f)) return 'Town & Population';
  if(/Circuits|Trains|Transport/i.test(f)) return 'Transport & Circuits';
  if(/StdBlocks|WorkCenter|ConnectedBlock|MediaGates|Illegal/i.test(f)) return 'Facility blocks';
  if(/World\.pas|WorldPolitics/i.test(f)) return 'World';
  if(/Kernel\.pas/i.test(f)) return 'Kernel (Facility / Tycoon / Company)';
  return 'Other';
}

/* ---------- 6b. account management, a cross-cutting tag ----------
 * Three rules, in order. The first is structural: the Directory Server IS the
 * account authority, so every member it publishes is account management by
 * construction. The other two are name lists, because "identity in this world"
 * and "companies under this account" are spread across TClientView /
 * TInterfaceServer / TWorld and no file path separates them.
 */
const ACCT_SESSION = new Set([
  'Logon','Logoff','AccountStatus','MailAccount','TycoonId','RDOCnntId',
  'UserName','GetUserName','ClientViewId','GetClientView','RDOLogonClient',
  'GetTycoonCookie','SetTycoonCookie','Password',
]);
const ACCT_COMPANY = new Set([
  'GetCompanyCount','GetCompanyList','GetCompanyId','GetCompanyName',
  'GetCompanyCluster','GetCompanyFacilityCount','GetCompanyOwnerRole',
  'GetCompanyProfit','NewCompany','RDOGetCompanyList','RDOGetCompanyOwnerRole',
]);
function accountGroup(name, decls){
  // EVERY owner must be a Directory class, not just one: `KeepAlive` is declared
  // on TDirectorySession, TCachedObjectWrap and TMailMessage alike — a generic
  // session heartbeat, not account management.
  // TSessionServer is admitted alongside: its one member here is RDOOpenSession,
  // the same account-session concept mirrored on the Interface Server side.
  const DIR_CLASSES=new Set(['TDirectorySession','TDirectoryServer','TSessionServer']);
  const isDir=d=>DIR_CLASSES.has(d.cls);
  if(decls.length&&decls.every(isDir)) return 'directory';
  if(ACCT_SESSION.has(name)) return 'session';
  if(ACCT_COMPANY.has(name)) return 'company';
  return null;
}

/* ---------- 7. merge ---------- */
const names=new Set([...legacy.keys(), ...cat.keys(), ...Object.keys(voy), ...wcSites.keys()]);
let rows=[];
for(const name of names){
  const decls=legacy.get(name)||[];
  const primary=decls[0]||null;
  const v=voy[name]||[];
  const ap=asp[name]||[];
  const sites=wcSites.get(name)||[];
  const c=cat.get(name)||null;
  const impl=sites.length>0||c!==null;
  let ui=UI[name]||null;
  if(uiFromGroups[name]) ui=[...uiFromGroups[name]].join(' · ');
  let status;
  if(impl) status = ui ? 'wired' : 'emitted';
  else status = (v.length || ap.length) ? 'gap' : 'unused';
  rows.push({
    name,
    kind: c?c.kind:(primary?(primary.kind==='property'?'accessor':primary.kind):'unknown'),
    arity: c&&c.arity!==null?c.arity:(primary&&primary.kind!=='property'?primary.arity:null),
    access: c&&c.access?c.access:(primary&&primary.access?primary.access:null),
    declKind: primary?primary.kind:null,
    owners: decls.map(d=>({cls:d.cls,file:d.file,line:d.line,decl:d.decl})),
    area: area(primary),
    account: accountGroup(name, decls),
    voyager: v.length,
    voyagerCalls: v.filter(h=>h.how==='call').length,
    voyagerReads: v.filter(h=>h.how==='read').length,
    voyagerSheets: [...new Set(v.map(h=>h.file))].slice(0,6),
    asp: ap.length,
    aspCalls: ap.filter(h=>h.how==='call').length,
    aspReads: ap.filter(h=>h.how==='read').length,
    aspPages: [...new Set(ap.filter(h=>h.how==='call').map(h=>h.file))]
              .concat([...new Set(ap.filter(h=>h.how==='read').map(h=>h.file))]).slice(0,4),
    origin: (v.length?(ap.length?'both':'voyager'):(ap.length?'asp':'none')),
    wcCount: sites.length,
    wcSites: sites,
    catalogued: c!==null,
    ui,
    status,
  });
}
// The scope rule: a member no legacy client touches is out of scope. "Legacy
// client" is two corpora, not one — the Voyager desktop client AND the ASP pages
// in ../SPO-ASP, which Voyager embedded and which issue RDO of their own. Members
// the WebClient already emits stay in regardless, so our surface is never
// under-counted.
rows=rows.filter(r=>r.owners.length>0||r.catalogued);
rows=rows.filter(r=>r.voyager>0||r.asp>0||r.wcCount>0||r.catalogued);
rows.sort((a,b)=>a.area.localeCompare(b.area)||a.name.localeCompare(b.name));
fs.writeFileSync('rdo-inventory.json',JSON.stringify(rows,null,1));
const t={}; for(const r of rows){ t[r.status]=(t[r.status]||0)+1; }
console.log('rows',rows.length,t);
const acc=rows.filter(r=>r.account);
const ag={}; for(const r of acc){const k=r.account+'/'+r.status; ag[k]=(ag[k]||0)+1;}
console.log('account management:',acc.length,JSON.stringify(ag));
const noDecl=rows.filter(r=>r.owners.length===0&&r.catalogued).map(r=>r.name);
console.log('catalogued without a declaration:',noDecl.join(', '));
