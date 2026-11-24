(() => {
  const isHrDashboard=document.body.classList.contains('rs-hr-dashboard');
  for(const host of document.querySelectorAll('[data-finance-pulse]')) {
    const button=host.querySelector('[data-pulse-refresh]');let active=false;
    async function load(){
      if(active)return;active=true;button.disabled=true;
      const status=host.querySelector('[data-pulse-status]');status.textContent='';
      try{
        const response=await fetch('/api/dashboard/pulse',{headers:{Accept:'application/json'},credentials:'same-origin'});
        if(!response.ok)throw new Error('Activity could not be loaded. Use refresh to try again.');
        const data=await response.json();
        const bars=host.querySelector('[data-pulse-bars]');
        const attendance=Array.isArray(data.attendance)?data.attendance:[];
        bars.replaceChildren();
        const max=Math.max(1,...attendance.map(day=>Number(day.present)||0));
        let present=0;
        for(const day of attendance){
          const dayPresent=Number(day.present)||0;
          const dayLate=Number(day.late)||0;
          present+=dayPresent;
          const group=document.createElement('div');group.className='finance-bar-group';
          const column=document.createElement('div');column.className='finance-bar-column';column.style.height=Math.max(2,dayPresent/max*150)+'px';column.tabIndex=0;
          const label=new Intl.DateTimeFormat('en-IN',{weekday:'short',timeZone:'UTC'}).format(new Date(day.date+'T12:00:00Z'));
          column.setAttribute('role','img');column.setAttribute('aria-label',`${day.date}: ${dayPresent} present, ${dayLate} late`);column.title=column.getAttribute('aria-label');
          const late=document.createElement('i');late.style.height=(dayPresent?dayLate/dayPresent*100:0)+'%';column.append(late);const date=document.createElement('span');date.textContent=label;group.append(column,date);bars.append(group);
        }
        const attendanceEmpty=host.querySelector('[data-pulse-attendance-empty]');
        const hasAttendance=present>0;
        bars.hidden=isHrDashboard&&!hasAttendance;
        if(attendanceEmpty)attendanceEmpty.hidden=!isHrDashboard||hasAttendance;
        const set=(selector,value)=>{const element=host.querySelector(selector);if(element)element.textContent=String(value);};
        const totalTasks=Number(data.totalTasks)||0;
        const taskStatus=Array.isArray(data.taskStatus)?data.taskStatus:[];
        set('[data-pulse-present]',present);
        set('[data-attendance-scope]',(data.attendanceScope||'Organization')+' · last seven days');
        set('[data-task-scope]',data.scope||'YOUR WORKSPACE');
        set('[data-pulse-rate]',data.completionRate==null?'—':Number(data.completionRate)+'%');
        set('[data-pulse-total]',totalTasks);
        set('[data-pulse-approved]',taskStatus.find(s=>s.status==='Approved')?.count||0);
        set('[data-pulse-pending]',taskStatus.find(s=>s.status==='Pending')?.count||0);
        set('[data-pulse-note]',totalTasks?'Every completed task moves your workspace forward.':'No assigned tasks yet. Your progress will appear here.');
        const taskWidget=host.querySelector('[data-task-widget]');
        if(taskWidget&&isHrDashboard)taskWidget.classList.toggle('is-empty',totalTasks===0);
        const arc=host.querySelector('[data-pulse-arc]');
        if(arc)arc.setAttribute('stroke-dasharray',(Number(data.completionRate)||0)+' 100');
      }catch(error){
        status.textContent=error.message;
        const bars=host.querySelector('[data-pulse-bars]');
        if(bars){bars.replaceChildren();if(isHrDashboard)bars.hidden=true;}
        const empty=host.querySelector('[data-pulse-attendance-empty]');
        if(empty)empty.hidden=true;
      }
      finally{active=false;button.disabled=false;}
    }
    button.addEventListener('click',load);load();
  }
})();
(() => {
  const sidebar=document.getElementById('rs-role-sidebar'),button=document.querySelector('[data-finance-menu]'),backdrop=document.querySelector('[data-finance-backdrop]');if(!sidebar||!button||!backdrop)return;
  const desktop=matchMedia('(min-width:768px)');let last=null;
  function set(open){document.body.classList.toggle('finance-sidebar-open',open);button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Close sidebar':'Open sidebar');backdrop.hidden=!open;if(open){last=document.activeElement;sidebar.querySelector('a,button')?.focus();}else if(last){last.focus();last=null;}}
  button.addEventListener('click',()=>set(!document.body.classList.contains('finance-sidebar-open')));backdrop.addEventListener('click',()=>set(false));
  sidebar.addEventListener('click',event=>{if(!desktop.matches&&(event.target.closest('a')||(isHrDashboard&&event.target.closest('button.nav-item'))))set(false);});
  document.addEventListener('keydown',event=>{if(!document.body.classList.contains('finance-sidebar-open'))return;if(event.key==='Escape'){set(false);return;}if(event.key==='Tab'){const items=[...sidebar.querySelectorAll('a[href],button:not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  desktop.addEventListener('change',()=>set(false));
})();
