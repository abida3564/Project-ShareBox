(function(){
'use strict';
const DBKEY='sharebox_db_v3', SESSION='sharebox_session_v3';
const seed={users:[],products:[],notifications:[]};
function db(){try{return Object.assign({},seed,JSON.parse(localStorage.getItem(DBKEY)||'{}'));}catch(e){return structuredClone(seed)}}
function save(x){localStorage.setItem(DBKEY,JSON.stringify(x)); localStorage.setItem('sharebox_sync',String(Date.now())); try{new BroadcastChannel('sharebox-live').postMessage({type:'sync'});}catch(e){}}
function session(){try{return JSON.parse(localStorage.getItem(SESSION)||'null')}catch(e){return null}}
function setSession(v){v?localStorage.setItem(SESSION,JSON.stringify(v)):localStorage.removeItem(SESSION)}
function initials(n){return (n||'User').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}
function currentUser(){const s=session(),d=db();return s&&d.users.find(u=>u.id===s.userId)}
function addNotification(text,userId){const d=db();d.notifications.unshift({id:crypto.randomUUID(),text,userId:userId||null,createdAt:new Date().toISOString(),read:false});d.notifications=d.notifications.slice(0,50);save(d)}
function money(v){return '৳'+Number(v||0).toLocaleString('en-US')}
window.ShareBox={db,save,session,setSession,currentUser,initials,addNotification,money};

const path=location.pathname.split('/').pop()||'index.html';
const publicPages=['index.html','sharebox-auth.html'];
if(!publicPages.includes(path) && !session()) location.replace('sharebox-auth.html?next='+encodeURIComponent(path+location.hash));

function applyUser(){const u=currentUser(); if(!u)return;
 const exactName=(u.name||'User').trim();
 document.querySelectorAll('.avatar').forEach(el=>el.textContent=initials(exactName));
 document.querySelectorAll('.pfp').forEach(el=>el.textContent=initials(exactName));
 document.querySelectorAll('.big-avatar').forEach(el=>{if(el.firstChild)el.firstChild.nodeValue=initials(exactName);});
 document.querySelectorAll('.profile-name h1').forEach(el=>{const tick=el.querySelector('.verify-tick'); if(el.firstChild)el.firstChild.nodeValue=exactName+' '; if(tick&&!u.verified)tick.remove();});
 document.querySelectorAll('.pmenu .ph strong,[data-user-name]').forEach(el=>el.textContent=exactName);
 const greeting=document.querySelector('.greet h1');
 if(greeting){const wave=greeting.querySelector('.wave');greeting.textContent='';if(wave)greeting.appendChild(wave);greeting.appendChild(document.createTextNode(' Good morning, '+exactName));}
 document.querySelectorAll('.owner').forEach(el=>{el.innerHTML=el.innerHTML.replace(/Tahmid A\./g,escapeHtml(exactName))});
 const meta=document.querySelector('.profile-name .meta');
 if(meta){
   const first=meta.querySelector('.badge'); if(first) first.lastChild.nodeValue=(u.department||'Student')+' · '+(u.academicYear||'Campus member');
   if(u.studentId&&!meta.querySelector('[data-student-id]')){const b=document.createElement('span');b.className='badge badge-neutral';b.dataset.studentId='1';b.textContent='Student ID: '+u.studentId;meta.appendChild(b);}
 }
 const bio=document.querySelector('.profile-name p');if(bio)bio.textContent='Registered campus member. Profile name: '+exactName+'.';
}
function replaceLogo(){document.querySelectorAll('.brand svg,.brandrow svg').forEach((svg,i)=>{const gid='shareGrad'+i;svg.outerHTML='<svg width="34" height="34" viewBox="0 0 64 64" aria-label="ShareBox sharing logo" role="img"><defs><linearGradient id="'+gid+'" x1="8" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#14966A"/><stop offset="1" stop-color="#1676A5"/></linearGradient></defs><circle cx="32" cy="32" r="29" fill="url(#'+gid+')"/><path d="M23.5 29.5 39 20.5M23.5 34.5 39 43.5" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><circle cx="19" cy="32" r="7" fill="#fff"/><circle cx="44" cy="18" r="7" fill="#fff"/><circle cx="44" cy="46" r="7" fill="#fff"/></svg>';});}
function addTopActions(){if(publicPages.includes(path))return; const bars=document.querySelectorAll('.topbar'); bars.forEach(bar=>{if(bar.querySelector('[data-live-notify]'))return; const btn=document.createElement('button');btn.className='btn-icon';btn.dataset.liveNotify='1';btn.title='Live notifications';btn.setAttribute('aria-label','Live notifications');btn.innerHTML='🔔';btn.onclick=()=>showNotifications(btn); const avatar=bar.querySelector('.avatar');bar.insertBefore(btn,avatar||null);});}
function showNotifications(anchor){document.getElementById('sb-notify-pop')?.remove();const u=currentUser(),d=db();const items=d.notifications.filter(n=>!n.userId||n.userId===u?.id).slice(0,8);const p=document.createElement('div');p.id='sb-notify-pop';p.style.cssText='position:fixed;right:18px;top:70px;z-index:9999;width:min(360px,calc(100vw - 36px));padding:16px;border-radius:18px;background:rgba(255,255,255,.96);color:#142019;box-shadow:0 24px 70px rgba(0,0,0,.22);border:1px solid rgba(0,0,0,.08)';p.innerHTML='<strong>Live notifications</strong><div style="margin-top:10px;display:grid;gap:8px">'+(items.length?items.map(n=>'<div style="padding:10px;border-radius:12px;background:#eef7f2;font-size:13px">'+escapeHtml(n.text)+'<small style="display:block;opacity:.6">'+new Date(n.createdAt).toLocaleString()+'</small></div>').join(''):'<span style="opacity:.65">No notifications yet.</span>')+'</div>';document.body.appendChild(p);setTimeout(()=>document.addEventListener('click',e=>{if(!p.contains(e.target)&&e.target!==anchor)p.remove()},{once:true}),0)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function addLogout(){if(path!=='sharebox-account.html')return; const target=document.querySelector('.profile-actions'); if(!target||target.querySelector('.sb-logout'))return; const b=document.createElement('button');b.className='btn btn-secondary btn-sm sb-logout';b.textContent='Log out';b.onclick=()=>{setSession(null);location.href='index.html'};target.appendChild(b)}
function addRealtimeProducts(){if(path!=='sharebox-dashboard-glass.html')return; const main=document.querySelector('main');if(!main||document.getElementById('sb-live-products'))return;const sec=document.createElement('section');sec.id='sb-live-products';sec.style.cssText='max-width:1200px;margin:24px auto;padding:0 20px';sec.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2 style="margin:0">Live community listings</h2><p style="opacity:.7;margin:.2rem 0 0">New uploads appear instantly in every open tab.</p></div><a class="btn btn-primary" style="width:auto" href="sharebox-upload-wizard.html">+ Add item</a></div><div id="sb-product-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:16px"></div>';main.appendChild(sec);renderProducts()}
function renderProducts(){const grid=document.getElementById('sb-product-grid');if(!grid)return;const products=db().products;grid.innerHTML=products.length?products.map(p=>'<article class="glass" style="padding:14px;overflow:hidden"><img src="'+escapeHtml(p.photos?.[0]||'')+'" alt="" style="width:100%;height:170px;object-fit:cover;border-radius:14px;background:#e8eee9" onerror="this.style.display=\'none\'"><div style="padding-top:10px"><small style="font-weight:700;text-transform:uppercase;opacity:.65">'+escapeHtml(p.type||'share')+'</small><h3 style="margin:.25rem 0">'+escapeHtml(p.name)+'</h3><p style="font-size:13px;opacity:.72">'+escapeHtml(p.category||'')+' · '+escapeHtml(p.condition||'')+'</p><p style="font-weight:800">'+priceLine(p)+'</p><p style="font-size:13px">☎ '+escapeHtml(p.contact||'Not provided')+(p.negotiable?' · Negotiable in chat':'')+'</p><a class="btn btn-secondary" href="sharebox-item-details.html?id='+encodeURIComponent(p.id)+'">View details</a></div></article>').join(''):'<div class="glass" style="padding:24px">No live listings yet. Upload the first item.</div>'}
function priceLine(p){if(p.type==='donate')return 'Free donation';if(p.type==='sell')return money(p.sellPrice);if(p.type==='borrow')return 'Borrow · deposit '+money(p.deposit);return [p.perHour&&money(p.perHour)+'/hour',p.perDay&&money(p.perDay)+'/day',p.perWeek&&money(p.perWeek)+'/week'].filter(Boolean).join(' · ')}
window.addEventListener('storage',()=>{renderProducts();applyUser()});try{const c=new BroadcastChannel('sharebox-live');c.onmessage=()=>{renderProducts();applyUser()}}catch(e){}

document.addEventListener('DOMContentLoaded',()=>{replaceLogo();applyUser();addTopActions();addLogout();addRealtimeProducts()});
})();
