import { useState } from 'react';
export type Member={_id:string;name:string;department?:string};
export const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
export function TeamShowcase({name,description,managerName,members}:{name:string;description:string;managerName:string;members:Member[]}){
 const [active,setActive]=useState(0);
 const displayed=active>=3?[members[0],members[1],members[active]]:members.slice(0,3);
 return <article className="rs-team-card"><div className="rs-team-art" aria-hidden="true">{members.length?displayed.map((m,i)=><div key={m._id} className={`rs-member-card member-${i} ${members[active]?._id===m._id?'active':''}`}><span>{initials(m.name)}</span><small>{m.name}</small></div>):<span>No current members</span>}</div><div><p className="rs-eyebrow">LED BY {managerName}</p><h3>{name}</h3><p className="rs-muted">{description||'A shared space for your team.'}</p><ul>{members.map((m,i)=><li key={m._id}><button type="button" onMouseEnter={()=>setActive(i)} onFocus={()=>setActive(i)}><span className="rs-avatar">{initials(m.name)}</span><span>{m.name}<small>{m.department||'Team member'}</small></span></button></li>)}</ul></div></article>;
}
