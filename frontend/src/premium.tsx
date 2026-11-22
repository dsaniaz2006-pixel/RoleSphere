import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EmptyState, SelectedFiles } from '@/components/ui/empty-state';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { ASMRBackground } from '@/components/ui/asmr-background';
import { CanvasText } from '@/components/ui/canvas-text';
import { RevealText } from '@/components/ui/reveal-text';

declare global { interface Window { RoleSphereTheme?: { set: (value: string) => void; toggle: () => void }; RoleSphereUI?: { enhance: (root?: ParentNode) => void } } }

class EffectBoundary extends React.Component<{ children: React.ReactNode; fallback?: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback ?? null : this.props.children; }
}

function UploadField({ input, label }: { input: HTMLInputElement; label: string }) {
  const [files, setFiles] = useState<File[]>(Array.from(input.files || []));
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const describe = input.accept && input.accept !== '*' ? input.accept.replace(/,/g, ', ') : 'Documents and images';
  useEffect(() => {
    const sync = () => { setFiles(Array.from(input.files || [])); setError(''); };
    const reset = () => { setTimeout(sync, 0); };
    input.addEventListener('change', sync); input.form?.addEventListener('reset', reset);
    const invalid = () => { setError('Choose a file before submitting.'); zone.current?.querySelector<HTMLButtonElement>('button')?.focus(); };
    input.addEventListener('invalid', invalid);
    // Keep programmatic clearing by legacy upload handlers in sync as well.
    let previous = input.value;
    const interval = window.setInterval(() => { if (input.value !== previous) { previous = input.value; sync(); } }, 500);
    return () => { input.removeEventListener('change', sync); input.form?.removeEventListener('reset', reset); input.removeEventListener('invalid', invalid); clearInterval(interval); };
  }, [input]);
  const clear = () => { input.value = ''; input.dispatchEvent(new Event('change', { bubbles: true })); };
  const drop = (event: React.DragEvent) => {
    event.preventDefault(); setDrag(false); if (input.disabled) return;
    const incoming = Array.from(event.dataTransfer.files).slice(0, input.multiple ? undefined : 1);
    const allowed = input.accept.split(',').map(s => s.trim().toLowerCase()).filter(s => s && s !== '*');
    if (incoming.some(file => allowed.length && !allowed.some(rule => rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule) : rule.endsWith('/*') ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule))) { setError('This file type is not supported. ' + describe); return; }
    const max = Number(input.dataset.maxBytes || 10485760);
    if (incoming.some(file => file.size > max)) { setError('Choose a file smaller than ' + Math.round(max / 1048576) + ' MB.'); return; }
    try { const transfer = new DataTransfer(); incoming.forEach(file => transfer.items.add(file)); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) { setError('Use Choose file to select your attachment.'); }
  };
  return <div ref={zone} className={'rs-upload-zone' + (drag ? ' rs-dragging' : '')} onDragOver={event => { event.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={drop}>
    {files.length ? <SelectedFiles files={files} onChoose={() => input.click()} onClear={clear} /> : <EmptyState title={label} description={describe + ' · ' + Math.round(Number(input.dataset.maxBytes || 10485760) / 1048576) + ' MB maximum · Drag a file here'} action={{ label: 'Choose file', onClick: () => input.click() }} />}
    {error && <p role="alert" className="rs-upload-error">{error}</p>}
  </div>;
}

function Welcome({ name, onComplete }: { name: string; onComplete: () => void }) {
  const [width, setWidth] = useState(innerWidth);
  const skip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    skip.current?.focus();
    const timer = setTimeout(onComplete, 3100);
    const resize = () => setWidth(innerWidth);
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onComplete(); };
    window.addEventListener('resize', resize); window.addEventListener('keydown', key);
    return () => { clearTimeout(timer);window.removeEventListener('resize',resize);window.removeEventListener('keydown',key); };
  }, [onComplete]);
  const text = 'Welcome, ' + name;
  const fontSize = Math.max(14, Math.min(72, (Math.min(width * .88, 980) - 24) / (text.length * .64)));
  return <section className="rs-welcome" role="dialog" aria-modal="true" aria-label={text}>
    <div className="rs-welcome-brand"><span className="rs-brand-mark" aria-hidden="true">R<span>.</span></span><span className="rs-brand-name">RoleSphere.</span></div>
    <div className="rs-welcome-center"><p className="rs-welcome-eyebrow">YOUR SPACE. YOUR PEOPLE.</p>
      <EffectBoundary fallback={<h1>{text}</h1>}><CanvasText as="h1" text={text} fontSize={fontSize} loadDuration={.65} morphDuration={1.3} density={2} scatter={52} magnetic={.2} className="rs-welcome-canvas" /></EffectBoundary>
      <RevealText delay={1.7}>A connected workspace, ready for you.</RevealText>
    </div>
    <button ref={skip} type="button" className="rs-skip-welcome" onClick={onComplete}>Enter workspace <span aria-hidden="true">↗</span></button>
  </section>;
}

