const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');
const bundle=fs.readFileSync(path.join(__dirname,'../frontend/public/js/workbench-ui.js'),'utf8');
const opened=[];
afterEach(()=>opened.splice(0).forEach(d=>{d.window.dispatchEvent(new d.window.Event('pagehide'));d.window.close();}));
const profile={name:'Alex Member',email:'alex@example.test',phone:'+91 111 222',dob:'1995-04-12',bio:'Product design',role:'Employee'};
const task={_id:'111111111111111111111111',title:'Launch project',description:'Prepare the launch',deadline:'2031-06-20T00:00:00.000Z',status:'Pending',plan:{startDate:'2031-06-01',submissionDate:'2031-06-18',progress:40,notes:'Review ready',goals:[{text:'Design review',done:false}]}};
async function waitFor(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw Error('UI did not reach expected state');}
function page(tab='profile',role='Employee'){
 const dom=new JSDOM(`<div id="workbench-root" data-role="${role}" data-name="Alex Member"></div>`,{url:`http://localhost/workbench?tab=${tab}`,runScripts:'outside-only',pretendToBeVisual:true});opened.push(dom);const w=dom.window;
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 w.fetch=jest.fn(async(url,options={})=>{let data={success:true};if(url==='/api/workbench/profile'&&options.method==='GET')data={profile};if(url.startsWith('/api/workbench/tasks?'))data={tasks:[task],total:1,pages:1};if(url.startsWith('/api/workbench/attendance?'))data={records:[{_id:'record',date:'2031-06-02',status:'present',checkIn:'09:00'}]};if(url==='/api/workbench/teams'&&options.method==='GET')data={teams:[]};if(url==='/api/workbench/team-options')data={managers:[{_id:'222222222222222222222222',name:'Maya Manager'}],employees:[{_id:'333333333333333333333333',name:'Alex Member',department:'Design',managerId:'222222222222222222222222'}]};const body=JSON.stringify(data);
return {
  ok: true,
  status: 200,
  headers: {
    get: name => String(name).toLowerCase() === 'content-type'
      ? 'application/json'
      : null
  },
  text: async () => body,
  json: async () => JSON.parse(body)
};});w.eval(bundle);return dom;
}
function button(d,text){return [...d.querySelectorAll('button')].find(b=>b.textContent.includes(text));}
test('profile saves phone and DOB with no integrations tab',async()=>{
 const p=page(),w=p.window,d=w.document;await waitFor(()=>d.querySelector('[name=phone]'));expect(d.body.textContent).not.toContain('Integrations');expect(d.querySelector('[name=phone]').value).toBe(profile.phone);expect(d.querySelector('[type=date]').value).toBe(profile.dob);
 d.querySelector('[name=name]').value='Alex Updated';d.querySelector('[name=phone]').value='+91 999';d.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>d.body.textContent.includes('Profile saved.'));
 const call=w.fetch.mock.calls.find(([url,o])=>url==='/api/workbench/profile'&&o.method==='PATCH');expect(JSON.parse(call[1].body)).toMatchObject({name:'Alex Updated',phone:'+91 999',dob:profile.dob});
 button(d,'Security').click();await waitFor(()=>d.querySelector('[name=currentPassword]'));expect(d.querySelector('[name=currentPassword]').autocomplete).toBe('current-password');
 button(d,'My profile').click();await waitFor(()=>d.querySelector('[name=phone]'));expect(d.querySelector('[name=phone]').value).toBe('+91 999');
});
test('calendar opens as a labeled modal and selecting a day updates profile DOB',async()=>{
 const p=page(),d=p.window.document;await waitFor(()=>d.querySelector('[aria-label="Choose date of birth"]'));d.querySelector('[aria-label="Choose date of birth"]').click();await waitFor(()=>d.querySelector('dialog[open]'));expect(d.querySelector('dialog').getAttribute('aria-label')).toBe('Date of birth');const day=d.querySelector('.rs-day[aria-pressed=false]:not(:disabled)');day.click();await waitFor(()=>!d.querySelector('dialog[open]'));expect(d.querySelector('[type=date]').value).not.toBe(profile.dob);
});
test('task calendar and progress save real milestone changes',async()=>{
 const p=page('tasks'),w=p.window,d=w.document;await waitFor(()=>d.querySelector('.rs-goal input'));expect(d.body.textContent).toContain('Launch project');expect(d.querySelector('.rs-range input').value).toBe('40');d.querySelector('.rs-goal input').click();await waitFor(()=>d.querySelector('.rs-goal input').checked);button(d,'Save task plan').click();await waitFor(()=>d.body.textContent.includes('Task plan saved.'));const call=w.fetch.mock.calls.find(([url,o])=>url.endsWith('/plan')&&o.method==='PUT');expect(JSON.parse(call[1].body)).toMatchObject({progress:40,startDate:'2031-06-01',submissionDate:'2031-06-18',goals:[{text:'Design review',done:true}]});expect(d.body.textContent).toContain('Pending');
});
test('table status filter produces a no-results state without changing task data',async()=>{
 const p=page('tasks'),w=p.window,d=w.document;await waitFor(()=>d.querySelector('[aria-label="Filter from date"]'));const field=d.querySelector('[aria-label="Filter from date"]');Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(field,'2032-01-01');field.dispatchEvent(new w.Event('input',{bubbles:true}));await waitFor(()=>d.querySelector('tbody').textContent.includes('No matching records.'));expect(d.querySelector('.rs-task-detail').textContent).toContain('Launch project');
});
test('HR selects actual reporting members and creates a team',async()=>{
 const p=page('teams','HR'),w=p.window,d=w.document;await waitFor(()=>button(d,'Create team'));button(d,'Create team').click();await waitFor(()=>d.querySelector('.rs-member-options input[type=checkbox]'));d.querySelector('[name=name]').value='Launch crew';d.querySelector('.rs-member-options input').click();await waitFor(()=>!d.querySelector('dialog .rs-primary').disabled);d.querySelector('dialog form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await waitFor(()=>w.fetch.mock.calls.some(([url,o])=>url==='/api/workbench/teams'&&o.method==='POST'));const call=w.fetch.mock.calls.find(([url,o])=>url==='/api/workbench/teams'&&o.method==='POST');expect(JSON.parse(call[1].body)).toMatchObject({name:'Launch crew',managerId:'222222222222222222222222',memberIds:['333333333333333333333333']});
});
test('employee cannot see team creation controls',async()=>{const p=page('teams');await waitFor(()=>p.window.document.body.textContent.includes('No teams yet.'));expect(button(p.window.document,'Create team')).toBeUndefined();});
test('calendar stylesheet parses and explicitly reverses date contrast by theme',()=>{const css=fs.readFileSync(path.join(__dirname,'../frontend/public/css/workbench.css'),'utf8');expect(()=>require('postcss').parse(css)).not.toThrow();expect(css).toContain('html[data-theme=dark] .rs-calendar button.rs-day');expect(css).toContain('prefers-reduced-motion');});
function enhancedPage(){const p=new JSDOM('<form><label for="native-date">Project deadline</label><input id="native-date" type="date" required value="2031-06-01"><label for="native-text">Project notes</label><textarea id="native-text" maxlength="50">Original notes</textarea></form><table><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alex</td></tr><tr><td>Maya</td></tr></tbody></table>',{url:'http://localhost/dashboard',runScripts:'outside-only',pretendToBeVisual:true});opened.push(p);p.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};p.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};p.window.eval(fs.readFileSync(path.join(__dirname,'../frontend/public/js/component-enhancements.js'),'utf8'));return p;}
test('existing date forms retain native required fields and emit change when the calendar selects a date',async()=>{const p=enhancedPage(),w=p.window,d=w.document;const input=d.querySelector('#native-date'),changed=jest.fn();input.addEventListener('change',changed);await waitFor(()=>d.querySelector('.rs-date-launch'));d.querySelector('.rs-date-launch').click();await waitFor(()=>d.querySelector('dialog[open] .rs-day'));d.querySelector('dialog[open] .rs-day[aria-pressed=false]').click();await waitFor(()=>changed.mock.calls.length);expect(input.required).toBe(true);expect(d.querySelector('#native-date')).toBe(input);expect(input.value).not.toBe('2031-06-01');expect(changed).toHaveBeenCalledTimes(1);});
test('floating textarea applies text to the original field without submitting its form',async()=>{const p=enhancedPage(),w=p.window,d=w.document,submit=jest.fn();d.querySelector('form').addEventListener('submit',submit);await waitFor(()=>d.querySelector('.rs-text-launch'));d.querySelector('.rs-text-launch').click();await waitFor(()=>d.querySelector('dialog[open] textarea'));const textarea=d.querySelector('dialog[open] textarea');Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Updated notes');textarea.dispatchEvent(new w.Event('input',{bubbles:true}));button(d,'Apply text').click();await waitFor(()=>!d.querySelector('dialog[open]'));expect(d.querySelector('#native-text').value).toBe('Updated notes');expect(submit).not.toHaveBeenCalled();});
test('existing table search handles rows loaded after the table first renders',async()=>{const p=enhancedPage(),w=p.window,d=w.document;const input=d.querySelector('[aria-label="Filter loaded table rows"]');input.value='Maya';input.dispatchEvent(new w.Event('input',{bubbles:true}));expect(d.querySelector('tbody tr').hidden).toBe(true);const row=d.createElement('tr');row.innerHTML='<td>Maya Junior</td>';d.querySelector('tbody').append(row);await waitFor(()=>d.querySelector('.rs-legacy-tools [role=status]').textContent==='2 of 3 loaded rows');expect(row.hidden).toBe(false);expect(d.querySelectorAll('.rs-legacy-tools')).toHaveLength(1);});
