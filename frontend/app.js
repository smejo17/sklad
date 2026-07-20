// ===== KONFIG (verejné hodnoty) =====
const SUPA_URL="https://tvdwaknflrrreeqsetqu.supabase.co";
const SUPA_KEY="sb_publishable_eRv55m3ChcSTGd3YoRspBg_TxYlC5NF";
const sb=window.supabase.createClient(SUPA_URL,SUPA_KEY);

const $=s=>document.querySelector(s);
const esc=s=>(s==null?"":String(s)).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let ME={email:"",role:"",id:"",perms:[]};
// kopírovanie do schránky + malá ikonka
function copyText(t){const s=String(t==null?"":t);if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).catch(()=>{});}else{const ta=document.createElement("textarea");ta.value=s;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");}catch(e){}ta.remove();}}
function copyBtn(t){const s=String(t==null?"":t).replace(/'/g,"\\'").replace(/"/g,"&quot;");return `<span onclick="event.stopPropagation();copyText('${s}');this.textContent='✓';setTimeout(()=>this.textContent='📋',900)" title="Kopírovať" style="cursor:pointer;color:#7a8aa5;margin-left:4px;font-size:12px">📋</span>`;}
let DATA={products:[],warehouses:[],locations:[],categories:[],brands:[]};
let recvSel=null, issueLots=[], issueSel=null, prodEdit=undefined, tab="recv";
const REASONS=["predaj","presun medzi skladmi","likvidácia","reklamácia","oprava","vzorka / test","strata","iné"];
// oprávnenia sa načítajú podľa roly z role_permissions (viď onLogin)
const hasPerm=(code)=>ME.role==="admin"||ME.perms.includes(code);
const canWrite=()=>ME.role==="admin"||hasPerm("inventory.move")||hasPerm("product.edit")||hasPerm("shipment.edit");
const canDelete=()=>ME.role==="admin"||hasPerm("product.delete");

// ===== AUTH =====
async function init(){const {data:{session}}=await sb.auth.getSession();if(session)await onLogin();else showLogin();}
function showLogin(){$("#loginView").classList.remove("hide");$("#appView").classList.add("hide");}
async function doLogin(){
  const email=$("#li_email").value.trim(),password=$("#li_pass").value;
  $("#li_btn").disabled=true;$("#li_msg").innerHTML="";
  const {error}=await sb.auth.signInWithPassword({email,password});
  $("#li_btn").disabled=false;
  if(error){$("#li_msg").innerHTML=`<div class="msg err">${esc(error.message)}</div>`;return;}
  await onLogin();
}
async function doLogout(){await sb.auth.signOut();showLogin();}
async function onLogin(){
  const {data:{user}}=await sb.auth.getUser();ME.email=user?user.email:"";ME.id=user?user.id:"";
  const {data:prof}=await sb.from("profiles").select("role").eq("id",user.id).maybeSingle();
  ME.role=prof?prof.role:"visitor";
  // načítaj oprávnenia podľa roly (pre skladník/technik/zamestnanec/… bez hardcode)
  ME.perms=[];
  try{const {data:roleRow}=await sb.from("roles").select("id").eq("name",ME.role).maybeSingle();
    if(roleRow){const {data:rp}=await sb.from("role_permissions").select("permissions(code)").eq("role_id",roleRow.id);
      ME.perms=(rp||[]).map(x=>x.permissions&&x.permissions.code).filter(Boolean);}}catch(e){}
  $("#a_email").textContent=ME.email;$("#a_role").textContent=ME.role;
  $("#sb_email").textContent=ME.email;$("#sb_role").textContent=ME.role;
  $("#loginView").classList.add("hide");$("#appView").classList.remove("hide");
  const notAdmin=ME.role!=="admin";
  ["tab_admin","tab_cats","tab_dupes","nav_admin","nav_cats","nav_dupes","grp_admin"].forEach(x=>{const el=$("#"+x);if(el)el.classList.toggle("hide",notAdmin);});
  loadFilters();loadStockFilters();
  const saved=localStorage.getItem("uimode");isMobile = saved? saved==="m" : matchMedia("(max-width:760px)").matches;
  await loadData();applyMode();route();
}
// ===== režim PC / mobil =====
// Mobil = zjednodušené: pridávanie zásob (Príjem) + zásielok, vyhľadávanie/zoznam
//          zásob a zásielok. Admin má navyše pridávanie produktov.
let isMobile=false;
function mobileTabs(){return TABS.filter(t=>!ADMIN_TABS.includes(t)||ME.role==="admin");}
function applyMode(){
  document.getElementById("appView").classList.toggle("mob",isMobile);
  const allow=mobileTabs();
  TABS.forEach(t=>{const el=$("#tab_"+t);if(!el)return;
    if(isMobile){el.classList.toggle("hide",!allow.includes(t));}
    else{el.classList.remove("hide");if(ADMIN_TABS.includes(t))el.classList.toggle("hide",ME.role!=="admin");}});
  const mb=$("#modeBtn"),mb2=$("#modeBtn2");
  if(mb){mb.textContent="💻";mb.title="Prepnúť na PC verziu";}
  if(mb2)mb2.textContent=isMobile?"💻 PC verzia":"📱 Mobilná verzia";
  if(isMobile && !allow.includes(tab))setTab("recv");
}
function toggleMode(){isMobile=!isMobile;localStorage.setItem("uimode",isMobile?"m":"p");applyMode();}
// ===== zapamätané filtre pre používateľa (localStorage) =====
function loadFilters(){try{const s=localStorage.getItem("flt_"+ME.id);if(s){const o=JSON.parse(s);if(o.pf)pf=Object.assign(pf,o.pf);}}catch(e){}}
function saveFilters(){try{localStorage.setItem("flt_"+ME.id,JSON.stringify({pf}));}catch(e){}}
// ===== normalizácia názvu + kontrola duplicít =====
function normName(s){return (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function similarProduct(name,exceptId){const n=normName(name);if(n.length<3)return null;return DATA.products.find(p=>p.id!==exceptId&&normName(p.name)===n)||null;}

// ===== DÁTA =====
async function loadData(){
  const [p,w,l,c,b,tg,pt,ad,pa]=await Promise.all([
    sb.from("products").select("id,name,model,sku,category_id,price,currency,weight_g,brand_id,image_url,description,long_description,price_source,price_updated_at,brands(name)").order("name").limit(3000),
    sb.from("warehouses").select("id,name,address,color").order("name"),
    sb.from("warehouse_locations").select("id,warehouse_id,code,description").order("sort_order"),
    sb.from("categories").select("id,name,parent_id").order("name"),
    sb.from("brands").select("id,name").order("name"),
    sb.from("tags").select("id,name").order("name"),
    sb.from("product_tags").select("product_id,tag_id"),
    sb.from("attribute_defs").select("id,category_id,attr_key,label,type,unit,options,sort_order").order("sort_order"),
    sb.from("product_attributes").select("product_id,attr_def_id,value,value_num")
  ]);
  DATA.products=p.data||[];DATA.warehouses=w.data||[];DATA.locations=l.data||[];DATA.categories=c.data||[];DATA.brands=b.data||[];
  DATA.tags=tg.data||[];DATA.ptags=pt.data||[];DATA.attrDefs=ad.data||[];DATA.pattrs=pa.data||[];
}
function catAncestors(catId){const ids=[];let id=catId,g=0;while(id!=null&&g++<10){ids.push(Number(id));const c=DATA.categories.find(x=>x.id===id);id=c?c.parent_id:null;}return ids;}
function attrDefsForCat(catId){if(!catId)return [];const anc=new Set(catAncestors(Number(catId)));return DATA.attrDefs.filter(d=>anc.has(Number(d.category_id))).sort((a,b)=>((a.sort_order||0)-(b.sort_order||0))||(a.label||"").localeCompare(b.label||""));}
function productAttrList(pid){const vals=DATA.pattrs.filter(x=>x.product_id===pid);return vals.map(v=>{const d=DATA.attrDefs.find(x=>x.id===v.attr_def_id);return d?{label:d.label,unit:d.unit,value:v.value}:null;}).filter(Boolean);}
const TAG_PALETTE=[["#e6eefb","#2a4fa0"],["#e4f6ea","#1d7d43"],["#fdf0df","#a8630c"],["#f3eefb","#5e37a6"],["#fde8e7","#b02a26"],["#e0f7f5","#0d7a70"],["#eef1f6","#41506a"]];
function tagColor(name){let h=0;const s=String(name||"");for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;return TAG_PALETTE[h%TAG_PALETTE.length];}
function tagChip(t,active,onclick){const c=tagColor(t.name);return `<span class="tagchip ${active?"on":""}" style="background:${c[0]};color:${c[1]}" onclick="${onclick}">#${esc(t.name)}</span>`;}
function tagName(id){const t=DATA.tags.find(x=>x.id===id);return t?t.name:"";}
function productTagIds(pid){return DATA.ptags.filter(x=>x.product_id===pid).map(x=>x.tag_id);}
function productTagNames(pid){return productTagIds(pid).map(tagName).filter(Boolean);}
function locsOf(whId){return DATA.locations.filter(l=>l.warehouse_id===Number(whId));}
function brandName(p){return (p.brands&&p.brands.name)||"";}
// ===== FOTKY: kompresia + upload do Storage =====
function blobToImg(b){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(b);});}
function canvasBlob(cv,q){return new Promise(r=>cv.toBlob(r,"image/jpeg",q));}
async function compressImage(file,maxBytes,maxDim){
  const img=await blobToImg(file);let w=img.width,h=img.height;
  if(Math.max(w,h)>maxDim){const s=maxDim/Math.max(w,h);w=Math.round(w*s);h=Math.round(h*s);}
  const cv=document.createElement("canvas");cv.width=w;cv.height=h;cv.getContext("2d").drawImage(img,0,0,w,h);
  let q=0.9,blob=await canvasBlob(cv,q);
  while(blob.size>maxBytes&&q>0.35){q-=0.1;blob=await canvasBlob(cv,q);}
  while(blob.size>maxBytes&&w>400){w=Math.round(w*0.85);h=Math.round(h*0.85);cv.width=w;cv.height=h;cv.getContext("2d").drawImage(img,0,0,w,h);blob=await canvasBlob(cv,0.8);}
  return blob;
}
async function uploadPhoto(blob,folder){
  const name=folder+"/"+Date.now()+"_"+Math.random().toString(36).slice(2)+".jpg";
  const {error}=await sb.storage.from("photos").upload(name,blob,{contentType:"image/jpeg"});
  if(error)throw error;
  return sb.storage.from("photos").getPublicUrl(name).data.publicUrl;
}
// vyber fotku -> opýtaj sa na účel -> zmenši -> nahraj -> cb(url,kb)
function pickPhoto(folder,cb){
  const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;
    const big=confirm("Je to FOTODOKUMENTÁCIA (server, zostava, detaily)?\n\nOK = áno (do ~1 MB)\nZrušiť = bežný/spotrebný tovar (~150 kB)");
    const maxBytes=big?1024*1024:150*1024,maxDim=big?1600:900;
    try{const blob=await compressImage(f,maxBytes,maxDim);const url=await uploadPhoto(blob,folder);cb(url,Math.round(blob.size/1024));}
    catch(e){alert("Nahranie fotky zlyhalo: "+(e.message||e));}
  };
  inp.click();
}
function catName(id){const c=DATA.categories.find(x=>x.id===id);return c?c.name:"";}
function whName(id){const w=DATA.warehouses.find(x=>x.id===id);return w?w.name:"—";}
// ===== OREZANIE FOTKY (napr. sériové číslo) =====
let cropCb=null,cropRect=null,cropDrag=null;
function openCrop(file,cb){cropCb=cb;const img=$("#cropImg");
  img.onload=()=>{$("#cropSel").style.display="none";cropRect=null;$("#cropOverlay").classList.remove("hide");};
  img.src=URL.createObjectURL(file);
  const st=$("#cropStage");st.onpointerdown=cropDown;st.onpointermove=cropMove;st.onpointerup=cropUp;st.onpointerleave=cropUp;}
function cropPos(e){const r=$("#cropStage").getBoundingClientRect();return {x:Math.max(0,Math.min(e.clientX-r.left,r.width)),y:Math.max(0,Math.min(e.clientY-r.top,r.height))};}
function cropDown(e){cropDrag=cropPos(e);const s=$("#cropSel");s.style.display="block";s.style.left=cropDrag.x+"px";s.style.top=cropDrag.y+"px";s.style.width="0px";s.style.height="0px";e.preventDefault();}
function cropMove(e){if(!cropDrag)return;const p=cropPos(e);const x=Math.min(p.x,cropDrag.x),y=Math.min(p.y,cropDrag.y),w=Math.abs(p.x-cropDrag.x),h=Math.abs(p.y-cropDrag.y);const s=$("#cropSel");s.style.left=x+"px";s.style.top=y+"px";s.style.width=w+"px";s.style.height=h+"px";cropRect={x,y,w,h};e.preventDefault();}
function cropUp(){cropDrag=null;}
function cropCancel(){cropCb=null;cropRect=null;$("#cropOverlay").classList.add("hide");}
async function cropApply(){
  const img=$("#cropImg");const rect=$("#cropStage").getBoundingClientRect();
  const sx=img.naturalWidth/rect.width, sy=img.naturalHeight/rect.height;
  let r=cropRect; if(!r||r.w<8||r.h<8)r={x:0,y:0,w:rect.width,h:rect.height};
  const padX=r.w*0.04, padY=r.h*0.10; // ~1 mm okraj okolo
  const cx=Math.max(0,(r.x-padX)*sx), cy=Math.max(0,(r.y-padY)*sy);
  const cw=Math.min(img.naturalWidth-cx,(r.w+2*padX)*sx), ch=Math.min(img.naturalHeight-cy,(r.h+2*padY)*sy);
  const cv=document.createElement("canvas");cv.width=Math.max(1,Math.round(cw));cv.height=Math.max(1,Math.round(ch));
  cv.getContext("2d").drawImage(img,cx,cy,cw,ch,0,0,cv.width,cv.height);
  const blob=await new Promise(res=>cv.toBlob(res,"image/jpeg",0.9));
  const cb=cropCb;cropCancel();
  try{const url=await uploadPhoto(blob,"serials");if(cb)cb(url);}catch(e){alert("Nahranie zlyhalo: "+(e.message||e));}
}

// ===== TABY =====
const TABS=["recv","issue","stock","prods","ship","repairs","assets","docs","qr","cats","dupes","admin"];
const ADMIN_TABS=["cats","dupes","admin"];
const TAB_TITLE={recv:["Príjem na sklad","Naskladnenie tovaru — vyhľadaj/naskenuj produkt a prijmi"],
  issue:["Výdaj zo skladu","Vyskladnenie — nájdi položku cez QR / SN / názov"],
  stock:["Zásoby","Stav skladu · triedenie do kategórií, tagy, obrázky, fotky"],
  prods:["Produkty","Katalóg · značka, kategórie, parametre podľa kategórie · kontrola duplicít"],
  ship:["Zásielky","Prichádzajúce/odchádzajúce · tracking, colné, obsah, platby"],
  repairs:["Opravy a reklamácie","Servis — opravné príjemky, fotky, stavy, termíny"],
  assets:["Majetok","Firemný majetok — správca, budova/miestnosť, výpisy podľa kritérií"],
  docs:["Doklady (príjem/výdaj)","História pohybov — kto, kedy, čo"],
  qr:["Tlač QR kódov","Predpripravené unikátne kódy · zásobník na tlač"],
  cats:["Kategórie a tagy","Vytvárať, upravovať, presúvať, zlučovať kategórie a tagy"],
  dupes:["Duplicity","Nájsť a zlúčiť duplicitné produkty"],
  admin:["Správa","Sklady, pozície, role a používatelia"]};
const RENDER={recv:renderRecv,issue:renderIssue,stock:loadStock,prods:renderProds,ship:renderShip,repairs:renderRepairs,assets:renderAssets,docs:loadDocs,qr:renderQR,cats:renderCats,dupes:renderDupes,admin:renderSettings};
// len zvýrazní tab + hlavičku (bez vykreslenia obsahu)
function markTab(t){tab=t;
  TABS.forEach(x=>{const b=$("#tab_"+x);if(b)b.classList.toggle("on",x===t);const n=$("#nav_"+x);if(n)n.classList.toggle("on",x===t);});
  const ti=TAB_TITLE[t]||["Sklad",""];$("#pageTitle").textContent=ti[0];$("#pageSub").textContent=ti[1];}
function setTab(t){markTab(t);$("#view").className="";RENDER[t]();navHash(t);}

