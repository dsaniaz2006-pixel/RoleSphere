import { motion, useReducedMotion } from 'framer-motion';
/** Ajith's responsive blur/stagger reveal, adapted to RoleSphere's intro. */
export function RevealText({ children, delay = 0, className = '' }: { children: string; delay?: number; className?: string }) {
  const reduced = useReducedMotion();
  return <p className={'rs-reveal-text ' + className} aria-label={children}>{children.split(' ').map((word, i) =>
    <motion.span aria-hidden="true" key={i} initial={reduced ? false : { opacity: 0, filter: 'blur(8px)', y: 12 }} animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }} transition={{ duration: reduced ? 0 : .7, delay: reduced ? 0 : delay + i * .045 }}>{word}{' '}</motion.span>)}</p>;
}
