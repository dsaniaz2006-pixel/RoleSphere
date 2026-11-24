const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname,'..');
const theme = fs.readFileSync(path.join(root,'frontend/public/js/theme-init.js'),'utf8');
const client = () => fs.readFileSync(path.join(root,'frontend/public/js/premium-ui.js'),'utf8');
const jsonForScript = v => JSON.stringify(v).replace(/</g,'\\u003c');
const person = { name:'Aadi <script>bad()</script>',email:'aadi@example.test',_id:'507f1f77bcf86cd799439011',profilePhoto:null };
const locals = { hr:person,manager:person,employee:person,admin:person,employees:[],announcements:[],message:'',totalEmployees:0,managerList:[],hrList:[],pendingApprovals:0,hrLeaves:[],roleTaskStatusData:{},employeeReportsStatusData:{},role:'HR',error:null,success:null,welcome:{token:'test-login-one',name:person.name},jsonForScript };
const openPages=[];
afterEach(()=>{for(const page of openPages.splice(0))page.window.close();});
const settle = () => new Promise(r=>setTimeout(r,100));
async function waitUntil(predicate, message) {
 const deadline = Date.now() + 3000;
 while (Date.now() < deadline) {
  if (predicate()) return;
  await new Promise(resolve => setTimeout(resolve, 20));
 }
 throw new Error(message || 'Timed out waiting for upload UI update');
}
function dom(html, reduced=true) {
 const page=new JSDOM(html,{url:'http://localhost',runScripts:'outside-only',pretendToBeVisual:true});const w=page.window;
 w.matchMedia=()=>({matches:reduced,addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
 w.ResizeObserver=class {observe(){}disconnect(){}};w.IntersectionObserver=class{observe(){}disconnect(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>null;
 w.eval(theme);openPages.push(page);return page;
}
async function render(name,extra={}) { return ejs.renderFile(path.join(root,'frontend/views',name+'.ejs'),{...locals,...extra}); }

test('theme preference is applied before mount and synchronized across pages/tabs',()=>{
 const p=dom('<!doctype html><body>');const w=p.window;
 w.RoleSphereTheme.set('dark');expect(w.localStorage.getItem('rolesphere.theme')).toBe('dark');expect(w.document.documentElement.classList.contains('dark')).toBe(true);
 w.eval(theme);expect(w.document.documentElement.dataset.theme).toBe('dark');w.RoleSphereTheme.toggle();expect(w.document.documentElement.dataset.theme).toBe('light');
 w.dispatchEvent(new w.StorageEvent('storage',{key:'rolesphere.theme',newValue:'dark'}));expect(w.document.documentElement.dataset.theme).toBe('dark');p.window.close();
});
test('blocked preference storage still allows theme switching',()=>{
 const p=dom('<body>');Object.defineProperty(p.window,'localStorage',{get(){throw Error('blocked')}});expect(()=>p.window.eval(theme)).not.toThrow();p.window.RoleSphereTheme.set('dark');expect(p.window.document.documentElement.dataset.theme).toBe('dark');p.window.close();
});
test.each(['admin-dashboard','hrDashboard','managerDashboard','employee-dashboard'])('%s has branding, appearance controls and a safely escaped welcome identity',async name=>{
 const page=new JSDOM(await render(name));const d=page.window.document;
 expect(d.querySelector('.rs-brand-name').textContent).toBe('RoleSphere.');expect(d.querySelector('.rs-brand-mark').textContent).toBe('R.');expect(d.querySelector('[data-rs-theme-toggle]')).toBeTruthy();
 expect(d.querySelector('#rs-dashboard-experience').dataset.name).toBe(person.name);expect(d.querySelector('#rs-dashboard-experience script')).toBeNull();
 expect(Boolean(d.querySelector('#rs-admin-background'))).toBe(name==='admin-dashboard');expect(Boolean(d.querySelector('#rs-dashboard-dots'))).toBe(name!=='admin-dashboard');page.window.close();
});
test.each(['index','forgot-password','reset-password-success','register-pending','403','workspace'])('%s renders with shared theme and logo',async name=>{
 const page=new JSDOM(await render(name,{user:person}));const d=page.window.document;
 expect(d.querySelector('script[src="/js/theme-init.js"]')).toBeTruthy();expect(d.querySelector('link[href="/css/premium.css"]')).toBeTruthy();expect(d.querySelector('.rs-brand-mark')).toBeTruthy();expect(d.querySelector('link[rel=icon][href="/images/brand-mark.svg"]')).toBeTruthy();
 expect(d.querySelector('header.rs-page-brand')?.closest('body') || d.querySelector('.sh-brand') || d.querySelector('.auth-brand') || d.querySelector('.auth-header .rs-brand')).toBeTruthy();page.window.close();
});
test('every full template includes the global theme and controls',()=>{
 const folder=path.join(root,'frontend/views');
 for(const file of fs.readdirSync(folder).filter(f=>f.endsWith('.ejs'))){const s=fs.readFileSync(path.join(folder,file),'utf8');if(!s.includes('<head>'))continue;expect(s).toContain("include('partials/premium-head')");expect(s).toContain("include('partials/site-tools')");}
});
test('HR Managers directory renders isolated Name and Email grid columns with search',async()=>{
 const page=new JSDOM(await render('hrDashboard'));const d=page.window.document;
 const directory=d.querySelector('#hr-managers-directory[role="table"]');
 expect(directory).toBeTruthy();
 expect([...directory.querySelectorAll('.hr-managers-heading [role="columnheader"]')].map(cell=>cell.textContent.trim())).toEqual(['Name','Email']);
 expect(directory.querySelector('#managersList[role="rowgroup"]')).toBeTruthy();
 expect(d.querySelector('#hr-managers-search[type="search"]')).toBeTruthy();
 expect(d.querySelector('link[href="/css/hr-dashboard-refinements.css?v=hr-managers-grid-5"]')).toBeTruthy();
 const styles=fs.readFileSync(path.join(root,'frontend/public/css/hr-dashboard-refinements.css'),'utf8');
 expect(styles).toContain('#section-managers .hr-manager-row');
 expect(styles).toContain('display: grid !important');
 expect(styles).toContain('grid-template-columns: minmax(220px, 0.8fr) minmax(300px, 1.2fr) !important');
 expect(styles).toContain('#section-managers .hr-managers-toolbar');
 page.window.close();
});

test('empty-state uploads preserve native inputs, selection, removal and reset',async()=>{
 const p=dom(await render('employee-dashboard'));const w=p.window;w.eval(client());await settle();const input=w.document.querySelector('#taskFile');await waitUntil(()=>input.dataset.rsUploadReady==='true','Task upload listener did not initialize');const zone=input.closest('.rs-upload');
 expect(input.required).toBe(true);expect(zone.textContent).toContain('Add your task submission');const click=jest.fn();input.click=click;
 zone.querySelector('button').click();expect(click).toHaveBeenCalledTimes(1);
 Object.defineProperty(input,'files',{configurable:true,value:[new w.File(['report'],'report.pdf',{type:'application/pdf'})]});input.dispatchEvent(new w.Event('change',{bubbles:true}));await waitUntil(()=>zone.textContent.includes('report.pdf'),'Selected task file was not rendered after change');expect(zone.textContent).toContain('Ready to submit');
 // Browser FileList clears when value is reset; supply an equivalent FileList fixture.
 Object.defineProperty(input,'files',{configurable:true,value:[]});zone.querySelector('[aria-label="Remove selected files"]').click();await waitUntil(()=>zone.textContent.includes('Add your task submission'),'Task file removal did not restore the empty state');
 const photo=w.document.querySelector('#photoInput');expect(photo.dataset.maxBytes).toBe('2097152');await waitUntil(()=>photo.dataset.rsUploadReady==='true','Profile photo upload listener did not initialize');Object.defineProperty(photo,'files',{configurable:true,value:[new w.File(['photo'],'portrait.png',{type:'image/png'})]});photo.dispatchEvent(new w.Event('change',{bubbles:true}));await waitUntil(()=>photo.closest('.rs-upload').textContent.includes('portrait.png'),'Selected profile photo was not rendered after change');Object.defineProperty(photo,'files',{configurable:true,value:[]});photo.form.reset();await waitUntil(()=>photo.closest('.rs-upload').textContent.includes('Add a profile photo'),'Profile photo reset did not restore the empty state');p.window.close();
});
test('all existing upload points use empty states without changing field names',async()=>{
 const expected={'admin-announcements':['attachment'],'managerDashboard':['submissionFile'],'employee-dashboard':['attachment','profilePhoto','taskFile']};
 for(const [pageName,names] of Object.entries(expected)){const p=new JSDOM(await render(pageName));const inputs=[...p.window.document.querySelectorAll('input[type=file]')];expect(inputs.map(i=>i.name)).toEqual(names);expect(inputs.every(i=>i.closest('.rs-upload')?.querySelector('.rs-upload-host'))).toBe(true);p.window.close();}
});
test('hover enhancement keeps native button identity and delegated handlers',async()=>{
 const p=dom('<!doctype html><body class="rs-dashboard"><main><button id="action" data-rs-click="test">Approve</button><button aria-label="Close">×</button></main>');const w=p.window;const button=w.document.querySelector('#action'),click=jest.fn();button.addEventListener('click',click);w.eval(client());await settle();expect(w.document.querySelector('#action')).toBe(button);button.click();expect(click).toHaveBeenCalledTimes(1);expect(button.dataset.rsClick).toBe('test');expect(button.querySelector('.rs-button-label').textContent).toBe('Approve');expect(w.document.querySelector('[aria-label=Close]').classList.contains('rs-hover-button')).toBe(false);p.window.close();
});
test('welcome skip releases the dashboard and does not repeat for the same sign-in',async()=>{
 const p=dom(await render('hrDashboard'),false);const w=p.window;w.eval(client());await settle();expect(w.document.querySelector('[role=dialog].rs-welcome')).toBeTruthy();expect(w.document.body.classList.contains('rs-welcoming')).toBe(true);expect(w.document.querySelector('main').inert).toBe(true);
 w.document.querySelector('.rs-skip-welcome').click();await settle();expect(w.document.querySelector('.rs-welcome')).toBeNull();expect(w.document.body.classList.contains('rs-dashboard-reveal')).toBe(true);expect(w.document.querySelector('main').inert).toBeFalsy();expect(w.sessionStorage.getItem('rolesphere.welcome')).toBe('test-login-one');p.window.close();
});
test('reduced motion bypasses the welcome blocking layer',async()=>{
 const p=dom(await render('managerDashboard'));p.window.eval(client());await settle();expect(p.window.document.querySelector('.rs-welcome')).toBeNull();expect(p.window.document.querySelector('main').inert).toBeFalsy();p.window.close();
});

test('ASMR canvas updates finite shard positions, pauses, and redraws for the light theme',async()=>{
 const p=dom('<!doctype html><body class="rs-dashboard"><main><div id="rs-admin-background"></div></main><div class="rs-site-tools"></div>',false);const w=p.window;
 const positions=[],fills=[];let callbacks=new Map(),next=1;
 w.requestAnimationFrame=cb=>{const id=next++;callbacks.set(id,cb);return id};w.cancelAnimationFrame=id=>callbacks.delete(id);
 const ctx={fillStyle:'',setTransform(){},clearRect(){},fillRect(){fills.push(this.fillStyle)},save(){},restore(){},translate(x,y){positions.push([x,y])},rotate(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>ctx;w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:800,height:600,left:264,top:0});
 w.eval(client());await settle();expect(w.document.querySelector('.rs-asmr-canvas')).toBeTruthy();expect(positions.length).toBeGreaterThan(200);
 w.document.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:300,clientY:100}));
 const callback=[...callbacks.values()][0];callbacks.clear();callback(60);expect(positions.every(pair=>pair.every(Number.isFinite))).toBe(true);
 const pause=w.document.querySelector('.rs-motion-toggle');pause.click();expect(pause.getAttribute('aria-label')).toBe('Play background motion');expect(callbacks.size).toBe(0);
 w.RoleSphereTheme.set('light');expect(fills.at(-1)).toBe('rgba(248,249,251,.3)');await settle();p.window.close();
});
test('a repeated sign-in token skips the welcome and a new token replays it',async()=>{
 const p=dom(await render('hrDashboard'),false);p.window.sessionStorage.setItem('rolesphere.welcome','test-login-one');p.window.eval(client());await settle();expect(p.window.document.querySelector('.rs-welcome')).toBeNull();p.window.close();
 const second=dom(await render('hrDashboard',{welcome:{token:'test-login-two',name:'Aadi'}}),false);second.window.sessionStorage.setItem('rolesphere.welcome','test-login-one');second.window.eval(client());await settle();expect(second.window.document.querySelector('.rs-welcome')).toBeTruthy();second.window.document.querySelector('.rs-skip-welcome').click();await settle();second.window.close();
});
test('upload rejects disallowed dragged files and the profile size limit',async()=>{
 const p=dom(await render('employee-dashboard'));const w=p.window;w.eval(client());await settle();const input=w.document.querySelector('#photoInput'),zone=input.closest('.rs-upload').querySelector('.rs-upload-zone');
 const wrong=new w.File(['no'],'program.exe',{type:'application/octet-stream'});const e=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:{files:[wrong]}});zone.dispatchEvent(e);await settle();expect(zone.textContent).toContain('not supported');
 const big=new w.File(['image'],'photo.png',{type:'image/png'});Object.defineProperty(big,'size',{value:3*1048576});const bigEvent=new w.Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(bigEvent,'dataTransfer',{value:{files:[big]}});zone.dispatchEvent(bigEvent);await settle();expect(zone.textContent).toContain('smaller than 2 MB');p.window.close();
});
test('global stylesheet parses and retains motion, dark theme and small-screen rules',()=>{
 const postcss=require('postcss');const sheet=fs.readFileSync(path.join(root,'frontend/public/css/premium.css'),'utf8');expect(()=>postcss.parse(sheet)).not.toThrow();expect(sheet).toContain('prefers-reduced-motion');expect(sheet).toContain('max-width:360px');expect(sheet).toContain('html[data-theme="dark"]');
});
