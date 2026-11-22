import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CalendarDays, Expand } from 'lucide-react';
import { AppleCalendarPicker } from '@/components/ui/apple-calendar-picker';
import { FloatingPanel } from '@/components/ui/floating-panel';
const roots=new Map<HTMLElement,Root>();
const tables=new Map<HTMLTableElement,MutationObserver>();
function mountComponent(mount:HTMLElement,element:React.ReactNode){const root=createRoot(mount);roots.set(mount,root);root.render(element);}
function NativeDate({input}:{input:HTMLInputElement}){
 const [open,setOpen]=useState(false),[value,setValue]=useState(input.value);
 return <><button type="button" className="rs-date-launch rs-icon" aria-label={`Open calendar: ${input.labels?.[0]?.textContent?.trim()||input.placeholder||input.name||'date'}`} onClick={()=>{setValue(input.value);setOpen(true);}}><CalendarDays size={17}/></button><FloatingPanel open={open} onClose={()=>setOpen(false)} title="Choose a date"><AppleCalendarPicker value={value} min={input.min} max={input.max} onChange={v=>{input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));setOpen(false);}}/></FloatingPanel></>;
}
function NativeText({input}:{input:HTMLTextAreaElement}){
 const [open,setOpen]=useState(false),[text,setText]=useState('');
 return <><button type="button" className="rs-text-launch" onClick={()=>{setText(input.value);setOpen(true);}}><Expand size={14}/> Expand editor</button><FloatingPanel open={open} onClose={()=>setOpen(false)} title={input.labels?.[0]?.textContent?.trim()||input.placeholder||'Write an update'}><div className="rs-form"><textarea aria-label="Expanded text editor" rows={7} maxLength={input.maxLength>0?input.maxLength:undefined} value={text} onChange={e=>setText(e.target.value)} autoFocus/><div className="rs-form-footer"><button type="button" onClick={()=>setOpen(false)}>Cancel</button><button type="button" className="rs-primary" onClick={()=>{input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));setOpen(false);}}>Apply text</button></div><p className="rs-muted">Apply updates the field. Submit its form to save.</p></div></FloatingPanel></>;
}
// Keep the existing native form controls, IDs, validation and submit handlers intact.
function enhance(){
 roots.forEach((root,node)=>{if(!node.isConnected){root.unmount();roots.delete(node);}});
 tables.forEach((observer,table)=>{if(!table.isConnected){observer.disconnect();tables.delete(table);}});
 document.querySelectorAll<HTMLInputElement>('input[type="date"]:not([data-rs-enhanced])').forEach(input=>{if(input.closest('.rs-floating-panel,#workbench-root')||input.disabled||input.readOnly)return;input.dataset.rsEnhanced='true';const mount=document.createElement('span');mount.className='rs-date-mount';input.insertAdjacentElement('afterend',mount);mountComponent(mount,<NativeDate input={input}/>);});
 document.querySelectorAll<HTMLTextAreaElement>('textarea:not([data-rs-enhanced])').forEach(input=>{if(input.closest('.rs-floating-panel,#workbench-root')||input.disabled||input.readOnly)return;input.dataset.rsEnhanced='true';const mount=document.createElement('div');mount.className='rs-text-mount';input.insertAdjacentElement('afterend',mount);mountComponent(mount,<NativeText input={input}/>);});
 document.querySelectorAll<HTMLTableElement>('table:not([data-rs-enhanced])').forEach(table=>{if(table.closest('#workbench-root')||!table.tHead||table.tHead.rows.length!==1)return;table.dataset.rsEnhanced='true';table.classList.add('rs-enhanced-table');const tools=document.createElement('div');tools.className='rs-table-tools rs-legacy-tools';const label=document.createElement('label');label.textContent='Filter loaded rows ';const search=document.createElement('input');search.type='search';search.placeholder='Search this table…';search.setAttribute('aria-label','Filter loaded table rows');label.append(search);const count=document.createElement('span');count.className='rs-muted';count.setAttribute('role','status');tools.append(label,count);table.before(tools);
 const apply=()=>{const rows=Array.from(table.tBodies).flatMap(body=>Array.from(body.rows));let visible=0;rows.forEach(row=>{const match=(row.textContent||'').toLowerCase().includes(search.value.toLowerCase());row.hidden=!match;if(match)visible++;});count.textContent=`${visible} of ${rows.length} loaded rows`;};search.addEventListener('input',apply);const observer=new MutationObserver(apply);observer.observe(table,{childList:true,subtree:true,characterData:true});tables.set(table,observer);apply();
 });
}
enhance();let frame=0;const observer=new MutationObserver(()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;enhance();});});observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('pagehide',event=>{if(event.persisted)return;observer.disconnect();cancelAnimationFrame(frame);tables.forEach(o=>o.disconnect());roots.forEach(root=>root.unmount());roots.clear();},{once:true});