const roots = new WeakSet<Element>();
function mountUploads(scope: ParentNode = document) {
  for (const host of scope.querySelectorAll<HTMLElement>('.rs-upload-host')) {
    if (roots.has(host)) continue;
    const input = document.getElementById(host.dataset.inputId || '') as HTMLInputElement | null;
    if (!input || input.type !== 'file') continue;
    roots.add(host);
    createRoot(host).render(<EffectBoundary fallback={<label htmlFor={input.id}>Choose file</label>}><UploadField input={input} label={host.dataset.uploadLabel || 'Add an attachment'} /></EffectBoundary>);
  }
}

// Enhance the existing buttons instead of replacing them: form actions and delegated
// handlers stay attached to the same DOM nodes, including dynamically inserted rows.
function enhanceButtons(scope: ParentNode = document) {
  for (const button of scope.querySelectorAll<HTMLElement>('body.rs-dashboard button, body.rs-dashboard main a[class*="bg-"], .rs-hover-scope button')) {
    if (button.closest('.rs-upload, .rs-welcome, .rs-site-tools, nav') || button.hasAttribute('data-theme-toggle') || button.hasAttribute('data-rs-no-hover') || button.querySelector(':scope > .rs-button-label') || !button.textContent?.trim() || button.textContent.trim().length < 2 || button.textContent.trim().length > 64 || button.hasAttribute('aria-label') || button.querySelector('input,select')) continue;
    const label = document.createElement('span'); label.className = 'rs-button-label';
    while (button.firstChild) label.append(button.firstChild);
    const dot = document.createElement('span');dot.className = 'rs-button-dot';dot.setAttribute('aria-hidden','true');
    const arrow = document.createElement('span');arrow.className = 'rs-button-arrow';arrow.setAttribute('aria-hidden','true');arrow.textContent = '→';
    button.append(dot,label,arrow);button.classList.add('rs-hover-button');
  }
}

function themeControls() {
  const update = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-rs-theme-toggle]')) { button.setAttribute('aria-label','Switch to ' + (dark ? 'light' : 'dark') + ' theme');button.title = button.getAttribute('aria-label')!;button.setAttribute('aria-pressed',String(dark)); }
  };
  document.querySelectorAll('[data-rs-theme-toggle]').forEach(button => button.addEventListener('click',()=>window.RoleSphereTheme?.toggle()));
  update();window.addEventListener('rolesphere:theme',update);
}

function dashboardIntro() {
  const host = document.getElementById('rs-dashboard-experience'); if (!host) return;
  const token = host.dataset.loginToken, name = host.dataset.name || 'there';
  let seen = false;try { seen = sessionStorage.getItem('rolesphere.welcome') === token; } catch (_) {}
  if (!token || seen || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  try { sessionStorage.setItem('rolesphere.welcome',token); } catch (_) {}
  const previousFocus = document.activeElement as HTMLElement | null;
  const regions = [...document.querySelectorAll<HTMLElement>('body > aside,body > main,body > header')];
  const previousInert = regions.map(el=>el.inert);
  document.body.classList.add('rs-welcoming'); regions.forEach(el => { el.inert = true; });
  const root = createRoot(host);let finished = false;
  const finish = () => { if (finished) return;finished = true;clearTimeout(safety);root.unmount();document.body.classList.remove('rs-welcoming');document.body.classList.add('rs-dashboard-reveal');regions.forEach((el,i)=>{el.inert=previousInert[i];});const heading=[...document.querySelectorAll<HTMLElement>('main h1,main h2')].find(element=>element.getClientRects().length>0);if(heading){heading.setAttribute('tabindex','-1');heading.focus({preventScroll:true});}else previousFocus?.focus(); };
  const safety = setTimeout(finish,5500);
  root.render(<EffectBoundary fallback={<button type="button" className="rs-welcome-fallback" onClick={finish}>Enter workspace</button>}><Welcome name={name} onComplete={finish}/></EffectBoundary>);
}

function start() {
  themeControls();mountUploads();enhanceButtons();
  const admin = document.getElementById('rs-admin-background');
  if (admin) {
    createRoot(admin).render(<EffectBoundary><ASMRBackground/></EffectBoundary>);
    const tools=document.querySelector('.rs-site-tools');
    if(tools){const button=document.createElement('button');button.className='rs-motion-toggle';button.type='button';button.setAttribute('aria-label','Pause background motion');button.textContent='Ⅱ';let paused=false;button.addEventListener('click',()=>{paused=!paused;button.textContent=paused?'▷':'Ⅱ';button.setAttribute('aria-label',paused?'Play background motion':'Pause background motion');window.dispatchEvent(new CustomEvent('rolesphere:motion',{detail:paused}));});tools.append(button);}
  }
  dashboardIntro();
  let queued = false;
  const observer = new MutationObserver(records => {
    if (queued || !records.some(record=>record.addedNodes.length)) return;
    queued = true;queueMicrotask(()=>{queued=false;mountUploads();enhanceButtons();});
  });observer.observe(document.body,{childList:true,subtree:true});
  window.RoleSphereUI = { enhance: (root=document)=>{mountUploads(root);enhanceButtons(root);} };
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