// ===== ROUTING (hash v adrese — zdieľateľné odkazy + tlačidlá Späť/Vpred) =====
// taby: #stock ; detail: #ship/123 , #prods/45 , #repairs/7 , #assets/3
const DETAIL={ship:shipDetail,prods:prodDetail,repairs:repairDetail,assets:assetDetail};
let _routeLock=false;
// nastaví adresu bez zacyklenia (hashchange sa preskočí, ak zmenu vyvolala appka)
function navHash(h){if(("#"+h)!==location.hash){_routeLock=true;location.hash=h;}}
function route(){
  const raw=decodeURIComponent((location.hash||"").replace(/^#\/?/,""));
  if(!raw){setTab("recv");return;}
  const i=raw.indexOf("/");const t=i<0?raw:raw.slice(0,i);const id=i<0?"":raw.slice(i+1);
  if(!TABS.includes(t)||(ADMIN_TABS.includes(t)&&ME.role!=="admin")){setTab("recv");return;}
  if(id&&DETAIL[t]){markTab(t);$("#view").className="";DETAIL[t](/^\d+$/.test(id)?Number(id):id);navHash(t+"/"+id);return;}
  setTab(t);
}
window.addEventListener("hashchange",()=>{if(_routeLock){_routeLock=false;return;}route();});

// ===== SKENOVANIE QR (kamera) =====
let qrScanner=null,scanCb=null,torchOn=false;
// z web-QR (firma.sk/i/KOD) vytiahne samotný kód; inak vráti pôvodný text
function qrNormScan(t){const s=String(t||"").trim();const m=s.match(/\/(?:i|p)\/([^/?#]+)/);return m?m[1]:s;}
function getFmts(){try{const F=Html5QrcodeSupportedFormats;return [F.QR_CODE,F.CODE_128,F.CODE_39,F.CODE_93,F.EAN_13,F.EAN_8,F.UPC_A,F.UPC_E,F.ITF,F.CODABAR,F.DATA_MATRIX];}catch(e){return undefined;}}
// je to EAN/UPC (produktový kód)? podľa formátu skenera alebo čistej číslice 8/12/13/14
function isEanCode(code,fmt){const f=String(fmt||"").toUpperCase();if(/EAN|UPC/.test(f))return true;const digits=String(code||"").replace(/\D/g,"");return /^\d{8}$|^\d{12,14}$/.test(digits)&&String(code||"").replace(/[\s\d]/g,"").length===0;}
let scanPrefer=null,scanIgnored=null;
function openScan(cb,opts){scanCb=cb;scanPrefer=(opts&&opts.prefer)||null;scanIgnored=null;torchOn=false;$("#scanOverlay").classList.remove("hide");
  const isQr=!!(opts&&opts.qr);
  const hint=$("#scanHint");if(hint){hint.classList.add("hide");hint.innerHTML="";}
  const lbl=$("#scanLbl");if(lbl)lbl.textContent=isQr?"Naskenuj QR kód (alebo sériové číslo)":(scanPrefer==="ean"?"Namier na EAN / čiarový kód (číslice) — nie na sériové číslo":"Namier na kód · pri malom priblíž zoomom alebo odfoť");
  if(!window.Html5Qrcode){alert("Skener sa nenačítal (internet?).");closeScan();return;}
  $("#zoomWrap").classList.add("hide");$("#torchBtn").style.display="none";
  qrScanner=new Html5Qrcode("reader");
  // vyššie rozlíšenie = malý kód má viac pixelov
  const onScan=(txt,res)=>{const code=qrNormScan(txt);const fmt=res&&res.result&&res.result.format&&res.result.format.formatName;scanAccept(code,fmt);};
  // QR = štvorcové okno; čiarový kód = širšie okno
  const box=isQr?{width:240,height:240}:{width:270,height:180};
  // prvý argument start() smie mať IBA 1 kľúč; rozlíšenie ide cez videoConstraints v konfigurácii
  const cfg={fps:12,qrbox:box,formatsToSupport:getFmts(),videoConstraints:{facingMode:"environment",width:{ideal:1920},height:{ideal:1080}}};
  qrScanner.start({facingMode:"environment"},cfg,onScan,()=>{})
    .then(setupCamControls)
    .catch(()=>{ // fallback bez náročných constraints (prísnejšie prehliadače/zariadenia)
      qrScanner.start({facingMode:"environment"},{fps:10,qrbox:box,formatsToSupport:getFmts()},onScan,()=>{})
        .then(setupCamControls).catch(e=>{alert("Kamera sa nespustila: "+e);closeScan();});
    });
}
// spracuj naskenovaný kód so zohľadnením preferencie (EAN vs sériové číslo)
function scanAccept(code,fmt){
  if(scanPrefer==="ean"&&!isEanCode(code,fmt)){
    scanIgnored=code;const hint=$("#scanHint");
    if(hint){hint.classList.remove("hide");hint.innerHTML=`Toto vyzerá ako sériové číslo (${esc(code)}), nie EAN — hľadám ďalej…<br><button class="btn ghost sm" style="margin-top:6px" onclick="scanUseAnyway()">Použiť aj tak</button>`;}
    return;
  }
  const cb2=scanCb;closeScan();if(cb2)cb2(code,fmt);
}
function scanUseAnyway(){const code=scanIgnored;const cb2=scanCb;closeScan();if(cb2&&code)cb2(code,"");}
function setupCamControls(){
  try{
    // kontinuálne ostrenie (ak to zariadenie podporuje)
    qrScanner.applyVideoConstraints({advanced:[{focusMode:"continuous"}]}).catch(()=>{});
    const caps=qrScanner.getRunningTrackCapabilities();
    if(caps&&caps.zoom){const z=$("#zoomSlider");z.min=caps.zoom.min;z.max=caps.zoom.max;z.step=caps.zoom.step||0.1;z.value=caps.zoom.min;$("#zoomWrap").classList.remove("hide");}
    if(caps&&("torch"in caps)){$("#torchBtn").style.display="";}
  }catch(e){}
}
function applyZoom(v){try{qrScanner.applyVideoConstraints({advanced:[{zoom:Number(v)}]}).catch(()=>{});}catch(e){}}
function toggleTorch(){torchOn=!torchOn;try{qrScanner.applyVideoConstraints({advanced:[{torch:torchOn}]}).catch(()=>{});}catch(e){}$("#torchBtn").textContent=torchOn?"🔦 Vypnúť svetlo":"🔦 Svetlo";}
function closeScan(){if(qrScanner){qrScanner.stop().then(()=>qrScanner.clear()).catch(()=>{});qrScanner=null;}scanCb=null;scanPrefer=null;scanIgnored=null;torchOn=false;const h=$("#scanHint");if(h){h.classList.add("hide");h.innerHTML="";}$("#scanOverlay").classList.add("hide");}
// dekódovanie z odfotenej fotky (ostrejšie/väčšie pre malé kódy)
function scanPhotoPick(){$("#photoInput").value="";$("#photoInput").click();}
async function scanPhotoFile(file){if(!file)return;
  if(qrScanner){try{await qrScanner.stop();qrScanner.clear();}catch(e){}qrScanner=null;}
  const tmp=new Html5Qrcode("photoReader",{formatsToSupport:getFmts()});
  let code="",fmt="";
  try{
    if(typeof tmp.scanFileV2==="function"){const r=await tmp.scanFileV2(file,false);code=qrNormScan(r.decodedText);fmt=r&&r.result&&r.result.format&&r.result.format.formatName;}
    else {code=qrNormScan(await tmp.scanFile(file,false));}
  }catch(e){try{tmp.clear();}catch(_){}alert("Z fotky sa kód nepodarilo prečítať. Skús ho odfotiť zbližša a ostro (nech kód vyplní väčšinu záberu).");closeScan();return;}
  try{tmp.clear();}catch(_){}
  scanAccept(code,fmt);
}

// ===== PRÍJEM =====
function renderRecv(){
  if(!canWrite()){$("#view").innerHTML=`<div class="card"><div class="msg err">Táto rola nemôže prijímať (user/admin).</div></div>`;return;}
  if(!recvSel){
    $("#view").innerHTML=`<div class="card"><h2>Príjem</h2>
      <label>Kam prijímaš?</label>
      <div class="inline" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn green sm" onclick="setTab('recv')">🏬 Na sklad</button><button class="btn ghost sm" onclick="repairForm(0,'oprava')">🛠️ Na opravu</button><button class="btn ghost sm" onclick="repairForm(0,'reklamacia')">⚠️ Na reklamáciu</button></div>
      <hr style="border:0;border-top:1px solid var(--line);margin:6px 0 12px">
      <div class="inline" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn green sm" onclick="recvNewProduct()">+ Nový produkt</button><button class="btn ghost sm" onclick="aiPick()">🔍 Rozpoznať z fotky (AI)</button></div>
      <label>Existujúci produkt na sklad (napíš názov alebo naskenuj kód)</label>
      <div class="inline"><input id="r_q" placeholder="napr. Antminer / SKU" oninput="rSearch()" autocomplete="off"><button class="btn ghost sm" onclick="rScanSearch()">📷 kód</button></div>
      <div id="r_sug" class="sug"></div>
      </div>
      <div class="card"><h4>História príjemiek</h4><div id="recvHist" class="muted">Načítavam…</div></div>`;
    setTimeout(()=>{$("#r_q").focus();rSearch();},30);loadRecvHistory();
  }else{
    const p=DATA.products.find(x=>x.id===recvSel);
    $("#view").innerHTML=`<div class="card">
      <div class="chosen"><div><div class="muted">Vybraný produkt</div><b>${esc(p.name)}</b></div><button class="btn ghost sm" onclick="rReset()">Zmeniť</button></div>
      <div class="row2"><div><label>Sklad</label><select id="r_wh" onchange="rFillLoc()">${DATA.warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("")}</select></div>
      <div><label>Pozícia</label><select id="r_loc"></select></div></div>
      <label>Evidencia</label><select id="r_track" onchange="rTrackUI()"><option value="unit">Kus (QR/SN)</option><option value="bulk">Množstvo (spotreb.)</option></select>
      <div class="row2"><div><label>Stav</label><select id="r_state" onchange="rStatePreset()"><option value="new">nové</option><option value="used">použité</option><option value="refurb">repasované</option><option value="damaged">poškodené</option></select></div>
      <div><label>Popis stavu</label><input id="r_note" list="r_note_presets" placeholder="vyber alebo napíš…">
        <datalist id="r_note_presets">
          <option value="nové – nerozbalené"></option>
          <option value="nové – rozbalené, nepoužité"></option>
          <option value="použité – 100% funkčné"></option>
          <option value="repastované, 100% funkčné (ASIC)"></option>
          <option value="repasované – otestované, 100% funkčné"></option>
          <option value="použité – kozmetické oškretie, plne funkčné"></option>
          <option value="poškodené – popíš závadu"></option>
        </datalist></div></div>
      <div id="r_unitbox"><label>Sériové čísla — každé = jeden prijatý kus (napr. 10× ASIC = 10 SN)</label>
        <div id="r_serials"></div>
        <button class="btn ghost sm" type="button" onclick="rAddSerial()">+ Pridať sériové číslo / ďalší kus</button>
        <label>QR kód (naskenuj predtlačený)</label><div class="inline"><input id="r_qr" placeholder="QR-…"><button class="btn ghost sm" onclick="openScan(t=>$('#r_qr').value=t)">📷</button></div></div>
      <div id="r_bulkbox" class="hide"><label>Množstvo (ks)</label><input id="r_qty" type="number" min="1" value="1">
        <label>QR na bedničke</label><div class="inline"><input id="r_qrb" placeholder="QR-BOX-…"><button class="btn ghost sm" onclick="openScan(t=>$('#r_qrb').value=t)">📷</button></div></div>
      <div class="row2"><div><label>Nákupná cena (za kus)</label><input id="r_buyprice" type="number" step="any"></div>
      <div><label>Mena</label><select id="r_buycur"><option>CZK</option><option>EUR</option><option>USD</option></select></div></div>
      <label>Doklad / faktúra</label><input id="r_doc" placeholder="FA-… / dodací list">
      <label>Fotodokumentácia (voliteľné)</label>
      <div class="inline"><button class="btn ghost sm" onclick="rAddPhoto()">📷 Pridať fotku</button><span id="r_photocnt" class="muted"></span></div>
      <div id="r_photos" class="inline" style="flex-wrap:wrap;gap:6px;margin-top:6px"></div>
      <label class="chk"><input type="checkbox" id="r_again"><span>Prijať a pokračovať ďalším kusom <span class="muted" style="font-weight:400">(rovnaký produkt, iné SN)</span></span></label>
      <button class="btn green" id="r_save" onclick="rSave()">✓ Prijať na sklad</button>
      <div id="r_msg"></div></div>`;
    rFillLoc();rRenderPhotos();recvSerials=[];rRenderSerials();
    // po „pridať a pokračovať" — obnov spoločné údaje (sklad, pozícia, cena, faktúra, stav)
    if(recvKeep){const rk=recvKeep;
      if(rk.wh){$("#r_wh").value=rk.wh;rFillLoc();}
      if(rk.loc)$("#r_loc").value=rk.loc;
      if(rk.track){$("#r_track").value=rk.track;rTrackUI();}
      if(rk.state)$("#r_state").value=rk.state;
      if(rk.note)$("#r_note").value=rk.note;
      if(rk.doc)$("#r_doc").value=rk.doc;
      if(rk.buyp)$("#r_buyprice").value=rk.buyp;
      if(rk.buyc)$("#r_buycur").value=rk.buyc;
    }
  }
}
let recvKeep=null;
function rSearch(){const q=($("#r_q").value||"").trim().toLowerCase();let list=DATA.products;
  // vyhľadáva v názve, značke, modeli, SKU, KATEGÓRII aj TAGOCH
  if(q)list=list.filter(p=>((p.name||"")+" "+brandName(p)+" "+(p.model||"")+" "+(p.sku||"")+" "+catPathText(p.category_id)+" "+productTagNames(p.id).join(" ")).toLowerCase().includes(q));
  list=list.slice(0,25);
  $("#r_sug").innerHTML=list.length?list.map(p=>{const cat=catPathText(p.category_id);const tags=productTagNames(p.id);
    return `<div class="it" onclick="rPick(${p.id})"><b>${esc(p.name)}</b><div class="m">${esc(brandName(p))} ${esc(p.model||"")} ${esc(p.sku||"")}${cat?" · "+esc(cat):""}${tags.length?" · "+tags.map(t=>"#"+esc(t)).join(" "):""}</div></div>`;}).join(""):`<div class="it muted">Nič sa nenašlo.</div>`;}
function rPick(id){recvSel=id;renderRecv();}
function rReset(){recvSel=null;recvKeep=null;renderRecv();}
let lastScanCode="";
// naskenuj čiarový kód/QR a identifikuj produkt (podľa SKU)
function rScanSearch(){openScan(code=>{
  lastScanCode=code;
  const hit=DATA.products.find(p=>(p.sku||"").toLowerCase()===code.toLowerCase());
  if(hit){rPick(hit.id);return;}
  // nenašiel sa interne — skús dohľadať online podľa kódu
  barcodeLookup(code);
});}
async function barcodeLookup(code){
  const box=$("#r_sug");if(box)box.innerHTML=`<div class="it muted">🌐 Dohľadávam kód ${esc(code)} na internete…</div>`;
  let res=null;
  try{const {data,error}=await sb.functions.invoke("lookup-barcode",{body:{code}});if(!error)res=data;}catch(e){}
  if(res&&res.found){
    aiExtract={name:res.name||"",brand:res.brand||"",model:"",barcode:code};
    recvNewProduct();
    setTimeout(()=>{const v=$("#view");if(v)v.insertAdjacentHTML("afterbegin",`<div class="msg ok">🌐 Dohľadané na internete: ${esc(res.name||"")}. Skontroluj a doplň.</div>`);},40);
  }else{
    // nič sa nenašlo (alebo funkcia nenasadená) → ručné založenie so SKU
    if(box)box.innerHTML="";
    if(confirm('Kód "'+code+'" sa nenašiel v katalógu ani na internete. Založiť nový produkt s týmto kódom (SKU)?'))recvNewProduct();
  }
}
// nový produkt priamo z príjmu
function rPhoto(){
  alert("Odfoť názov alebo samotný produkt. Prototyp: otvorí sa rozpoznávanie (Google Lens) — zistíš názov a doplníš ho.\n\nV ostrej verzii appka z fotky automaticky rozpozná produkt a predvyplní parametre; ty len potvrdíš.");
  window.open("https://lens.google.com/","_blank");
  recvNewProduct();
}
let aiExtract=null;
function aiPick(){const i=$("#aiPhoto");i.value="";i.click();}
function aiFile(file){if(!file)return;const r=new FileReader();r.onload=()=>aiRun(r.result);r.readAsDataURL(file);}
// zaznamenaj spotrebu AI (pre počítadlo nákladov v Administrácii); tichá, chyby ignoruje
async function logAiUsage(fn,data){try{const u=data&&data.usage;if(!u)return;await sb.from("ai_usage").insert({fn,model:u.model||null,input_tokens:u.input_tokens||0,output_tokens:u.output_tokens||0,created_by:ME.id||null});}catch(e){}}
async function aiRun(dataUrl){
  const box=$("#r_sug");if(box)box.innerHTML=`<div class="it muted">🔍 Rozpoznávam z fotky…</div>`;
  const {data,error}=await sb.functions.invoke("identify-product",{body:{labelImage:dataUrl}});
  logAiUsage("identify-product",data);
  if(error||(data&&data.error)){if(box)box.innerHTML="";alert("AI rozpoznávanie nie je dostupné.\n(Skontroluj, či je nasadená Edge Function identify-product a nastavený AI kľúč.)\n\n"+esc((error&&error.message)||(data&&data.error)||""));return;}
  if(data.source==="internal"&&data.product){if(!DATA.products.find(p=>p.id===data.product.id))DATA.products.push(data.product);rPick(data.product.id);return;}
  aiExtract=data.extracted||data.suggestion||{};
  recvNewProduct();
}
// Nový produkt z príjmu = rovnaký plný formulár ako v Produktoch; po uložení sa vrátime do príjmu s produktom
function recvNewProduct(){
  const ax=aiExtract||{};aiExtract=null;
  prodReturnToRecv=true;
  prodForm(0,{name:ax.name||"",brand:ax.brand||"",sku:ax.barcode||lastScanCode||""});
}
function rFillLoc(){$("#r_loc").innerHTML=locsOf($("#r_wh").value).map(l=>`<option value="${l.id}">${esc(l.code)}${l.description?" — "+esc(l.description):""}</option>`).join("")||`<option value="">—</option>`;}
function rTrackUI(){const b=$("#r_track").value==="bulk";$("#r_bulkbox").classList.toggle("hide",!b);$("#r_unitbox").classList.toggle("hide",b);}
// predvyplní popis stavu podľa vybraného stavu (neprepíše vlastný text)
const STATE_NOTE_DEFAULT={new:"nové – nerozbalené",used:"použité – 100% funkčné",refurb:"repasované – otestované, 100% funkčné",damaged:"poškodené – popíš závadu"};
const STATE_NOTE_ALL=Object.values(STATE_NOTE_DEFAULT);
function rStatePreset(){const n=$("#r_note");if(!n)return;const cur=n.value.trim();if(cur===""||STATE_NOTE_ALL.includes(cur)){n.value=STATE_NOTE_DEFAULT[$("#r_state").value]||"";}}
let recvPhotos=[]; // [{url}]
function rRenderPhotos(){const el=$("#r_photos");if(el)el.innerHTML=recvPhotos.map((p,i)=>`<span style="position:relative;display:inline-block"><img src="${esc(p.url)}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--line)"><button onclick="recvPhotos.splice(${i},1);rRenderPhotos()" style="position:absolute;top:-6px;right:-6px;border:0;background:#e35;color:#fff;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:11px">×</button></span>`).join("");const c=$("#r_photocnt");if(c)c.textContent=recvPhotos.length?recvPhotos.length+" fotiek pripravených":"";}
function rAddPhoto(){pickPhoto("lots",url=>{recvPhotos.push({url});rRenderPhotos();});}
// ===== sériové čísla (viac na položku) =====
let recvSerials=[];
function rAddSerial(){recvSerials.push({serial:"",photo:""});rRenderSerials();}
function rRenderSerials(){const el=$("#r_serials");if(!el)return;
  el.innerHTML=recvSerials.map((s,i)=>`<div class="inline" style="margin:0 0 6px;gap:6px;align-items:center;flex-wrap:wrap">
    <input value="${esc(s.serial)}" placeholder="SN-…" oninput="recvSerials[${i}].serial=this.value" style="flex:1;min-width:120px">
    <button class="btn ghost sm" type="button" onclick="openScan(t=>{recvSerials[${i}].serial=t;rRenderSerials();})">📷</button>
    <button class="btn ghost sm" type="button" onclick="rSerialCrop(${i})">✂️ Fotka SN</button>
    ${s.photo?`<img src="${esc(s.photo)}" style="width:34px;height:34px;object-fit:cover;border-radius:6px;border:1px solid var(--line)">`:""}
    <button class="btn red sm" type="button" onclick="recvSerials.splice(${i},1);rRenderSerials()">×</button></div>`).join("")||`<div class="muted" style="margin-bottom:6px">Zatiaľ žiadne SN (nepovinné pri kusovej evidencii).</div>`;}
// odfoť štítok -> orež len na sériové číslo -> ulož k danému SN
function rSerialCrop(i){const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;openCrop(f,url=>{recvSerials[i].photo=url;rRenderSerials();});};inp.click();}
async function rSave(){
  const track=$("#r_track").value,loc=$("#r_loc").value?Number($("#r_loc").value):null;
  const sers=track==="unit"?recvSerials.filter(s=>s.serial&&s.serial.trim()):[];
  const common={product_id:recvSel,warehouse_id:Number($("#r_wh").value),location_id:loc,track,
    status:"skladom",state:$("#r_state").value,note:($("#r_note").value.trim()||null),
    buy_price:$("#r_buyprice").value?Number($("#r_buyprice").value):null,buy_currency:$("#r_buycur").value||"CZK",
    buy_date:new Date().toISOString().slice(0,10),invoice_number:$("#r_doc").value.trim()||null};
  $("#r_save").disabled=true;$("#r_msg").innerHTML="";
  let createdCount=0;
  if(track==="unit"&&sers.length>1){
    // hromadný príjem: každé SN = samostatný kus (položka)
    for(const s of sers){
      const lot=Object.assign({},common,{quantity:1,serial:s.serial.trim(),qr_code:null});
      const {data,error}=await sb.from("stock_lots").insert(lot).select().single();
      if(error){$("#r_save").disabled=false;$("#r_msg").innerHTML=`<div class="msg err">${esc(error.message)}</div>`;return;}
      await sb.from("stock_movements").insert({type:"prijem",product_id:recvSel,lot_id:data.id,quantity:1,warehouse_id:lot.warehouse_id,location_id:loc,via:"fyzicky",document:lot.invoice_number,serial:lot.serial});
      if(s.photo){try{await sb.from("lot_serials").insert({lot_id:data.id,serial:s.serial.trim(),photo_url:s.photo});}catch(e){}}
      if(recvPhotos.length){try{await sb.from("lot_photos").insert(recvPhotos.map(x=>({lot_id:data.id,url:x.url})));}catch(e){}}
      createdCount++;
    }
  }else{
    const lot=Object.assign({},common,{quantity:track==="bulk"?Number($("#r_qty").value||1):1,
      serial:track==="unit"?((sers[0]&&sers[0].serial.trim())||null):null,
      qr_code:(track==="bulk"?$("#r_qrb").value.trim():$("#r_qr").value.trim())||null});
    const {data,error}=await sb.from("stock_lots").insert(lot).select().single();
    if(error){$("#r_save").disabled=false;$("#r_msg").innerHTML=`<div class="msg err">${esc(error.message)}</div>`;return;}
    await sb.from("stock_movements").insert({type:"prijem",product_id:recvSel,lot_id:data.id,quantity:lot.quantity,warehouse_id:lot.warehouse_id,location_id:loc,via:"fyzicky",document:lot.invoice_number,serial:lot.serial});
    if(lot.qr_code){try{await sb.from("qr_codes").update({status:"assigned",lot_id:data.id}).eq("code",lot.qr_code);}catch(e){}}
    if(recvPhotos.length){try{await sb.from("lot_photos").insert(recvPhotos.map(x=>({lot_id:data.id,url:x.url})));}catch(e){}}
    if(sers.length===1&&sers[0].photo){try{await sb.from("lot_serials").insert({lot_id:data.id,serial:sers[0].serial.trim(),photo_url:sers[0].photo});}catch(e){}}
    createdCount=lot.quantity;
  }
  const again=$("#r_again")&&$("#r_again").checked;
  if(again)recvKeep={wh:$("#r_wh").value,loc:$("#r_loc").value,track:$("#r_track").value,state:$("#r_state").value,note:$("#r_note").value,doc:$("#r_doc").value,buyp:$("#r_buyprice").value,buyc:$("#r_buycur").value};
  else recvKeep=null;
  const p=DATA.products.find(x=>x.id===recvSel);recvPhotos=[];recvSerials=[];
  if(!again)recvSel=null;
  renderRecv();
  const label=(track==="unit"&&sers.length>1)?(createdCount+" ks (samostatné kusy)"):(createdCount+" ks");
  $("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Prijaté: ${esc(p?p.name:"")} · ${label}.${again?" Pokračuj ďalším kusom.":""}</div>`);
}
// história príjemiek (posledné pohyby typu prijem)
async function loadRecvHistory(){
  const el=$("#recvHist");if(!el)return;
  const {data,error}=await sb.from("stock_movements").select("id,quantity,serial,document,happened_at,product_id,lot_id,warehouse_id,location_id,products(name),warehouses(name)").eq("type","prijem").order("happened_at",{ascending:false}).limit(40);
  if(error){el.innerHTML=`<span class="msg err">${esc(error.message)}</span>`;return;}
  if(!data||!data.length){el.textContent="Zatiaľ žiadne príjemky.";return;}
  el.innerHTML=`<div class="ptbl-wrap"><table class="ptbl"><thead><tr><th>Dátum</th><th>Produkt</th><th class="r">Ks</th><th>Sklad</th><th>SN</th><th>Doklad</th><th></th></tr></thead><tbody>`+
    data.map(m=>{const canDel=ME.role==="admin"||((Date.now()-new Date(m.happened_at).getTime())/60000)<=10;
      return `<tr><td>${esc((m.happened_at||"").replace("T"," ").slice(0,16))}</td><td>${esc((m.products&&m.products.name)||"?")}</td><td class="r">+${fmtNum(m.quantity)}</td><td>${esc((m.warehouses&&m.warehouses.name)||"—")}</td><td>${esc(m.serial||"—")}</td><td>${esc(m.document||"—")}</td>
      <td style="white-space:nowrap"><button class="btn ghost sm" onclick="recvDuplicate(${m.id})">⧉ Duplikovať</button>${canDel?` <button class="btn red sm" onclick="recvDelete(${m.id},${m.lot_id||"null"},'${esc(m.happened_at||"")}')">🗑</button>`:""}</td></tr>`;}).join("")+`</tbody></table></div>`;
}
// zmazať príjemku — users do 10 min od prijatia, admin bez limitu
async function recvDelete(moveId,lotId,ts){
  if(ME.role!=="admin"){const age=(Date.now()-new Date(ts).getTime())/60000;if(age>10){alert("Príjemku môžeš zmazať len do 10 minút od prijatia. Požiadaj admina.");return;}}
  if(!confirm("Naozaj zmazať túto príjemku a vrátiť naskladnenie?"))return;
  if(!confirm("Potvrď ešte raz — operácia je nevratná."))return;
  if(lotId){await sb.from("stock_lots").delete().eq("id",lotId);}
  const {error}=await sb.from("stock_movements").delete().eq("id",moveId);
  if(error){alert("Mazanie zlyhalo: "+error.message+"\n(Spustil si supabase_fix_moves_delete.sql?)");return;}
  loadRecvHistory();
}
// duplikovať príjemku — skopíruje produkt, sklad, cenu, faktúru, stav; SN sa zadá nové
async function recvDuplicate(moveId){
  const {data:m}=await sb.from("stock_movements").select("product_id,warehouse_id,location_id,document,lot_id").eq("id",moveId).single();
  if(!m){alert("Príjemka sa nenašla.");return;}
  let lot=null;if(m.lot_id){const r=await sb.from("stock_lots").select("state,note,buy_price,buy_currency").eq("id",m.lot_id).maybeSingle();lot=r.data;}
  recvSel=m.product_id;
  recvKeep={wh:m.warehouse_id?String(m.warehouse_id):"",loc:m.location_id?String(m.location_id):"",track:"unit",state:(lot&&lot.state)||"new",note:(lot&&lot.note)||"",doc:m.document||"",buyp:(lot&&lot.buy_price!=null)?String(lot.buy_price):"",buyc:(lot&&lot.buy_currency)||"CZK"};
  setTab("recv");
  setTimeout(()=>{const v=$("#view");if(v)v.insertAdjacentHTML("afterbegin",`<div class="msg ok">⧉ Údaje skopírované z príjemky. Naskenuj/odfoť NOVÉ sériové číslo a prijmi.</div>`);},60);
}

// ===== VÝDAJ =====
async function renderIssue(){
  if(!canWrite()){$("#view").innerHTML=`<div class="card"><div class="msg err">Táto rola nemôže vydávať (user/admin).</div></div>`;return;}
  issueSel=null;
  $("#view").innerHTML=`<div class="card"><h2>Výdaj</h2>
    <label>Odkiaľ vydávaš?</label>
    <div class="inline" style="gap:8px;flex-wrap:wrap;margin-bottom:10px"><button class="btn red sm" onclick="setTab('issue')">🏬 Zo skladu</button><button class="btn ghost sm" onclick="repKind='oprava';setTab('repairs')">🛠️ Z opravy</button><button class="btn ghost sm" onclick="repKind='reklamacia';setTab('repairs')">⚠️ Z reklamácie</button></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:6px 0 12px">
    <div class="muted" style="margin-bottom:8px">Jeden tovar: nájdi nižšie. Viac tovarov naraz (jedna výdajka): v <b>Zásobách</b> označ položky → <b>Vydať vybrané</b>.</div>
    <label>Nájdi položku (QR / SN / názov / pozícia)</label>
    <div class="inline"><input id="i_q" placeholder="naskenuj QR alebo napíš…" oninput="iSearch()" autocomplete="off"><button class="btn ghost sm" onclick="openScan(t=>{$('#i_q').value=t;iSearch();},{qr:true})">📷 QR</button></div>
    <div id="i_sug" class="sug"></div></div><div id="i_form"></div>
    <div class="card"><h4>História výdajok</h4><div id="issueHist" class="muted">Načítavam…</div></div>`;
  // načítaj zásoby do pamäte pre hľadanie
  const {data}=await sb.from("stock_lots").select("id,quantity,track,serial,qr_code,status,product_id,warehouse_id,location_id,products(name),warehouses(name),warehouse_locations(code)").order("id",{ascending:false}).limit(1000);
  issueLots=data||[];iSearch();loadIssueHistory();
  if(issuePreselect){const pid=issuePreselect;issuePreselect=null;if(issueLots.find(x=>x.id===pid))iPick(pid);}
}
async function loadIssueHistory(){
  const el=$("#issueHist");if(!el)return;
  const {data,error}=await sb.from("stock_movements").select("id,quantity,serial,document,purpose,happened_at,product_id,warehouse_id,location_id,products(name),warehouses(name)").eq("type","vydaj").order("happened_at",{ascending:false}).limit(40);
  if(error){el.innerHTML=`<span class="msg err">${esc(error.message)}</span>`;return;}
  if(!data||!data.length){el.textContent="Zatiaľ žiadne výdajky.";return;}
  el.innerHTML=`<div class="ptbl-wrap"><table class="ptbl"><thead><tr><th>Dátum</th><th>Produkt</th><th class="r">Ks</th><th>Sklad</th><th>SN</th><th>Doklad / účel</th><th></th></tr></thead><tbody>`+
    data.map(m=>`<tr><td>${esc((m.happened_at||"").replace("T"," ").slice(0,16))}</td><td>${esc((m.products&&m.products.name)||"?")}</td><td class="r">−${fmtNum(m.quantity)}</td><td>${esc((m.warehouses&&m.warehouses.name)||"—")}</td><td>${esc(m.serial||"—")}</td><td>${esc(m.document||"")}${m.purpose?" · "+esc(m.purpose):""}</td>
      <td style="white-space:nowrap"><button class="btn red sm" onclick="issueDelete(${m.id},'${esc(m.happened_at||"")}')">🗑 Zmazať</button></td></tr>`).join("")+`</tbody></table></div>`;
}
// zmazať výdajku — users do 60 min, admin bez limitu; vráti tovar na sklad
async function issueDelete(moveId,ts){
  if(ME.role!=="admin"){const age=(Date.now()-new Date(ts).getTime())/60000;if(age>60){alert("Výdajku môžeš zmazať len do 60 minút od výdaja. Požiadaj admina.");return;}}
  if(!confirm("Zmazať výdajku a vrátiť tovar na sklad?"))return;
  if(!confirm("Potvrď ešte raz — operácia je nevratná."))return;
  const {data:m}=await sb.from("stock_movements").select("product_id,quantity,serial,warehouse_id,location_id").eq("id",moveId).single();
  if(m){await sb.from("stock_lots").insert({product_id:m.product_id,warehouse_id:m.warehouse_id,location_id:m.location_id,quantity:m.quantity,serial:m.serial||null,track:m.serial?"unit":"bulk",status:"skladom",state:"new"});}
  const {error}=await sb.from("stock_movements").delete().eq("id",moveId);
  if(error){alert("Mazanie zlyhalo: "+error.message+"\n(Spustil si supabase_fix_moves_delete.sql?)");return;}
  loadIssueHistory();
}
function iSearch(){const q=($("#i_q")?$("#i_q").value:"").trim().toLowerCase();let list=issueLots;
  if(q)list=list.filter(l=>((l.products&&l.products.name||"")+" "+(l.serial||"")+" "+(l.qr_code||"")+" "+((l.warehouse_locations&&l.warehouse_locations.code)||"")).toLowerCase().includes(q));
  list=list.slice(0,25);
  const box=$("#i_sug");if(!box)return;
  box.innerHTML=list.length?list.map(l=>`<div class="it" onclick="iPick(${l.id})"><b>${esc(l.products&&l.products.name||"?")}</b><div class="m">${esc((l.warehouses&&l.warehouses.name)||"")} · ${esc((l.warehouse_locations&&l.warehouse_locations.code)||"—")} · ${l.quantity} ks${l.serial?" · "+esc(l.serial):""}${l.qr_code?" · "+esc(l.qr_code):""}</div></div>`).join(""):`<div class="it muted">Nič sa nenašlo.</div>`;}
function iPick(id){issueSel=issueLots.find(l=>l.id===id);const l=issueSel;
  $("#i_sug").innerHTML="";$("#i_q").value=(l.products&&l.products.name)||"";
  $("#i_form").innerHTML=`<div class="card">
    <div class="chosen"><div><b>${esc(l.products&&l.products.name||"?")}</b><div class="muted">${esc((l.warehouses&&l.warehouses.name)||"")} · ${esc((l.warehouse_locations&&l.warehouse_locations.code)||"—")} · na sklade: ${l.quantity}</div></div></div>
    ${l.track==="bulk"?`<label>Množstvo na výdaj</label><input id="i_qty" type="number" min="1" max="${l.quantity}" value="1">`:""}
    <label>Spôsob</label><select id="i_via"><option value="fyzicky">fyzicky</option><option value="zasielkou">zásielkou</option></select>
    <label>Dôvod výdaja</label><input id="i_reason" list="reasonList" placeholder="predaj / presun / likvidácia…"><datalist id="reasonList">${REASONS.map(r=>`<option>${esc(r)}</option>`).join("")}</datalist>
    <label>Doklad / objednávka</label><input id="i_doc" placeholder="OBJ-…">
    <button class="btn red" id="i_save" onclick="iDo()">Vydať zo skladu</button><div id="i_msg"></div></div>`;
}
async function iDo(){
  const l=issueSel;if(!l)return;
  let qty=l.track==="bulk"?Math.max(1,Math.min(Number($("#i_qty").value||1),l.quantity)):1;
  $("#i_save").disabled=true;$("#i_msg").innerHTML="";
  await sb.from("stock_movements").insert({type:"vydaj",product_id:l.product_id,lot_id:l.id,quantity:qty,warehouse_id:l.warehouse_id,location_id:l.location_id,via:$("#i_via").value,document:$("#i_doc").value.trim()||null,purpose:$("#i_reason").value.trim()||null,serial:l.serial});
  let err;
  if(l.track==="bulk"&&qty<l.quantity){const r=await sb.from("stock_lots").update({quantity:l.quantity-qty}).eq("id",l.id);err=r.error;}
  else {const r=await sb.from("stock_lots").delete().eq("id",l.id);err=r.error;}
  if(err){$("#i_save").disabled=false;$("#i_msg").innerHTML=`<div class="msg err">${esc(err.message)}</div>`;return;}
  renderIssue();
  $("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Vydané: ${esc(l.products&&l.products.name||"")} (${qty} ks).</div>`);
}

// ===== ZÁSOBY =====
let sf={q:"",cat:"",sub:"",brand:"",tag:"",wh:"",state:""};
function loadStockFilters(){try{const s=localStorage.getItem("sflt_"+ME.id);if(s)sf=Object.assign(sf,JSON.parse(s));}catch(e){}}
function saveStockFilters(){try{localStorage.setItem("sflt_"+ME.id,JSON.stringify(sf));}catch(e){}}
let stockLots=[],stockExpanded={},stockSel={};
function whColor(id){const w=DATA.warehouses.find(x=>String(x.id)===String(id));return (w&&w.color)||null;}
function fmtNum(n){const x=+n;return isNaN(x)?String(n):x.toLocaleString("sk-SK");}
function whChip(l){if(l.status==="na_ceste")return `<span class="tag o">doručuje sa</span>`;const nm=(l.warehouses&&l.warehouses.name)||whName(l.warehouse_id)||"—";const col=(l.warehouses&&l.warehouses.color)||whColor(l.warehouse_id);return `<span class="tag" style="${col?`background:${esc(col)}22;color:#26324a;border:1px solid ${esc(col)}`:""}">${esc(nm)}</span>`;}
// uložené filtre (localStorage, per user)
function savedStockFilters(){try{return JSON.parse(localStorage.getItem("savedflt_"+ME.id)||"[]");}catch(e){return [];}}
function sfSaveNew(){const name=prompt("Názov filtra:");if(!name||!name.trim())return;const arr=savedStockFilters();arr.push({name:name.trim(),sf:JSON.parse(JSON.stringify(sf))});localStorage.setItem("savedflt_"+ME.id,JSON.stringify(arr));renderStock();}
function sfLoad(name){if(!name)return;const f=savedStockFilters().find(x=>x.name===name);if(f){sf=Object.assign({q:"",cat:"",sub:"",brand:"",tag:"",wh:"",state:""},f.sf);saveStockFilters();renderStock();}}
function sfReset(){sf={q:"",cat:"",sub:"",brand:"",tag:"",wh:"",state:""};saveStockFilters();renderStock();}
function sfManage(){const arr=savedStockFilters();if(!arr.length){alert("Žiadne uložené filtre.");return;}const name=prompt("Napíš názov filtra na zmazanie:\n\n"+arr.map(x=>"• "+x.name).join("\n"));if(!name)return;localStorage.setItem("savedflt_"+ME.id,JSON.stringify(arr.filter(x=>x.name!==name.trim())));renderStock();}
function toggleExp(k){stockExpanded[k]=!stockExpanded[k];renderStock();}
function toggleStockSel(k,on){if(on)stockSel[k]=true;else delete stockSel[k];renderStock();}
function stockSelAll(keys,on){keys.forEach(k=>{if(on)stockSel[k]=true;else delete stockSel[k];});renderStock();}
async function loadStock(){
  $("#view").innerHTML=`<div class="card muted">Načítavam…</div>`;
  const {data,error}=await sb.from("stock_lots").select("id,quantity,track,serial,qr_code,status,state,state_note,note,expected_date,counted_at,buy_price,buy_currency,buy_date,invoice_number,warehouse_id,location_id,shipment_id,product_id,products(name),warehouses(name,color),warehouse_locations(code)").order("id",{ascending:false}).limit(3000);
  if(error){$("#view").innerHTML=`<div class="card"><div class="msg err">${esc(error.message)}</div></div>`;return;}
  stockLots=data||[];stockExpanded={};stockSel={};renderStock();
}
function prodOf(pid){return DATA.products.find(x=>x.id===pid)||{};}
function renderStock(){
  let lots=stockLots.slice();
  const catT=sf.sub||sf.cat;
  if(catT){const ds=catDesc(catT);lots=lots.filter(l=>ds.has(Number(prodOf(l.product_id).category_id)));}
  if(sf.brand)lots=lots.filter(l=>String(prodOf(l.product_id).brand_id)===sf.brand);
  if(sf.tag)lots=lots.filter(l=>productTagIds(l.product_id).includes(Number(sf.tag)));
  if(sf.q){const q=sf.q.toLowerCase();lots=lots.filter(l=>((l.products&&l.products.name||"")+" "+(l.serial||"")+" "+(l.qr_code||"")+" "+((l.warehouse_locations&&l.warehouse_locations.code)||"")+" "+catPathText(prodOf(l.product_id).category_id)+" "+productTagNames(l.product_id).join(" ")).toLowerCase().includes(q));}
  const topCats=DATA.categories.filter(c=>!c.parent_id);
  const catOpts=`<option value="">Všetky kategórie</option>`+topCats.map(c=>`<option value="${c.id}" ${sf.cat==String(c.id)?"selected":""}>${esc(c.name)}</option>`).join("");
  const subsS=sf.cat?catChildren(sf.cat):[];
  const subOptsS=`<option value="">Všetky podkategórie</option>`+subsS.map(c=>`<option value="${c.id}" ${sf.sub==String(c.id)?"selected":""}>${esc(c.name)}</option>`).join("");
  let scopeLotsB=stockLots;if(catT){const ds=catDesc(catT);scopeLotsB=stockLots.filter(l=>ds.has(Number(prodOf(l.product_id).category_id)));}
  const brandIdsS=new Set(scopeLotsB.map(l=>prodOf(l.product_id).brand_id).filter(x=>x!=null));
  const brListS=DATA.brands.filter(b=>brandIdsS.has(b.id)||String(b.id)===sf.brand);
  const brOpts=`<option value="">Všetky značky</option>`+brListS.map(b=>`<option value="${b.id}" ${sf.brand==String(b.id)?"selected":""}>${esc(b.name)}</option>`).join("");
  const tgOpts=`<option value="">Všetky tagy</option>`+DATA.tags.map(t=>`<option value="${t.id}" ${sf.tag==String(t.id)?"selected":""}>#${esc(t.name)}</option>`).join("");
  if(sf.wh)lots=lots.filter(l=>String(l.warehouse_id)===sf.wh);
  if(sf.state)lots=lots.filter(l=>String(l.state)===sf.state);
  const whOpts=`<option value="">Všetky sklady</option>`+DATA.warehouses.map(w=>`<option value="${w.id}" ${sf.wh==String(w.id)?"selected":""}>${esc(w.name)}</option>`).join("");
  const stateOpts=`<option value="">Všetky stavy</option>`+Object.keys(STATE_LBL).map(k=>`<option value="${k}" ${sf.state===k?"selected":""}>${STATE_LBL[k]}</option>`).join("");
  const savedOpts=savedStockFilters().map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join("");
  // zoskupenie po produktoch
  const g={};lots.forEach(l=>{(g[l.product_id]=g[l.product_id]||[]).push(l);});
  const keys=Object.keys(g).sort((a,b)=>((prodOf(Number(a)).name)||"").localeCompare((prodOf(Number(b)).name)||""));
  const uniq=a=>[...new Set(a)];
  const allLotIds=lots.map(l=>l.id);
  let body="";
  keys.forEach(k=>{const ls=g[k];const p=prodOf(Number(k));const nm=(ls[0].products&&ls[0].products.name)||p.name||"?";
    const tot=ls.reduce((s,l)=>s+(+l.quantity||0),0);
    const th=p.image_url?`<span class="zoomwrap"><img class="pimg" src="${esc(p.image_url)}"><img class="zoombig" src="${esc(p.image_url)}"></span>`:`<div class="pimg" style="background:#eef1f6"></div>`;
    const inStock=ls.filter(l=>l.status!=="na_ceste");const onWayLots=ls.filter(l=>l.status==="na_ceste");
    const whIds=uniq(inStock.map(l=>l.warehouse_id).filter(x=>x!=null));
    let whChips=whIds.map(wid=>{const l=inStock.find(x=>x.warehouse_id===wid);return whChip(l);}).join(" ");
    if(onWayLots.length){const ow=onWayLots.find(l=>l.shipment_id)||onWayLots[0];whChips+=` <span class="tag o" style="cursor:pointer" onclick="event.stopPropagation();stockOpenShipment(${ow.shipment_id||"null"})">🚚 doručuje sa</span>`;}
    const whCell=whChips||"—";
    const locs=uniq(inStock.map(l=>(l.warehouse_locations&&l.warehouse_locations.code)||null).filter(Boolean));
    const locCell=locs.length===0?"—":(locs.length===1?esc(locs[0]):`${locs.length}×`);
    const prices=ls.map(l=>l.buy_price).filter(x=>x!=null);let buyCell="—";
    if(prices.length){const mn=Math.min(...prices),mx=Math.max(...prices),cur=ls[0].buy_currency||"";buyCell=(mn===mx?fmtNum(mn):fmtNum(mn)+" – "+fmtNum(mx))+" "+esc(cur);}
    const onStock=inStock.reduce((s,l)=>s+(+l.quantity||0),0),onWay=onWayLots.reduce((s,l)=>s+(+l.quantity||0),0),reserved=0;
    const qtyCell=`<b>${fmtNum(onStock)}</b>${(onWay||reserved)?` <span class="muted">(${onWay?"+"+fmtNum(onWay):"+0"} / −${fmtNum(reserved)})</span>`:""}`;
    const exp=!!stockExpanded[k];const allSel=ls.every(l=>stockSel[l.id]);
    const catp=esc(catPathText(p.category_id));
    body+=`<tr>
      <td style="width:26px"><input type="checkbox" ${allSel?"checked":""} onclick="selProd([${ls.map(l=>l.id).join(",")}],this.checked)"></td>
      <td><span style="cursor:pointer;display:inline-flex;align-items:center;gap:8px" onclick="toggleExp('${k}')"><span style="width:14px;color:#7a8aa5">${exp?"▾":"▸"}</span>${th}<span><b class="pnm" style="cursor:pointer" onclick="event.stopPropagation();prodOpen(${k})">${esc(nm)}</b><div class="psub">${catp} · ${ls.length} šarží</div></span></span></td>
      <td>${whCell}</td><td>${locCell}</td><td class="r">${qtyCell}</td><td></td><td>${buyCell}</td><td></td></tr>`;
    if(exp){ls.forEach(l=>{const loc=(l.warehouse_locations&&l.warehouse_locations.code)||"—";
      const buy=(l.buy_price!=null?fmtNum(l.buy_price)+" "+(l.buy_currency||""):"—")+(l.buy_date?" · "+String(l.buy_date).slice(0,10):"")+(l.invoice_number?" · "+esc(l.invoice_number):"");
      const posCell=l.status==="na_ceste"?`<span class="tag o">doručuje sa</span>${l.expected_date?`<div class="psub">predp. doručenie: ${esc(String(l.expected_date).slice(0,10))}</div>`:""}`:esc(loc);
      const rowbg=l.status==="na_ceste"?"background:#fff6e9":"background:#f8fafe";
      body+=`<tr style="${rowbg}">
        <td style="padding-left:3mm"><input type="checkbox" ${stockSel[l.id]?"checked":""} onclick="selLot(${l.id},this.checked)"></td>
        <td class="psub" style="padding-left:26px">↳ <span style="cursor:pointer" onclick="lotEdit(${l.id})">${l.track==="unit"?"kus":"množstvo"}</span>${l.serial?" · SN: "+esc(l.serial)+copyBtn(l.serial):""}${l.qr_code?" · "+esc(l.qr_code)+copyBtn(l.qr_code):""}${l.state_note?" · "+esc(l.state_note):""}</td>
        <td>${whChip(l)}</td><td>${posCell}</td><td class="r">${fmtNum(l.quantity)} ${l.track==="unit"?"kus":"ks"}</td><td>${stateBadges(l)}</td><td>${buy}</td>
        <td style="white-space:nowrap">${canWrite()?`<button class="btn red sm" onclick="lotIssue(${l.id})">Výdaj</button> <button class="btn ghost sm" onclick="lotEdit(${l.id})">Upraviť</button>`:""}</td></tr>`;});}
  });
  const table=keys.length?`<div class="ptbl-wrap"><table class="ptbl"><thead><tr><th></th><th>Produkt</th><th>Sklad</th><th>Pozícia</th><th class="r">Množstvo (+na ceste/−rez.)</th><th>Stav</th><th>Nákup (cena / dátum / faktúra)</th><th></th></tr></thead><tbody>${body}</tbody></table></div>`:`<div class="muted">Žiadne zásoby pre daný filter.</div>`;
  const totKs=lots.reduce((s,l)=>s+(+l.quantity||0),0);const selCount=allLotIds.filter(id=>stockSel[id]).length;
  const bulkBar=selCount?`<div style="background:#eaf1ff;border:1px solid #cfe0ff;border-radius:10px;padding:8px 12px;margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
    <b style="color:var(--blue)">${selCount} vybraných</b>
    ${canWrite()?`<button class="btn red sm" onclick="bulkIssue()">− Vydať vybrané</button>`:""}
    <button class="btn sm" style="width:auto" onclick="bulkMove()">Presunúť vybrané</button>
    <button class="btn ghost sm" onclick="bulkState()">Zmeniť stav</button>
    <button class="btn ghost sm" onclick="bulkCounted()">Označiť spočítané</button>
    <button class="btn ghost sm" onclick="bulkClear()">Zrušiť výber</button></div>`:"";
  // dynamické tagy — len tie, ktoré sú vo filtrovaných zásobách
  let stBase=stockLots.slice();
  if(catT){const ds=catDesc(catT);stBase=stBase.filter(l=>ds.has(Number(prodOf(l.product_id).category_id)));}
  if(sf.brand)stBase=stBase.filter(l=>String(prodOf(l.product_id).brand_id)===sf.brand);
  if(sf.wh)stBase=stBase.filter(l=>String(l.warehouse_id)===sf.wh);
  if(sf.state)stBase=stBase.filter(l=>String(l.state)===sf.state);
  if(sf.q){const q=sf.q.toLowerCase();stBase=stBase.filter(l=>((l.products&&l.products.name||"")+" "+catPathText(prodOf(l.product_id).category_id)+" "+(l.serial||"")+" "+(l.qr_code||"")).toLowerCase().includes(q));}
  const stTagIds=new Set();stBase.forEach(l=>productTagIds(l.product_id).forEach(id=>stTagIds.add(id)));
  const stTagChips=DATA.tags.filter(t=>stTagIds.has(t.id)||String(t.id)===sf.tag).sort((a,b)=>a.name.localeCompare(b.name)).map(t=>tagChip(t,String(t.id)===sf.tag,`sf.tag=(sf.tag==='${t.id}'?'':'${t.id}');saveStockFilters();renderStock()`)).join("")||`<span class="muted" style="font-size:12px">žiadne tagy</span>`;
  $("#view").innerHTML=`
  <div class="card"><div class="inline" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
    <button class="btn sm" onclick="stockScanFind()">📷 Nájsť tovar (QR/SN)</button>
    ${canWrite()?`<button class="btn green sm" onclick="setTab('recv')">+ Príjem na sklad</button><button class="btn red sm" onclick="setTab('issue')">− Výdaj</button>`:""}
    ${ME.role==="admin"?`<button class="btn ghost sm" onclick="openPlacement()">🗺️ Rozmiestnenie</button>`:""}
    <button class="btn ghost sm" onclick="stockExport()">⬇ Export (Excel/CSV)</button></div></div>
  <div class="card">
    <div class="toolbar"><input placeholder="Hľadať produkt / SN / QR / pozíciu / kategóriu…" value="${esc(sf.q)}" oninput="sf.q=this.value;saveStockFilters();renderStock()">
      <select onchange="sf.wh=this.value;saveStockFilters();renderStock()">${whOpts}</select>
      <select onchange="sf.cat=this.value;sf.sub='';saveStockFilters();renderStock()">${catOpts}</select>
      <select onchange="sf.sub=this.value;saveStockFilters();renderStock()" ${subsS.length?"":"disabled"}>${subOptsS}</select>
      <select onchange="sf.state=this.value;saveStockFilters();renderStock()">${stateOpts}</select>
      <select onchange="sf.brand=this.value;saveStockFilters();renderStock()">${brOpts}</select></div>
    <div style="margin:2px 0 6px">${stTagChips}</div>
    <div class="inline" style="gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
      <button class="btn ghost sm" onclick="sfReset()">✕ Filtre</button>
      <button class="btn ghost sm" onclick="selAllFiltered(${JSON.stringify(allLotIds)},true)">☑ Filtrované</button>
      <select style="width:auto" onchange="sfLoad(this.value)"><option value="">Uložené filtre…</option>${savedOpts}</select>
      <button class="btn ghost sm" onclick="sfSaveNew()">💾 Uložiť</button>
      <button class="btn ghost sm" onclick="sfManage()">🗑</button></div>
    ${bulkBar}
    <div class="muted" style="margin-bottom:8px">${keys.length} produktov · ${lots.length} šarží · spolu ${fmtNum(totKs)} ks</div>${table}</div>`;
}
function stockOpenShipment(sid){setTab("ship");if(sid){setTimeout(()=>shipDetail(sid),80);}}
function stateBadges(l){let b=`<span class="tag" style="background:#e4f6ea;color:#1d7d43">${STATE_LBL[l.state]||esc(l.state||"")}</span>`;
  if(l.status==="na_ceste")b+=` <span class="tag o">🚚 doručuje sa</span>`;
  if(l.counted_at)b+=` <span class="tag b">spočítané</span>`;
  return b;}
// ===== výber šarží + hromadné akcie =====
function selLot(id,on){if(on)stockSel[id]=true;else delete stockSel[id];renderStock();}
function selProd(ids,on){ids.forEach(id=>{if(on)stockSel[id]=true;else delete stockSel[id];});renderStock();}
function selAllFiltered(ids,on){ids.forEach(id=>{if(on)stockSel[id]=true;else delete stockSel[id];});renderStock();}
function bulkClear(){stockSel={};renderStock();}
function selectedLotIds(){return Object.keys(stockSel).filter(k=>stockSel[k]).map(Number);}
async function bulkMove(){const ids=selectedLotIds();if(!ids.length)return;
  const whOpts=DATA.warehouses.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join("");
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2>Presunúť ${ids.length} položiek</h2><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <label>Sklad</label><select id="bm_wh" onchange="bmFillLoc()">${whOpts}</select>
    <label>Pozícia</label><select id="bm_loc"></select>
    <div style="text-align:right;margin-top:14px"><button class="btn" style="width:auto" onclick="bulkMoveDo()">Presunúť</button></div>`);
  bmFillLoc();
}
function bmFillLoc(){$("#bm_loc").innerHTML=locsOf($("#bm_wh").value).map(l=>`<option value="${l.id}">${esc(l.code)}${l.description?" — "+esc(l.description):""}</option>`).join("")||`<option value="">—</option>`;}
async function bulkMoveDo(){const ids=selectedLotIds();const wh=Number($("#bm_wh").value);const loc=$("#bm_loc").value?Number($("#bm_loc").value):null;
  const {error}=await sb.from("stock_lots").update({warehouse_id:wh,location_id:loc}).in("id",ids);
  if(error){alert(error.message);return;}closeModal();stockSel={};await loadStock();}
async function bulkState(){const ids=selectedLotIds();if(!ids.length)return;
  const opts=Object.keys(STATE_LBL).map(k=>`<option value="${k}">${STATE_LBL[k]}</option>`).join("");
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2>Zmeniť stav ${ids.length} položiek</h2><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <label>Nový stav</label><select id="bs_state">${opts}</select>
    <label>Popis stavu (nepovinné)</label><input id="bs_note" placeholder="napr. repasované, plne funkčné">
    <div style="text-align:right;margin-top:14px"><button class="btn" style="width:auto" onclick="bulkStateDo()">Uložiť</button></div>`);
}
async function bulkStateDo(){const ids=selectedLotIds();const st=$("#bs_state").value;const note=$("#bs_note").value.trim()||null;
  const o={state:st};if(note!==null)o.state_note=note;
  const {error}=await sb.from("stock_lots").update(o).in("id",ids);
  if(error){alert(error.message);return;}closeModal();stockSel={};await loadStock();}
async function bulkCounted(){const ids=selectedLotIds();if(!ids.length)return;
  if(!confirm("Označiť "+ids.length+" položiek ako spočítané (inventúra)?"))return;
  const {error}=await sb.from("stock_lots").update({counted_at:new Date().toISOString()}).in("id",ids);
  if(error){alert(error.message);return;}stockSel={};await loadStock();}
// hromadný výdaj — jedna výdajka, viac tovarov naraz
function bulkIssue(){const ids=selectedLotIds();if(!ids.length)return;
  const items=ids.map(id=>stockLots.find(l=>l.id===id)).filter(Boolean);
  const list=items.map(l=>`<div class="lot">${esc((l.products&&l.products.name)||prodOf(l.product_id).name||"?")} · ${fmtNum(l.quantity)} ks${l.serial?" · SN "+esc(l.serial):""}</div>`).join("");
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2>Výdaj — ${items.length} položiek</h2><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="muted">Vytvorí sa jedna výdajka pre všetky vybrané tovary (vydá sa celé množstvo šarže).</div>
    <div style="max-height:220px;overflow:auto;margin:8px 0">${list}</div>
    <label>Spôsob</label><select id="bi_via"><option value="fyzicky">fyzicky</option><option value="zasielkou">zásielkou</option></select>
    <label>Dôvod výdaja</label><input id="bi_reason" list="reasonList" placeholder="predaj / presun / likvidácia…"><datalist id="reasonList">${REASONS.map(r=>`<option>${esc(r)}</option>`).join("")}</datalist>
    <label>Doklad / objednávka</label><input id="bi_doc" placeholder="OBJ-…">
    <div style="text-align:right;margin-top:14px"><button class="btn red" style="width:auto" onclick="bulkIssueDo()">Vydať zo skladu</button></div>`);
}
async function bulkIssueDo(){const ids=selectedLotIds();const items=ids.map(id=>stockLots.find(l=>l.id===id)).filter(Boolean);
  const via=$("#bi_via").value,reason=$("#bi_reason").value.trim()||null,doc=$("#bi_doc").value.trim()||null;
  const mv=items.map(l=>({type:"vydaj",product_id:l.product_id,lot_id:l.id,quantity:l.quantity,warehouse_id:l.warehouse_id,location_id:l.location_id,via,document:doc,purpose:reason,serial:l.serial}));
  const {error}=await sb.from("stock_movements").insert(mv);
  if(error){alert(error.message);return;}
  await sb.from("stock_lots").delete().in("id",ids);
  closeModal();stockSel={};await loadStock();
  $("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Vydané ${items.length} položiek na jednej výdajke${doc?" ("+esc(doc)+")":""}.</div>`);
}
// výdaj konkrétnej šarže
let issuePreselect=null;
function lotIssue(id){issuePreselect=id;setTab("issue");}
// naskenuj QR / sériové číslo a otvor príslušnú položku na sklade (úprava stavu/popisu, parametre)
function stockScanFind(){openScan(code=>{
  const c=String(code||"").trim().toLowerCase();if(!c)return;
  const lot=stockLots.find(l=>((l.qr_code||"").toLowerCase()===c)||((l.serial||"").toLowerCase()===c));
  if(lot){lotEdit(lot.id);return;}
  const prod=DATA.products.find(p=>(p.sku||"").toLowerCase()===c||(p.name||"").toLowerCase()===c);
  if(prod){prodDetail(prod.id);return;}
  alert("Pre kód „"+code+"“ sa nenašla položka na sklade ani produkt.\nSkontroluj QR / sériové číslo.");
},{qr:true});}
// úprava jednej šarže (modal)
function lotEdit(id){const l=stockLots.find(x=>x.id===id);if(!l)return;
  const whOpts=DATA.warehouses.map(w=>`<option value="${w.id}" ${w.id===l.warehouse_id?"selected":""}>${esc(w.name)}</option>`).join("");
  const stOpts=Object.keys(STATE_LBL).map(k=>`<option value="${k}" ${l.state===k?"selected":""}>${STATE_LBL[k]}</option>`).join("");
  const p=prodOf(l.product_id);
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2>Upraviť šaržu</h2><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px"><span class="muted">${esc((l.products&&l.products.name)||p.name||"")}</span><button class="btn ghost sm" onclick="closeModal();prodDetail(${l.product_id})">ⓘ Parametre produktu</button></div>
    <div class="row2"><div><label>Sklad</label><select id="le_wh" onchange="leFillLoc()">${whOpts}</select></div>
    <div><label>Pozícia</label><select id="le_loc"></select></div></div>
    <div class="row2"><div><label>Stav</label><select id="le_state">${stOpts}</select></div>
    <div><label>Popis stavu</label><input id="le_note" value="${esc(l.state_note||"")}"></div></div>
    <div class="row2"><div><label>Množstvo</label><input id="le_qty" type="number" step="any" value="${esc(l.quantity)}"></div>
    <div><label>Sériové číslo</label><input id="le_sn" value="${esc(l.serial||"")}"></div></div>
    <label>QR kód</label><input id="le_qr" value="${esc(l.qr_code||"")}">
    <div class="row2"><div><label>Nákupná cena</label><input id="le_price" type="number" step="any" value="${esc(l.buy_price)}"></div>
    <div><label>Mena</label><select id="le_cur"><option ${l.buy_currency==="CZK"?"selected":""}>CZK</option><option ${l.buy_currency==="EUR"?"selected":""}>EUR</option><option ${l.buy_currency==="USD"?"selected":""}>USD</option></select></div></div>
    <div class="row2"><div><label>Dátum nákupu</label><input id="le_date" type="date" value="${esc(l.buy_date?String(l.buy_date).slice(0,10):"")}"></div>
    <div><label>Faktúra</label><input id="le_inv" value="${esc(l.invoice_number||"")}"></div></div>
    <div style="display:flex;justify-content:space-between;margin-top:14px">${canDelete()?`<button class="btn red" style="width:auto" onclick="lotDelete(${id})">🗑 Zmazať šaržu</button>`:"<span></span>"}<button class="btn" style="width:auto" onclick="lotEditSave(${id})">Uložiť</button></div>`);
  leFillLoc(l.location_id);
}
function leFillLoc(sel){const arr=locsOf($("#le_wh").value);$("#le_loc").innerHTML=`<option value="">—</option>`+arr.map(l=>`<option value="${l.id}" ${sel&&l.id===sel?"selected":""}>${esc(l.code)}${l.description?" — "+esc(l.description):""}</option>`).join("");}
async function lotEditSave(id){
  const o={warehouse_id:Number($("#le_wh").value),location_id:$("#le_loc").value?Number($("#le_loc").value):null,
    state:$("#le_state").value,state_note:$("#le_note").value.trim()||null,
    quantity:Number($("#le_qty").value||1),serial:$("#le_sn").value.trim()||null,qr_code:$("#le_qr").value.trim()||null,
    buy_price:$("#le_price").value===""?null:Number($("#le_price").value),buy_currency:$("#le_cur").value,
    buy_date:$("#le_date").value||null,invoice_number:$("#le_inv").value.trim()||null};
  const {error}=await sb.from("stock_lots").update(o).eq("id",id);
  if(error){alert(error.message);return;}closeModal();await loadStock();
}
async function lotDelete(id){if(!confirm("Zmazať túto šaržu zo skladu?"))return;const {error}=await sb.from("stock_lots").delete().eq("id",id);if(error){alert(error.message);return;}closeModal();await loadStock();}
const STATE_LBL={new:"nové",used:"použité",refurb:"repasované",damaged:"poškodené"};
// export zásob do CSV
function stockExport(){
  let lots=stockLots.slice();const catT=sf.sub||sf.cat;
  if(catT){const ds=catDesc(catT);lots=lots.filter(l=>ds.has(Number(prodOf(l.product_id).category_id)));}
  if(sf.brand)lots=lots.filter(l=>String(prodOf(l.product_id).brand_id)===sf.brand);
  if(sf.tag)lots=lots.filter(l=>productTagIds(l.product_id).includes(Number(sf.tag)));
  if(sf.wh)lots=lots.filter(l=>String(l.warehouse_id)===sf.wh);
  if(sf.state)lots=lots.filter(l=>String(l.state)===sf.state);
  if(sf.q){const q=sf.q.toLowerCase();lots=lots.filter(l=>((l.products&&l.products.name||"")+" "+(l.serial||"")+" "+(l.qr_code||"")+" "+catPathText(prodOf(l.product_id).category_id)).toLowerCase().includes(q));}
  const head=["Produkt","Kategória","Výrobca","Sklad","Pozícia","Množstvo","Stav","Popis stavu","SN","QR","Nákup cena","Mena","Dátum","Faktúra"];
  const cell=v=>{v=v==null?"":String(v);return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const rows=lots.map(l=>{const p=prodOf(l.product_id);return [(l.products&&l.products.name)||p.name,catPathText(p.category_id),brandName(p),(l.warehouses&&l.warehouses.name)||whName(l.warehouse_id),(l.warehouse_locations&&l.warehouse_locations.code)||"",l.quantity,STATE_LBL[l.state]||l.state,l.state_note||l.note||"",l.serial||"",l.qr_code||"",l.buy_price!=null?l.buy_price:"",l.buy_currency||"",l.buy_date||"",l.invoice_number||""].map(cell).join(";");});
  const csv="﻿"+head.join(";")+"\n"+rows.join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="zasoby_"+new Date().toISOString().slice(0,10)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
// ===== ROZMIESTNENIE SKLADU (modal) =====
let plWh="";
function openPlacement(){if(DATA.warehouses.length&&!plWh)plWh=String(DATA.warehouses[0].id);renderPlacement();}
function renderPlacement(){
  const whOpts=DATA.warehouses.map(w=>`<option value="${w.id}" ${plWh==String(w.id)?"selected":""}>${esc(w.name)}</option>`).join("");
  const w=DATA.warehouses.find(x=>String(x.id)===String(plWh));
  const locs=locsOf(plWh);
  const locRows=locs.map(l=>`<div class="inline" style="gap:6px;margin-bottom:6px;align-items:center"><input value="${esc(l.code)}" onchange="plEditLoc(${l.id},'code',this.value)" style="max-width:130px"><input value="${esc(l.description||"")}" placeholder="Popis pozície" onchange="plEditLoc(${l.id},'description',this.value)"><button class="btn red sm" onclick="plDelLoc(${l.id})">×</button></div>`).join("")||`<div class="muted" style="margin-bottom:6px">Žiadne pozície.</div>`;
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><h2>Rozmiestnenie skladu</h2><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <label>Sklad</label><select onchange="plWh=this.value;renderPlacement()">${whOpts||'<option>—</option>'}</select>
    <div class="inline" style="gap:6px;margin-top:8px"><input id="pl_newwh" placeholder="Nový sklad (krátky názov)…"><button class="btn green sm" onclick="plAddWh()">+ Sklad</button>${w?`<button class="btn red sm" onclick="plDelWh()">Zmazať sklad</button>`:""}</div>
    ${w?`<div class="row2" style="margin-top:10px"><div><label>Názov (krátky)</label><input value="${esc(w.name)}" onchange="plRenameWh(this.value)" placeholder="napr. Rostovská"></div>
      <div><label>Adresa / popis (nepovinné)</label><input value="${esc(w.address||'')}" onchange="plSetAddr(this.value)" placeholder="napr. Rostovská 260/2b, Praha"></div></div>
    <label style="margin-top:10px">Farba skladu (podfarbenie)</label><input type="color" value="${esc(w.color||'#3b6fd4')}" onchange="plColor(this.value)" style="width:70px;height:38px;padding:2px">`:""}
    <div style="display:flex;gap:6px;margin-top:14px"><div style="flex:0 0 130px" class="muted" style="font-size:12px">OZNAČENIE (KRÁTKE)</div><div class="muted" style="font-size:12px">POPIS POZÍCIE</div></div>
    <div id="pl_locs">${locRows}</div>
    <div class="inline" style="gap:6px;margin-top:6px"><input id="pl_code" placeholder="napr. R1-P3" style="max-width:130px"><input id="pl_desc" placeholder="Popis pozície"><button class="btn green sm" onclick="plAddLoc()">+ pozícia</button></div>
    <div style="text-align:right;margin-top:16px"><button class="btn" style="width:auto" onclick="closeModal()">Zavrieť</button></div>`);
}
async function plAddWh(){const n=$("#pl_newwh").value.trim();if(!n)return;const {data,error}=await sb.from("warehouses").insert({name:n}).select("id").single();if(error){alert(error.message);return;}await loadData();plWh=String(data.id);renderPlacement();}
async function plDelWh(){const w=DATA.warehouses.find(x=>String(x.id)===String(plWh));if(!w)return;const {count}=await sb.from("stock_lots").select("id",{count:"exact",head:true}).eq("warehouse_id",w.id);if(count){alert("Na sklade je "+count+" položiek — najprv ich presuň/vydaj.");return;}if(!confirm('Zmazať sklad „'+w.name+'"?'))return;const {error}=await sb.from("warehouses").delete().eq("id",w.id);if(error){alert(error.message);return;}await loadData();plWh=DATA.warehouses[0]?String(DATA.warehouses[0].id):"";renderPlacement();}
async function plColor(v){const {error}=await sb.from("warehouses").update({color:v}).eq("id",Number(plWh));if(error){alert(error.message);return;}await loadData();}
async function plRenameWh(v){v=(v||"").trim();if(!v)return;const {error}=await sb.from("warehouses").update({name:v}).eq("id",Number(plWh));if(error){alert(error.message);return;}await loadData();renderPlacement();}
async function plSetAddr(v){const {error}=await sb.from("warehouses").update({address:(v||"").trim()||null}).eq("id",Number(plWh));if(error){alert(error.message);return;}await loadData();}
async function plAddLoc(){const code=$("#pl_code").value.trim();if(!code)return;const desc=$("#pl_desc").value.trim()||null;const {error}=await sb.from("warehouse_locations").insert({warehouse_id:Number(plWh),code,description:desc});if(error){alert(error.message);return;}await loadData();renderPlacement();}
async function plEditLoc(id,field,val){const o={};o[field]=val.trim()||null;const {error}=await sb.from("warehouse_locations").update(o).eq("id",id);if(error){alert(error.message);}await loadData();}
async function plDelLoc(id){const {count}=await sb.from("stock_lots").select("id",{count:"exact",head:true}).eq("location_id",id);if(count){alert("Na pozícii je "+count+" položiek.");return;}if(!confirm("Zmazať pozíciu?"))return;const {error}=await sb.from("warehouse_locations").delete().eq("id",id);if(error){alert(error.message);return;}await loadData();renderPlacement();}

// ===== PRODUKTY (správa + filtre) =====
let pf={q:"",cat:"",sub:"",brand:"",tag:""};
function savedProdFilters(){try{return JSON.parse(localStorage.getItem("psaved_"+ME.id)||"[]");}catch(e){return [];}}
function pfSaveNew(){const n=prompt("Názov filtra:");if(!n||!n.trim())return;const a=savedProdFilters();a.push({name:n.trim(),pf:JSON.parse(JSON.stringify(pf))});localStorage.setItem("psaved_"+ME.id,JSON.stringify(a));renderProds();}
function pfLoad(name){if(!name)return;const f=savedProdFilters().find(x=>x.name===name);if(f){pf=Object.assign({q:"",cat:"",sub:"",brand:"",tag:""},f.pf);saveFilters();renderProds();}}
function pfManage(){const a=savedProdFilters();if(!a.length){alert("Žiadne uložené filtre.");return;}const n=prompt("Napíš názov filtra na zmazanie:\n\n"+a.map(x=>"• "+x.name).join("\n"));if(!n)return;localStorage.setItem("psaved_"+ME.id,JSON.stringify(a.filter(x=>x.name!==n.trim())));renderProds();}
function catChildren(catId){return DATA.categories.filter(c=>String(c.parent_id)===String(catId));}
// kategórie v stromovom poradí s hĺbkou (pre odsadené <option>)
function catSorted(){const byP={};DATA.categories.forEach(c=>{const k=c.parent_id||0;(byP[k]=byP[k]||[]).push(c);});
  const out=[];(function walk(pid,depth){(byP[pid]||[]).slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"")).forEach(c=>{out.push({c,depth});walk(c.id,depth+1);});})(0,0);return out;}
function catOptionsHtml(selId){return `<option value="">— kategória —</option>`+catSorted().map(({c,depth})=>`<option value="${c.id}" ${String(selId)===String(c.id)?"selected":""}>${"   ".repeat(depth)}${depth?"↳ ":""}${esc(c.name)}</option>`).join("");}
function catByName(name){if(!name)return null;const n=String(name).toLowerCase();return DATA.categories.find(c=>(c.name||"").toLowerCase()===n)||null;}
// celá cesta kategórie: "Komponenty › Disky a SSD" (pre vyhľadávanie)
function catPathText(catId){let id=catId,parts=[],guard=0;while(id!=null&&guard++<8){const c=DATA.categories.find(x=>x.id===id);if(!c)break;parts.unshift(c.name);id=c.parent_id;}return parts.join(" ");}
// množina id danej kategórie + všetkých potomkov (rekurzívny filter)
function catDesc(id){const out=new Set([Number(id)]);let grew=true;while(grew){grew=false;DATA.categories.forEach(c=>{if(out.has(Number(c.parent_id))&&!out.has(Number(c.id))){out.add(Number(c.id));grew=true;}});}return out;}
// ===== automatická klasifikácia produktu (kategória + tagy) podľa názvu/značky =====
const CLASSIFY_RULES=[
  {re:/(antminer|whatsminer|iceriver|avalon|goldshell|bitmain|micro ?bt|\bTh\/s\b|\bhashrate\b|\basic\b)/i, pick:t=>{
      if(/(kaspa|\bks[0-9]|kheavyhash)/i.test(t))return"Kaspa (kHeavyHash)";
      if(/(scrypt|\bl[0-9]|litecoin|doge)/i.test(t))return"Litecoin / Doge (Scrypt)";
      if(/(ethash|\be[0-9]|etchash|ethereum classic)/i.test(t))return"Ethereum Classic (Ethash)";
      if(/(sha ?256|bitcoin|\bs[0-9]{2}|\bt[0-9]{2})/i.test(t))return"Bitcoin (SHA-256)";
      return"ASIC";}, tags:["ASIC","mining"]},
  {re:/(nvme|\bm\.?2\b|\bssd\b|\bhdd\b|pevn[ýy] disk|seagate|barracuda|western digital|extern[ýa].{0,10}disk)/i, cat:"Disky a SSD", pick:t=>{}, tags:t=>{const a=[];if(/(nvme|\bm\.?2\b)/i.test(t)){a.push("SSD","NVMe");}else if(/\bssd\b/i.test(t))a.push("SSD");else if(/\bhdd\b|pevn|seagate|barracuda|western/i.test(t))a.push("HDD");return a;}},
  {re:/(ddr[345]|so-?dimm|\bdimm\b|operačn[áa] pam|\bram\b|pam[äa]t)/i, cat:"Pamäti", tags:["RAM"]},
  {re:/(ryzen|core ?i[3579]|\bxeon\b|pentium|celeron|threadripper|procesor|\bcpu\b)/i, cat:"Procesory", tags:["CPU"]},
  {re:/(geforce|radeon|\brtx\b|\bgtx\b|\brx ?[0-9]{3,4}|grafick[áa] kart|\bgpu\b)/i, cat:"Grafické karty", tags:["GPU"]},
  {re:/(z[áa]kladn[áa] doska|motherboard|mainboard|socket)/i, cat:"Základné dosky", tags:[]},
  {re:/(raid|\bhba\b|radič|radič disk|controller card|expander)/i, cat:"Radiče", tags:["radič"]},
  {re:/(zdroj|napájac[íi] zdroj|\bpsu\b|[0-9]{3,4} ?w( |$)|corsair rm|be quiet|skri[nň]a|\bcase\b|midi ?tower|full ?tower)/i, cat:"Skrine a zdroje", tags:[]},
  {re:/(chladič|chladenie|\bcooler\b|ventilátor|\bfan\b|watercool|\baio\b|teplovodiv|thermal paste)/i, cat:"Chladenie", tags:[]},
  {re:/(notebook|laptop|thinkpad|ideapad|macbook|\bserver\b|stoln[ýy] po[čc]íta[čc]|\bpc\b|workstation|mini ?pc)/i, cat:"Počítače/Servery", tags:t=>/server/i.test(t)?["server"]:/notebook|laptop/i.test(t)?["notebook"]:[]},
  {re:/(k[áa]bel|napájac|\bc13\b|\bc14\b|\bc19\b|\bhdmi\b|display ?port|\busb\b|ethernet|patch|redukci|adapt[ée]r|konektor|\brj45\b|8p8c)/i, cat:"Kabely", tags:t=>{const a=["kábel"];if(/napájac|c1[349]/i.test(t))a.push("napájací");if(/rj45|8p8c/i.test(t))a.push("RJ45");if(/hdmi/i.test(t))a.push("HDMI");if(/usb/i.test(t))a.push("USB");return a;}},
  {re:/(\bpdu\b|mining ?rig|mining ?frame|rám na|riser|mining)/i, cat:"Mining", tags:["mining"]}
];
function classifyProduct(text){const t=String(text||"");for(const r of CLASSIFY_RULES){if(r.re.test(t)){const cat=r.cat||(r.pick?r.pick(t):null);const tags=typeof r.tags==="function"?r.tags(t):r.tags;return {cat,tags:(tags||[]).slice()};}}return {cat:null,tags:[]};}
async function prodDelete(id){
  if(!canDelete())return;
  const {count}=await sb.from("stock_lots").select("id",{count:"exact",head:true}).eq("product_id",id);
  if(count){alert("Produkt má "+count+" skladových položiek — najprv ich vydaj/presuň.");return;}
  const p=DATA.products.find(x=>x.id===id);
  if(!confirm('Zmazať produkt "'+(p?p.name:id)+'"?'))return;
  const {error}=await sb.from("products").delete().eq("id",id);
  if(error){alert(error.message);return;}
  await loadData();renderProds();
}
function prodExport(){
  // export aktuálne filtrovaného zoznamu do CSV (Excel ho otvorí)
  let list=DATA.products.slice().filter(inCatFilter);
  if(pf.brand)list=list.filter(p=>String(p.brand_id)===pf.brand);
  if(pf.tag)list=list.filter(p=>productTagIds(p.id).includes(Number(pf.tag)));
  if(pf.q){const q=pf.q.toLowerCase();list=list.filter(p=>((p.name||"")+" "+brandName(p)+" "+(p.model||"")+" "+(p.sku||"")+" "+productTagNames(p.id).join(" ")).toLowerCase().includes(q));}
  const head=["Názov","Značka","Kategória","Model","SKU","Cena","Mena","Hmotnosť (g)","Tagy"];
  const cell=v=>{v=v==null?"":String(v);return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
  const rows=list.map(p=>[p.name,brandName(p),catName(p.category_id),p.model,p.sku,p.price,p.currency,p.weight_g,productTagNames(p.id).join(", ")].map(cell).join(";"));
  const csv="﻿"+head.join(";")+"\n"+rows.join("\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="produkty_"+new Date().toISOString().slice(0,10)+".csv";a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function inCatFilter(p){const target=pf.sub||pf.cat;if(!target)return true;return catDesc(target).has(Number(p.category_id));}
// popis pôvodu orientačnej ceny (pre ⓘ)
function priceInfo(p){const src=p.price_source==="internet"?"Cena z internetu":"Cena zadaná ručne";const d=p.price_updated_at?(" · "+String(p.price_updated_at).slice(0,10)):"";return src+d;}
// ===== MODAL =====
function openModal(html){$("#modalCard").innerHTML=html;$("#modalOverlay").classList.remove("hide");}
function closeModal(){$("#modalOverlay").classList.add("hide");$("#modalCard").innerHTML="";if(tab==="stock")renderStock();}
// klik na produkt -> detail (parametre, cena, šarže)
function prodOpen(id){prodDetail(id);}
function prodDetail(id){const p=DATA.products.find(x=>x.id===id);if(!p)return;navHash("prods/"+id);
  const tags=productTagNames(id).map(t=>`<span class="tag" style="background:#f3eefb;color:#5e37a6">#${esc(t)}</span>`).join(" ");
  const img=p.image_url?`<img src="${esc(p.image_url)}" style="max-width:220px;border-radius:10px;border:1px solid var(--line)">`:`<div class="muted">bez fotky</div>`;
  const row=(l,v)=>`<div class="lot"><div class="m">${esc(l)}</div><b>${v}</b></div>`;
  const priceVal=p.price!=null&&p.price!==""?esc(p.price)+" "+esc(p.currency||"")+` <span title="${esc(priceInfo(p))}" style="cursor:help;color:#7a8aa5">&#9432;</span>`:"—";
  const lots=stockLots.filter(l=>l.product_id===id);
  const lotsHtml=lots.length?lots.map(l=>`<div class="lot"><div>${whChip(l)} · ${esc((l.warehouse_locations&&l.warehouse_locations.code)||"—")} · <b>${fmtNum(l.quantity)} ks</b> · ${STATE_LBL[l.state]||esc(l.state||"")}</div><div class="m">${l.serial?"SN: "+esc(l.serial)+" · ":""}${l.qr_code?esc(l.qr_code)+" · ":""}${l.buy_price!=null?"nákup "+fmtNum(l.buy_price)+" "+(l.buy_currency||""):""}${l.buy_date?" · "+String(l.buy_date).slice(0,10):""}</div></div>`).join(""):`<div class="muted">Žiadne šarže na sklade.</div>`;
  const missingParams=!p.long_description&&productAttrList(id).length===0;
  $("#view").innerHTML=`<div class="card"><div class="chosen"><b>${esc(p.name)}</b><div style="display:flex;gap:6px;flex-wrap:wrap">${canWrite()?`<button class="btn ghost sm" onclick="prodForm(${id})">✏️ Upraviť</button><button class="btn ghost sm" onclick="prodChangePrice(${id})">💰 Zmeniť cenu</button><button class="btn ghost sm" onclick="prodFetchSpecs(${id})">🔎 Dohľadať parametre</button><button class="btn ghost sm" onclick="prodPrintQR(${id})">🏷️ Tlač QR</button>`:""}<button class="btn ghost sm" onclick="setTab(tab==='prods'?'prods':'stock')">Späť</button></div></div>
    ${missingParams?`<div class="msg" style="background:#fff4e5;color:#a8630c">Chýbajú parametre. ${p.sku?"Skús tlačidlo Dohľadať parametre.":"Doplň EAN/SKU a potom dohľadaj parametre, alebo vyplň ručne cez Upraviť."}</div>`:""}
    <div style="margin:10px 0">${img}</div>
    ${row("Značka",esc(brandName(p))||"—")}${row("Kategória",esc(catPathText(p.category_id))||"—")}
    <div class="lot"><div class="m">Model / SKU</div><b>${esc(p.model||"—")}${p.sku?" · "+esc(p.sku)+copyBtn(p.sku):""}</b></div>
    ${row("Orientačná cena",priceVal)}
    ${p.weight_g?row("Hmotnosť",esc(p.weight_g)+" g"):""}
    ${productAttrList(id).map(a=>row(a.label+(a.unit?" ("+a.unit+")":""),esc(a.value))).join("")}
    ${p.description?row("Krátky popis",esc(p.description)):""}
    ${p.long_description?`<div class="lot"><div class="m">Podrobný popis / parametre</div><div>${esc(p.long_description).replace(/\n/g,"<br>")}</div></div>`:""}
    ${tags?`<div style="margin:8px 0">${tags}</div>`:""}
    <h4 style="margin-top:12px">Na sklade (šarže)</h4>${lotsHtml}</div>`;
}
// ===== DUPLICITY =====
let DUP_MINMATCH=4;               // min. počet zhodných parametrov pre param-duplicitu
function dupSetMin(v){const n=parseInt(v,10);if(!isNaN(n)&&n>=1)DUP_MINMATCH=n;renderDupes();}
// podpis parametrov produktu: {attr_def_id: normalizovaná hodnota}
function attrSig(pid){const m={};DATA.pattrs.filter(x=>x.product_id===pid).forEach(x=>{const v=x.value_num!=null?("#"+x.value_num):normName(x.value);if(v!=="")m[x.attr_def_id]=v;});return m;}
function attrMatch(a,b){let match=0,conflict=0;for(const k in a){if(k in b){if(a[k]===b[k])match++;else conflict++;}}return{match,conflict};}
// skupiny duplicít podľa parametrov: rovnaká značka + ≥ minMatch zhodných parametrov a 0 rozporov
function paramDupGroups(minMatch){
  const sigs={};DATA.products.forEach(p=>{sigs[p.id]=attrSig(p.id);});
  const buckets={};DATA.products.forEach(p=>{if(Object.keys(sigs[p.id]).length<minMatch)return;const key=(p.brand_id||0);(buckets[key]=buckets[key]||[]).push(p);});
  const parent={};const find=x=>parent[x]===undefined?(parent[x]=x):(parent[x]===x?x:(parent[x]=find(parent[x])));
  const uni=(a,b)=>{parent[find(a)]=find(b);};
  Object.values(buckets).forEach(arr=>{for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){const r=attrMatch(sigs[arr[i].id],sigs[arr[j].id]);if(r.conflict===0&&r.match>=minMatch)uni(arr[i].id,arr[j].id);}});
  const g={};DATA.products.forEach(p=>{if(parent[p.id]===undefined)return;(g[find(p.id)]=g[find(p.id)]||[]).push(p);});
  return Object.values(g).filter(a=>a.length>1);
}
// spoločné parametre (rovnaké naprieč celou skupinou) -> pole {label,unit,value}
function commonAttrs(grp){const base=attrSig(grp[0].id);const sigs=grp.map(p=>attrSig(p.id));
  return Object.keys(base).filter(k=>sigs.every(s=>s[k]===base[k])).map(k=>{const d=DATA.attrDefs.find(x=>x.id==k);const pv=DATA.pattrs.find(x=>x.product_id===grp[0].id&&x.attr_def_id==k);return d?{label:d.label,unit:d.unit,value:pv?pv.value:""}:null;}).filter(Boolean);}
function dupCard(grp,gi,cnt,extra){
  return `<div class="card"><h4>${esc(grp[0].name)}</h4>${extra||""}`+grp.map((p,i)=>`<div class="lot" style="display:flex;justify-content:space-between;align-items:center;gap:8px">
      <div><label style="display:inline-flex;gap:6px;align-items:center;margin:0"><input type="radio" name="dup${gi}" value="${p.id}" ${i===0?"checked":""}> <b>${esc(p.name)}</b></label>
      <div class="psub">${esc(brandName(p))||"—"} · ${esc(catPathText(p.category_id))||"—"} · ${cnt[p.id]||0} šarží · SKU ${esc(p.sku||"—")} · ${DATA.pattrs.filter(x=>x.product_id===p.id).length} param.</div></div></div>`).join("")+
      `<button class="btn green" onclick="dupMergeGroup('${gi}',[${grp.map(p=>p.id).join(",")}])">Zlúčiť do vybraného</button></div>`;
}
async function renderDupes(){
  if(ME.role!=="admin"){$("#view").innerHTML=`<div class="card"><div class="msg err">Prístup len pre admina.</div></div>`;return;}
  $("#view").innerHTML=`<div class="card muted">Hľadám duplicity…</div>`;
  const {data:lc}=await sb.from("stock_lots").select("product_id").limit(5000);
  const cnt={};(lc||[]).forEach(r=>{cnt[r.product_id]=(cnt[r.product_id]||0)+1;});
  // 1) podľa názvu
  const groups={};DATA.products.forEach(p=>{const k=normName(p.name);if(!k)return;(groups[k]=groups[k]||[]).push(p);});
  const dups=Object.values(groups).filter(a=>a.length>1);
  // 2) podľa parametrov + značky
  const pgroups=paramDupGroups(DUP_MINMATCH);
  const inName=new Set();dups.forEach(g=>g.forEach(p=>inName.add(p.id)));
  let html=`<div class="card"><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><b>Kontrola duplicít</b>
    <span class="muted">Zhoda parametrov (min):</span><input type="number" min="1" value="${DUP_MINMATCH}" style="width:64px" onchange="dupSetMin(this.value)">
    <span class="muted">pri rovnakej značke</span></div>
    <div class="muted" style="margin-top:6px">Zlúčenie presunie zásoby, pohyby, tagy aj parametre do vybraného; pôvodný názov ostane ako alias pre vyhľadávanie.</div></div>`;
  // sekcia: názov
  html+=`<div class="card"><h3 style="margin:0">Podľa názvu ${dups.length?`(${dups.length})`:""}</h3><div class="muted">Normalizovaný názov (bez diakritiky, veľkosti písmen a interpunkcie).</div></div>`;
  if(!dups.length)html+=`<div class="card"><div class="msg ok">Žiadne duplicity podľa názvu. 👍</div></div>`;
  dups.forEach((grp,gi)=>{html+=dupCard(grp,"n"+gi,cnt);});
  // sekcia: parametre
  html+=`<div class="card"><h3 style="margin:0">Podľa parametrov + značky ${pgroups.length?`(${pgroups.length})`:""}</h3><div class="muted">Rovnaká značka a aspoň ${DUP_MINMATCH} zhodných parametrov bez rozporu — pravdepodobne ten istý produkt aj pri inom názve.</div></div>`;
  if(!pgroups.length)html+=`<div class="card"><div class="msg ok">Žiadne ďalšie duplicity podľa parametrov. 👍</div></div>`;
  pgroups.forEach((grp,gi)=>{
    const ca=commonAttrs(grp);
    const badge=inName.has(grp[0].id)?`<span class="muted" style="font-size:12px">(niektoré už nájdené podľa názvu)</span> `:"";
    const chips=ca.length?`<div style="margin:2px 0 8px 0">${badge}${ca.map(a=>`<span class="tagchip" style="background:#eef1f6;color:#41506a">${esc(a.label)}: ${esc(a.value)}${a.unit?" "+esc(a.unit):""}</span>`).join(" ")}</div>`:(badge?`<div style="margin-bottom:6px">${badge}</div>`:"");
    html+=dupCard(grp,"p"+gi,cnt,chips);
  });
  $("#view").innerHTML=html;
}
async function dupMergeGroup(gi,ids){
  const sel=document.querySelector('input[name="dup'+gi+'"]:checked');if(!sel){alert("Vyber cieľový produkt.");return;}
  const dst=Number(sel.value);const srcs=ids.filter(x=>x!==dst);if(!srcs.length)return;
  if(!confirm("Zlúčiť "+srcs.length+" produkt(ov) do vybraného? Operácia je nevratná."))return;
  try{for(const s of srcs)await prodMerge(dst,s);}catch(e){alert("Chyba pri zlučovaní: "+(e.message||e));}
  await loadData();renderDupes();
}
async function prodMerge(dstId,srcId){
  const s=DATA.products.find(x=>x.id===srcId);
  await sb.from("stock_lots").update({product_id:dstId}).eq("product_id",srcId);
  await sb.from("stock_movements").update({product_id:dstId}).eq("product_id",srcId);
  if(s)await sb.from("product_aliases").insert({product_id:dstId,alias:s.name});
  const dstTags=new Set(DATA.ptags.filter(x=>x.product_id===dstId).map(x=>x.tag_id));
  const moveT=DATA.ptags.filter(x=>x.product_id===srcId&&!dstTags.has(x.tag_id));
  if(moveT.length)await sb.from("product_tags").insert(moveT.map(x=>({product_id:dstId,tag_id:x.tag_id})));
  await sb.from("product_tags").delete().eq("product_id",srcId);
  const dstAttr=new Set(DATA.pattrs.filter(x=>x.product_id===dstId).map(x=>x.attr_def_id));
  const moveA=DATA.pattrs.filter(x=>x.product_id===srcId&&!dstAttr.has(x.attr_def_id));
  if(moveA.length)await sb.from("product_attributes").insert(moveA.map(x=>({product_id:dstId,attr_def_id:x.attr_def_id,value:x.value,value_num:x.value_num})));
  await sb.from("product_attributes").delete().eq("product_id",srcId);
  const {error}=await sb.from("products").delete().eq("id",srcId);
  if(error)throw error;
}
// automatické dohľadanie parametrov: internet (podľa EAN) + AI štruktúrované parametre
async function prodFetchSpecs(id){const p=DATA.products.find(x=>x.id===id);if(!p)return;
  $("#view").insertAdjacentHTML("afterbegin",`<div class="msg" id="pf_msg">🔎 Dohľadávam parametre…</div>`);
  let done=[];
  // 1) internet podľa EAN (fotka, cena, popis) — ak má SKU
  if(p.sku){try{const {data:res,error}=await sb.functions.invoke("lookup-barcode",{body:{code:p.sku}});
    if(!error&&res&&res.found){const o={};
      if(res.specs&&!p.long_description){o.long_description=res.specs;done.push("popis");}
      if(res.image&&!p.image_url){o.image_url=res.image;done.push("fotka");}
      if(res.price!=null&&(p.price==null||p.price==="")){o.price=res.price;o.price_source="internet";o.price_updated_at=new Date().toISOString().slice(0,10);done.push("cena");}
      if(Object.keys(o).length)await sb.from("products").update(o).eq("id",id);
    }}catch(e){}}
  // 2) AI štruktúrované parametre kategórie (funguje aj bez EAN)
  const defs=attrDefsForCat(p.category_id);
  if(defs.length){try{
    const bname=brandName(p);
    const {data,error}=await sb.functions.invoke("product-specs",{body:{name:p.name,brand:bname,model:p.model,category:catName(p.category_id),attributes:defs.map(d=>({key:d.attr_key,label:d.label,type:d.type,unit:d.unit,options:d.options}))}});
    logAiUsage("product-specs",data);
    if(!error&&data&&data.attrs){
      const rows=[];defs.forEach(d=>{const v=data.attrs[d.attr_key];if(v!=null&&v!==""){const num=Number(v);rows.push({product_id:id,attr_def_id:d.id,value:String(v),value_num:isNaN(num)?null:num});}});
      // nezmaž existujúce; doplň len chýbajúce
      const have=new Set(DATA.pattrs.filter(x=>x.product_id===id).map(x=>x.attr_def_id));
      const add=rows.filter(r=>!have.has(r.attr_def_id));
      if(add.length){await sb.from("product_attributes").insert(add);done.push(add.length+" parametrov (AI)");}
    }
  }catch(e){}}
  await loadData();prodDetail(id);
  const m=$("#pf_msg");if(m)m.outerHTML=done.length?`<div class="msg ok">✓ Doplnené: ${esc(done.join(", "))}.</div>`:`<div class="msg" style="background:#fff4e5;color:#a8630c">Nič sa nedoplnilo. Pri EAN treba <b>ICECAT_USER</b>, pri AI parametroch <b>product-specs</b> + <b>ANTHROPIC_API_KEY</b>. Alebo doplň ručne cez Upraviť.</div>`;
}
// z detailu produktu -> tlač QR pre daný produkt
function prodPrintQR(id){const p=DATA.products.find(x=>x.id===id);setTab("qr");setTimeout(()=>{const s=$("#q_prod");if(s&&p){s.value=p.name;}const m=$("#view");if(m)m.insertAdjacentHTML("afterbegin",`<div class="msg ok">Produkt „${esc(p?p.name:"")}" predvyplnený — zadaj počet a klikni „+ Pridať pre produkt", potom Pripraviť tlač.</div>`);},80);}
async function prodChangePrice(id){const p=DATA.products.find(x=>x.id===id);if(!p)return;
  const v=prompt("Nová orientačná cena ("+(p.currency||"CZK")+"), zdroj = ručne:",p.price!=null?p.price:"");
  if(v===null)return;const num=v.trim()===""?null:Number(v);if(v.trim()!==""&&isNaN(num)){alert("Neplatné číslo.");return;}
  const {data,error}=await sb.from("products").update({price:num,price_source:num!=null?"manual":null,price_updated_at:num!=null?new Date().toISOString().slice(0,10):null}).eq("id",id).select("id,price,currency,price_source,price_updated_at").single();
  if(error){alert(error.message);return;}
  const i=DATA.products.findIndex(x=>x.id===id);if(i>=0)Object.assign(DATA.products[i],data);
  prodDetail(id);
}
function renderProds(){
  let list=DATA.products.slice();
  list=list.filter(inCatFilter);
  if(pf.brand)list=list.filter(p=>String(p.brand_id)===pf.brand);
  if(pf.tag)list=list.filter(p=>productTagIds(p.id).includes(Number(pf.tag)));
  if(pf.q){const q=pf.q.toLowerCase();list=list.filter(p=>((p.name||"")+" "+brandName(p)+" "+(p.model||"")+" "+(p.sku||"")+" "+catPathText(p.category_id)+" "+productTagNames(p.id).join(" ")).toLowerCase().includes(q));}
  const topCats=DATA.categories.filter(c=>!c.parent_id);
  const catOpts=`<option value="">Všetky kategórie</option>`+topCats.map(c=>`<option value="${c.id}" ${pf.cat==String(c.id)?"selected":""}>${esc(c.name)}</option>`).join("");
  const subs=pf.cat?catChildren(pf.cat):[];
  const subOpts=`<option value="">Všetky podkategórie</option>`+subs.map(c=>`<option value="${c.id}" ${pf.sub==String(c.id)?"selected":""}>${esc(c.name)}</option>`).join("");
  const scopeB=DATA.products.filter(inCatFilter);const brandIdsB=new Set(scopeB.map(p=>p.brand_id).filter(x=>x!=null));
  const brList=DATA.brands.filter(b=>brandIdsB.has(b.id)||String(b.id)===pf.brand);
  const brOpts=`<option value="">Všetky značky</option>`+brList.map(b=>`<option value="${b.id}" ${pf.brand==String(b.id)?"selected":""}>${esc(b.name)}</option>`).join("");
  const preTag=DATA.products.filter(inCatFilter).filter(p=>!pf.brand||String(p.brand_id)===pf.brand).filter(p=>{if(!pf.q)return true;const q=pf.q.toLowerCase();return((p.name||"")+" "+brandName(p)+" "+(p.model||"")+" "+(p.sku||"")+" "+catPathText(p.category_id)+" "+productTagNames(p.id).join(" ")).toLowerCase().includes(q);});
  const presentTagIds=new Set();preTag.forEach(p=>productTagIds(p.id).forEach(id=>presentTagIds.add(id)));
  const tagChips=DATA.tags.filter(t=>presentTagIds.has(t.id)||String(t.id)===pf.tag).sort((a,b)=>a.name.localeCompare(b.name)).map(t=>tagChip(t,String(t.id)===pf.tag,`pf.tag=(pf.tag==='${t.id}'?'':'${t.id}');saveFilters();renderProds()`)).join("")||`<span class="muted" style="font-size:12px">žiadne tagy</span>`;
  const trs=list.slice(0,300).map(p=>{const th=p.image_url?`<img class="pimg" src="${esc(p.image_url)}">`:`<div class="pimg" style="background:#eef1f6"></div>`;
    const tags=productTagNames(p.id).map(t=>{const c=tagColor(t);return `<span class="tag" style="background:${c[0]};color:${c[1]}">#${esc(t)}</span>`;}).join(" ");
    const asm=(p.type==="assembly"||p.is_assembly)?`<span class="tag o">zostava</span>`:"";
    return `<tr>
      <td style="width:52px;cursor:pointer" onclick="prodOpen(${p.id})">${th}</td>
      <td style="cursor:pointer" onclick="prodOpen(${p.id})"><span class="pnm">${esc(p.name)}</span> ${asm}<div class="psub">${esc(brandName(p))?esc(brandName(p))+" · ":""}${esc(p.model||"")}${p.sku?" · "+esc(p.sku):""}</div>${tags?`<div style="margin-top:3px">${tags}</div>`:""}</td>
      <td>${esc(brandName(p))||"—"}</td>
      <td>${esc(catName(p.category_id))||"—"}</td>
      <td class="r">${p.price!=null&&p.price!==""?esc(p.price)+" "+esc(p.currency||"")+` <span title="${esc(priceInfo(p))}" style="cursor:help;color:#7a8aa5;font-weight:700">&#9432;</span>`:"—"}</td>
      ${canWrite()?`<td class="r" style="white-space:nowrap"><button class="btn ghost sm" onclick="prodForm(${p.id})">Upraviť</button>${canDelete()?` <button class="btn red sm" onclick="prodDelete(${p.id})">Zmazať</button>`:""}</td>`:"<td></td>"}
    </tr>`;}).join("");
  const table=list.length?`<div class="ptbl-wrap"><table class="ptbl"><thead><tr><th></th><th>Produkt</th><th>Značka</th><th>Kategória</th><th class="r">Orientačná nákupná cena</th><th></th></tr></thead><tbody>${trs}</tbody></table></div>`:`<div class="muted">Žiadne produkty.</div>`;
  $("#view").innerHTML=`
    ${canWrite()?`<div class="card"><div class="inline" style="gap:8px;flex-wrap:wrap"><button class="btn sm" onclick="prodForm(0)">+ Nový produkt</button><button class="btn ghost sm" onclick="prodExport()">⬇ Export (Excel/CSV)</button></div></div>`:""}
    <div class="card">
    <div class="toolbar"><input placeholder="Hľadať názov / SKU / kategóriu / tag…" value="${esc(pf.q)}" oninput="pf.q=this.value;saveFilters();renderProds()">
      <select onchange="pf.cat=this.value;pf.sub='';saveFilters();renderProds()">${catOpts}</select>
      <select onchange="pf.sub=this.value;saveFilters();renderProds()" ${subs.length?"":"disabled"}>${subOpts}</select>
      <select onchange="pf.brand=this.value;saveFilters();renderProds()">${brOpts}</select>
      <button class="btn ghost sm" onclick="pf={q:'',cat:'',sub:'',brand:'',tag:''};saveFilters();renderProds()">✕ Filtre</button></div>
    <div style="margin:2px 0 8px">${tagChips}</div>
    <div class="inline" style="gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
      <select style="width:auto" onchange="pfLoad(this.value)"><option value="">Uložené filtre…</option>${savedProdFilters().map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join("")}</select>
      <button class="btn ghost sm" onclick="pfSaveNew()">💾 Uložiť filter</button>
      <button class="btn ghost sm" onclick="pfManage()">🗑</button></div>
    <div class="muted" style="margin-bottom:8px">${list.length} produktov</div>${table}</div>`;
}
function prodForm(id,prefill){
  const pf2=prefill||{};
  const brMatch=pf2.brand?DATA.brands.find(b=>b.name.toLowerCase()===String(pf2.brand).toLowerCase()):null;
  const p=id?DATA.products.find(x=>x.id===id):{price:"",currency:"CZK",name:pf2.name||"",sku:pf2.sku||"",brand_id:brMatch?brMatch.id:null,image_url:""};
  formTags=id?productTagIds(id):[];
  priceSrc=p.price_source||"manual";
  formAttrs={};if(id){DATA.pattrs.filter(x=>x.product_id===id).forEach(x=>{formAttrs[x.attr_def_id]=x.value;});}
  const catOpts=catOptionsHtml(p.category_id);
  const brOpts=`<option value="">— značka —</option>`+DATA.brands.map(b=>`<option value="${b.id}" ${p.brand_id===b.id?"selected":""}>${esc(b.name)}</option>`).join("")+`<option value="__new">➕ nová značka…</option>`;
  $("#view").innerHTML=`<div class="card"><h2>${id?"Upraviť produkt":"Nový produkt"}</h2>
    <div style="background:#eef4ff;border:1px solid #cfe0ff;border-radius:10px;padding:12px">
      <label style="margin-top:0">EAN / čiarový kód — naskenuj alebo odfoť, údaje sa doplnia samé</label>
      <div class="inline"><input id="p_sku" value="${esc(p.sku||"")}" placeholder="EAN / kód">
        <button class="btn ghost sm" type="button" onclick="pScanBarcode()">📷 Skenovať</button>
        <button class="btn ghost sm" type="button" onclick="pLookupNow()">🌐 Dohľadať</button></div>
      <div class="inline" style="margin-top:8px;flex-wrap:wrap;gap:6px"><button class="btn ghost sm" type="button" onclick="pOcrPhoto()">🔤 Prečítať štítok (OCR, zadarmo)</button><button class="btn ghost sm" type="button" onclick="pAiPhoto()">🔍 Rozpoznať z fotky (AI)</button></div>
      <div id="p_scanmsg" style="margin-top:6px"></div>
    </div>
    <label>Názov</label><input id="p_name" value="${esc(p.name||"")}" onchange="pApplyClassify('')">
    <div class="row2"><div><label>Značka</label><select id="p_brand" onchange="if(this.value==='__new')pNewBrand(this)">${brOpts}</select></div>
    <div><label>Model</label><input id="p_model" value="${esc(p.model||"")}"></div></div>
    <label>Kategória / podkategória</label><select id="p_cat" onchange="renderProdAttrs();pMapSpecsToAttrs(lastSpecList)">${catOpts}</select>
    <div id="p_attrs"></div>
    <button class="btn ghost sm" type="button" onclick="pAiSpecs()" style="margin-top:6px">🤖 Doplniť parametre (AI z názvu/modelu)</button>
    <div class="row2"><div><label>Cena</label><input id="p_price" type="number" step="any" value="${esc(p.price)}" oninput="priceSrc='manual'"></div>
    <div><label>Mena</label><select id="p_cur"><option ${p.currency==="CZK"?"selected":""}>CZK</option><option ${p.currency==="EUR"?"selected":""}>EUR</option><option ${p.currency==="USD"?"selected":""}>USD</option></select></div></div>
    <label>Hmotnosť (g)</label><input id="p_weight" type="number" step="any" value="${esc(p.weight_g)}">
    <label>Krátky popis</label><input id="p_desc" value="${esc(p.description||"")}">
    <label>Parametre / podrobný popis</label><textarea id="p_long" rows="4" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:15px;font-family:inherit">${esc(p.long_description||"")}</textarea>
    <input id="p_img" type="hidden" value="${esc(p.image_url||"")}">
    <label>Fotka produktu</label><div id="p_imgwrap">${p.image_url?`<img src="${esc(p.image_url)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">`:`<span class="muted">bez fotky</span>`}</div>
    <button class="btn ghost" type="button" onclick="pPhoto()">📷 Nahrať / zmeniť fotku</button>
    <label>Tagy</label><input id="p_tagq" placeholder="Hľadať tag…" oninput="renderPTags()" style="margin-bottom:6px"><div id="p_tags" class="sug" style="max-height:170px;overflow:auto;padding:6px"></div><button class="btn ghost" type="button" onclick="pAddTag()" style="margin-top:6px">+ nový tag</button>
    <button class="btn green" id="p_save" onclick="pSave(${id||0})">Uložiť</button>
    <button class="btn ghost" onclick="prodBack()">Späť</button>
    <div id="p_msg"></div></div>`;
  renderPTags();renderProdAttrs();
}
let formTags=[];let priceSrc="manual";let formAttrs={};let prodReturnToRecv=false;let lastSpecList=[];
function prodBack(){if(prodReturnToRecv){prodReturnToRecv=false;setTab("recv");}else setTab("prods");}
// dynamické polia parametrov podľa zvolenej kategórie (+ zdedené od rodičov)
// automatické doplnenie parametrov kategórie cez AI (z názvu/značky/modelu)
async function pAiSpecs(){
  const cid=$("#p_cat").value?Number($("#p_cat").value):null;const defs=attrDefsForCat(cid);
  if(!defs.length){alert("Táto kategória nemá definované parametre (pridaj ich v Kategórie a tagy).");return;}
  const name=$("#p_name").value.trim();if(!name){alert("Najprv zadaj názov produktu.");return;}
  const bsel=$("#p_brand");const bname=(bsel&&bsel.value&&bsel.value!=="__new")?((DATA.brands.find(b=>b.id===Number(bsel.value))||{}).name||""):"";
  const model=$("#p_model")?$("#p_model").value.trim():"";
  const msg=$("#p_scanmsg");if(msg)msg.innerHTML=`<div class="muted">🤖 Dopĺňam parametre z názvu/modelu…</div>`;
  let data=null,error=null;
  try{const r=await sb.functions.invoke("product-specs",{body:{name,brand:bname,model,category:catName(cid),attributes:defs.map(d=>({key:d.attr_key,label:d.label,type:d.type,unit:d.unit,options:d.options}))}});data=r.data;error=r.error;logAiUsage("product-specs",data);}catch(e){error=e;}
  if(error||(data&&data.error)||!data||!data.attrs){if(msg)msg.innerHTML=`<div class="msg err">AI dopĺňanie nie je dostupné. Nasaď edge funkciu <b>product-specs</b> a nastav <b>ANTHROPIC_API_KEY</b>.${data&&data.error?"<br>"+esc(data.error):""}</div>`;return;}
  let n=0;defs.forEach(d=>{const v=data.attrs[d.attr_key];if(v!=null&&v!==""){formAttrs[d.id]=String(v);n++;}});
  renderProdAttrs();
  if(msg)msg.innerHTML=n?`<div class="msg ok">🤖 Doplnených ${n} parametrov — skontroluj hodnoty.</div>`:`<div class="muted">AI nevedelo spoľahlivo určiť parametre pre tento produkt. Doplň ich ručne.</div>`;
}
function renderProdAttrs(){const box=$("#p_attrs");if(!box)return;const cid=$("#p_cat").value?Number($("#p_cat").value):null;const defs=attrDefsForCat(cid);
  if(!defs.length){box.innerHTML=`<div class="muted" style="margin-top:6px">Pre túto kategóriu nie sú definované parametre (pridať sa dajú v „Kategórie a tagy").</div>`;return;}
  box.innerHTML=`<label>Parametre — ${esc(catName(cid))}</label>`+defs.map(d=>{const v=formAttrs[d.id]!=null?formAttrs[d.id]:"";
    const lab=`<div class="muted" style="font-size:12px;margin:6px 0 3px">${esc(d.label)}${d.unit?" ("+esc(d.unit)+")":""}</div>`;
    if(d.type==="enum"&&Array.isArray(d.options))return lab+`<select onchange="formAttrs[${d.id}]=this.value"><option value="">—</option>${d.options.map(o=>`<option ${String(v)===String(o)?"selected":""}>${esc(o)}</option>`).join("")}</select>`;
    const t=d.type==="number"?"number":"text";
    return lab+`<input type="${t}" step="any" value="${esc(v)}" oninput="formAttrs[${d.id}]=this.value">`;}).join("");
}
function renderPTags(){const box=$("#p_tags");if(!box)return;const q=(($("#p_tagq")&&$("#p_tagq").value)||"").toLowerCase();
  const list=DATA.tags.filter(t=>formTags.includes(t.id)||!q||t.name.toLowerCase().includes(q));
  box.innerHTML=list.map(t=>`<span class="chip ${formTags.includes(t.id)?"on":""}" style="cursor:pointer;padding:4px 10px;border-radius:16px;border:1px solid #cfe0ff;display:inline-block;margin:2px;${formTags.includes(t.id)?"background:var(--blue);color:#fff":"background:#eef4ff;color:var(--blue)"}" onclick="pToggleTag(${t.id})">#${esc(t.name)}</span>`).join("")||`<span class="muted">Nič nenájdené.</span>`;}
function pToggleTag(id){const i=formTags.indexOf(id);if(i>=0)formTags.splice(i,1);else formTags.push(id);renderPTags();}
async function pAddTag(){const n=prompt("Nový tag:");if(!n||!n.trim())return;const v=n.trim();
  let t=DATA.tags.find(x=>x.name.toLowerCase()===v.toLowerCase());
  if(!t){const {data,error}=await sb.from("tags").insert({name:v}).select().single();if(error){alert(error.message);return;}t=data;DATA.tags.push(t);DATA.tags.sort((a,b)=>a.name.localeCompare(b.name));}
  if(!formTags.includes(t.id))formTags.push(t.id);renderPTags();}
function pPhoto(){pickPhoto("products",(url,kb)=>{$("#p_img").value=url;$("#p_imgwrap").innerHTML=`<img src="${esc(url)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"> <span class="muted">${kb} kB</span>`;});}
// nastav značku vo formulári podľa názvu (vytvorí ak neexistuje)
async function pSetBrandByName(name){const sel=$("#p_brand");if(!sel||!name)return false;
  let b=DATA.brands.find(x=>x.name.toLowerCase()===String(name).toLowerCase());let created=false;
  if(!b){const {data,error}=await sb.from("brands").insert({name:String(name).trim()}).select().single();if(error)return false;b=data;created=true;DATA.brands.push(b);DATA.brands.sort((a,c)=>a.name.localeCompare(c.name));
    sel.innerHTML=`<option value="">— značka —</option>`+DATA.brands.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("")+`<option value="__new">➕ nová značka…</option>`;}
  sel.value=String(b.id);return created;}
// doplní obrázok/cenu/parametre z výsledku dohľadania (len ak sú polia prázdne)
function pFillExtras(res){
  if(res.image&&$("#p_img")&&!$("#p_img").value){$("#p_img").value=res.image;$("#p_imgwrap").innerHTML=`<img src="${esc(res.image)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line)"> <span class="muted">z internetu</span>`;}
  if(res.price!=null&&$("#p_price")&&!$("#p_price").value){$("#p_price").value=res.price;priceSrc="internet";const cur=$("#p_cur");if(cur&&res.currency)cur.value=res.currency;}
  if(res.specs&&$("#p_long")&&!$("#p_long").value.trim())$("#p_long").value=res.specs;
}
// normalizácia štítku parametra na porovnanie (bez diakritiky, malé, len písmená/čísla)
function normLabel(s){return String(s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g," ").trim();}
// nastaví kategóriu podľa Icecat kategórie (ak sa dá namapovať na našu taxonómiu)
function pSetCategoryByName(name){const sel=$("#p_cat");if(!sel||sel.value||!name)return false;
  const n=normLabel(name);let hit=null;
  for(const c of DATA.categories){const cn=normLabel(c.name);if(!cn)continue;if(cn===n||cn.includes(n)||n.includes(cn)){hit=c;if(cn===n)break;}}
  if(hit){sel.value=String(hit.id);renderProdAttrs();return true;}
  return false;
}
// namapuje dohľadané parametre (Icecat) na definované atribúty zvolenej kategórie — bez AI
function pMapSpecsToAttrs(specList){
  const cid=$("#p_cat").value?Number($("#p_cat").value):null;if(!cid)return 0;
  const defs=attrDefsForCat(cid);if(!defs.length||!Array.isArray(specList)||!specList.length)return 0;
  // index atribútov podľa normalizovaného labelu
  const idx={};defs.forEach(d=>{idx[normLabel(d.label)]=d;});
  let n=0;
  specList.forEach(s=>{
    const key=normLabel(s.label);let d=idx[key];
    if(!d){for(const dk in idx){if(dk&&(dk.includes(key)||key.includes(dk))){d=idx[dk];break;}}}
    if(!d)return;
    if(formAttrs[d.id]!=null&&String(formAttrs[d.id]).trim()!=="")return; // neprepisuj vyplnené
    // z hodnoty vytiahni číslo, ak je atribút číselný
    let val=String(s.value).trim();
    if(d.type==="number"){const m=val.replace(",",".").match(/-?\d+(\.\d+)?/);if(m)val=m[0];else return;}
    formAttrs[d.id]=val;n++;
  });
  if(n)renderProdAttrs();
  return n;
}
// doplní tag podľa názvu (vytvorí, ak neexistuje)
async function pAddTagByName(name){if(!name)return;let t=DATA.tags.find(x=>x.name.toLowerCase()===String(name).toLowerCase());
  if(!t){const {data,error}=await sb.from("tags").insert({name:String(name)}).select().single();if(error)return;t=data;DATA.tags.push(t);DATA.tags.sort((a,b)=>a.name.localeCompare(b.name));}
  if(!formTags.includes(t.id))formTags.push(t.id);renderPTags();}
// automaticky vyber kategóriu (ak nie je zvolená) a doplň tagy podľa textu
function pApplyClassify(extra){
  const full=[extra,$("#p_name")&&$("#p_name").value,$("#p_model")&&$("#p_model").value].filter(Boolean).join(" ");
  if(!full.trim())return;
  const {cat,tags}=classifyProduct(full);
  const sel=$("#p_cat");
  if(sel&&cat&&!sel.value){const c=catByName(cat);if(c)sel.value=String(c.id);}
  (tags||[]).forEach(t=>pAddTagByName(t));
}
// naskenuj / odfoť čiarový kód — na štítku býva EAN aj sériové číslo, preferuj EAN
function pScanBarcode(){openScan(code=>{const s=$("#p_sku");if(s)s.value=code;pDoLookup(code);},{prefer:"ean"});}
// dohľadanie zadaného EAN (tlačidlo 🌐)
function pLookupNow(){const code=($("#p_sku").value||"").trim();if(!code){$("#p_scanmsg").innerHTML=`<div class="muted">Zadaj EAN / čiarový kód.</div>`;return;}pDoLookup(code);}
// spoločné: interná zhoda -> internet -> auto-doplnenie + klasifikácia
async function pDoLookup(code){
  const msg=$("#p_scanmsg");if(msg)msg.innerHTML=`<div class="muted">🌐 Dohľadávam kód ${esc(code)}…</div>`;
  const hit=DATA.products.find(p=>(p.sku||"").toLowerCase()===code.toLowerCase());
  if(hit){if(msg)msg.innerHTML=`<div class="msg err">Tento kód už má produkt: „${esc(hit.name)}". Otváram ho na úpravu…</div>`;setTimeout(()=>prodForm(hit.id),900);return;}
  let res=null;
  try{const {data,error}=await sb.functions.invoke("lookup-barcode",{body:{code}});if(!error)res=data;}catch(e){}
  if(res&&res.found){
    lastSpecList=res.specList||[];
    const nm=$("#p_name");if(nm&&!nm.value.trim())nm.value=res.name||"";
    let created=false;if(res.brand)created=await pSetBrandByName(res.brand);
    pFillExtras(res);
    // kategória: najprv z názvu (naše pravidlá), ak nezaberie, skús Icecat kategóriu
    pApplyClassify([res.name,res.brand].filter(Boolean).join(" "));
    let catSet=!!($("#p_cat")&&$("#p_cat").value);
    if(!catSet&&res.category)catSet=pSetCategoryByName(res.category);
    // parametre: namapuj Icecat parametre na atribúty kategórie (bez AI)
    const nAttr=pMapSpecsToAttrs(res.specList||[]);
    const noExtra=!res.image&&res.price==null&&!res.specs;
    if(msg)msg.innerHTML=`<div class="msg ok">🌐 Doplnené z internetu: ${esc(res.name||"")}${res.image?" · fotka":""}${res.price!=null?" · cena":""}${res.specs?" · popis":""}${nAttr?" · "+nAttr+" parametrov":""}. ${catSet?"Kategória a tagy nastavené.":"⚠️ Kategóriu vyber ručne (parametre sa potom doplnia)."}${created?`<br>⚠️ Vytvorený nový výrobca: <b>${esc(res.brand)}</b>.`:""}${(!nAttr&&catSet&&res.specList&&res.specList.length)?`<br><span style="color:#a8630c">Parametre sa nezhodli s definíciami tejto kategórie — over názvy atribútov v „Kategórie a tagy".</span>`:""}${noExtra?`<br><span style="color:#a8630c">Fotka/cena/parametre neprišli — over AKTUÁLNU edge funkciu <b>lookup-barcode</b> a secret <b>ICECAT_USER</b>.</span>`:""}</div>`;
  }else if(msg){msg.innerHTML=`<div class="muted">Kód ${esc(code)} sa v oficiálnych databázach nenašiel (bežné pri ASIC). Vyplň názov — kategóriu a tagy doplním z názvu, alebo skús „Rozpoznať z fotky".</div>`;}
}
// OCR priamo v prehliadači (zadarmo, bez AI) — prečíta text zo štítka
function pOcrPhoto(){const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;pOcrRun(f);};inp.click();}
// predspracovanie fotky pre OCR: zväčšenie + odtiene sivej + zvýšenie kontrastu
async function ocrPreprocess(file){
  const img=await blobToImg(file);
  let w=img.width,h=img.height;const target=1600;               // upscale menšie fotky
  const sc=Math.min(2.5,Math.max(1,target/Math.max(w,h)));
  w=Math.round(w*sc);h=Math.round(h*sc);
  const cv=document.createElement("canvas");cv.width=w;cv.height=h;
  const ctx=cv.getContext("2d");ctx.drawImage(img,0,0,w,h);
  const im=ctx.getImageData(0,0,w,h);const d=im.data;
  // grayscale + kontrastné roztiahnutie (jednoduché, robustné voči osvetleniu)
  let min=255,max=0;const g=new Uint8ClampedArray(w*h);
  for(let i=0,j=0;i<d.length;i+=4,j++){const v=(d[i]*0.299+d[i+1]*0.587+d[i+2]*0.114)|0;g[j]=v;if(v<min)min=v;if(v>max)max=v;}
  const rng=Math.max(1,max-min);
  for(let i=0,j=0;i<d.length;i+=4,j++){let v=((g[j]-min)*255/rng)|0;v=v<0?0:v>255?255:v;d[i]=d[i+1]=d[i+2]=v;}
  ctx.putImageData(im,0,0);
  return cv;
}
// vyčistí OCR výstup: zahodí "šumové" riadky (čiarový kód, samé oddeľovače, nízka istota)
function ocrCleanLines(data){
  let lines=[];
  if(data&&Array.isArray(data.lines)&&data.lines.length){
    lines=data.lines.map(l=>({t:(l.text||"").trim(),c:(typeof l.confidence==="number")?l.confidence:70}));
  }else{
    lines=String((data&&data.text)||"").split(/\n+/).map(t=>({t:t.trim(),c:70}));
  }
  const good=[];
  for(const {t,c} of lines){
    if(!t)continue;
    const nonSpace=t.replace(/\s/g,"");if(nonSpace.length<2)continue;
    const alnum=(t.match(/[A-Za-z0-9]/g)||[]).length;
    if(alnum/nonSpace.length<0.5)continue;         // väčšinou oddeľovače/šum (napr. 4|3|4||)
    if(c<45)continue;                               // nízka istota
    good.push(t.replace(/\s{2,}/g," "));
  }
  return good;
}
async function pOcrRun(file){
  const msg=$("#p_scanmsg");if(msg)msg.innerHTML=`<div class="muted">🔤 Čítam text z fotky (OCR, môže chvíľu trvať)…</div>`;
  if(!window.Tesseract){if(msg)msg.innerHTML=`<div class="msg err">OCR knižnica sa nenačítala (internet?).</div>`;return;}
  let data=null;
  try{const src=await ocrPreprocess(file).catch(()=>file);const r=await Tesseract.recognize(src,"eng");data=r&&r.data;}
  catch(e){if(msg)msg.innerHTML=`<div class="msg err">OCR zlyhalo: ${esc(e.message||e)}</div>`;return;}
  const lines=ocrCleanLines(data);
  const clean=lines.join(" ").replace(/\s+/g," ").trim();
  const raw=String((data&&data.text)||"");
  if(!clean){if(msg)msg.innerHTML=`<div class="msg err">Zo štítka sa nepodarilo spoľahlivo prečítať text. Skús ostrejšiu fotku zblízka, s dobrým svetlom.</div>`;return;}
  const low=clean.toLowerCase();
  // EAN: nájdi postupnosť číslic (aj s medzerami) a over dĺžku 8/12/13 po odstránení medzier
  let ean="";
  const cand=raw.match(/\d[\d ]{6,}\d/g)||[];
  for(const csr of cand){const digits=csr.replace(/\D/g,"");if(/^(\d{13}|\d{12}|\d{8})$/.test(digits)){ean=digits;break;}}
  // značka — najprv podľa existujúcich značiek, potom bežné keywordy
  const brandKW=["Antminer","Bitmain","Iceriver","Whatsminer","MicroBT","Goldshell","Avalon","Elphapex","NVIDIA","GeForce","AMD","Radeon","ASUS","MSI","Gigabyte","Kingston","Corsair","Samsung","Seagate","Western Digital","Intel","Noctua","TP-Link","Mikrotik"];
  let brand="";
  for(const b of DATA.brands){if(b.name&&b.name.length>2&&low.includes(b.name.toLowerCase())){brand=b.name;break;}}
  if(!brand)for(const k of brandKW){if(low.includes(k.toLowerCase())){brand=k;break;}}
  const model=((clean.match(/\b(?:RTX|GTX|RX)\s?\d{3,4}\w*\b/i)||[])[0])||((clean.match(/\b[A-Z]{1,4}\d{1,4}[A-Z0-9+\-]*\b/)||[])[0])||"";
  const nm=$("#p_name");const compose=[brand,model].filter(Boolean).join(" ").trim();
  if(nm&&!nm.value.trim()&&compose)nm.value=compose;
  const sk=$("#p_sku");if(sk&&ean&&!sk.value.trim())sk.value=ean;
  if(brand)await pSetBrandByName(brand);
  const md=$("#p_model");if(md&&model&&!md.value.trim())md.value=model;
  // POZOR: surový OCR text NEDÁVAME do parametrov/popisu — býva to šum. Ukážeme ho len na kontrolu.
  pApplyClassify([brand,model,clean].filter(Boolean).join(" "));
  const preview=`<details style="margin-top:6px"><summary class="muted" style="cursor:pointer">Zobraziť prečítaný text (${lines.length} riadkov)</summary><div style="font-size:12px;white-space:pre-wrap;background:#f6f8fc;border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:4px;max-height:160px;overflow:auto">${esc(lines.join("\n"))}</div><button class="btn ghost sm" style="margin-top:4px" type="button" onclick="ocrToDesc(${JSON.stringify(clean.slice(0,400)).replace(/"/g,'&quot;')})">Vložiť do „Krátky popis"</button></details>`;
  // interná zhoda
  const hit=ean?DATA.products.find(p=>(p.sku||"").toLowerCase()===ean.toLowerCase()):(compose?similarProduct(compose,0):null);
  if(hit){if(msg)msg.innerHTML=`<div class="msg">Podobný produkt už v DB: „${esc(hit.name)}". <span style="color:var(--blue);cursor:pointer;text-decoration:underline" onclick="prodForm(${hit.id})">otvoriť</span></div>${preview}`;return;}
  if(ean){if(msg)msg.innerHTML=`<div class="msg ok">🔤 Prečítané${brand?" · "+esc(brand):""}${model?" · "+esc(model):""} · EAN ${esc(ean)}. Dohľadávam online…</div>${preview}`;pDoLookup(ean);return;}
  if(msg)msg.innerHTML=`<div class="msg ok">🔤 Prečítané z fotky${brand?" · značka "+esc(brand):""}${model?" · model "+esc(model):""}${!brand&&!model?" — text sa podarilo prečítať, ale značku/model treba doplniť ručne":""}. EAN sa nenašiel (skús „📷 Skenovať" na čiarový kód).</div>${preview}`;
}
// voliteľné vloženie prečítaného textu do krátkeho popisu (nie do parametrov)
function ocrToDesc(t){const d=$("#p_desc");if(d){d.value=(d.value?d.value+" ":"")+t;}}
// rozpoznanie z fotky štítku cez AI (identify-product)
function pAiPhoto(){const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=()=>{const f=inp.files&&inp.files[0];if(!f)return;const r=new FileReader();r.onload=()=>pAiRun(r.result);r.readAsDataURL(f);};inp.click();}
async function pAiRun(dataUrl){
  const msg=$("#p_scanmsg");if(msg)msg.innerHTML=`<div class="muted">🔍 Rozpoznávam z fotky…</div>`;
  let data=null,error=null;
  try{const r=await sb.functions.invoke("identify-product",{body:{labelImage:dataUrl}});data=r.data;error=r.error;}catch(e){error=e;}
  if(error||(data&&data.error)){if(msg)msg.innerHTML=`<div class="msg err">AI rozpoznávanie nie je dostupné (treba nasadenú Edge Function identify-product + AI kľúč).</div>`;return;}
  if(data.source==="internal"&&data.product){if(msg)msg.innerHTML=`<div class="msg err">Produkt už existuje: „${esc(data.product.name)}". Otváram na úpravu…</div>`;setTimeout(()=>{if(!DATA.products.find(p=>p.id===data.product.id))DATA.products.push(data.product);prodForm(data.product.id);},900);return;}
  const ex=data.extracted||data.suggestion||{};
  const nm=$("#p_name");if(nm)nm.value=nm.value.trim()||ex.name||((ex.brand||"")+" "+(ex.model||"")).trim();
  const md=$("#p_model");if(md&&ex.model&&!md.value.trim())md.value=ex.model;
  const sk=$("#p_sku");if(sk&&ex.barcode&&!sk.value.trim())sk.value=ex.barcode;
  const lg=$("#p_long");if(lg&&ex.specs&&!lg.value.trim())lg.value=ex.specs;
  let created=false;if(ex.brand)created=await pSetBrandByName(ex.brand);
  pApplyClassify([ex.name,ex.brand,ex.model].filter(Boolean).join(" "));
  if(msg)msg.innerHTML=`<div class="msg ok">🔍 Rozpoznané z fotky: ${esc(ex.name||ex.model||"")}. Kategória a tagy doplnené.${created?`<br>⚠️ Vytvorený nový výrobca: <b>${esc(ex.brand)}</b>.`:""} Skontroluj.</div>`;
  // ak sa našiel EAN, skús doplniť fotku/cenu/parametre z internetu
  if(ex.barcode){setTimeout(()=>pDoLookup(ex.barcode),300);}
}
async function pNewBrand(selEl){const n=prompt("Názov novej značky:");if(!n||!n.trim()){selEl.value="";return;}
  const {data,error}=await sb.from("brands").insert({name:n.trim()}).select().single();
  if(error){alert(error.message);selEl.value="";return;}
  DATA.brands.push(data);DATA.brands.sort((a,b)=>a.name.localeCompare(b.name));
  selEl.innerHTML=`<option value="">— značka —</option>`+DATA.brands.map(b=>`<option value="${b.id}" ${b.id===data.id?"selected":""}>${esc(b.name)}</option>`).join("")+`<option value="__new">➕ nová značka…</option>`;
}
async function pSave(id){
  const bv=$("#p_brand").value;
  const o={name:$("#p_name").value.trim(),model:$("#p_model").value.trim()||null,brand_id:(bv&&bv!=="__new")?Number(bv):null,
    category_id:$("#p_cat").value?Number($("#p_cat").value):null,sku:$("#p_sku").value.trim()||null,
    price:$("#p_price").value===""?null:Number($("#p_price").value),currency:$("#p_cur").value,
    weight_g:$("#p_weight").value===""?null:Number($("#p_weight").value),image_url:($("#p_img").value||null),
    description:($("#p_desc").value.trim()||null),long_description:($("#p_long").value.trim()||null),type:"simple"};
  if(o.price!=null){o.price_source=priceSrc;o.price_updated_at=new Date().toISOString().slice(0,10);}else{o.price_source=null;o.price_updated_at=null;}
  if(!o.name){$("#p_msg").innerHTML=`<div class="msg err">Zadaj názov.</div>`;return;}
  if(!id){const dup=similarProduct(o.name,0);if(dup&&!confirm('Podobný produkt už existuje: „'+dup.name+'". Napriek tomu pridať nový?'))return;}
  $("#p_save").disabled=true;
  const selCols="id,name,model,sku,category_id,price,currency,weight_g,image_url,description,long_description,price_source,price_updated_at,brand_id,brands(name)";
  let res;
  if(id)res=await sb.from("products").update(o).eq("id",id).select(selCols).single();
  else {o.source="manual";res=await sb.from("products").insert(o).select(selCols).single();}
  if(res.error){$("#p_save").disabled=false;$("#p_msg").innerHTML=`<div class="msg err">${esc(res.error.message)}</div>`;return;}
  const pid=res.data.id;
  // synchronizuj tagy
  await sb.from("product_tags").delete().eq("product_id",pid);
  if(formTags.length)await sb.from("product_tags").insert(formTags.map(tid=>({product_id:pid,tag_id:tid})));
  DATA.ptags=DATA.ptags.filter(x=>x.product_id!==pid).concat(formTags.map(tid=>({product_id:pid,tag_id:tid})));
  // synchronizuj parametre (product_attributes)
  await sb.from("product_attributes").delete().eq("product_id",pid);
  const attrRows=Object.keys(formAttrs).filter(k=>formAttrs[k]!==""&&formAttrs[k]!=null).map(k=>{const num=Number(formAttrs[k]);return {product_id:pid,attr_def_id:Number(k),value:String(formAttrs[k]),value_num:isNaN(num)?null:num};});
  if(attrRows.length)await sb.from("product_attributes").insert(attrRows);
  DATA.pattrs=DATA.pattrs.filter(x=>x.product_id!==pid).concat(attrRows.map(r=>({product_id:r.product_id,attr_def_id:r.attr_def_id,value:r.value,value_num:r.value_num})));
  if(id){const i=DATA.products.findIndex(x=>x.id===id);if(i>=0)DATA.products[i]=res.data;}else DATA.products.push(res.data);
  DATA.products.sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  if(prodReturnToRecv){prodReturnToRecv=false;recvSel=pid;setTab("recv");$("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Produkt založený: ${esc(o.name)}. Dokonči príjem nižšie.</div>`);return;}
  setTab("prods");$("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Uložené: ${esc(o.name)}.</div>`);
}

// ===== DOKLADY =====
let docFilter="";
async function loadDocs(){
  $("#view").innerHTML=`<div class="card muted">Načítavam…</div>`;
  let qy=sb.from("stock_movements").select("id,type,quantity,serial,document,purpose,via,happened_at,product_id,products(name),warehouses(name)").order("happened_at",{ascending:false}).limit(300);
  if(docFilter==="in")qy=qy.eq("type","prijem");if(docFilter==="out")qy=qy.eq("type","vydaj");
  const {data,error}=await qy;
  const tabBtn=(v,l)=>`<button class="btn sm ${docFilter===v?"":"ghost"}" onclick="docFilter='${v}';loadDocs()" style="margin-right:6px">${l}</button>`;
  if(error){$("#view").innerHTML=`<div class="card"><div class="msg err">${esc(error.message)}</div></div>`;return;}
  const rows=(data||[]).map(m=>{const nm=(m.products&&m.products.name)||"?";const tg=m.type==="prijem"?`<span class="tag g">príjem</span>`:m.type==="vydaj"?`<span class="tag r">výdaj</span>`:`<span class="tag b">${esc(m.type)}</span>`;
    return `<div class="lot"><div>${tg} <b>${esc(nm)}</b> · ${m.type==="vydaj"?"−":"+"}${m.quantity} ks</div><div class="m">${esc((m.happened_at||"").replace("T"," ").slice(0,16))} · ${esc((m.warehouses&&m.warehouses.name)||"")}${m.serial?" · SN: "+esc(m.serial):""}${m.document?" · "+esc(m.document):""}${m.purpose?" · "+esc(m.purpose):""}${m.via?" · "+esc(m.via):""}</div></div>`;}).join("")||`<div class="muted">Žiadne pohyby.</div>`;
  $("#view").innerHTML=`<div class="card"><div style="margin-bottom:10px">${tabBtn("","Všetko")}${tabBtn("in","Príjemky")}${tabBtn("out","Výdajky")}</div>${rows}</div>`;
}

// ===== ZÁSIELKY =====
let shipMode="list", shipFilterDir="", shipQ="", shipItems=[], shipPay="", shipTrackOnly=false, shipUnrecv=false;
function savedShipFilters(){try{return JSON.parse(localStorage.getItem("shsaved_"+ME.id)||"[]");}catch(e){return [];}}
function shipfSaveNew(){const n=prompt("Názov filtra:");if(!n||!n.trim())return;const a=savedShipFilters();a.push({name:n.trim(),f:{dir:shipFilterDir,q:shipQ,pay:shipPay,track:shipTrackOnly,unrecv:shipUnrecv}});localStorage.setItem("shsaved_"+ME.id,JSON.stringify(a));shipList();}
function shipfLoad(name){if(!name)return;const x=savedShipFilters().find(z=>z.name===name);if(x){const f=x.f||{};shipFilterDir=f.dir||"";shipQ=f.q||"";shipPay=f.pay||"";shipTrackOnly=!!f.track;shipUnrecv=!!f.unrecv;shipList();}}
function shipfReset(){shipFilterDir="";shipQ="";shipPay="";shipTrackOnly=false;shipUnrecv=false;shipList();}
function shipfManage(){const a=savedShipFilters();if(!a.length){alert("Žiadne uložené filtre.");return;}const n=prompt("Napíš názov filtra na zmazanie:\n\n"+a.map(x=>"• "+x.name).join("\n"));if(!n)return;localStorage.setItem("shsaved_"+ME.id,JSON.stringify(a.filter(x=>x.name!==n.trim())));shipList();}
const DIRS={inbound:["Prichádzajúca","g"],outbound:["Odchádzajúca","b"],dropship:["Dropship","o"]};
const DIRBAR={inbound:"#3b6fd4",outbound:"#e08a1e",dropship:"#7a4fc0"};
function dirBadge(dir){const m={inbound:["↙ k nám","#e6eefb","#2a4fa0"],outbound:["↗ od nás","#fdf0df","#a8630c"],dropship:["→ dropship","#f3eefb","#5e37a6"]}[dir]||["?","#eef1f6","#5b6472"];return `<span class="tag" style="background:${m[1]};color:${m[2]}">${m[0]}</span>`;}
function shipClosed(s){return /doru[čc]|deliver|vr[áa]t|return|uzav/i.test(s.status||"")||!!s.delivered_on;}
function shipDelivered(s){return /doru[čc]|deliver/i.test(s.status||"")||!!s.delivered_on;}
// zaradenie zásielky do sekcie podľa stavu (0 zadané → 3 uzavreté)
const SHIP_STAGES=[{r:0,label:"📝 Zadané / štítok vytvorený",cls:""},{r:1,label:"🚚 Na ceste",cls:"o"},{r:2,label:"📬 Doručené",cls:"g"},{r:3,label:"✅ Uzavreté / vrátené",cls:"g"}];
function shipStageRank(s){const st=(s.status||"").toLowerCase();
  if(/uzav|vr[áa]t|return/.test(st))return 3;
  if(shipDelivered(s))return 2;
  if(st&&!/label|order processed|billing information received|shipper created|created|manifest/.test(st))return 1;
  return 0;}
// je adresa/meno naša firma? (na určenie smeru)
function isUsAddr(t){return /kentino|opletalova|rostovsk|pod[ěe]brady|[čc]estm[íi]rova/i.test(t||"");}
// smer zásielky sa NEVYBERÁ ručne — určí sa z adries: od nás / k nám / priamo k zákazníkovi
function deriveDir(from,to,sender){const f=isUsAddr(from||sender),t=isUsAddr(to);
  if(f&&!t)return "outbound";        // od nás → zákazník
  if(t&&!f)return "inbound";         // k nám
  if(f&&t)return "inbound";          // interný presun → ber ako k nám
  if(from||to||sender)return "dropship"; // ani jeden nie sme my → priamo k zákazníkovi
  return "";}
// spôsob platby zásielky
const SHIP_PAYM={predom:"Predom (vopred)",predom_dobierka:"Predom + dobierka",dobierka:"Dobierka",reklamacia:"Reklamácia",ine:"Iné"};
const SHIP_ORDER_SRC=["Interný systém","Bazoš","eBay","Aukro","Facebook Marketplace","E-mail / telefón","Iné"];
function simplifyPlace(s){const x=(s||"").toLowerCase();
  if(/praha|prague|rostov|opletal|[čc]esk|czech|\bcz\b/.test(x))return "Praha";
  if(/[čc][íi]n|china|shenzhen|hong ?kong|\bhk\b|\bcn\b/.test(x))return "Čína";
  if(/usa|united states|new york|america|\bus\b/.test(x))return "USA";
  return ((s||"").split(",")[0]||"").slice(0,22)||"—";}
function flagFor(s){const x=(s||"").toLowerCase();
  if(/praha|prague|[čc]esk|czech|\bcz\b|rostov|opletal/.test(x))return "🇨🇿";
  if(/[čc][íi]n|china|shenzhen|hong ?kong|\bhk\b|\bcn\b/.test(x))return "🇨🇳";
  if(/usa|united states|new york|america|\bus\b/.test(x))return "🇺🇸";
  if(/nemeck|german|\bde\b|herne|leipzig/.test(x))return "🇩🇪";
  if(/portug|\bpt\b|vila|lisbon|porto/.test(x))return "🇵🇹";
  if(/slovensk|\bsk\b|bratislav|ko[šs]ic/.test(x))return "🇸🇰";
  if(/rak[úu]s|austria|\bat\b|wien|viede[ňn]/.test(x))return "🇦🇹";
  return "🏳️";}
function shipProblem(s){return /[čc]ak[áa]|reklam|n[áa]hr|probl[ée]m|zdr[žz]|colné konanie|colne konanie|vr[áa]t|return|strat|lost|delay|omešk|mešk/i.test(s.status||"");}
function shipRowBg(s){if(shipProblem(s))return "#fdeeee";return {inbound:"#eef4ff",outbound:"#fff6ec",dropship:"#f6f0fb"}[s.direction]||"#fff";}
function shipContents(s,items){
  if(s.contents)return esc(s.contents);
  if(!items||!items.length)return "";
  if(items.length===1)return esc((items[0].products&&items[0].products.name)||"?");
  let best=null,bestv=-1;items.forEach(i=>{const p=prodOf(i.product_id);const v=(+p.price||0);if(v>bestv){bestv=v;best=p;}});
  const cat=best?catPathText(best.category_id):"";
  return `${items.length} položiek${cat?" · najdr. "+esc(cat):""}`;}
function shipStatusCell(s){const low=(s.status||"").toLowerCase();let cls="b";if(/doru[čc]|deliver/.test(low))cls="g";else if(/vr[áa]t|return/.test(low))cls="r";else if(/col/.test(low))cls="";
  const closed=shipClosed(s);
  return `<span class="tag ${cls}">${esc(s.status||"—")}</span><div style="margin-top:3px"><span class="tag ${closed?"g":"o"}">${closed?"uzavreté":"sledovať"}</span></div>`;}
function renderShip(){shipMode="list";shipList();}
async function shipList(){
  $("#view").innerHTML=`<div class="card muted">Načítavam…</div>`;
  const {data,error}=await sb.from("shipments").select("id,tracking_number,carrier,direction,status,sender,from_address,to_address,our_order,contents,expected_date,delivered_on,created_at,label_date,is_paid,customs,incoterm,jds_number,invoice_number,customer_payment,paid_where,pay_amount,pay_currency,ship_cost,ship_cost_cur").order("id",{ascending:false}).limit(500);
  if(error){$("#view").innerHTML=`<div class="card"><div class="msg err">${esc(error.message)}</div></div>`;return;}
  let list=data||[];
  const {data:its}=await sb.from("shipment_items").select("shipment_id,quantity,product_id,products(name)");
  const byShip={};(its||[]).forEach(it=>{(byShip[it.shipment_id]=byShip[it.shipment_id]||[]).push(it);});
  const {data:onwaylots}=await sb.from("stock_lots").select("shipment_id").eq("status","na_ceste");
  const recvShip=new Set();(onwaylots||[]).forEach(l=>{if(l.shipment_id)recvShip.add(l.shipment_id);});
  if(shipFilterDir)list=list.filter(s=>s.direction===shipFilterDir);
  if(shipPay==="paid")list=list.filter(s=>s.is_paid);
  if(shipPay==="unpaid")list=list.filter(s=>!s.is_paid);
  if(shipTrackOnly)list=list.filter(s=>!shipClosed(s));
  if(shipUnrecv)list=list.filter(s=>s.direction==="inbound"&&!shipClosed(s));
  if(shipQ){const q=shipQ.toLowerCase();list=list.filter(s=>((s.tracking_number||"")+" "+(s.carrier||"")+" "+(s.sender||"")+" "+(s.to_address||"")+" "+(s.from_address||"")+" "+(s.contents||"")+" "+(s.jds_number||"")).toLowerCase().includes(q));}
  const dbtn=(v,l)=>`<option value="${v}" ${shipFilterDir===v?"selected":""}>${l}</option>`;
  const rowHtml=(s)=>{const bar=DIRBAR[s.direction]||"#cfd6e2";
    const items=byShip[s.id]||[];const contents=shipContents(s,items);
    const fromPlace=simplifyPlace(s.from_address||s.sender);const toPlace=simplifyPlace(s.to_address);
    const fromFlag=flagFor(s.from_address||s.sender);const toFlag=flagFor(s.to_address);
    // mená: od koho -> komu
    const fromName=s.sender||fromPlace;
    const toName=((s.to_address||"").split(",")[0])||(s.direction==="inbound"?"Kentino s.r.o.":toPlace);
    const pay=s.is_paid?`<span class="tag g">zaplatené</span>`:`<span class="tag r">nezaplatené</span>`;
    const paySub=[s.invoice_number,s.customer_payment,s.paid_where].filter(Boolean).join(" · ");
    const cost=s.ship_cost?`${fmtNum(s.ship_cost)} ${esc(s.ship_cost_cur||"")}`:"—";
    const eta=shipDelivered(s)?("doručené"+(s.delivered_on?" "+String(s.delivered_on).slice(0,10):(s.expected_date?" "+String(s.expected_date).slice(0,10):""))):(s.expected_date?"ETA "+String(s.expected_date).slice(0,10):"");
    const canRecv=canWrite()&&s.direction==="inbound"&&!shipClosed(s);
    return `<tr onclick="shipDetail(${s.id})" style="cursor:pointer;background:${shipRowBg(s)}">
      <td style="border-left:4px solid ${bar}"><b>${esc(s.tracking_number)}</b>${copyBtn(s.tracking_number)}<div class="psub">${esc(s.carrier||"")} · ${dirBadge(s.direction)} ${s.customs?`<span class="tag r">colné</span>`:""} ${s.incoterm?`<span class="tag">${esc(s.incoterm)}</span>`:""}</div>${s.our_order?`<div class="psub">Obj.: ${esc(s.our_order)}</div>`:""}${s.label_date?`<div class="psub">vytvorené: ${esc(String(s.label_date).slice(0,10))}</div>`:(s.created_at?`<div class="psub">pridané: ${esc(String(s.created_at).slice(0,10))}</div>`:"")}</td>
      <td><b>${fromFlag} ${esc(fromName)} → ${toFlag} ${esc(toName)}</b>${(s.from_address||s.to_address)?`<div class="psub">${esc(s.from_address||fromPlace)} → ${esc(s.to_address||toPlace)}</div>`:""}${contents?`<div class="psub">📦 ${contents}</div>`:""}</td>
      <td>${shipStatusCell(s)}${eta?`<div class="psub">${esc(eta)}</div>`:""}</td>
      <td>${pay}${paySub?`<div class="psub">${paySub}</div>`:""}<div class="psub">doprava: ${cost}</div></td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">${(canWrite()&&!shipClosed(s))?`<button class="btn ghost sm" title="Overiť stav u prepravcu" onclick="shipUpsTrack(${s.id})">🔄</button> `:""}${canRecv?`<button class="btn green sm" onclick="shipReceive(${s.id})">✓ Prijať</button> `:""}<button class="btn ghost sm" onclick="shipDetail(${s.id})">Upraviť</button></td></tr>`;};
  // zoskupenie do sekcií podľa stavu (zadané → na ceste → doručené → uzavreté)
  const thead=`<colgroup><col style="width:21%"><col style="width:33%"><col style="width:16%"><col style="width:22%"><col style="width:8%"></colgroup><thead><tr><th>Tracking</th><th>Trasa (od → komu)</th><th>Stav / riešenie</th><th>Platba / doprava</th><th></th></tr></thead>`;
  let table;
  if(!list.length)table=`<div class="muted">Žiadne zásielky.</div>`;
  else{table="";SHIP_STAGES.forEach(st=>{const grp=list.filter(s=>shipStageRank(s)===st.r);if(!grp.length)return;
    table+=`<div class="card"><h3 style="margin:0 0 8px"><span class="tag ${st.cls}">${esc(st.label)}</span> <span class="muted" style="font-weight:400">${grp.length}</span></h3>
      <div class="ptbl-wrap"><table class="ptbl shipfix">${thead}<tbody>${grp.map(rowHtml).join("")}</tbody></table></div></div>`;});}
  $("#view").innerHTML=`
  <div class="card"><div class="inline" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
    ${canWrite()?`<button class="btn sm" onclick="shipQuickTrack()">⚡ Rýchle: tracking</button><button class="btn green sm" onclick="shipForm()">+ Nová zásielka</button>`:""}
    <button class="btn ghost sm" onclick="shipCarriers()">🚚 Prepravcovia</button>
    <button class="btn ghost sm" onclick="shipExport()">⬇ Export (Excel/CSV)</button></div></div>
  <div class="card">
    <div class="toolbar"><input placeholder="Hľadať tracking / prepravca / adresu…" value="${esc(shipQ)}" oninput="shipQ=this.value;shipList()">
      <select onchange="shipFilterDir=this.value;shipList()">${dbtn("","Všetky smery")}${dbtn("inbound","Prichádzajúce (k nám)")}${dbtn("outbound","Odchádzajúce (od nás)")}${dbtn("dropship","Dropship")}</select>
      <select onchange="shipPay=this.value;shipList()"><option value="" ${shipPay===""?"selected":""}>Platba (všetko)</option><option value="paid" ${shipPay==="paid"?"selected":""}>zaplatené</option><option value="unpaid" ${shipPay==="unpaid"?"selected":""}>nezaplatené</option></select>
      <label class="chk" style="display:flex;align-items:center;gap:6px"><input type="checkbox" ${shipTrackOnly?"checked":""} onchange="shipTrackOnly=this.checked;shipList()"> Len na sledovanie</label>
      <label class="chk" style="display:flex;align-items:center;gap:6px"><input type="checkbox" ${shipUnrecv?"checked":""} onchange="shipUnrecv=this.checked;shipList()"> Neprijaté</label></div>
    <div class="inline" style="gap:6px;flex-wrap:wrap;margin-bottom:8px;align-items:center">
      <button class="btn ghost sm" onclick="shipfReset()">✕ Filtre</button>
      <select style="width:auto" onchange="shipfLoad(this.value)"><option value="">Uložené filtre…</option>${savedShipFilters().map(f=>`<option value="${esc(f.name)}">${esc(f.name)}</option>`).join("")}</select>
      <button class="btn ghost sm" onclick="shipfSaveNew()">💾 Uložiť filter</button>
      <button class="btn ghost sm" onclick="shipfManage()">🗑</button></div>
    <div class="muted">${list.length} zásielok · zoradené po sekciách podľa stavu</div></div>
  ${table}`;
}
// okno prepravcov — posledná automatická synchronizácia stavov cez API
const CARRIERS=[{code:"UPS",fn:"ups-refresh-all",live:true},{code:"FedEx",live:true},{code:"GLS",live:true},{code:"DHL Express",live:true},{code:"DHL Freight",live:false},{code:"Packeta",live:false}];
async function shipCarriers(){
  const {data:cs}=await sb.from("carrier_sync").select("carrier,last_run,checked,updated,note");
  const byC={};(cs||[]).forEach(x=>byC[x.carrier]=x);
  const rows=CARRIERS.map(c=>{const r=byC[c.code]||{};
    return `<tr><td><b>${esc(c.code)}</b></td>
      <td>${c.live?`<span class="tag g">napojené (API)</span>`:`<span class="tag">nenapojené</span>`}</td>
      <td>${r.last_run?esc(String(r.last_run).replace("T"," ").slice(0,16)):"—"}</td>
      <td>${r.last_run?`kontrolovaných: ${r.checked||0}, zmenených: ${r.updated||0}${r.note&&r.note!=="OK"?" · "+esc(r.note):""}`:"zatiaľ nebežalo"}</td>
      <td>${c.live&&canWrite()?`<button class="btn sm" onclick="shipRefreshAll('${c.fn}')">Skontrolovať teraz</button>`:""}</td></tr>`;}).join("");
  openModal(`<div style="display:flex;justify-content:space-between;align-items:center"><h2>Prepravcovia — synchronizácia</h2><button class="btn ghost sm" onclick="closeModal()">✕</button></div>
    <div class="muted">Aplikácia automaticky overuje stavy nedokončených zásielok cez API prepravcu (nastavené na 2× denne). Nižšie je čas poslednej kontroly.</div>
    <div class="ptbl-wrap" style="margin-top:10px"><table class="ptbl"><thead><tr><th>Prepravca</th><th>Stav</th><th>Posledná kontrola</th><th>Výsledok</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div style="text-align:right;margin-top:14px"><button class="btn" style="width:auto" onclick="closeModal()">Zavrieť</button></div>`);
}
async function shipRefreshAll(fn){
  const card=$("#modalCard");if(card)card.insertAdjacentHTML("afterbegin",`<div class="msg">🔄 Kontrolujem zásielky…</div>`);
  let data=null,error=null;
  try{const r=await sb.functions.invoke(fn,{body:{}});data=r.data;error=r.error;}catch(e){error=e;}
  if(error||(data&&data.error)){alert("Kontrola zlyhala: "+((data&&data.error)||(error&&error.message)||"funkcia nie je nasadená"));}
  else{alert("Hotovo. Kontrolovaných: "+(data.checked||0)+", zmenených: "+(data.updated||0)+".");}
  shipCarriers();
}
// rýchle pridanie podľa tracking čísla (odosielame z Prahy cez UPS)
function shipQuickTrack(){const t=prompt("Sledovacie číslo (napr. UPS):");if(!t||!t.trim())return;shipForm();setTimeout(()=>{if($("#s_trk"))$("#s_trk").value=t.trim();if($("#s_carr"))$("#s_carr").value="UPS";if($("#s_dir"))$("#s_dir").value="outbound";if($("#s_send"))$("#s_send").value="Sklad Rostovská 260/2b, Praha";},40);}
// prijatie zásielky na sklad -> vytvorí skladové položky z obsahu
async function shipReceive(id){
  if(!confirm("Prijať zásielku na sklad a vytvoriť skladové položky z obsahu?"))return;
  const {data:its}=await sb.from("shipment_items").select("product_id,quantity,serial").eq("shipment_id",id);
  if(!its||!its.length){alert("Zásielka nemá položky (obsah). Doplň produkty v úprave zásielky.");return;}
  const wh=DATA.warehouses[0]?DATA.warehouses[0].id:null;
  for(const it of its){if(!it.product_id)continue;
    const unit=!!it.serial;const qty=unit?1:(it.quantity||1);
    const {data:lot}=await sb.from("stock_lots").insert({product_id:it.product_id,warehouse_id:wh,track:unit?"unit":"bulk",quantity:qty,serial:it.serial||null,status:"skladom",state:"new",shipment_id:id}).select("id").single();
    if(lot)await sb.from("stock_movements").insert({type:"prijem",product_id:it.product_id,lot_id:lot.id,quantity:qty,serial:it.serial||null,warehouse_id:wh,via:"zasielkou"});
  }
  await sb.from("shipments").update({status:"Doručené",received_on:new Date().toISOString().slice(0,10)}).eq("id",id);
  shipList();
  $("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Zásielka prijatá na sklad (dátum prijatia: dnes).</div>`);
}
function shipExport(){
  (async()=>{
    const {data}=await sb.from("shipments").select("tracking_number,carrier,direction,status,sender,to_address,our_order,expected_date,customs,incoterm,jds_number,is_paid,invoice_number,pay_amount,pay_currency,ship_cost,ship_cost_cur").order("id",{ascending:false}).limit(1000);
    const head=["Tracking","Prepravca","Smer","Stav","Odosielateľ","Doručiť","Naše obj.","ETA","Colné","Incoterm","JDS","Zaplatené","Faktúra","Suma","Mena","Preprava","Mena prepravy"];
    const cell=v=>{v=v==null?"":String(v);return /[";\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;};
    const rows=(data||[]).map(s=>[s.tracking_number,s.carrier,(DIRS[s.direction]||["",""])[0],s.status,s.sender,s.to_address,s.our_order,s.expected_date,s.customs?"áno":"",s.incoterm,s.jds_number,s.is_paid?"áno":"nie",s.invoice_number,s.pay_amount,s.pay_currency,s.ship_cost,s.ship_cost_cur].map(cell).join(";"));
    const csv="﻿"+head.join(";")+"\n"+rows.join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download="zasielky_"+new Date().toISOString().slice(0,10)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  })();
}
function shipForm(){
  shipItems=[];
  const prodOpts=`<option value="">— produkt —</option>`+DATA.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const cur=c=>["CZK","EUR","USD","BTC"].map(x=>`<option ${c===x?"selected":""}>${x}</option>`).join("");
  $("#view").innerHTML=`<div class="card"><h2>Nová zásielka</h2>
    <label>Sledovacie číslo (tracking)</label><div class="inline" style="flex-wrap:wrap;gap:6px"><input id="s_trk" placeholder="napr. 1Z… / DR…C / CN…" oninput="shipAutoCarrier()"><button class="btn ghost sm" onclick="openScan(t=>$('#s_trk').value=t,{qr:true})">📷</button><button class="btn sm" type="button" onclick="shipFormTrack()">🔍 Zistiť údaje</button><button class="btn ghost sm" type="button" onclick="shipLabelAddPhoto()">📷 Odfotiť štítok (AI)</button></div>
    <div id="s_labeltray" style="margin-top:6px"></div>
    <div id="s_trkmsg" style="margin-top:6px"></div>
    <label>Prepravca</label><input id="s_carr" list="carrierList" placeholder="UPS / FedEx / DHL Express / GLS / Packeta / Česká pošta…"><datalist id="carrierList"><option>UPS</option><option>FedEx</option><option>DHL Express</option><option>DHL Freight</option><option>GLS</option><option>PPL</option><option>Packeta</option><option>Česká pošta</option><option>Balíkovna</option></datalist>
    <div class="muted" style="font-size:12px;margin-top:4px">Smer zásielky (od nás / k nám / dropship) sa určí automaticky z adries.</div>
    <div class="row2"><div><label>Dodávateľ / odosielateľ (kto)</label><input id="s_send"></div>
    <div><label>Odkiaľ (adresa)</label><input id="s_from" placeholder="mesto / krajina / adresa"></div></div>
    <label>Doručiť kam (adresa)</label><input id="s_to" placeholder="adresa / mesto / krajina">
    <div class="row2"><div><label>Očakávané doručenie (ETA)</label><input id="s_eta" type="date"></div>
    <div><label>Stav</label><input id="s_status" placeholder="napr. na ceste"></div></div>
    <label>Obsah (poznámka)</label><input id="s_cont" placeholder="stručný popis obsahu">
    <h4 style="margin-top:14px">Položky zásielky (produkt + ks)</h4>
    <div class="row2"><div><label>Produkt</label><select id="s_pitem">${prodOpts}</select></div>
    <div><label>Množstvo</label><input id="s_pqty" type="number" min="1" value="1"></div></div>
    <button class="btn ghost" type="button" onclick="shipAddItem()">+ Pridať položku</button>
    <div id="s_items" class="muted" style="margin-top:6px"></div>
    <h4 style="margin-top:14px">Objednávka</h4>
    <div class="row2"><div><label>Číslo objednávky</label><input id="s_order" placeholder="napr. OBJ-2026-006"></div>
    <div><label>Zdroj objednávky</label><input id="s_ordsrc" list="ordSrcList" placeholder="Interný systém / Bazoš / eBay…"><datalist id="ordSrcList">${SHIP_ORDER_SRC.map(x=>`<option>${esc(x)}</option>`).join("")}</datalist></div></div>
    <h4 style="margin-top:14px">Dodacie podmienky a preprava</h4>
    <div class="row2"><div><label>Incoterm (dodacia podmienka)</label><select id="s_inco"><option value="">—</option>${["EXW","FCA","CPT","CIP","DAP","DPU","DDP","FOB","CIF"].map(x=>`<option>${x}</option>`).join("")}</select></div>
    <div><label>AWB / prepravný list</label><input id="s_awb"></div></div>
    <div class="row2"><div><label>Cena prepravy (platíme my)</label><input id="s_shipcost" type="number" step="any"></div>
    <div><label>Mena prepravy</label><select id="s_shipcur">${cur("CZK")}</select></div></div>
    <div class="row2"><div><label>Poistná suma</label><input id="s_ins" type="number" step="any"></div>
    <div><label>Mena poistenia</label><select id="s_inscur">${cur("CZK")}</select></div></div>
    <h4 style="margin-top:14px">Colné konanie</h4>
    <label class="chk" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="s_customs"> Podlieha colnému konaniu (JDS)</label>
    <div class="row2"><div><label>JDS číslo</label><input id="s_jds" placeholder="napr. 26CZ6000…"></div>
    <div><label>Colná hodnota tovaru</label><input id="s_cval" type="number" step="any"></div></div>
    <div class="row2"><div><label>Clo</label><input id="s_duty" type="number" step="any"></div>
    <div><label>DPH</label><input id="s_vat" type="number" step="any"></div></div>
    <label>Clo a DPH platí</label><select id="s_dpayer"><option value="">—</option><option value="my">My (odosielateľ, napr. DDP)</option><option value="prijemca">Príjemca (napr. DAP)</option><option value="tretia">Tretia strana</option></select>
    <h4 style="margin-top:14px">Platba</h4>
    <div class="row2"><div><label>Spôsob platby</label><select id="s_paymethod"><option value="">—</option>${Object.entries(SHIP_PAYM).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join("")}</select></div>
    <div><label>Faktúra / doklad (popis)</label><input id="s_inv" placeholder="napr. F2026-03-006"></div></div>
    <div class="row2"><div><label>Suma</label><input id="s_amt" type="number" step="any"></div>
    <div><label>Mena</label><select id="s_cur">${cur("CZK")}</select></div></div>
    <label class="chk"><input type="checkbox" id="s_paid"><span>Zaplatené</span></label>
    <button class="btn green" id="s_save" onclick="shipSave()">✓ Uložiť zásielku</button>
    <button class="btn ghost" onclick="shipList()">Späť</button>
    <div id="s_msg"></div></div>`;
  shipRenderItems();
}
// pri zadávaní zásielky — zisti údaje priamo z tracking čísla (auto prepravca)
// zásobník fotiek štítkov — viac fotiek (detail produktu + detail prepravcu) = lepšia čitateľnosť
let shipLabelPhotos=[];
function renderLabelTray(){const el=$("#s_labeltray");if(!el)return;
  if(!shipLabelPhotos.length){el.innerHTML="";return;}
  const thumbs=shipLabelPhotos.map((u,i)=>`<span style="position:relative;display:inline-block;margin:2px"><img src="${u}" style="width:52px;height:52px;object-fit:cover;border-radius:6px;border:1px solid var(--line)"><button type="button" onclick="shipLabelPhotos.splice(${i},1);renderLabelTray()" style="position:absolute;top:-6px;right:-6px;border:0;background:#e35;color:#fff;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:11px">×</button></span>`).join("");
  el.innerHTML=`<div class="inline" style="flex-wrap:wrap;gap:6px;align-items:center">${thumbs}<button class="btn green sm" type="button" onclick="shipLabelRecognize()">🏷️ Rozpoznať (${shipLabelPhotos.length})</button><button class="btn ghost sm" type="button" onclick="shipLabelAddPhoto()">➕ Ďalšia fotka</button></div>`;}
function shipLabelAddPhoto(){
  const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;
    const box=$("#s_trkmsg");if(box)box.innerHTML=`<div class="msg">📷 Spracúvam fotku…</div>`;
    try{const blob=await compressImage(f,1500*1024,2560);
      const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(blob);});
      shipLabelPhotos.push(dataUrl);renderLabelTray();
      if(box)box.innerHTML=`<div class="msg">📷 ${shipLabelPhotos.length} fotka(y) v zásobníku — pridaj ďalšiu (napr. detail SN a detail prepravnej nálepky) alebo klikni „Rozpoznať".</div>`;
    }catch(e){if(box)box.innerHTML=`<div class="msg err">Fotka zlyhala: ${esc((e&&e.message)||String(e))}</div>`;}
  };inp.click();
}
async function shipLabelRecognize(){
  if(!shipLabelPhotos.length){shipLabelAddPhoto();return;}
  const box=$("#s_trkmsg");if(box)box.innerHTML=`<div class="msg">🏷️ Rozpoznávam kódy (${shipLabelPhotos.length}×)…</div>`;
  try{
      const {data,error}=await sb.functions.invoke("identify-labels",{body:{images:shipLabelPhotos}});
      logAiUsage("identify-labels",data);
      if(error||(data&&data.error)||!data||!data.found){
        const det=(data&&data.error)||(error&&(error.message||error.name))||"funkcia možno nie je nasadená";
        if(box)box.innerHTML=`<div class="msg err">Rozpoznávanie zlyhalo: ${esc(String(det))}<br><span class="muted">Skontroluj: funkcia <b>identify-labels</b> je nasadená a je nastavený <b>ANTHROPIC_API_KEY</b>.</span></div>`;return;}
      shipLastLabels=data;
      const set=(id,v)=>{const el=$("#"+id);if(el&&v&&!el.value)el.value=v;};
      set("s_trk",data.tracking_number);set("s_carr",data.carrier);set("s_inv",data.invoice_number);set("s_order",data.order_number);
      // párovanie produktu: podľa EAN, inak podľa názvu/modelu; inak ponúkni vytvorenie z rozpoznaných údajov
      const norm=s=>String(s||"").replace(/\s/g,"").toLowerCase();
      const pm=(data.product&&(data.product.model||data.product.name))||"";
      let prod=null;
      if(data.ean)prod=DATA.products.find(p=>norm(p.sku)&&norm(p.sku)===norm(data.ean));
      if(!prod&&pm){const q=pm.toLowerCase();prod=DATA.products.find(p=>{const n=(p.name||"").toLowerCase(),m=(p.model||"").toLowerCase();return (n&&(n.includes(q)||q.includes(n)))||(m&&(m.includes(q)||q.includes(m)));});}
      let itemMsg="";
      if(prod){shipItems.push({product_id:prod.id,name:prod.name,quantity:1,serial:data.serial||null});shipRenderItems();
        itemMsg=`✓ Produkt „${esc(prod.name)}" pridaný do zásielky${data.serial?" · SN "+esc(data.serial):""}.`;}
      else if(pm||data.ean){itemMsg=`Produkt ${pm?"„"+esc(pm)+"“":"(EAN "+esc(data.ean)+")"} nie je v katalógu — <button class="btn green sm" type="button" onclick="shipCreateProductFromLabel()">➕ Vytvoriť a pridať (aj s parametrami)</button>`;}
      else if(data.serial){shipPendingSerial=data.serial;itemMsg=`SN produktu: <b>${esc(data.serial)}</b> — vyber produkt nižšie, sériové číslo sa pridá automaticky.`;}
      const specN=data.specs?Object.keys(data.specs).length:0;
      const extra=[data.invoice_number?"faktúra: "+esc(data.invoice_number):"",data.order_number?"obj.: "+esc(data.order_number):"",specN?("parametre: "+specN):"",(data.references&&data.references.length)?"ďalšie: "+esc(data.references.join(", ")):""].filter(Boolean).join(" · ");
      if(box)box.innerHTML=`<div class="msg ok">✓ Rozpoznané${data.tracking_number?" · tracking <b>"+esc(data.tracking_number)+"</b>":""}${data.carrier?" ("+esc(data.carrier)+")":""}${extra?"<br>"+extra:""}${itemMsg?"<br>"+itemMsg:""}${data.notes?`<br><span class="muted">${esc(data.notes)}</span>`:""}</div>`;
      shipLabelPhotos=[];renderLabelTray();
    }catch(e){if(box)box.innerHTML=`<div class="msg err">Chyba: ${esc((e&&e.message)||String(e))}</div>`;}
}
// pri písaní tracking čísla sám rozpozná a predvyplní prepravcu (kým ho user nevyplní ručne)
function shipAutoCarrier(){const c=$("#s_carr");if(c&&!c.value.trim()){const n=detectCarrierName("",$("#s_trk").value);if(n)c.value=n;}}
async function shipFormTrack(){
  const trk=$("#s_trk").value.trim();if(!trk){alert("Zadaj tracking číslo.");return;}
  const cf=carrierFn($("#s_carr").value,trk);
  const box=$("#s_trkmsg");if(box)box.innerHTML=`<div class="msg">🔍 Zisťujem stav u ${esc(cf.name)}…</div>`;
  let data=null,error=null;
  try{const r=await sb.functions.invoke(cf.fn,{body:{tracking:trk}});data=r.data;error=r.error;}catch(e){error=e;}
  if(error||(data&&data.error)||!data||!data.found){
    let detail=(data&&data.error)?data.error:(error&&(error.message||error.name))||"funkcia neodpovedala (možno nie je nasadená)";
    try{if(error&&error.context&&typeof error.context.json==="function"){const j=await error.context.json();if(j&&j.error)detail=j.error;}}catch(e){}
    if(box)box.innerHTML=`<div class="msg err">${esc(cf.name)} sledovanie zlyhalo.<br>Detail: ${esc(String(detail))}<br><span class="muted">Prepravca: ${esc(cf.name)} · funkcia <b>${esc(cf.fn)}</b> · secrets <b>${esc(carrierSecrets(cf.name))}</b>. Ak je prepravca iný, oprav pole „Prepravca".</span></div>`;return;}
  if(!$("#s_carr").value)$("#s_carr").value=cf.name;
  const set=(id,v)=>{const el=$("#"+id);if(el&&v&&!el.value)el.value=v;};
  const pd=data.pod||{};
  set("s_status",data.status);
  if(data.eta)set("s_eta",String(data.eta).slice(0,10));
  set("s_send",pd.shipFromName);
  set("s_from",[pd.shipFromName,pd.shipFromAddr].filter(Boolean).join(", ")||data.from);
  set("s_to",[pd.deliveredToName,pd.deliveredToAddr].filter(Boolean).join(", ")||data.to);
  // dobierka → spôsob platby + suma
  if(data.cod){const m=String(data.cod).match(/([\d.,]+)\s*([A-Za-z]{3})?/);
    set("s_paymethod","dobierka");
    if(m){set("s_amt",m[1].replace(",",".").replace(/\.(?=\d{3}\b)/g,""));if(m[2])set("s_cur",m[2].toUpperCase());}}
  const bits=[data.status,data.delivered?("doručené"+(data.deliveredAt?" "+String(data.deliveredAt).slice(0,10):"")):"",data.cod?("dobierka "+data.cod):"",data.weight?("váha "+data.weight):"",data.eta?("ETA "+String(data.eta).slice(0,10)):"",(data.activity&&data.activity.length)?(data.activity.length+" udalostí"):""].filter(Boolean).join(" · ");
  if(box)box.innerHTML=`<div class="msg ok">✓ ${esc(cf.name)}: ${esc(bits)}.<br><span class="muted">Predvyplnené. Celú históriu uvidíš po uložení cez „🔄 Zistiť stav" v detaile zásielky.</span></div>`;
}
let shipPendingSerial=null; // SN rozpoznané AI, ktoré sa pripne k ručne vybranej položke
let shipLastLabels=null;    // posledný výsledok identify-labels (pre vytvorenie produktu)
async function findOrCreateBrand(name){name=(name||"").trim();if(!name)return null;
  const ex=DATA.brands.find(x=>(x.name||"").toLowerCase()===name.toLowerCase());if(ex)return ex.id;
  const {data,error}=await sb.from("brands").insert({name}).select("id,name").single();
  if(error||!data)return null;DATA.brands.push(data);return data.id;}
// vytvorí produkt z rozpoznaných údajov (názov/model/značka + parametre do popisu) a pridá ho do zásielky so SN
async function shipCreateProductFromLabel(){
  const d=shipLastLabels;if(!d){return;}const box=$("#s_trkmsg");
  const P=d.product||{};const name=((P.model||P.name||"").trim())||(d.ean?("EAN "+d.ean):"Nový produkt");
  if(box)box.innerHTML=`<div class="msg">➕ Vytváram produkt „${esc(name)}"…</div>`;
  try{
    const brand_id=await findOrCreateBrand(P.brand);
    const specsTxt=(d.specs&&Object.keys(d.specs).length)?Object.entries(d.specs).map(([k,v])=>k+": "+v).join("\n"):null;
    const rec={name,model:P.model||null,brand_id,long_description:specsTxt,source:"photo"};
    if(d.ean)rec.sku=d.ean;
    const {data:np,error}=await sb.from("products").insert(rec).select("id,name,sku,brand_id,category_id,model").single();
    if(error){if(box)box.innerHTML=`<div class="msg err">Vytvorenie produktu zlyhalo: ${esc(error.message)}</div>`;return;}
    DATA.products.push(np);
    shipItems.push({product_id:np.id,name:np.name,quantity:1,serial:d.serial||null});shipRenderItems();
    if(box)box.innerHTML=`<div class="msg ok">✓ Vytvorený produkt „${esc(np.name)}"${P.brand?" ("+esc(P.brand)+")":""} a pridaný do zásielky${d.serial?" · SN "+esc(d.serial):""}.${specsTxt?" Parametre uložené do popisu.":""} <span class="muted">Kategóriu/cenu doplníš v Produktoch.</span></div>`;
  }catch(e){if(box)box.innerHTML=`<div class="msg err">Chyba: ${esc((e&&e.message)||String(e))}</div>`;}
}
function shipAddItem(){const pid=Number($("#s_pitem").value);if(!pid)return;const p=DATA.products.find(x=>x.id===pid);const qty=Number($("#s_pqty").value||1);shipItems.push({product_id:pid,name:p?p.name:"?",quantity:qty,serial:shipPendingSerial||null});shipPendingSerial=null;shipRenderItems();}
function shipRenderItems(){const el=$("#s_items");if(el)el.innerHTML=shipItems.length?shipItems.map((it,i)=>`${it.quantity}× ${esc(it.name)}${it.serial?` · SN ${esc(it.serial)}`:""} <span style="color:var(--red);cursor:pointer" onclick="shipItems.splice(${i},1);shipRenderItems()">×</span>`).join("<br>"):"Zatiaľ žiadne položky.";}
// vytvorí produkt z EAN (dohľadá názov cez lookup-barcode) a pridá ho do zásielky so SN
async function shipEanCreate(ean,serial){
  const box=$("#s_trkmsg");if(box)box.innerHTML=`<div class="msg">➕ Vytváram produkt z EAN ${esc(ean)}…</div>`;
  try{
    let name="";try{const r=await sb.functions.invoke("lookup-barcode",{body:{code:ean}});if(r.data&&r.data.name)name=r.data.name;}catch(e){}
    const {data:np,error}=await sb.from("products").insert({name:name||("EAN "+ean),sku:ean}).select("id,name,sku,brand_id,category_id,price,currency").single();
    if(error){if(box)box.innerHTML=`<div class="msg err">Vytvorenie produktu zlyhalo: ${esc(error.message)}</div>`;return;}
    DATA.products.push(np);
    shipItems.push({product_id:np.id,name:np.name,quantity:1,serial:serial||null});shipRenderItems();
    if(box)box.innerHTML=`<div class="msg ok">✓ Vytvorený produkt „${esc(np.name)}" (EAN ${esc(ean)}) a pridaný do zásielky${serial?" · SN "+esc(serial):""}. Detaily (kategória, cena, parametre) doplníš v Produktoch.</div>`;
  }catch(e){if(box)box.innerHTML=`<div class="msg err">Chyba: ${esc((e&&e.message)||String(e))}</div>`;}
}
async function shipSave(){
  const trk=$("#s_trk").value.trim();if(!trk){$("#s_msg").innerHTML=`<div class="msg err">Zadaj sledovacie číslo.</div>`;return;}
  const from=$("#s_from").value.trim()||null,to=$("#s_to").value.trim()||null,send=$("#s_send").value.trim()||null;
  const rec={tracking_number:trk,direction:deriveDir(from,to,send)||"inbound",carrier:$("#s_carr").value.trim()||null,
    sender:send,from_address:from,to_address:to,
    our_order:$("#s_order").value.trim()||null,order_source:$("#s_ordsrc").value.trim()||null,
    payment_method:$("#s_paymethod").value||null,
    expected_date:$("#s_eta").value||null,status:$("#s_status").value.trim()||null,contents:$("#s_cont").value.trim()||null,
    customs:$("#s_customs").checked,incoterm:$("#s_inco").value||null,jds_number:$("#s_jds").value.trim()||null,awb_number:$("#s_awb").value.trim()||null,
    ship_cost:$("#s_shipcost").value?Number($("#s_shipcost").value):null,ship_cost_cur:$("#s_shipcur").value,
    insured_value:$("#s_ins").value?Number($("#s_ins").value):null,insured_cur:$("#s_inscur").value,
    customs_value:$("#s_cval").value?Number($("#s_cval").value):null,duty:$("#s_duty").value?Number($("#s_duty").value):null,
    vat:$("#s_vat").value?Number($("#s_vat").value):null,duty_payer:$("#s_dpayer").value||null,
    is_paid:$("#s_paid").checked,pay_amount:$("#s_amt").value?Number($("#s_amt").value):null,pay_currency:$("#s_cur").value,invoice_number:$("#s_inv").value.trim()||null};
  $("#s_save").disabled=true;$("#s_msg").innerHTML="";
  const {data,error}=await sb.from("shipments").insert(rec).select("id").single();
  if(error){$("#s_save").disabled=false;$("#s_msg").innerHTML=`<div class="msg err">${esc(error.message)}</div>`;return;}
  if(shipItems.length){const items=shipItems.map(it=>({shipment_id:data.id,product_id:it.product_id,quantity:it.quantity,serial:it.serial||null}));await sb.from("shipment_items").insert(items);}
  shipList();
  $("#view").insertAdjacentHTML("afterbegin",`<div class="msg ok">✓ Zásielka ${esc(trk)} uložená.</div>`);
}
let shipDetailId=null;
async function shipDetail(id){navHash("ship/"+id);
  shipDetailId=id;
  const {data:s,error}=await sb.from("shipments").select("*").eq("id",id).single();
  if(error){alert(error.message);return;}
  const {data:its}=await sb.from("shipment_items").select("id,quantity,product_id,products(name)").eq("shipment_id",id);
  const {data:lots}=await sb.from("stock_lots").select("id,status").eq("shipment_id",id);
  const d=DIRS[s.direction]||["?",""];
  const row=(l,v)=>(v!==null&&v!==undefined&&v!=="")?`<div class="lot"><div class="m">${esc(l)}</div><b>${esc(v)}</b></div>`:"";
  const prodOpts=DATA.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const itemsHtml=(its||[]).map(i=>`<div class="lot" style="display:flex;justify-content:space-between;align-items:center"><div>${fmtNum(i.quantity)}× ${esc((i.products&&i.products.name)||"?")}</div>${canWrite()?`<button class="btn red sm" onclick="shipItemDel(${i.id})">×</button>`:""}</div>`).join("")||`<div class="muted">Bez položiek.</div>`;
  const inStock=(lots&&lots.length)?`<span class="tag o">v zásobách ako „doručuje sa" (${lots.length})</span>`:"";
  $("#view").innerHTML=`<div class="card"><div class="chosen"><div><span class="tag ${d[1]}">${d[0]}</span> <b>${esc(s.tracking_number)}</b>${copyBtn(s.tracking_number)}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${(canWrite()&&!shipClosed(s))?`<button class="btn sm" onclick="shipUpsTrack(${id})">🔄 Zistiť stav u prepravcu</button>`:""}<button class="btn ghost sm" onclick="shipPOD(${id})">🧾 Proof of Delivery</button><button class="btn ghost sm" onclick="shipList()">Späť</button></div></div>
    ${s.tracking_at?`<div class="muted" style="margin-bottom:6px">Naposledy stiahnuté od prepravcu: ${esc(String(s.tracking_at).replace("T"," ").slice(0,16))} · údaje sú uložené v systéme (aj po expirácii u prepravcu).</div>`:""}
    <div id="ship_upsmsg"></div>
    ${row("Prepravca",s.carrier)}
    <div class="lot"><div class="m">Smer (určený automaticky z adries)</div><b>${dirBadge(s.direction)} ${esc((DIRS[s.direction]||["",""])[0])}</b></div>
    ${row("Stav",s.status)}
    ${row("Odosielateľ / dodávateľ",s.sender)}${row("Odkiaľ (adresa)",s.from_address)}${row("Doručiť kam",s.to_address)}
    ${row("Objednávka",[s.our_order,s.order_source].filter(Boolean).join(" · "))}${row("Predpokladané doručenie",s.expected_date?String(s.expected_date).slice(0,10):"")}${row("Prijaté dňa",s.received_on?String(s.received_on).slice(0,10):"")}${row("Obsah (poznámka)",s.contents)}
    ${row("Dodacia podmienka (incoterm)",s.incoterm)}${row("Cena prepravy (platíme my)",s.ship_cost?s.ship_cost+" "+(s.ship_cost_cur||""):"")}${row("Poistná suma",s.insured_value?s.insured_value+" "+(s.insured_cur||""):"")}
    ${s.customs?row("Colné konanie (JDS)",s.jds_number||"áno"):""}${row("Mimo EÚ",s.non_eu?"áno":"")}${row("AWB / prepravný list",s.awb_number)}${row("Colná hodnota",s.customs_value)}${row("Clo",s.duty)}${row("DPH",s.vat)}${row("Clo a DPH platí",{my:"My (odosielateľ)",prijemca:"Príjemca",tretia:"Tretia strana"}[s.duty_payer]||"")}${row("Poplatok za spracovanie",s.processing_fee)}
    <div class="lot"><div class="m">Platba</div><b>${s.payment_method?esc(SHIP_PAYM[s.payment_method]||s.payment_method)+" · ":""}${s.is_paid?`<span class="tag g">zaplatené</span>`:`<span class="tag r">nezaplatené</span>`}${s.pay_amount?" · "+esc(s.pay_amount)+" "+esc(s.pay_currency||""):""}</b>${canWrite()?` <button class="btn ghost sm" onclick="shipTogglePaid(${id},${s.is_paid?"true":"false"})">${s.is_paid?"Označiť nezaplatené":"✓ Zaplatené (dobierka)"}</button>`:""}${(canWrite()&&detectCarrierName(s.carrier,s.tracking_number)==="UPS")?` <button class="btn ghost sm" title="Overiť dobierku cez UPS Quantum View" onclick="shipQVPay(${id})">💶 Overiť dobierku (Quantum View)</button>`:""}</div>
    ${row("Kde/čím zaplatené",s.paid_where)}${row("Krypto TX",s.crypto_tx)}${row("Faktúra",s.invoice_number)}${row("Platba zákazníka",s.customer_payment)}${row("Cena prepravy (platíme my)",s.ship_cost?s.ship_cost+" "+(s.ship_cost_cur||""):"")}
    <h4 style="margin-top:12px">Položky zásielky ${inStock}</h4>${itemsHtml}
    ${canWrite()?`<div class="row2" style="margin-top:8px"><div><label>Produkt</label><select id="si_prod">${prodOpts}</select></div><div><label>Množstvo</label><input id="si_qty" type="number" min="1" value="1"></div></div>
    <div class="inline" style="gap:8px;flex-wrap:wrap"><button class="btn ghost sm" onclick="shipItemAdd(${id})">+ Pridať položku</button>${(s.direction==="inbound"&&(!lots||!lots.length))?`<button class="btn sm" onclick="shipItemsToStock(${id})">📦 Vytvoriť skladové položky (na ceste)</button>`:""}</div>`:""}
    ${canDelete()?`<button class="btn red" onclick="shipDelete(${id})" style="margin-top:12px">🗑 Zmazať zásielku</button>`:""}</div>`;
}
async function shipItemAdd(id){const pid=Number($("#si_prod").value);const qty=Number($("#si_qty").value||1);if(!pid)return;
  const {error}=await sb.from("shipment_items").insert({shipment_id:id,product_id:pid,quantity:qty});if(error){alert(error.message);return;}shipDetail(id);}
async function shipItemDel(itemId){const {error}=await sb.from("shipment_items").delete().eq("id",itemId);if(error){alert(error.message);return;}if(shipDetailId)shipDetail(shipDetailId);}
// vytvorí skladové položky zo zásielky so stavom na_ceste (zobrazia sa v Zásobách ako „doručuje sa")
async function shipItemsToStock(id){
  const {data:s}=await sb.from("shipments").select("expected_date").eq("id",id).single();
  const {data:its}=await sb.from("shipment_items").select("product_id,quantity").eq("shipment_id",id);
  if(!its||!its.length){alert("Zásielka nemá položky. Najprv pridaj produkty nižšie.");return;}
  if(!confirm("Vytvoriť "+its.length+" skladových položiek so stavom na ceste?"))return;
  const wh=DATA.warehouses[0]?DATA.warehouses[0].id:null;
  const rows=its.filter(i=>i.product_id).map(i=>({product_id:i.product_id,warehouse_id:wh,track:"bulk",quantity:i.quantity||1,status:"na_ceste",state:"new",shipment_id:id,expected_date:s?s.expected_date:null,note:"doručuje sa"}));
  const {error}=await sb.from("stock_lots").insert(rows);
  if(error){alert(error.message);return;}
  shipDetail(id);
}
// stiahni Proof of Delivery (uložený snapshot) ako samostatný HTML súbor
async function shipPOD(id){
  let {data:s}=await sb.from("shipments").select("tracking_number,tracking_json,tracking_at").eq("id",id).single();
  if(!s||!s.tracking_json){
    if(!confirm("Zásielka ešte nemá stiahnuté údaje z UPS. Stiahnuť teraz?"))return;
    await shipUpsTrack(id);
    const r=await sb.from("shipments").select("tracking_number,tracking_json,tracking_at").eq("id",id).single();s=r.data;
    if(!s||!s.tracking_json){alert("Údaje sa nepodarilo získať.");return;}
  }
  const t=s.tracking_json;const p=t.pod||{};
  const rowH=(l,v)=>v?`<tr><td style="padding:4px 14px 4px 0;color:#555;vertical-align:top"><b>${esc(l)}</b></td><td style="padding:4px 0">${esc(v)}</td></tr>`:"";
  const acts=(t.activity||[]).map(a=>`<tr><td style="padding:3px 14px 3px 0;color:#555;white-space:nowrap">${esc(a.date||"")}</td><td style="padding:3px 0">${esc(a.status||"")}${a.location?" — "+esc(a.location):""}</td></tr>`).join("");
  const html=`<!DOCTYPE html><html lang="sk"><head><meta charset="UTF-8"><title>Proof of Delivery ${esc(s.tracking_number||"")}</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:760px;margin:24px auto;padding:0 16px}h1{border-bottom:3px solid #f5b301;padding-bottom:6px}h2{font-size:16px;margin-top:24px}table{border-collapse:collapse}.muted{color:#777}</style></head><body>
    <h1>Proof of Delivery — UPS</h1>
    <p>Doklad o doručení zásielky. Stiahnuté zo systému ${esc(String(s.tracking_at||"").replace("T"," ").slice(0,16))}.</p>
    <table>
    ${rowH("Tracking Number",s.tracking_number)}
    ${rowH("Service",p.service||t.service)}
    ${rowH("Weight",p.weight||t.weight)}
    ${rowH("Shipment Category",p.category)}
    ${rowH("Shipped / Billed On",p.shippedBilledOn)}
    ${rowH("Delivered On",p.deliveredOn||t.deliveredAt)}
    ${rowH("Ship From",[p.shipFromName,p.shipFromAddr].filter(Boolean).join(", "))}
    ${rowH("Delivered To",[p.deliveredToName,p.deliveredToAddr].filter(Boolean).join(", "))}
    ${rowH("Received By",p.receivedBy||t.receivedBy)}
    ${rowH("Delivery Location",p.deliveryLocation||t.deliveryLocation)}
    ${rowH("Reference Number(s)",(p.references||t.references||[]).join(", "))}
    ${rowH("C.O.D.",p.cod||t.cod)}
    </table>
    <h2>Parcel History</h2><table>${acts||"<tr><td>—</td></tr>"}</table>
    <p class="muted" style="margin-top:24px">Uložené v internom systéme. Zdroj: UPS Tracking API.</p>
    </body></html>`;
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="POD_"+(s.tracking_number||id)+".html";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
// zisti stav u prepravcu podľa tracking čísla (UPS alebo DHL podľa carrier)
// rozpoznanie prepravcu — najprv podľa poľa Prepravca, inak podľa tvaru tracking čísla
function detectCarrierName(carrier,tracking){const c=(carrier||"").toLowerCase();
  if(/fedex|fdx/.test(c))return "FedEx";
  if(/gls/.test(c))return "GLS";
  if(/dhl/.test(c))return "DHL Express";            // Unified API pokrýva Express aj Freight/Forwarding (myDHLi)
  if(/ups/.test(c))return "UPS";
  if(/bal[íi]kovn/.test(c))return "Balíkovna";
  if(/po[šs]ta|cpost|[čc]esk[áa] po/.test(c))return "Česká pošta";
  const t=(tracking||"").toUpperCase().replace(/\s/g,"");
  if(/^1Z[0-9A-Z]{16}$/.test(t))return "UPS";
  if(/^(JJD|JVGL|JD|GM|LX)/.test(t))return "DHL Express";
  if(/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(t))return "Česká pošta";  // UPU medzinárodné (napr. RR…CZ)
  if(/^[A-Z]{2}\d{8,12}[A-Z]$/.test(t))return "Balíkovna";    // Balíkovňa / ČP domáce (napr. DR…C)
  if(/^(ZBA|GLS)/.test(t)||/^\d{11,14}$/.test(t)&&/^0/.test(t))return "GLS";
  if(/^\d{12}$|^\d{15}$|^\d{20}$|^\d{22}$/.test(t))return "FedEx";
  return "";}
function carrierFnByName(name){return {"FedEx":{fn:"fedex-track",name:"FedEx"},"GLS":{fn:"gls-track",name:"GLS"},"DHL Express":{fn:"dhl-track",name:"DHL"},"DHL Freight":{fn:"dhl-track",name:"DHL"},"UPS":{fn:"ups-track",name:"UPS"},"Česká pošta":{fn:"ceska-posta-track",name:"Česká pošta"},"Balíkovna":{fn:"ceska-posta-track",name:"Balíkovna"}}[name]||null;}
// keď sa prepravca nerozpozná, NEskúšaj naslepo UPS — skús Českú poštu (verejné, zadarmo; pri cudzom čísle vráti „nenašlo sa")
function carrierFn(carrier,tracking){const n=detectCarrierName(carrier,tracking);return carrierFnByName(n)||carrierFnByName("Česká pošta");}
function carrierSecrets(name){return {"UPS":"UPS_CLIENT_ID / UPS_CLIENT_SECRET","FedEx":"FEDEX_CLIENT_ID / FEDEX_CLIENT_SECRET","DHL Express":"DHL_API_KEY (Unified API — Express aj Freight)","DHL Freight":"DHL_API_KEY (Unified API)","GLS":"GLS_TRACK_URL + prihlásenie","Česká pošta":"(verejné API — bez kľúča)","Balíkovna":"(verejné API — bez kľúča)"}[name]||"prihlasovacie údaje prepravcu";}
async function shipUpsTrack(id){
  const {data:s}=await sb.from("shipments").select("tracking_number,carrier").eq("id",id).single();
  if(!s||!s.tracking_number){alert("Zásielka nemá tracking číslo.");return;}
  const cf=carrierFn(s.carrier,s.tracking_number);
  const msg=$("#ship_upsmsg");if(msg)msg.innerHTML=`<div class="msg">🔄 Zisťujem stav u ${esc(cf.name)}…</div>`;
  let data=null,error=null;
  try{const r=await sb.functions.invoke(cf.fn,{body:{tracking:s.tracking_number}});data=r.data;error=r.error;}catch(e){error=e;}
  if(error||(data&&data.error)||!data||!data.found){
    let detail=(data&&data.error)?data.error:(error&&(error.message||error.name))?(error.message||error.name):"funkcia neodpovedala (možno nie je nasadená)";
    try{if(error&&error.context&&typeof error.context.json==="function"){const j=await error.context.json();if(j&&j.error)detail=j.error;}}catch(e){}
    if(msg)msg.innerHTML=`<div class="msg err">${esc(cf.name)} sledovanie zlyhalo.<br>Detail: ${esc(String(detail))}<br><span class="muted">Skontroluj: 1) funkcia <b>${esc(cf.fn)}</b> je nasadená, 2) secrets <b>${esc(carrierSecrets(cf.name))}</b>, 3) prepravca má povolené Tracking API.</span></div>`;return;}
  const upd={status:data.status||null,tracking_json:data,tracking_at:new Date().toISOString()};
  const pd=data.pod||{};
  const fromA=[pd.shipFromName,pd.shipFromAddr].filter(Boolean).join(", ");
  const toA=[pd.deliveredToName,pd.deliveredToAddr].filter(Boolean).join(", ");
  if(fromA)upd.from_address=fromA;
  if(toA)upd.to_address=toA;
  if(pd.shipFromName)upd.sender=pd.shipFromName;
  // dátumy: doručené vs. predpokladané
  if(data.delivered){upd.delivered_on=String(data.deliveredAt||data.eta||"").replace(" ","T")||null;upd.expected_date=null;}
  else if(data.eta){upd.expected_date=String(data.eta).slice(0,10);}
  // smer podľa toho, či je odosielateľ/príjemca naša firma
  const fromUs=isUsAddr(fromA),toUs=isUsAddr(toA);
  if(fromUs&&!toUs)upd.direction="outbound";else if(toUs&&!fromUs)upd.direction="inbound";
  // dobierka (C.O.D.) — ak doručené a je COD, ber ako zaplatené
  if(data.cod){upd.customer_payment="dobierka "+data.cod;if(data.delivered){upd.is_paid=true;upd.paid_where="dobierka (prepravca)";}}
  if(pd.labelDate)upd.label_date=String(pd.labelDate).slice(0,10);
  await sb.from("shipments").update(upd).eq("id",id);
  const act=(data.activity||[]).map(a=>`<div class="lot"><div class="m">${esc(a.date||"")}${a.location?" · "+esc(a.location):""}</div>${esc(a.status||"")}</div>`).join("");
  const info=(l,v)=>v?`<div class="lot"><div class="m">${esc(l)}</div><b>${esc(v)}</b></div>`:"";
  const details=[
    info("Aktuálny stav",data.status),
    data.delivered?info("Doručené",data.deliveredAt||"áno"):info("Predpokladané doručenie",data.eta),
    info("Služba",data.service),info("Hmotnosť",data.weight),
    data.packages>1?info("Počet balíkov",String(data.packages)):"",
    info("Odosielané z",data.from),info("Doručuje sa do",data.to),
    info("Prevzal",data.receivedBy),info("Miesto doručenia",data.deliveryLocation),info("Podpis",data.signature),
    info("C.O.D. (dobierka)",data.cod),
    (data.references&&data.references.length)?info("Referencie",data.references.join(", ")):""
  ].join("");
  shipDetail(id);
  setTimeout(()=>{const m2=$("#ship_upsmsg");if(m2)m2.innerHTML=`<div class="msg ok">✓ Aktualizované z ${esc(data.carrier||"prepravcu")}.</div><div class="card"><h4>Podrobnosti (${esc(data.carrier||"")})</h4>${details}</div>`+(act?`<div class="card"><h4>Priebeh zásielky</h4>${act}</div>`:"");},60);
}
async function shipDelete(id){if(!confirm("Zmazať zásielku?"))return;const {error}=await sb.from("shipments").delete().eq("id",id);if(error){alert(error.message);return;}shipList();}
async function shipSetDir(id,dir){const {error}=await sb.from("shipments").update({direction:dir}).eq("id",id);if(error){alert(error.message);return;}shipDetail(id);}
async function shipTogglePaid(id,cur){const o={is_paid:!cur};if(!cur&&!confirm("Označiť zásielku ako zaplatenú (dobierka)?"))return;const {error}=await sb.from("shipments").update(o).eq("id",id);if(error){alert(error.message);return;}shipDetail(id);}
// Overenie dobierky cez UPS Quantum View (C.O.D. collected)
async function shipQVPay(id){
  const {data:s}=await sb.from("shipments").select("tracking_number,carrier,is_paid").eq("id",id).single();
  if(!s||!s.tracking_number){alert("Zásielka nemá tracking číslo.");return;}
  const msg=$("#ship_upsmsg");if(msg)msg.innerHTML=`<div class="msg">💶 Zisťujem dobierku cez UPS Quantum View…</div>`;
  let data=null,error=null;
  try{const r=await sb.functions.invoke("ups-quantumview",{body:{tracking:s.tracking_number}});data=r.data;error=r.error;}catch(e){error=e;}
  if(error||(data&&data.error)){
    let detail=(data&&data.error)?data.error:(error&&(error.message||error.name))||"funkcia neodpovedala (možno nie je nasadená)";
    try{if(error&&error.context&&typeof error.context.json==="function"){const j=await error.context.json();if(j&&j.error)detail=j.error;}}catch(e){}
    if(msg)msg.innerHTML=`<div class="msg err">Quantum View zlyhalo.<br>Detail: ${esc(String(detail))}<br><span class="muted">Skontroluj: 1) funkcia <b>ups-quantumview</b> je nasadená, 2) secrets <b>UPS_CLIENT_ID/SECRET</b> + <b>UPS_QV_SUBSCRIPTION</b>, 3) v UPS účte je aktívna Quantum View subscription.</span></div>`;return;}
  const ev=(data.codByTracking&&data.codByTracking[s.tracking_number])||(data.events&&data.events[0])||null;
  if(!ev){if(msg)msg.innerHTML=`<div class="msg" style="background:#fff4e5;color:#a8630c">Pre toto tracking číslo zatiaľ Quantum View nevrátil udalosť dobierky. Skús neskôr (udalosti pribúdajú po doručení) alebo zväčši obdobie (UPS_QV_DAYS).</div>`;return;}
  const collected=!!ev.codCollected;
  const upd={};
  if(ev.codAmount)upd.customer_payment="dobierka "+ev.codAmount;
  if(collected){upd.is_paid=true;upd.paid_where="dobierka (UPS Quantum View)";}
  if(Object.keys(upd).length)await sb.from("shipments").update(upd).eq("id",id);
  shipDetail(id);
  setTimeout(()=>{const m2=$("#ship_upsmsg");if(m2)m2.innerHTML=collected
    ?`<div class="msg ok">✓ Dobierka vybraná${ev.codAmount?" ("+esc(ev.codAmount)+")":""}${ev.deliveredAt?", doručené "+esc(ev.deliveredAt):""} — označené ako zaplatené.</div>`
    :`<div class="msg" style="background:#fff4e5;color:#a8630c">Quantum View našiel zásielku${ev.codAmount?", dobierka "+esc(ev.codAmount):""}, ale zatiaľ bez potvrdenia „vybraté". Stav sa doplní po doručení.</div>`;},60);
}

// ===== OPRAVY A REKLAMÁCIE =====
// Workflow — každý stav má polia, ktoré technik pri danom kroku vypĺňa.
const REP_STAGES=[
  {k:"prijaté",         label:"Prijaté",                          fields:[{k:"received_by",label:"Prijal",type:"text"},{k:"fault",label:"Popis závady (od zákazníka)",type:"textarea"}]},
  {k:"diagnostika",     label:"Diagnostika",                      fields:[{k:"technician",label:"Technik",type:"text"},{k:"diagnosis",label:"Zistená závada",type:"textarea"}]},
  {k:"schválenie ceny", label:"Cena — zákazník informovaný a schválil", fields:[{k:"price",label:"Cena opravy",type:"number"},{k:"currency",label:"Mena",type:"cur"},{k:"approved_by",label:"Schválil (zákazník)",type:"text"}]},
  {k:"objednané diely", label:"Objednané náhradné diely",         fields:[{k:"parts",label:"Diely",type:"textarea"},{k:"order_no",label:"Č. objednávky",type:"text"},{k:"supplier",label:"Dodávateľ",type:"text"}]},
  {k:"čaká na diely",   label:"Čaká na dodanie dielov",           fields:[{k:"expected",label:"Očak. dodanie",type:"date"}]},
  {k:"oprava",          label:"Prebieha oprava",                  fields:[{k:"technician",label:"Technik",type:"text"},{k:"work",label:"Vykonané práce",type:"textarea"}]},
  {k:"hotovo",          label:"Hotovo — zákazník informovaný",    fields:[{k:"notified_on",label:"Informovaný dňa",type:"date"},{k:"notify_how",label:"Ako (e-mail / telefón)",type:"text"}]},
  {k:"čaká na platbu",  label:"Čaká na platbu a prevzatie",       fields:[{k:"price_final",label:"Fakturovaná suma",type:"number"},{k:"currency",label:"Mena",type:"cur"}]},
  {k:"uzavreté",        label:"Zaplatené, vrátené, uzavreté",     fields:[{k:"paid_on",label:"Zaplatené dňa",type:"date"},{k:"returned_on",label:"Vrátené dňa",type:"date"},{k:"payment_method",label:"Spôsob platby",type:"text"}]}
];
const REP_STATUS=REP_STAGES.map(s=>s.k);
function repStageIdx(k){return Math.max(0,REP_STATUS.indexOf(k));}
function repStageLabel(k){const s=REP_STAGES.find(x=>x.k===k);return s?s.label:(k||"");}
function repStatusColor(s){const i=repStageIdx(s);if(i>=REP_STAGES.length-1)return "g";if(/oprava|hotovo/.test(s||""))return "b";if(/čak|cak/.test(s||""))return "o";return "";}
function repNextStage(k){const i=repStageIdx(k);return REP_STATUS[Math.min(i+1,REP_STATUS.length-1)];}
let repKind="",repStatus="",repQ="",repPhotos=[];
function renderRepairs(){
  if(!canWrite()){$("#view").innerHTML=`<div class="card"><div class="msg err">Táto sekcia je pre user/admin.</div></div>`;return;}
  $("#view").innerHTML=`<div class="card muted">Načítavam…</div>`;
  sb.from("repairs").select("*").order("id",{ascending:false}).limit(500).then(({data,error})=>{
    if(error){$("#view").innerHTML=`<div class="card"><div class="msg err">${esc(error.message)}</div></div>`;return;}
    let list=data||[];
    if(repKind)list=list.filter(r=>r.kind===repKind);
    if(repStatus)list=list.filter(r=>r.status===repStatus);
    if(repQ){const q=repQ.toLowerCase();list=list.filter(r=>((r.title||"")+" "+(r.customer||"")+" "+(r.serial||"")+" "+(r.technician||"")+" "+(r.received_by||"")).toLowerCase().includes(q));}
    const nm=r=>r.title||((DATA.products.find(p=>p.id===r.product_id)||{}).name)||"(bez názvu)";
    const today=new Date().toISOString().slice(0,10);
    const rowH=r=>{const overdue=r.kind==="reklamacia"&&r.deadline&&r.deadline<today&&repStageIdx(r.status)<REP_STAGES.length-1;
      return `<tr onclick="repairDetail(${r.id})" style="cursor:pointer;${overdue?"background:#fdeeee":""}">
        <td><b>${esc(nm(r))}</b>${r.serial?`<div class="psub">SN: ${esc(r.serial)}</div>`:""}<div class="psub">${r.kind==="reklamacia"?`<span class="tag r">reklamácia</span>`:`<span class="tag b">oprava</span>`}</div></td>
        <td>${esc(r.customer||"—")}${r.customer_contact?`<div class="psub">${esc(r.customer_contact)}</div>`:""}</td>
        <td><span class="tag ${repStatusColor(r.status)}">${esc(repStageLabel(r.status))}</span></td>
        <td>${esc(r.deadline?String(r.deadline).slice(0,10):"—")}${overdue?` <span class="tag r">po termíne</span>`:""}</td>
        <td>${esc(r.received_by||"—")}${r.technician?`<div class="psub">tech: ${esc(r.technician)}</div>`:""}</td>
        <td>${esc(String(r.created_at||"").slice(0,10))}</td></tr>`;};
    // zoskupenie do sekcií podľa stavu (prijaté → … → uzavreté)
    let sections="";
    if(!list.length){sections=`<div class="card"><div class="muted">Žiadne záznamy.</div></div>`;}
    else{
      REP_STAGES.forEach(st=>{
        const grp=list.filter(r=>r.status===st.k);if(!grp.length)return;
        sections+=`<div class="card"><h3 style="margin:0 0 8px"><span class="tag ${repStatusColor(st.k)}">${esc(st.label)}</span> <span class="muted" style="font-weight:400">${grp.length}</span></h3>
          <div class="ptbl-wrap"><table class="ptbl"><thead><tr><th>Tovar</th><th>Zákazník</th><th>Stav</th><th>Termín</th><th>Prijal / technik</th><th>Vytvorené</th></tr></thead><tbody>${grp.map(rowH).join("")}</tbody></table></div></div>`;
      });
      // stavy mimo definície (poistka)
      const other=list.filter(r=>!REP_STATUS.includes(r.status));
      if(other.length)sections+=`<div class="card"><h3 style="margin:0 0 8px">Iné (${other.length})</h3><div class="ptbl-wrap"><table class="ptbl"><tbody>${other.map(rowH).join("")}</tbody></table></div></div>`;
    }
    const kbtn=(v,l)=>`<option value="${v}" ${repKind===v?"selected":""}>${l}</option>`;
    const stOpts=`<option value="">Všetky stavy</option>`+REP_STAGES.map(s=>`<option value="${s.k}" ${repStatus===s.k?"selected":""}>${esc(s.label)}</option>`).join("");
    $("#view").innerHTML=`
    <div class="card"><div class="inline" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
      <button class="btn green sm" onclick="repairForm(0,'oprava')">+ Nová oprava</button>
      <button class="btn sm" style="background:var(--red);width:auto" onclick="repairForm(0,'reklamacia')">+ Nová reklamácia</button></div></div>
    <div class="card">
      <div class="toolbar"><input placeholder="Hľadať (názov / zákazník / SN / technik)…" value="${esc(repQ)}" oninput="repQ=this.value;renderRepairs()">
        <select onchange="repKind=this.value;renderRepairs()">${kbtn("","Opravy + reklamácie")}${kbtn("oprava","Len opravy")}${kbtn("reklamacia","Len reklamácie")}</select>
        <select onchange="repStatus=this.value;renderRepairs()">${stOpts}</select></div>
      <div class="muted">${list.length} záznamov · zoradené po sekciách podľa stavu</div></div>
    <div id="repReqs"></div>
    ${sections}`;
    loadRepairRequests();
  });
}
// nové verejné požiadavky od zákazníkov (self-service stránka oprava.html)
async function loadRepairRequests(){
  const el=$("#repReqs");if(!el)return;
  const {data,error}=await sb.from("repair_requests").select("*").eq("status","new").order("id",{ascending:false});
  if(error||!data||!data.length){el.innerHTML="";return;}
  const rows=data.map(q=>`<div class="lot" style="border-left:4px solid var(--orange)">
    <div><b>${esc(q.item||"(bez názvu)")}</b> ${q.kind==="reklamacia"?`<span class="tag r">reklamácia</span>`:`<span class="tag b">oprava</span>`} <span class="muted">${esc(q.public_code||"")} · ${esc(String(q.created_at||"").replace("T"," ").slice(0,16))}</span></div>
    <div class="m">${esc(q.name||"")}${q.email?" · "+esc(q.email):""}${q.phone?" · "+esc(q.phone):""}${q.address?" · "+esc(q.address):""}</div>
    ${q.serial?`<div class="m">SN: ${esc(q.serial)}</div>`:""}${q.fault?`<div class="m">Závada: ${esc(q.fault)}</div>`:""}${q.note?`<div class="m">Pozn.: ${esc(q.note)}</div>`:""}
    <div style="margin-top:6px"><button class="btn green sm" onclick="repReqTake(${q.id})">✓ Prevziať (prideliť QR)</button> <button class="btn ghost sm" onclick="repReqReject(${q.id})">Zamietnuť</button></div>
  </div>`).join("");
  el.innerHTML=`<div class="card" style="border:1px solid var(--orange)"><h3 style="margin:0 0 8px">📥 Nové požiadavky od zákazníkov <span class="muted" style="font-weight:400">${data.length}</span></h3>${rows}</div>`;
}
// Prevziať požiadavku → otvor prijímací formulár (QR, fotky, poznámky) prefill z požiadavky
async function repReqTake(reqId){
  const {data:q,error}=await sb.from("repair_requests").select("*").eq("id",reqId).single();
  if(error||!q){alert("Požiadavka sa nenašla.");return;}
  repairForm(0,q.kind||"oprava",q);
  setTimeout(()=>{const m=$("#rp_msg");if(m)m.innerHTML=`<div class="msg ok">Prevzatie požiadavky ${esc(q.public_code||"")} — priraď QR (naskenuj alebo vygeneruj), doplň fotky/poznámky a ulož.</div>`;},60);
}
async function repReqReject(reqId){
  if(!confirm("Zamietnuť túto požiadavku?"))return;
  const {error}=await sb.from("repair_requests").update({status:"rejected"}).eq("id",reqId);
  if(error){alert(error.message);return;}
  renderRepairs();
}
let repTakeReqId=null; // ak formulár vzniká z verejnej požiadavky
function repGenQr(){const el=$("#rp_qr");if(el)el.value="OPR-"+Date.now().toString(36).toUpperCase().slice(-6);}
function repairForm(id,kind,req){
  repPhotos=[];
  repTakeReqId=(req&&req.id)||null;
  const r=id?null:{kind:(req&&req.kind)||kind||"oprava",status:"prijaté",received_by:ME.email,price_currency:"EUR",
    title:(req&&req.item)||"",serial:(req&&req.serial)||"",customer:(req&&req.name)||"",customer_email:(req&&req.email)||"",
    customer_phone:(req&&req.phone)||"",customer_address:(req&&req.address)||"",fault:(req&&req.fault)||"",note:(req&&req.note)||""};
  const load=id?sb.from("repairs").select("*").eq("id",id).single():Promise.resolve({data:r});
  load.then(({data:rec})=>{
    if(id)repPhotos=[];
    const prodOpts=DATA.products.map(p=>`<option value="${esc(p.name)}"></option>`).join("");
    const stOpts=REP_STAGES.map(s=>`<option value="${s.k}" ${rec.status===s.k?"selected":""}>${esc(s.label)}</option>`).join("");
    const prodName=rec.product_id?((DATA.products.find(p=>p.id===rec.product_id)||{}).name||""):"";
    $("#view").innerHTML=`<div class="card"><h2>${id?"Upraviť":"Nová"} ${rec.kind==="reklamacia"?"reklamácia":"oprava"}</h2>
      <div class="row2"><div><label>Typ</label><select id="rp_kind"><option value="oprava" ${rec.kind==="oprava"?"selected":""}>Oprava</option><option value="reklamacia" ${rec.kind==="reklamacia"?"selected":""}>Reklamácia</option></select></div>
      <div><label>Stav</label><select id="rp_status">${stOpts}</select></div></div>
      <label>Produkt z katalógu (nepovinné — hľadaj)</label><input id="rp_prod" list="rpProdList" value="${esc(prodName)}" placeholder="ak je z katalógu"><datalist id="rpProdList">${prodOpts}</datalist>
      <label>Názov tovaru (ak nie je z katalógu — prispôsobené výrobky)</label><input id="rp_title" value="${esc(rec.title||"")}">
      <div class="row2"><div><label>Sériové číslo</label><input id="rp_serial" value="${esc(rec.serial||"")}"></div>
      <div><label>Termín (najmä reklamácie)</label><input id="rp_deadline" type="date" value="${esc(rec.deadline?String(rec.deadline).slice(0,10):"")}"></div></div>
      <label>Interný QR kód</label><div class="inline"><input id="rp_qr" value="${esc(rec.qr_code||"")}" placeholder="OPR-… (naskenuj alebo vygeneruj)"><button class="btn ghost sm" type="button" onclick="openScan(t=>$('#rp_qr').value=t,{qr:true})">📷</button><button class="btn ghost sm" type="button" onclick="repGenQr()">⚙ Vygenerovať</button></div>
      <label>Zákazník</label><input id="rp_cust" value="${esc(rec.customer||"")}">
      <div class="row2"><div><label>E-mail</label><input id="rp_email" type="email" value="${esc(rec.customer_email||"")}"></div>
      <div><label>Telefón</label><input id="rp_phone" type="tel" value="${esc(rec.customer_phone||"")}"></div></div>
      <label>Adresa</label><input id="rp_address" value="${esc(rec.customer_address||"")}">
      <div class="row2"><div><label>Prijal</label><input id="rp_recv" value="${esc(rec.received_by||ME.email)}"></div>
      <div><label>Opravuje (technik)</label><input id="rp_tech" value="${esc(rec.technician||"")}"></div></div>
      <label>Popis závady</label><textarea id="rp_fault" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:9px;font-family:inherit">${esc(rec.fault||"")}</textarea>
      <div class="row2"><div><label>Návrh ceny opravy</label><input id="rp_price" type="number" step="any" value="${esc(rec.price_estimate)}"></div>
      <div><label>Mena</label><select id="rp_cur"><option ${rec.price_currency==="EUR"?"selected":""}>EUR</option><option ${rec.price_currency==="CZK"?"selected":""}>CZK</option><option ${rec.price_currency==="USD"?"selected":""}>USD</option></select></div></div>
      <label>Poznámka</label><input id="rp_note" value="${esc(rec.note||"")}">
      <label>Fotky (viac, vyššia kvalita)</label>
      <div class="inline"><button class="btn ghost sm" type="button" onclick="repairAddPhoto()">📷 Pridať fotku</button><span id="rp_photocnt" class="muted"></span></div>
      <div id="rp_photos" class="inline" style="flex-wrap:wrap;gap:6px;margin-top:6px"></div>
      <button class="btn green" id="rp_save" onclick="repairSave(${id||0})">Uložiť</button>
      <button class="btn ghost" onclick="setTab('repairs')">Späť</button><div id="rp_msg"></div></div>`;
    repRenderPhotos();
  });
}
function repRenderPhotos(){const el=$("#rp_photos");if(el)el.innerHTML=repPhotos.map((u,i)=>`<span style="position:relative;display:inline-block"><img src="${esc(u)}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--line)"><button onclick="repPhotos.splice(${i},1);repRenderPhotos()" style="position:absolute;top:-6px;right:-6px;border:0;background:#e35;color:#fff;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:11px">×</button></span>`).join("");const c=$("#rp_photocnt");if(c)c.textContent=repPhotos.length?repPhotos.length+" fotiek":"";}
function repairAddPhoto(){const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;const c=$("#rp_photocnt");if(c)c.textContent="nahrávam…";
    try{const blob=await compressImage(f,1500*1024,1920);const url=await uploadPhoto(blob,"repairs");repPhotos.push(url);repRenderPhotos();}
    catch(e){alert("Nahranie zlyhalo: "+(e.message||e));}};inp.click();}
async function repairSave(id){
  const prodVal=($("#rp_prod").value||"").trim();const prod=prodVal?DATA.products.find(p=>(p.name||"").toLowerCase()===prodVal.toLowerCase()):null;
  const o={kind:$("#rp_kind").value,status:$("#rp_status").value,product_id:prod?prod.id:null,title:$("#rp_title").value.trim()||null,
    serial:$("#rp_serial").value.trim()||null,deadline:$("#rp_deadline").value||null,customer:$("#rp_cust").value.trim()||null,
    customer_email:$("#rp_email").value.trim()||null,customer_phone:$("#rp_phone").value.trim()||null,customer_address:$("#rp_address").value.trim()||null,
    customer_contact:[$("#rp_email").value.trim(),$("#rp_phone").value.trim()].filter(Boolean).join(" · ")||null,
    received_by:$("#rp_recv").value.trim()||null,technician:$("#rp_tech").value.trim()||null,
    fault:$("#rp_fault").value.trim()||null,price_estimate:$("#rp_price").value===""?null:Number($("#rp_price").value),price_currency:$("#rp_cur").value,
    note:$("#rp_note").value.trim()||null,qr_code:($("#rp_qr")?$("#rp_qr").value.trim():"")||null,updated_at:new Date().toISOString()};
  if(!o.title&&!o.product_id){$("#rp_msg").innerHTML=`<div class="msg err">Zadaj názov tovaru alebo vyber produkt.</div>`;return;}
  $("#rp_save").disabled=true;
  let rid=id,err;
  if(id){const r=await sb.from("repairs").update(o).eq("id",id);err=r.error;}
  else{const r=await sb.from("repairs").insert(o).select("id").single();err=r.error;rid=r.data&&r.data.id;}
  if(err){$("#rp_save").disabled=false;$("#rp_msg").innerHTML=`<div class="msg err">${esc(err.message)}</div>`;return;}
  if(repPhotos.length&&rid){await sb.from("repair_photos").insert(repPhotos.map(u=>({repair_id:rid,url:u})));}
  // ak vzniklo z verejnej požiadavky — prideľ QR (ak prázdny), prepoj a označ požiadavku za prevzatú
  if(!id&&rid&&repTakeReqId){
    const qr=o.qr_code||("OPR-"+rid);
    await sb.from("repairs").update({qr_code:qr,request_id:repTakeReqId}).eq("id",rid);
    await sb.from("repair_requests").update({status:"taken",taken_repair_id:rid}).eq("id",repTakeReqId);
    o.qr_code=qr;repTakeReqId=null;
  }
  // pri NOVOM zázname založ prvý krok denníka „prijaté" (nemenný)
  if(!id&&rid){await sb.from("repair_events").insert({repair_id:rid,stage:o.status||"prijaté",note:(o.note||"")+(o.qr_code?" · QR: "+o.qr_code:"")||null,
    data:{received_by:o.received_by||null,fault:o.fault||null},created_by_name:ME.email});}
  setTab("repairs");
}
let repEventStage="";
async function repairDetail(id){navHash("repairs/"+id);
  const {data:r,error}=await sb.from("repairs").select("*").eq("id",id).single();
  if(error){alert(error.message);return;}
  const {data:ph}=await sb.from("repair_photos").select("id,url").eq("repair_id",id).order("id");
  const {data:evs}=await sb.from("repair_events").select("*").eq("repair_id",id).order("created_at",{ascending:true});
  const nm=r.title||((DATA.products.find(p=>p.id===r.product_id)||{}).name)||"(bez názvu)";
  const row=(l,v)=>(v!==null&&v!==undefined&&v!=="")?`<div class="lot"><div class="m">${esc(l)}</div><b>${esc(v)}</b></div>`:"";
  const gal=(ph||[]).map(x=>`<a href="${esc(x.url)}" target="_blank"><img src="${esc(x.url)}" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--line);margin:3px"></a>`).join("")||`<div class="muted">Bez fotiek.</div>`;
  // progres — ktoré kroky sú hotové
  const doneIdx=repStageIdx(r.status);
  const prog=REP_STAGES.map((s,i)=>`<span class="tag ${i<doneIdx?"g":(i===doneIdx?repStatusColor(s.k)||"b":"")}" style="${i>doneIdx?"opacity:.45":""};margin:2px">${i<=doneIdx?"✓ ":""}${esc(s.label)}</span>`).join("");
  // denník krokov (nemenný)
  const fLabel=(stage,key)=>{const st=REP_STAGES.find(x=>x.k===stage);const f=st&&st.fields.find(x=>x.k===key);return f?f.label:key;};
  const timeline=(evs||[]).map(ev=>{const d=ev.data||{};
    const flds=Object.keys(d).filter(k=>d[k]!=null&&d[k]!=="").map(k=>`<div class="psub"><b>${esc(fLabel(ev.stage,k))}:</b> ${esc(String(d[k]))}</div>`).join("");
    return `<div class="lot" style="border-left:3px solid var(--blue);padding-left:8px">
      <div class="m">${esc(String(ev.created_at||"").replace("T"," ").slice(0,16))}${ev.created_by_name?" · "+esc(ev.created_by_name):""}</div>
      <b><span class="tag ${repStatusColor(ev.stage)}">${esc(repStageLabel(ev.stage))}</span></b>
      ${flds}${ev.note?`<div style="margin-top:4px;white-space:pre-wrap">📝 ${esc(ev.note)}</div>`:""}</div>`;}).join("")||`<div class="muted">Zatiaľ žiadne kroky.</div>`;
  // formulár na zaznamenanie ďalšieho kroku (predvolene ďalší krok)
  repEventStage=repNextStage(r.status);
  $("#view").innerHTML=`<div class="card"><div class="chosen"><div><b>${esc(nm)}</b> ${r.kind==="reklamacia"?`<span class="tag r">reklamácia</span>`:`<span class="tag b">oprava</span>`}</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn ghost sm" onclick="repairForm(${id})">✏️ Upraviť základ</button><button class="btn ghost sm" onclick="repairReceipt(${id})">🧾 Protokol</button><button class="btn ghost sm" onclick="setTab('repairs')">Späť</button></div></div>
    <div style="margin:6px 0 10px">${prog}</div>
    <div class="row2" style="align-items:center"><div><label>Aktuálny stav</label><b><span class="tag ${repStatusColor(r.status)}">${esc(repStageLabel(r.status))}</span></b></div><div>${r.deadline?`<label>Termín</label><b>${esc(String(r.deadline).slice(0,10))}</b>`:""}</div></div>
    ${row("Sériové číslo",r.serial)}${row("Interný QR kód",r.qr_code)}${row("Zákazník",r.customer)}${row("E-mail",r.customer_email)}${row("Telefón",r.customer_phone)}${row("Adresa",r.customer_address)}${row("Prijal",r.received_by)}${row("Opravuje (technik)",r.technician)}
    ${row("Popis závady",r.fault)}${row("Cena",r.price_estimate!=null?r.price_estimate+" "+(r.price_currency||""):"")}${row("Vytvorené",String(r.created_at||"").replace("T"," ").slice(0,16))}</div>

    <div class="card"><h4 style="margin:0 0 8px">➕ Zaznamenať krok</h4>
      <label>Stav / krok</label><select id="rev_stage" onchange="repEventStage=this.value;repairRenderStageFields()">${REP_STAGES.map(s=>`<option value="${s.k}" ${repEventStage===s.k?"selected":""}>${esc(s.label)}</option>`).join("")}</select>
      <div id="rev_fields"></div>
      <label>Poznámka <span class="muted">(po uložení sa už nedá zmeniť)</span></label>
      <textarea id="rev_note" rows="2" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:9px;font-family:inherit" placeholder="napr. čo sa zistilo / dohodlo…"></textarea>
      <button class="btn green" onclick="repairAddEvent(${id})" style="margin-top:8px">💾 Uložiť krok</button>
      <div id="rev_msg"></div></div>

    <div class="card"><h4 style="margin:0 0 8px">📒 Denník (nemenný)</h4>${timeline}</div>

    <div class="card"><h4 style="margin:0 0 8px">Fotodokumentácia</h4>
      <div class="inline"><button class="btn ghost sm" onclick="repairAddPhotoTo(${id})">📷 Pridať fotku</button></div>
      <div style="margin-top:8px">${gal}</div>
      ${canDelete()?`<button class="btn red" onclick="repairDelete(${id})" style="margin-top:12px">🗑 Zmazať záznam</button>`:""}</div>`;
  repairRenderStageFields();
}
// polia pre zvolený krok
function repairRenderStageFields(){const box=$("#rev_fields");if(!box)return;const st=REP_STAGES.find(x=>x.k===repEventStage);if(!st){box.innerHTML="";return;}
  box.innerHTML=st.fields.map(f=>{
    const lab=`<label>${esc(f.label)}</label>`;
    if(f.type==="textarea")return lab+`<textarea id="revf_${f.k}" rows="2" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:9px;font-family:inherit"></textarea>`;
    if(f.type==="cur")return lab+`<select id="revf_${f.k}"><option>EUR</option><option>CZK</option><option>USD</option></select>`;
    const t=f.type==="number"?"number":(f.type==="date"?"date":"text");
    return lab+`<input id="revf_${f.k}" type="${t}" step="any">`;
  }).join("");
}
// uloženie kroku — vloží nemenný záznam do denníka + aktualizuje sumárne polia opravy
async function repairAddEvent(id){
  const st=REP_STAGES.find(x=>x.k===repEventStage);if(!st)return;
  const data={};st.fields.forEach(f=>{const el=$("#revf_"+f.k);if(el&&el.value!==""&&el.value!=null)data[f.k]=el.value;});
  const note=($("#rev_note").value||"").trim();
  const msg=$("#rev_msg");
  const {error}=await sb.from("repair_events").insert({repair_id:id,stage:repEventStage,note:note||null,data,created_by_name:ME.email});
  if(error){if(msg)msg.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;return;}
  // aktualizuj hlavný záznam (stav + užitočné sumárne polia)
  const upd={status:repEventStage,updated_at:new Date().toISOString()};
  if(data.technician)upd.technician=data.technician;
  if(data.received_by)upd.received_by=data.received_by;
  if(data.fault)upd.fault=data.fault;
  if(data.price!=null&&data.price!=="")upd.price_estimate=Number(data.price);
  if(data.price_final!=null&&data.price_final!=="")upd.price_estimate=Number(data.price_final);
  if(data.currency)upd.price_currency=data.currency;
  await sb.from("repairs").update(upd).eq("id",id);
  repEventStage=repNextStage(repEventStage);
  repairDetail(id);
}
function repairAddPhotoTo(id){const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;try{const blob=await compressImage(f,1500*1024,1920);const url=await uploadPhoto(blob,"repairs");await sb.from("repair_photos").insert({repair_id:id,url});repairDetail(id);}catch(e){alert("Nahranie zlyhalo: "+(e.message||e));}};inp.click();}
async function repairDelete(id){if(!confirm("Zmazať tento záznam opravy/reklamácie aj s fotkami?"))return;const {error}=await sb.from("repairs").delete().eq("id",id);if(error){alert(error.message);return;}setTab("repairs");}
// opravná príjemka na stiahnutie (s fotkami)
async function repairReceipt(id){
  const {data:r}=await sb.from("repairs").select("*").eq("id",id).single();
  const {data:ph}=await sb.from("repair_photos").select("url").eq("repair_id",id).order("id");
  const {data:evs}=await sb.from("repair_events").select("*").eq("repair_id",id).order("created_at",{ascending:true});
  const nm=r.title||((DATA.products.find(p=>p.id===r.product_id)||{}).name)||"(bez názvu)";
  const rowH=(l,v)=>v?`<tr><td style="padding:4px 14px 4px 0;color:#555;vertical-align:top"><b>${esc(l)}</b></td><td style="padding:4px 0">${esc(v)}</td></tr>`:"";
  const imgs=(ph||[]).map(x=>`<img src="${esc(x.url)}" style="width:32%;margin:0.5%;border:1px solid #ddd;border-radius:6px">`).join("");
  const fLabel=(stage,key)=>{const st=REP_STAGES.find(x=>x.k===stage);const f=st&&st.fields.find(x=>x.k===key);return f?f.label:key;};
  const evRows=(evs||[]).map(ev=>{const d=ev.data||{};const flds=Object.keys(d).filter(k=>d[k]!=null&&d[k]!=="").map(k=>`${fLabel(ev.stage,k)}: ${d[k]}`).join("; ");
    return `<tr><td style="padding:4px 10px 4px 0;color:#555;white-space:nowrap;vertical-align:top">${esc(String(ev.created_at||"").replace("T"," ").slice(0,16))}</td><td style="padding:4px 0"><b>${esc(repStageLabel(ev.stage))}</b>${flds?`<br>${esc(flds)}`:""}${ev.note?`<br>📝 ${esc(ev.note)}`:""}${ev.created_by_name?`<br><span style="color:#888">${esc(ev.created_by_name)}</span>`:""}</td></tr>`;}).join("");
  const html=`<!DOCTYPE html><html lang="sk"><head><meta charset="UTF-8"><title>Opravná príjemka #${id}</title>
    <style>body{font-family:Arial,Helvetica,sans-serif;color:#222;max-width:820px;margin:24px auto;padding:0 16px}h1{border-bottom:3px solid #3b6fd4;padding-bottom:6px}table{border-collapse:collapse}.muted{color:#777}</style></head><body>
    <h1>${r.kind==="reklamacia"?"Reklamačný":"Opravný"} protokol #${id}</h1>
    <table>${rowH("Tovar",nm)}${rowH("Sériové číslo",r.serial)}${rowH("Typ",r.kind)}${rowH("Stav",repStageLabel(r.status))}${rowH("Termín",r.deadline?String(r.deadline).slice(0,10):"")}
    ${rowH("Zákazník",r.customer)}${rowH("Kontakt",r.customer_contact)}${rowH("Prijal",r.received_by)}${rowH("Opravuje",r.technician)}
    ${rowH("Popis závady",r.fault)}${rowH("Návrh ceny",r.price_estimate!=null?r.price_estimate+" "+(r.price_currency||""):"")}${rowH("Prijaté",String(r.created_at||"").replace("T"," ").slice(0,16))}</table>
    ${evRows?`<h3>Priebeh (denník)</h3><table>${evRows}</table>`:""}
    <h3>Fotodokumentácia</h3><div style="display:flex;flex-wrap:wrap">${imgs||"<span class='muted'>—</span>"}</div>
    <p class="muted" style="margin-top:20px">Vygenerované z interného systému.</p></body></html>`;
  const blob=new Blob([html],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=(r.kind==="reklamacia"?"Reklamacia_":"Oprava_")+id+".html";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// ===== MAJETOK (firemný majetok používaný na prácu) =====
let assetQ="",assetGroup="room",assetFRoom="",assetFHolder="",assetPhoto="",assetPrefill=null;
const ASSET_STATE={new:["nové","g"],used:["používané","b"],broken:["pokazené","r"]};
function assetName(a){return a.name||((DATA.products.find(p=>p.id===a.product_id)||{}).name)||"(bez názvu)";}
function renderAssets(){
  $("#view").innerHTML=`<div class="card muted">Načítavam…</div>`;
  sb.from("assets").select("*").order("id",{ascending:false}).limit(1000).then(({data,error})=>{
    if(error){$("#view").innerHTML=`<div class="card"><div class="msg err">${esc(error.message)}</div></div>`;return;}
    let list=data||[];
    if(assetFRoom)list=list.filter(a=>(a.room||"")===assetFRoom);
    if(assetFHolder)list=list.filter(a=>(a.holder||"")===assetFHolder);
    if(assetQ){const q=assetQ.toLowerCase();list=list.filter(a=>((assetName(a))+" "+(a.serial||"")+" "+(a.manager||"")+" "+(a.holder||"")+" "+(a.room||"")+" "+(a.note||"")).toLowerCase().includes(q));}
    const rooms=[...new Set((data||[]).map(a=>a.room).filter(Boolean))].sort();
    const holders=[...new Set((data||[]).map(a=>a.holder).filter(Boolean))].sort();
    const stTag=s=>{const m=ASSET_STATE[s]||[s||"—",""];return `<span class="tag ${m[1]}">${esc(m[0])}</span>`;};
    const rowH=a=>`<tr onclick="assetDetail(${a.id})" style="cursor:pointer">
      <td><b>${esc(assetName(a))}</b>${a.serial?`<div class="psub">SN: ${esc(a.serial)}${copyBtn(a.serial)}</div>`:""}</td>
      <td>${esc(a.holder||"—")}${a.manager?`<div class="psub">správca: ${esc(a.manager)}</div>`:""}</td>
      <td>${esc(a.room||"—")}</td>
      <td>${stTag(a.state)}</td>
      <td>${esc(a.acquired_at?String(a.acquired_at).slice(0,10):"—")}</td></tr>`;
    // zoskupenie podľa zvoleného kľúča
    const keyOf=a=>assetGroup==="room"?(a.room||"— bez miestnosti —"):assetGroup==="holder"?(a.holder||"— nepridelené —"):assetGroup==="manager"?(a.manager||"— bez správcu —"):"Všetok majetok";
    const groups={};list.forEach(a=>{const k=keyOf(a);(groups[k]=groups[k]||[]).push(a);});
    const keys=Object.keys(groups).sort((x,y)=>x.localeCompare(y));
    const thead=`<thead><tr><th>Položka</th><th>Užívateľ / správca</th><th>Budova / miestnosť</th><th>Stav</th><th>Nadobudnuté</th></tr></thead>`;
    let sections=list.length?keys.map(k=>`<div class="card"><h3 style="margin:0 0 8px">${esc(k)} <span class="muted" style="font-weight:400">${groups[k].length}</span></h3>
      <div class="ptbl-wrap"><table class="ptbl">${thead}<tbody>${groups[k].map(rowH).join("")}</tbody></table></div></div>`).join(""):`<div class="card"><div class="muted">Žiadny majetok.</div></div>`;
    const gsel=(v,l)=>`<option value="${v}" ${assetGroup===v?"selected":""}>${l}</option>`;
    $("#view").innerHTML=`
    <div class="card"><div class="inline" style="gap:8px;flex-wrap:wrap;justify-content:flex-end">
      ${canWrite()?`<button class="btn green sm" onclick="assetForm(0)">+ Nový majetok</button><button class="btn sm" onclick="assetPickFromStock()">📦 Presunúť zo skladu</button>`:""}
      <button class="btn ghost sm" onclick="assetExport()">⬇ Export (CSV)</button></div></div>
    <div class="card">
      <div class="toolbar"><input placeholder="Hľadať (názov / SN / správca / užívateľ / miestnosť)…" value="${esc(assetQ)}" oninput="assetQ=this.value;renderAssets()">
        <select onchange="assetGroup=this.value;renderAssets()">${gsel("room","Zoskupiť: miestnosť")}${gsel("holder","Zoskupiť: užívateľ")}${gsel("manager","Zoskupiť: správca")}${gsel("none","Bez zoskupenia")}</select>
        <select onchange="assetFRoom=this.value;renderAssets()"><option value="">Miestnosť (všetky)</option>${rooms.map(r=>`<option ${assetFRoom===r?"selected":""}>${esc(r)}</option>`).join("")}</select>
        <select onchange="assetFHolder=this.value;renderAssets()"><option value="">Užívateľ (všetci)</option>${holders.map(h=>`<option ${assetFHolder===h?"selected":""}>${esc(h)}</option>`).join("")}</select></div>
      <div class="muted">${list.length} položiek · zoskupené podľa: ${assetGroup==="room"?"miestnosť":assetGroup==="holder"?"užívateľ":assetGroup==="manager"?"správca":"—"}</div></div>
    ${sections}`;
  });
}
function assetForm(id){
  assetPhoto="";
  const pre=assetPrefill||{};assetPrefill=null;
  const load=id?sb.from("assets").select("*").eq("id",id).single():Promise.resolve({data:{state:"used",manager:ME.email,...pre}});
  load.then(({data:a})=>{
    assetPhoto=a.image_url||"";
    const prodOpts=DATA.products.map(p=>`<option value="${esc(p.name)}"></option>`).join("");
    const prodName=a.product_id?((DATA.products.find(p=>p.id===a.product_id)||{}).name||""):(pre._prodName||"");
    const stOpts=Object.keys(ASSET_STATE).map(s=>`<option value="${s}" ${a.state===s?"selected":""}>${ASSET_STATE[s][0]}</option>`).join("");
    $("#view").innerHTML=`<div class="card"><h2>${id?"Upraviť":"Nový"} majetok</h2>
      ${a.source_lot||pre.source_lot?`<div class="msg ok">Vzniká presunom zo skladu — po uložení sa kus vyskladní.</div>`:""}
      <label>Produkt z katalógu (nepovinné)</label><input id="as_prod" list="asProdList" value="${esc(prodName)}" placeholder="ak je z katalógu"><datalist id="asProdList">${prodOpts}</datalist>
      <label>Názov (ak nie je z katalógu)</label><input id="as_name" value="${esc(a.name||"")}">
      <div class="row2"><div><label>Sériové číslo</label><input id="as_serial" value="${esc(a.serial||"")}"></div>
      <div><label>Stav</label><select id="as_state">${stOpts}</select></div></div>
      <div class="row2"><div><label>Užívateľ (kto ho má)</label><input id="as_holder" value="${esc(a.holder||"")}" placeholder="napr. M. Beno"></div>
      <div><label>Správca (zodpovedný)</label><input id="as_manager" value="${esc(a.manager||"")}"></div></div>
      <div class="row2"><div><label>Budova / miestnosť</label><input id="as_room" value="${esc(a.room||"")}" placeholder="napr. Zasadačka"></div>
      <div><label>Nadobudnuté dňa</label><input id="as_acq" type="date" value="${esc(a.acquired_at?String(a.acquired_at).slice(0,10):"")}"></div></div>
      <label>Poznámka</label><input id="as_note" value="${esc(a.note||"")}">
      <input id="as_img" type="hidden" value="${esc(a.image_url||"")}">
      <label>Fotka</label><div id="as_imgwrap">${a.image_url?`<img src="${esc(a.image_url)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">`:`<span class="muted">bez fotky</span>`}</div>
      <button class="btn ghost sm" type="button" onclick="assetAddPhoto()">📷 Nahrať fotku</button>
      <input type="hidden" id="as_srclot" value="${esc(a.source_lot||pre.source_lot||"")}">
      <button class="btn green" id="as_save" onclick="assetSave(${id||0})">Uložiť</button>
      <button class="btn ghost" onclick="setTab('assets')">Späť</button><div id="as_msg"></div></div>`;
  });
}
function assetAddPhoto(){const inp=document.createElement("input");inp.type="file";inp.accept="image/*";inp.setAttribute("capture","environment");
  inp.onchange=async()=>{const f=inp.files&&inp.files[0];if(!f)return;try{const blob=await compressImage(f,1200*1024,1600);const url=await uploadPhoto(blob,"assets");assetPhoto=url;$("#as_img").value=url;$("#as_imgwrap").innerHTML=`<img src="${esc(url)}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid var(--line)">`;}catch(e){alert("Nahranie zlyhalo: "+(e.message||e));}};inp.click();}
async function assetSave(id){
  const prodVal=($("#as_prod").value||"").trim();const prod=prodVal?DATA.products.find(p=>(p.name||"").toLowerCase()===prodVal.toLowerCase()):null;
  const srcLot=$("#as_srclot").value?Number($("#as_srclot").value):null;
  const o={product_id:prod?prod.id:null,name:$("#as_name").value.trim()||null,serial:$("#as_serial").value.trim()||null,
    state:$("#as_state").value,holder:$("#as_holder").value.trim()||null,manager:$("#as_manager").value.trim()||null,
    room:$("#as_room").value.trim()||null,acquired_at:$("#as_acq").value||null,note:$("#as_note").value.trim()||null,
    image_url:$("#as_img").value||null,source_lot:srcLot||null,updated_at:new Date().toISOString()};
  if(!o.name&&!o.product_id){$("#as_msg").innerHTML=`<div class="msg err">Zadaj názov alebo vyber produkt.</div>`;return;}
  $("#as_save").disabled=true;
  let err;
  if(id){const r=await sb.from("assets").update(o).eq("id",id);err=r.error;}
  else{const r=await sb.from("assets").insert(o);err=r.error;}
  if(err){$("#as_save").disabled=false;$("#as_msg").innerHTML=`<div class="msg err">${esc(err.message)}</div>`;return;}
  // ak vzniká zo skladu — vyskladni pôvodnú šaržu (pohyb výdaj + zruš/zníž šaržu)
  if(!id&&srcLot){try{
    const {data:lot}=await sb.from("stock_lots").select("*").eq("id",srcLot).single();
    if(lot){await sb.from("stock_movements").insert({type:"vydaj",product_id:lot.product_id,lot_id:lot.id,quantity:1,warehouse_id:lot.warehouse_id,location_id:lot.location_id,purpose:"presun do majetku",note:"→ Majetok"});
      if(lot.track==="unit"||Number(lot.quantity)<=1)await sb.from("stock_lots").delete().eq("id",lot.id);
      else await sb.from("stock_lots").update({quantity:Number(lot.quantity)-1}).eq("id",lot.id);
    }}catch(e){}}
  setTab("assets");
}
// presun zo skladu: vyber skladovú šaržu → predvyplní formulár majetku
async function assetPickFromStock(){
  $("#view").innerHTML=`<div class="card muted">Načítavam skladové položky…</div>`;
  const {data:lots}=await sb.from("stock_lots").select("id,product_id,warehouse_id,serial,quantity,track,status").eq("status","skladom").order("id",{ascending:false}).limit(1000);
  const rows=(lots||[]).map(l=>{const p=DATA.products.find(x=>x.id===l.product_id)||{};const wh=(DATA.warehouses.find(w=>w.id===l.warehouse_id)||{}).name||"";
    return `<tr><td><b>${esc(p.name||"?")}</b>${l.serial?`<div class="psub">SN: ${esc(l.serial)}</div>`:""}</td><td>${esc(wh)}</td><td>${l.track==="unit"?"1 ks":fmtNum(l.quantity)+" ks"}</td>
      <td><button class="btn green sm" onclick="assetFromLot(${l.id})">Presunúť →</button></td></tr>`;}).join("")||`<tr><td colspan="4" class="muted">Sklad je prázdny.</td></tr>`;
  $("#view").innerHTML=`<div class="card"><div class="chosen"><b>Presun zo skladu do majetku</b><button class="btn ghost sm" onclick="setTab('assets')">Späť</button></div>
    <div class="muted" style="margin-bottom:8px">Vyber skladovú položku — vytvorí sa karta majetku a kus sa vyskladní.</div>
    <div class="ptbl-wrap"><table class="ptbl"><thead><tr><th>Produkt</th><th>Sklad</th><th>Množstvo</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
async function assetFromLot(lotId){
  const {data:l}=await sb.from("stock_lots").select("id,product_id,serial").eq("id",lotId).single();
  if(!l)return;const p=DATA.products.find(x=>x.id===l.product_id)||{};
  assetPrefill={product_id:l.product_id,_prodName:p.name||"",serial:l.serial||null,source_lot:l.id,state:"used"};
  assetForm(0);
}
async function assetDetail(id){navHash("assets/"+id);
  const {data:a,error}=await sb.from("assets").select("*").eq("id",id).single();
  if(error){alert(error.message);return;}
  const row=(l,v)=>(v!==null&&v!==undefined&&v!=="")?`<div class="lot"><div class="m">${esc(l)}</div><b>${esc(v)}</b></div>`:"";
  const st=ASSET_STATE[a.state]||[a.state,""];
  $("#view").innerHTML=`<div class="card"><div class="chosen"><div><b>${esc(assetName(a))}</b> <span class="tag ${st[1]}">${esc(st[0])}</span></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">${canWrite()?`<button class="btn ghost sm" onclick="assetForm(${id})">✏️ Upraviť</button>`:""}${canWrite()?`<button class="btn ghost sm" onclick="assetToStock(${id})">↩︎ Vrátiť na sklad</button>`:""}<button class="btn ghost sm" onclick="setTab('assets')">Späť</button></div></div>
    ${a.image_url?`<img src="${esc(a.image_url)}" style="max-width:200px;border-radius:10px;border:1px solid var(--line);margin:6px 0">`:""}
    ${row("Sériové číslo",a.serial)}${row("Užívateľ",a.holder)}${row("Správca",a.manager)}${row("Budova / miestnosť",a.room)}
    ${row("Nadobudnuté",a.acquired_at?String(a.acquired_at).slice(0,10):"")}${row("Poznámka",a.note)}
    ${canDelete()?`<button class="btn red" onclick="assetDelete(${id})" style="margin-top:12px">🗑 Zmazať</button>`:""}</div>`;
}
async function assetDelete(id){if(!confirm("Zmazať túto položku majetku?"))return;const {error}=await sb.from("assets").delete().eq("id",id);if(error){alert(error.message);return;}setTab("assets");}
// vrátenie majetku späť na sklad (vytvorí skladovú šaržu + pohyb príjem)
async function assetToStock(id){
  const {data:a}=await sb.from("assets").select("*").eq("id",id).single();if(!a)return;
  if(!a.product_id){alert("Vrátiť na sklad možno len majetok naviazaný na produkt z katalógu.");return;}
  if(!confirm("Vrátiť "+assetName(a)+" na sklad?"))return;
  const wh=(DATA.warehouses[0]||{}).id||null;
  const {data:lot,error}=await sb.from("stock_lots").insert({product_id:a.product_id,warehouse_id:wh,track:"unit",quantity:1,serial:a.serial||null,status:"skladom",state:a.state==="broken"?"used":(a.state||"used"),note:"vrátené z majetku"}).select("id").single();
  if(error){alert(error.message);return;}
  await sb.from("stock_movements").insert({type:"prijem",product_id:a.product_id,lot_id:lot&&lot.id,quantity:1,warehouse_id:wh,purpose:"vrátenie z majetku",note:"Majetok → sklad"});
  await sb.from("assets").delete().eq("id",id);
  setTab("assets");
}
async function assetExport(){
  const {data}=await sb.from("assets").select("*").order("room");
  const rows=(data||[]).map(a=>[assetName(a),a.serial||"",a.holder||"",a.manager||"",a.room||"",(ASSET_STATE[a.state]||[a.state])[0],a.acquired_at||"",a.note||""]);
  const head=["Položka","Sériové číslo","Užívateľ","Správca","Budova/miestnosť","Stav","Nadobudnuté","Poznámka"];
  const csv=[head,...rows].map(r=>r.map(c=>`"${String(c==null?"":c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download="majetok.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}

// ===== SPRÁVA (admin) — data-driven, bez uploadu =====
let setWh="";
async function renderSettings(){
  if(ME.role!=="admin"){$("#view").innerHTML=`<div class="card"><div class="msg err">Prístup len pre admina.</div></div>`;return;}
  const {data:profs}=await sb.from("profiles").select("id,full_name,role").order("full_name");
  const {data:roles}=await sb.from("roles").select("id,name").order("id");
  const {data:perms}=await sb.from("permissions").select("id,code,module,description").order("module");
  const {data:rperms}=await sb.from("role_permissions").select("role_id,permission_id");
  if(!setWh&&DATA.warehouses[0])setWh=String(DATA.warehouses[0].id);
  const whList=DATA.warehouses.map(w=>`<div class="lot"><b>${esc(w.name)}</b></div>`).join("")||`<div class="muted">—</div>`;
  const whSel=DATA.warehouses.map(w=>`<option value="${w.id}" ${setWh==String(w.id)?"selected":""}>${esc(w.name)}</option>`).join("");
  const locs=locsOf(setWh);
  const locList=locs.map(l=>`<div class="lot" style="display:flex;justify-content:space-between;align-items:center"><div><b>${esc(l.code)}</b> <span class="muted">${esc(l.description||"")}</span></div><button class="btn red sm" onclick="sDelLoc(${l.id})">×</button></div>`).join("")||`<div class="muted">Žiadne pozície.</div>`;
  const cats=DATA.categories.map(c=>`<span class="tag" style="margin:2px">${esc(c.name)}${c.parent_id?" ↳":""}</span>`).join("");
  const topCats=DATA.categories.filter(c=>!c.parent_id);
  ADMIN_ROLES=(roles||[]).map(r=>r.name);
  $("#view").innerHTML=`
  <div class="card"><h2>🏬 Sklady</h2>${whList}
    <label>Nový sklad</label><div class="inline"><input id="s_whname" placeholder="napr. Sklad Košice"><button class="btn green sm" onclick="sAddWh()">Pridať</button></div></div>
  <div class="card"><h2>📍 Pozície v sklade</h2>
    <label>Sklad</label><select id="s_wsel" onchange="setWh=this.value;renderSettings()">${whSel}</select>
    <div style="margin-top:10px">${locList}</div>
    <div class="row2"><div><label>Označenie</label><input id="s_lcode" placeholder="napr. 4 / Kancl"></div><div><label>Popis</label><input id="s_ldesc" placeholder="napr. Rada 4"></div></div>
    <button class="btn green" onclick="sAddLoc()">Pridať pozíciu</button></div>
  <div class="card"><div class="muted">Kategórie a tagy spravuješ na samostatnej stránke <b>🗂️ Kategórie a tagy</b>.</div></div>
  <div class="card" id="userAdmin"><h2>👤 Používatelia</h2><div class="muted">Načítavam…</div></div>
  <div class="card" id="aiCosts"><h2>💰 AI náklady</h2><div class="muted">Načítavam…</div></div>
  ${rolesPermsCard(roles,perms,rperms)}`;
  renderUserAdmin();
  renderAiCosts();
}
// ===== POČÍTADLO AI NÁKLADOV (admin) =====
// ceny USD za 1M tokenov [vstup, výstup]
const AI_PRICES={"claude-haiku-4-5":[1,5],"claude-haiku-4-5-20251001":[1,5],"claude-sonnet-5":[3,15],"claude-sonnet-4-6":[3,15],"claude-opus-4-8":[5,25],"claude-opus-4-7":[5,25]};
function aiRowCost(r){const p=AI_PRICES[r.model]||AI_PRICES["claude-haiku-4-5"];return (r.input_tokens||0)/1e6*p[0]+(r.output_tokens||0)/1e6*p[1];}
async function renderAiCosts(){
  const box=$("#aiCosts");if(!box)return;
  const {data,error}=await sb.from("ai_usage").select("fn,model,input_tokens,output_tokens,created_at").order("created_at",{ascending:false}).limit(5000);
  if(error){box.innerHTML=`<h2>💰 AI náklady</h2><div class="msg err">${esc(error.message)}</div><div class="muted">Spustil si v Supabase <b>supabase_ai_usage.sql</b>?</div>`;return;}
  const rows=data||[];
  const today=new Date().toISOString().slice(0,10),ym=today.slice(0,7);
  let cAll=0,cToday=0,cMonth=0,tokIn=0,tokOut=0;const byFn={};
  rows.forEach(r=>{const c=aiRowCost(r);cAll+=c;tokIn+=r.input_tokens||0;tokOut+=r.output_tokens||0;const d=(r.created_at||"").slice(0,10);if(d===today)cToday+=c;if(d.slice(0,7)===ym)cMonth+=c;const b=byFn[r.fn]=byFn[r.fn]||{n:0,c:0};b.n++;b.c+=c;});
  const usd=v=>"$"+v.toFixed(v<1?4:2);
  const fnLbl={"identify-product":"Rozpoznanie produktu (fotka)","product-specs":"Parametre (AI)","identify-labels":"Kódy zásielky (fotka)"};
  const fnRows=Object.entries(byFn).sort((a,b)=>b[1].c-a[1].c).map(([f,v])=>`<div class="lot" style="display:flex;justify-content:space-between;align-items:center"><span>${esc(fnLbl[f]||f)} <span class="muted">· ${v.n}×</span></span><b>${usd(v.c)}</b></div>`).join("")||`<div class="muted">Zatiaľ žiadne AI volania.</div>`;
  box.innerHTML=`<h2>💰 AI náklady</h2>
    <div class="row2"><div class="lot"><div class="m">Dnes</div><b>${usd(cToday)}</b></div><div class="lot"><div class="m">Tento mesiac</div><b>${usd(cMonth)}</b></div><div class="lot"><div class="m">Celkovo</div><b>${usd(cAll)}</b></div></div>
    <div class="muted" style="margin:6px 0">${rows.length} volaní · ${fmtNum(tokIn)} vstupných + ${fmtNum(tokOut)} výstupných tokenov</div>
    ${fnRows}
    <div class="muted" style="font-size:12px;margin-top:8px">Odhad podľa cenníka modelu. Presné vyúčtovanie v $ je v <b>console.anthropic.com → Usage</b>.</div>`;
}
// ===== SPRÁVA POUŽÍVATEĽOV (admin) — cez edge funkciu admin-users =====
let ADMIN_ROLES=["admin","skladník","technik","visitor","zamestnanec","dočasný","externý"];
let userEditId="",userAddOpen=false;
async function adminUsers(action,body){return await sb.functions.invoke("admin-users",{body:{action,...(body||{})}});}
async function renderUserAdmin(){
  const box=$("#userAdmin");if(!box)return;
  // primárne cez edge funkciu (emaily, posledné prihlásenie, ban); fallback na profiles
  let users=null,fnErr="";
  try{const {data,error}=await adminUsers("list");if(error||(data&&data.error)){fnErr=(data&&data.error)||error.message||"funkcia nedostupná";}else users=data.users;}catch(e){fnErr=String(e.message||e);}
  const roleOpts=(cur)=>ADMIN_ROLES.map(r=>`<option value="${esc(r)}" ${cur===r?"selected":""}>${esc(r)}</option>`).join("");
  const addForm=`<div class="lot" style="background:#f6f8fc">
    <div style="display:flex;justify-content:space-between;align-items:center"><b>➕ Pridať používateľa</b>
      <button class="btn ghost sm" onclick="userAddOpen=!userAddOpen;renderUserAdmin()">${userAddOpen?"Zavrieť":"Otvoriť"}</button></div>
    ${userAddOpen?`<div style="margin-top:8px">
      <div class="row2"><div><label>E-mail</label><input id="ua_email" placeholder="meno@firma.sk"></div>
      <div><label>Meno</label><input id="ua_name"></div></div>
      <div class="row2"><div><label>Rola</label><select id="ua_role">${roleOpts("zamestnanec")}</select></div>
      <div><label>Pozícia</label><input id="ua_pos" placeholder="napr. skladník"></div></div>
      <label>Spôsob vytvorenia</label>
      <div class="inline" style="gap:10px;flex-wrap:wrap;margin-bottom:6px">
        <label class="chk" style="display:flex;gap:6px;align-items:center"><input type="radio" name="ua_mode" value="invite" checked onchange="ua_toggleMode()"> Pozvánka e-mailom (bez hesla)</label>
        <label class="chk" style="display:flex;gap:6px;align-items:center"><input type="radio" name="ua_mode" value="create" onchange="ua_toggleMode()"> Zadať dočasné heslo</label></div>
      <div id="ua_pwwrap" class="hide"><label>Dočasné heslo (min. 6 znakov)</label><input id="ua_pw" type="text" placeholder="používateľ si ho po prihlásení zmení"></div>
      <button class="btn green" onclick="userCreate()">Vytvoriť používateľa</button>
      <div id="ua_msg" style="margin-top:6px"></div>
      <div class="muted" style="margin-top:6px">Pozvánka vyžaduje nastavený e-mail (SMTP) v Supabase. Heslo do appky nezadávaj ty za používateľa — nech si ho zmení sám.</div>
    </div>`:""}
  </div>`;
  if(!users){
    // fallback: aspoň zoznam z profiles + role (bez emailov/ban)
    const {data:profs}=await sb.from("profiles").select("id,full_name,role,position,phone,note,is_active").order("full_name");
    const rows=(profs||[]).map(p=>`<div class="lot" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div><b>${esc(p.full_name||p.id.slice(0,8))}</b>${p.position?`<div class="psub">${esc(p.position)}</div>`:""}${!p.is_active?` <span class="tag r">zablokovaný</span>`:""}</div>
      <select onchange="userSetRole('${p.id}',this.value)">${roleOpts(p.role)}</select></div>`).join("")||`<div class="muted">—</div>`;
    box.innerHTML=`<h2>👤 Používatelia</h2>
      <div class="msg" style="background:#fff4e5;color:#a8630c">Plná správa (pridať/ban/zmazať/emaily) vyžaduje nasadenú edge funkciu <b>admin-users</b>.${fnErr?`<br><span class="muted">Detail: ${esc(fnErr)}</span>`:""}</div>
      ${addForm}${rows}
      <div class="muted" style="margin-top:6px">Zmena roly sa prejaví po ďalšom prihlásení používateľa.</div>`;
    return;
  }
  const fmtDT=s=>s?String(s).replace("T"," ").slice(0,16):"—";
  const rows=users.map(u=>{const p=u.profile||{};const banned=!!u.banned_until&&u.banned_until!=="none";
    if(userEditId===u.id){
      return `<div class="lot" style="background:#eef4ff">
        <b>${esc(u.email)}</b>
        <div class="row2" style="margin-top:6px"><div><label>Meno</label><input id="ue_name" value="${esc(p.full_name||"")}"></div>
        <div><label>Pozícia</label><input id="ue_pos" value="${esc(p.position||"")}"></div></div>
        <div class="row2"><div><label>Telefón</label><input id="ue_phone" value="${esc(p.phone||"")}"></div>
        <div><label>Rola</label><select id="ue_role">${roleOpts(p.role)}</select></div></div>
        <label>Poznámka</label><input id="ue_note" value="${esc(p.note||"")}">
        <div class="inline" style="gap:6px;margin-top:8px"><button class="btn green sm" onclick="userSaveInfo('${u.id}')">💾 Uložiť</button>
        <button class="btn ghost sm" onclick="userEditId='';renderUserAdmin()">Zrušiť</button></div></div>`;
    }
    return `<div class="lot" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="min-width:200px"><b>${esc(p.full_name||u.email)}</b> ${banned?`<span class="tag r">zablokovaný</span>`:`<span class="tag g">aktívny</span>`}
        <div class="psub">${esc(u.email)}${p.position?" · "+esc(p.position):""}${p.phone?" · "+esc(p.phone):""}</div>
        <div class="psub">prihlásenie: ${fmtDT(u.last_sign_in_at)}</div>${p.note?`<div class="psub">📝 ${esc(p.note)}</div>`:""}</div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
        <select onchange="userSetRole('${u.id}',this.value)">${roleOpts(p.role)}</select>
        <button class="btn ghost sm" onclick="userEditId='${u.id}';renderUserAdmin()">✏️ Info</button>
        <button class="btn ghost sm" onclick="userBan('${u.id}',${banned?"true":"false"})">${banned?"✓ Odblokovať":"🚫 Zablokovať"}</button>
        <button class="btn red sm" onclick="userDelete('${u.id}','${esc(u.email)}')">🗑</button></div></div>`;}).join("");
  box.innerHTML=`<h2>👤 Používatelia <span class="muted" style="font-weight:400">${users.length}</span></h2>
    ${addForm}${rows}
    <div class="muted" style="margin-top:6px">Zmena roly sa prejaví po ďalšom prihlásení používateľa.</div>`;
}
function ua_toggleMode(){const m=document.querySelector('input[name="ua_mode"]:checked');const w=$("#ua_pwwrap");if(w)w.classList.toggle("hide",!(m&&m.value==="create"));}
async function userCreate(){
  const email=($("#ua_email").value||"").trim();if(!email){$("#ua_msg").innerHTML=`<div class="msg err">Zadaj e-mail.</div>`;return;}
  const mode=(document.querySelector('input[name="ua_mode"]:checked')||{}).value||"invite";
  const payload={action:mode,email,full_name:($("#ua_name").value||"").trim(),role:$("#ua_role").value,position:($("#ua_pos").value||"").trim()};
  if(mode==="create")payload.password=$("#ua_pw").value||"";
  $("#ua_msg").innerHTML=`<div class="muted">Vytváram…</div>`;
  const {data,error}=await adminUsers(payload.action,payload);
  if(error||(data&&data.error)){$("#ua_msg").innerHTML=`<div class="msg err">${esc((data&&data.error)||error.message)}</div>`;return;}
  userAddOpen=false;renderUserAdmin();
}
async function userSetRole(id,role){const {data,error}=await adminUsers("setRole",{id,role});if(error||(data&&data.error)){alert((data&&data.error)||error.message);}}
async function userBan(id,isBanned){const act=isBanned?"unban":"ban";if(!isBanned&&!confirm("Zablokovať prístup tomuto používateľovi?"))return;
  const {data,error}=await adminUsers(act,{id});if(error||(data&&data.error)){alert((data&&data.error)||error.message);return;}renderUserAdmin();}
async function userDelete(id,email){if(!confirm("Natrvalo zmazať používateľa "+email+"? Túto akciu nemožno vrátiť."))return;
  const {data,error}=await adminUsers("delete",{id});if(error||(data&&data.error)){alert((data&&data.error)||error.message);return;}renderUserAdmin();}
async function userSaveInfo(id){
  const o={full_name:($("#ue_name").value||"").trim()||null,position:($("#ue_pos").value||"").trim()||null,phone:($("#ue_phone").value||"").trim()||null,note:($("#ue_note").value||"").trim()||null,role:$("#ue_role").value};
  const {error}=await sb.from("profiles").update(o).eq("id",id);
  if(error){alert(error.message);return;}userEditId="";renderUserAdmin();
}
// matica rolí × oprávnení (admin ich mení)
function rolesPermsCard(roles,perms,rperms){
  if(!roles||!roles.length||!perms||!perms.length)return `<div class="card"><h2>🔑 Role a oprávnenia</h2><div class="muted">Nenačítali sa role/oprávnenia (spustil si supabase_auth_rls.sql?).</div></div>`;
  const has=(rid,pid)=>(rperms||[]).some(x=>x.role_id===rid&&x.permission_id===pid);
  const mods={};perms.forEach(p=>{(mods[p.module||"ostatné"]=mods[p.module||"ostatné"]||[]).push(p);});
  let rows="";
  Object.keys(mods).forEach(mod=>{
    rows+=`<tr><td colspan="${roles.length+1}" style="background:#f3f6fb;font-weight:700;font-size:12px;text-transform:uppercase;color:#7a8aa5">${esc(mod)}</td></tr>`;
    mods[mod].forEach(p=>{rows+=`<tr><td>${esc(p.description||p.code)}<div class="psub">${esc(p.code)}</div></td>`+
      roles.map(r=>`<td class="r"><input type="checkbox" ${has(r.id,p.id)?"checked":""} ${r.name==="admin"?"disabled title='admin má vždy všetko'":""} onclick="setRolePerm(${r.id},${p.id},this.checked)"></td>`).join("")+`</tr>`;});
  });
  return `<div class="card"><h2>🔑 Role a oprávnenia</h2><div class="muted" style="margin-bottom:8px">Zaškrtni, ktoré oprávnenia má daná rola. Prejaví sa po ďalšom prihlásení používateľa.</div>
    <div class="ptbl-wrap"><table class="ptbl"><thead><tr><th>Oprávnenie</th>${roles.map(r=>`<th class="r">${esc(r.name)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
async function setRolePerm(roleId,permId,on){
  if(on){const {error}=await sb.from("role_permissions").insert({role_id:roleId,permission_id:permId});if(error&&!/duplicate/i.test(error.message))alert(error.message);}
  else{const {error}=await sb.from("role_permissions").delete().eq("role_id",roleId).eq("permission_id",permId);if(error)alert(error.message);}
}
async function sAddWh(){const n=$("#s_whname").value.trim();if(!n)return;const {error}=await sb.from("warehouses").insert({name:n});if(error){alert(error.message);return;}await loadData();setWh="";renderSettings();}
async function sAddLoc(){const code=$("#s_lcode").value.trim();if(!code)return;const desc=$("#s_ldesc").value.trim()||null;const {error}=await sb.from("warehouse_locations").insert({warehouse_id:Number(setWh),code,description:desc});if(error){alert(error.message);return;}await loadData();renderSettings();}
async function sDelLoc(id){
  // kontrola obsadenosti
  const {count}=await sb.from("stock_lots").select("id",{count:"exact",head:true}).eq("location_id",id);
  if(count){alert("Na pozícii je "+count+" položiek — najprv ich presuň/vydaj.");return;}
  if(!confirm("Zmazať pozíciu?"))return;
  const {error}=await sb.from("warehouse_locations").delete().eq("id",id);if(error){alert(error.message);return;}await loadData();renderSettings();}
async function sAddCat(){const n=$("#s_catname").value.trim();if(!n)return;const par=$("#s_catparent").value?Number($("#s_catparent").value):null;const {error}=await sb.from("categories").insert({name:n,parent_id:par});if(error){alert(error.message);return;}await loadData();renderSettings();}
async function sSetRole(id,role){const {error}=await sb.from("profiles").update({role}).eq("id",id);if(error){alert(error.message);renderSettings();}}

// ===== KATEGÓRIE A TAGY (správa) =====
function renderCats(){
  if(ME.role!=="admin"){$("#view").innerHTML=`<div class="card"><div class="msg err">Prístup len pre admina.</div></div>`;return;}
  const tree=catSorted();
  const catSelOpts=tree.map(({c,depth})=>`<option value="${c.id}">${"   ".repeat(depth)}${depth?"↳ ":""}${esc(c.name)}</option>`).join("");
  const parentOpts=`<option value="">— hlavná (bez rodiča) —</option>`+catSelOpts;
  const prodCount={};DATA.products.forEach(p=>{if(p.category_id!=null)prodCount[p.category_id]=(prodCount[p.category_id]||0)+1;});
  const cbtn="padding:3px 9px;font-size:12px;margin:0;width:auto;line-height:1.4";
  const rows=tree.map(({c,depth})=>{const cnt=prodCount[c.id]||0;const kids=catChildren(c.id).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:2px 8px;border-bottom:1px solid var(--line)">
      <div style="padding-left:${depth*16}px;font-size:13px">${depth?"↳ ":""}<b>${esc(c.name)}</b> <span class="muted">· ${cnt} prod.${kids?" · "+kids+" podkat.":""}</span></div>
      <div style="white-space:nowrap;display:flex;gap:5px">
        <button class="btn ghost" style="${cbtn}" onclick="catAddChild(${c.id})">＋ podkategória</button>
        <button class="btn ghost" style="${cbtn}" onclick="catRename(${c.id})">✏️</button>
        <button class="btn red" style="${cbtn}" onclick="catDelete(${c.id})">🗑</button></div></div>`;}).join("")||`<div class="muted">Žiadne kategórie.</div>`;
  const tags=DATA.tags.map(t=>{const cnt=DATA.ptags.filter(x=>x.tag_id===t.id).length;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 8px;border-bottom:1px solid var(--line)"><div style="font-size:13px">#${esc(t.name)} <span class="muted">· ${cnt}×</span></div>
      <div style="display:flex;gap:5px"><button class="btn ghost" style="${cbtn}" onclick="tagRename(${t.id})">✏️</button><button class="btn red" style="${cbtn}" onclick="tagDelete(${t.id})">🗑</button></div></div>`;}).join("")||`<div class="muted">Žiadne tagy.</div>`;
  const tagSelOpts=DATA.tags.map(t=>`<option value="${t.id}">#${esc(t.name)}</option>`).join("");
  if(!catAttrSel&&tree.length)catAttrSel=String(tree[0].c.id);
  const caCatOpts=tree.map(({c,depth})=>`<option value="${c.id}" ${catAttrSel==String(c.id)?"selected":""}>${"   ".repeat(depth)}${depth?"↳ ":""}${esc(c.name)}</option>`).join("");
  const caList=caDefsOwn(catAttrSel).map(d=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 8px;border-bottom:1px solid var(--line)"><div style="font-size:13px"><b>${esc(d.label)}</b> <span class="muted">· ${esc(d.type)}${d.unit?" · "+esc(d.unit):""}${d.options&&d.options.length?" · ("+d.options.map(esc).join(" / ")+")":""}</span></div><button class="btn red" style="${cbtn}" onclick="caDel(${d.id})">🗑</button></div>`).join("")||`<div class="muted">Pre túto kategóriu zatiaľ žiadne parametre.</div>`;
  $("#view").innerHTML=`
  <div class="card"><h2>🗂️ Kategórie a podkategórie</h2>
    <div style="margin:8px 0">${rows}</div>
    <label>Nová hlavná kategória</label><div class="inline"><input id="c_new" placeholder="napr. Komponenty"><button class="btn green sm" onclick="catAddTop()">Pridať</button></div></div>
  <div class="card"><h4>Presunúť kategóriu (zmeniť rodiča)</h4>
    <div class="row2"><div><label>Kategória</label><select id="c_mv">${catSelOpts}</select></div>
    <div><label>Nový rodič</label><select id="c_mvp">${parentOpts}</select></div></div>
    <button class="btn" onclick="catMove()">Presunúť</button></div>
  <div class="card"><h4>Zlúčiť kategórie</h4><div class="muted">Produkty aj podkategórie zo zdrojovej sa presunú do cieľovej a zdrojová sa zmaže.</div>
    <div class="row2"><div><label>Zdroj</label><select id="c_src">${catSelOpts}</select></div>
    <div><label>Cieľ</label><select id="c_dst">${catSelOpts}</select></div></div>
    <button class="btn red" onclick="catMerge()">Zlúčiť</button></div>
  <div class="card"><h2>⚙️ Parametre kategórie</h2><div class="muted">Polia, ktoré sa zobrazia pri produkte danej kategórie (podkategórie ich dedia).</div>
    <label>Kategória</label><select id="ca_cat" onchange="catAttrSel=this.value;renderCats()">${caCatOpts}</select>
    <div style="margin:8px 0">${caList}</div>
    <div class="row2"><div><label>Názov parametra</label><input id="ca_label" placeholder="napr. Hashrate"></div>
    <div><label>Typ</label><select id="ca_type"><option value="text">text</option><option value="number">číslo</option><option value="enum">výber z možností</option></select></div></div>
    <div class="row2"><div><label>Jednotka (nepovinné)</label><input id="ca_unit" placeholder="napr. W, GB, TH/s"></div>
    <div><label>Možnosti pre výber (oddeľ čiarkou)</label><input id="ca_opts" placeholder="SSD, HDD, NVMe"></div></div>
    <button class="btn green" onclick="caAdd()">+ Pridať parameter</button></div>
  <div class="card"><h2>🏷️ Tagy</h2><div style="margin:8px 0">${tags}</div>
    <label>Nový tag</label><div class="inline"><input id="t_new" placeholder="napr. gaming"><button class="btn green sm" onclick="tagAdd()">Pridať</button></div></div>
  <div class="card"><h4>Zlúčiť tagy</h4><div class="muted">Priradenia zo zdrojového tagu prejdú na cieľový a zdroj sa zmaže.</div>
    <div class="row2"><div><label>Zdroj</label><select id="t_src">${tagSelOpts}</select></div>
    <div><label>Cieľ</label><select id="t_dst">${tagSelOpts}</select></div></div>
    <button class="btn red" onclick="tagMerge()">Zlúčiť</button></div>`;
}
let catAttrSel="";
function caDefsOwn(cid){return DATA.attrDefs.filter(d=>String(d.category_id)===String(cid)).sort((a,b)=>((a.sort_order||0)-(b.sort_order||0)));}
function attrKey(s){const k=normName(s).replace(/\s+/g,"_").slice(0,40);return k||("p"+Date.now());}
async function caAdd(){const cid=$("#ca_cat").value;if(!cid){alert("Vyber kategóriu.");return;}
  const label=$("#ca_label").value.trim();if(!label){alert("Zadaj názov parametra.");return;}
  const type=$("#ca_type").value;const unit=$("#ca_unit").value.trim()||null;
  const opts=type==="enum"?$("#ca_opts").value.split(",").map(s=>s.trim()).filter(Boolean):null;
  if(type==="enum"&&(!opts||!opts.length)){alert("Pre typ výber zadaj možnosti oddelené čiarkou.");return;}
  const {error}=await sb.from("attribute_defs").insert({category_id:Number(cid),attr_key:attrKey(label),label,type,unit,options:opts,is_filter:true,sort_order:caDefsOwn(cid).length+1});
  if(error){alert(error.message);return;}await loadData();renderCats();}
async function caDel(id){if(!confirm("Zmazať parameter? Odstránia sa aj jeho hodnoty pri produktoch."))return;const {error}=await sb.from("attribute_defs").delete().eq("id",id);if(error){alert(error.message);return;}await loadData();renderCats();}
async function catAddTop(){const n=$("#c_new").value.trim();if(!n)return;const {error}=await sb.from("categories").insert({name:n,parent_id:null});if(error){alert(error.message);return;}await loadData();renderCats();}
async function catAddChild(pid){const n=prompt("Názov podkategórie:");if(!n||!n.trim())return;const {error}=await sb.from("categories").insert({name:n.trim(),parent_id:pid});if(error){alert(error.message);return;}await loadData();renderCats();}
async function catRename(id){const c=DATA.categories.find(x=>x.id===id);const n=prompt("Nový názov kategórie:",c?c.name:"");if(!n||!n.trim())return;const {error}=await sb.from("categories").update({name:n.trim()}).eq("id",id);if(error){alert(error.message);return;}await loadData();renderCats();}
async function catMove(){const id=Number($("#c_mv").value);const par=$("#c_mvp").value?Number($("#c_mvp").value):null;
  if(par===id){alert("Kategória nemôže byť rodičom sama sebe.");return;}
  if(par&&catDesc(id).has(par)){alert("Nemôžeš presunúť kategóriu do vlastnej podkategórie.");return;}
  const {error}=await sb.from("categories").update({parent_id:par}).eq("id",id);if(error){alert(error.message);return;}await loadData();renderCats();}
async function catDelete(id){
  const c=DATA.categories.find(x=>x.id===id);const kids=catChildren(id);const cnt=DATA.products.filter(p=>p.category_id===id).length;
  if(kids.length){alert('Kategória „'+(c?c.name:id)+'" má podkategórie — najprv ich presuň, zmaž alebo zlúč.');return;}
  if(cnt){if(!confirm(cnt+' produktov sa presunie do nadradenej kategórie a „'+(c?c.name:id)+'" sa zmaže. Pokračovať?'))return;
    await sb.from("products").update({category_id:c?c.parent_id:null}).eq("category_id",id);}
  else if(!confirm('Zmazať kategóriu „'+(c?c.name:id)+'"?'))return;
  const {error}=await sb.from("categories").delete().eq("id",id);if(error){alert(error.message);return;}await loadData();renderCats();}
async function catMerge(){const src=Number($("#c_src").value),dst=Number($("#c_dst").value);
  if(!src||!dst||src===dst){alert("Vyber dve rôzne kategórie.");return;}
  if(catDesc(src).has(dst)){alert("Cieľ nesmie byť podkategóriou zdroja.");return;}
  const s=DATA.categories.find(x=>x.id===src),d=DATA.categories.find(x=>x.id===dst);
  if(!confirm('Zlúčiť „'+(s?s.name:src)+'" do „'+(d?d.name:dst)+'"?'))return;
  await sb.from("products").update({category_id:dst}).eq("category_id",src);
  await sb.from("categories").update({parent_id:dst}).eq("parent_id",src);
  const {error}=await sb.from("categories").delete().eq("id",src);if(error){alert(error.message);return;}await loadData();renderCats();}
async function tagAdd(){const n=$("#t_new").value.trim();if(!n)return;if(DATA.tags.find(t=>t.name.toLowerCase()===n.toLowerCase())){alert("Taký tag už existuje.");return;}const {error}=await sb.from("tags").insert({name:n});if(error){alert(error.message);return;}await loadData();renderCats();}
async function tagRename(id){const t=DATA.tags.find(x=>x.id===id);const n=prompt("Nový názov tagu:",t?t.name:"");if(!n||!n.trim())return;const {error}=await sb.from("tags").update({name:n.trim()}).eq("id",id);if(error){alert(error.message);return;}await loadData();renderCats();}
async function tagDelete(id){const t=DATA.tags.find(x=>x.id===id);if(!confirm('Zmazať tag #'+(t?t.name:id)+'?'))return;await sb.from("product_tags").delete().eq("tag_id",id);const {error}=await sb.from("tags").delete().eq("id",id);if(error){alert(error.message);return;}await loadData();renderCats();}
async function tagMerge(){const src=Number($("#t_src").value),dst=Number($("#t_dst").value);
  if(!src||!dst||src===dst){alert("Vyber dva rôzne tagy.");return;}
  const s=DATA.tags.find(x=>x.id===src),d=DATA.tags.find(x=>x.id===dst);
  if(!confirm('Zlúčiť #'+(s?s.name:src)+' do #'+(d?d.name:dst)+'?'))return;
  const dstProds=new Set(DATA.ptags.filter(x=>x.tag_id===dst).map(x=>x.product_id));
  const dup=DATA.ptags.filter(x=>x.tag_id===src&&dstProds.has(x.product_id)).map(x=>x.product_id);
  for(const pid of dup){await sb.from("product_tags").delete().eq("tag_id",src).eq("product_id",pid);}
  await sb.from("product_tags").update({tag_id:dst}).eq("tag_id",src);
  const {error}=await sb.from("tags").delete().eq("id",src);if(error){alert(error.message);return;}await loadData();renderCats();}

// ===== QR KÓDY — zásobník na tlač =====
let qrLast=[]; // [{code,label}]
const QR_FIRMS=[{name:"OneMiners",web:"https://oneminers.com"},{name:"Firma 2",web:"https://firma2.example"},{name:"Firma 3",web:"https://firma3.example"}];
function renderQR(){
  if(!canWrite()){$("#view").innerHTML=`<div class="card"><div class="msg err">QR kódy môže generovať user/admin.</div></div>`;return;}
  const prodOptsQ=DATA.products.map(p=>`<option value="${esc(p.name)}"></option>`).join("");
  $("#view").innerHTML=`
  <div class="card noprint"><h2>QR kódy — zásobník na tlač</h2>
    <div class="muted">Naskladaj kódy do zásobníka a vytlač ich naraz. Kódy sú dlhé unikátne reťazce — nikdy sa nezopakujú.</div>
    <h4 style="margin-top:12px">Nastavenie tlače</h4>
    <div class="row2"><div><label>Veľkosť QR</label><select id="q_size" onchange="qrRenderSheet()"><option value="2">2×2 cm</option><option value="3" selected>3×3 cm</option><option value="4">4×4 cm</option></select></div>
    <div><label>Rovnakých na kód</label><select id="q_dupes" onchange="qrRenderSheet()"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></div></div>
    <div class="row2" style="margin-top:8px"><div><label>Firma (značka na štítku)</label><select id="q_firm" onchange="qrFirmUI()"><option value="-1">— bez firmy —</option>${QR_FIRMS.map((c,i)=>`<option value="${i}">${esc(c.name)}</option>`).join("")}</select></div>
    <div><label>Kódovať QR ako</label><select id="q_web" onchange="qrRenderSheet()"><option value="0">interný kód (na skenovanie)</option><option value="1">web odkaz (externý vidí web firmy)</option></select></div></div>
    <label>Web firmy (do QR pre externých)</label><input id="q_firmurl" placeholder="napr. https://www.kentino.com" oninput="qrRenderSheet()">
    <div class="muted" style="margin-top:2px">Web-QR = web/i/KÓD → externý po naskenovaní vidí vašu stránku, interný skener rozpozná kód.</div>
    <label class="chk" style="display:flex;align-items:center;gap:8px;margin-top:8px"><input type="checkbox" id="q_cut" checked onchange="qrRenderSheet()"> Rezacie krížiky medzi kódmi</label>
  </div>
  <div class="card noprint"><h4>Pridať do zásobníka</h4>
    <div class="row2"><div><label>Počet (bez produktu)</label><input id="q_count" type="number" min="1" max="300" value="12"></div>
    <div><label>Predpona (nepovinné)</label><input id="q_prefix" value="" placeholder="napr. K- (voliteľné)"></div></div>
    <button class="btn ghost sm" onclick="qrAddGeneric()">+ Pridať kódy</button>
    <hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
    <div class="muted">Ďalšia možnosť — QR viazané na konkrétny produkt:</div>
    <div class="row2"><div><label>Produkt (hľadaj)</label><input id="q_prod" list="qProdList" placeholder="napíš názov produktu…"><datalist id="qProdList">${prodOptsQ}</datalist></div>
    <div><label>Počet pre produkt</label><input id="q_pcount" type="number" min="1" max="100" value="5"></div></div>
    <button class="btn ghost sm" onclick="qrAddProduct()">+ Pridať pre produkt</button>
  </div>
  <div class="card noprint"><h4>Zásobník</h4><div id="q_queue" class="muted"></div>
    <div class="row2" style="margin-top:8px"><button class="btn green" onclick="qrRenderSheet()">🖨 Pripraviť tlač</button><button class="btn ghost" onclick="qrClearQueue()">Vyprázdniť zásobník</button></div></div>
  <div class="card noprint"><h4>Údržba</h4><div id="q_freecnt" class="muted"></div>
    <div class="row2" style="margin-top:8px"><button class="btn ghost" onclick="qrPrintFree()">Načítať voľné kódy</button><button class="btn red" onclick="qrDeleteFree()">🗑 Premazať nepoužité</button></div></div>
  <div class="noprint" id="q_actions"></div>
  <div id="q_sheet"></div>`;
  qrRenderQueue();qrFreeCount();
}
async function qrFreeCount(){const {count}=await sb.from("qr_codes").select("id",{count:"exact",head:true}).eq("status","free");const el=$("#q_freecnt");if(el)el.textContent="Voľných (nepriradených) kódov v systéme: "+(count??0);}
function randCode(){const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";const arr=new Uint32Array(10);crypto.getRandomValues(arr);let s="";for(let i=0;i<10;i++)s+=a[arr[i]%a.length];return s;}
function qrImg(t,px){return "https://api.qrserver.com/v1/create-qr-code/?size="+px+"x"+px+"&margin=0&data="+encodeURIComponent(t);}
function qrFirmUI(){const f=$("#q_firm")?QR_FIRMS[Number($("#q_firm").value)]:null;const u=$("#q_firmurl");if(u&&f&&f.web&&!u.value)u.value=f.web;qrRenderSheet();}
async function qrAddGeneric(){
  const n=Math.max(1,Math.min(300,Number($("#q_count").value)||12));const prefix=($("#q_prefix").value||"").trim();
  const batch=new Date().toISOString().slice(0,16).replace("T"," ");
  const rows=[];for(let i=0;i<n;i++)rows.push({code:prefix+randCode(),status:"free",batch});
  const {data,error}=await sb.from("qr_codes").insert(rows).select("code");
  if(error){alert("Chyba: "+error.message);return;}
  (data||rows).forEach(r=>qrLast.push({code:r.code,label:""}));qrRenderQueue();qrFreeCount();
}
async function qrAddProduct(){
  const val=($("#q_prod").value||"").trim();
  const p=DATA.products.find(x=>String(x.id)===val)||DATA.products.find(x=>(x.name||"").toLowerCase()===val.toLowerCase());
  if(!p){alert("Vyber existujúci produkt (napíš názov a vyber z ponuky).");return;}
  const n=Math.max(1,Math.min(100,Number($("#q_pcount").value)||5));const prefix="";
  const batch=new Date().toISOString().slice(0,16).replace("T"," ");
  const rows=[];for(let i=0;i<n;i++)rows.push({code:prefix+randCode(),status:"free",batch,product_id:pid,label:p.name});
  const {data,error}=await sb.from("qr_codes").insert(rows).select("code");
  if(error){alert("Chyba: "+error.message);return;}
  (data||rows).forEach(r=>qrLast.push({code:r.code,label:p.name}));qrRenderQueue();qrFreeCount();
}
function qrRenderQueue(){const el=$("#q_queue");if(!el)return;
  if(!qrLast.length){el.textContent="Zásobník je prázdny.";$("#q_sheet").innerHTML="";$("#q_actions").innerHTML="";return;}
  const grp={};qrLast.forEach(x=>{const k=x.label||"— bez produktu —";grp[k]=(grp[k]||0)+1;});
  el.innerHTML="V zásobníku: <b>"+qrLast.length+"</b> kódov<br>"+Object.entries(grp).map(([k,v])=>`${v}× ${esc(k)}`).join("<br>");}
function qrClearQueue(){qrLast=[];qrRenderQueue();}
async function qrPrintFree(){
  const {data,error}=await sb.from("qr_codes").select("code,label").eq("status","free").order("id").limit(1000);
  if(error){alert(error.message);return;}
  if(!data||!data.length){alert("Žiadne voľné kódy.");return;}
  qrLast=data.map(r=>({code:r.code,label:r.label||""}));qrRenderQueue();qrRenderSheet();
}
async function qrDeleteFree(){
  if(!confirm("Premazať VŠETKY nepriradené (voľné) QR kódy? Použi len ak si ich ešte nevytlačil/nenalepil."))return;
  const {error}=await sb.from("qr_codes").delete().eq("status","free");
  if(error){alert(error.message);return;}
  qrLast=[];qrRenderQueue();qrFreeCount();
}
function qrRenderSheet(){
  if(!qrLast.length){$("#q_sheet").innerHTML="";$("#q_actions").innerHTML="";return;}
  const cm=Number($("#q_size").value)||3;const w=cm*10;
  const dupes=Math.max(1,Number($("#q_dupes").value)||1);
  const cut=$("#q_cut")&&$("#q_cut").checked;
  const firm=$("#q_firm")?QR_FIRMS[Number($("#q_firm").value)]:null;
  const firmUrl=(($("#q_firmurl")&&$("#q_firmurl").value)||(firm&&firm.web)||"").trim().replace(/\/+$/,"");
  const asWeb=$("#q_web")&&$("#q_web").value==="1"&&firmUrl;
  const cells=[];
  qrLast.forEach(x=>{const data=asWeb?(firmUrl+"/i/"+x.code):x.code;for(let d=0;d<dupes;d++)cells.push(`<div class="qcell${cut?" cutx":""}" style="width:${w}mm"><img src="${qrImg(data,300)}" style="width:${w}mm;height:${w}mm"><div class="qc">${x.label?"<b>"+esc(x.label)+"</b><br>":""}${esc(x.code)}${firm?"<br><span style='color:#888'>"+esc(firm.name)+"</span>":""}</div></div>`);});
  $("#q_actions").innerHTML=`<button class="btn green" onclick="window.print()">🖨 Tlačiť (${cells.length} ks)</button>`;
  $("#q_sheet").innerHTML=`<div class="qsheet">${cells.join("")}</div>`;
}
// ===== katalóg: skenuj a pridaj produkt =====
function catalogScan(){openScan(async code=>{
  lastScanCode=code;
  const hit=DATA.products.find(p=>(p.sku||"").toLowerCase()===code.toLowerCase());
  if(hit){prodForm(hit.id);return;} // už existuje -> otvor na úpravu (žiadny duplikát)
  let res=null;try{const {data,error}=await sb.functions.invoke("lookup-barcode",{body:{code}});if(!error)res=data;}catch(e){}
  if(res&&res.found)prodForm(0,{name:res.name||"",brand:res.brand||"",sku:code});
  else prodForm(0,{sku:code});
});}

// štart
$("#li_pass").addEventListener("keydown",e=>{if(e.key==="Enter")doLogin();});
init();
