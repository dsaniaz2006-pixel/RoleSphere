import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
/** Accessible modal form panel: focus trap, Escape and focus restoration via native dialog. */
export function FloatingPanel({open,onClose,title,children}:{open:boolean;onClose:()=>void;title:string;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const previous=document.activeElement as HTMLElement|null;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();return ()=>{if(dialog.open)dialog.close();previous?.focus();};},[open]);
 return <dialog ref={ref} className="rs-floating-panel" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="rs-panel-heading"><h2>{title}</h2><button type="button" className="rs-icon" onClick={onClose} aria-label="Close panel"><X size={20}/></button></div>{children}</dialog>;
}
