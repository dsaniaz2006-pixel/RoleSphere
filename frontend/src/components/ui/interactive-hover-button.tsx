import type { ButtonHTMLAttributes } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Adapted from Dillion Verma / Magic UI's dot-to-fill hover interaction. */
export function InteractiveHoverButton({ children, className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cn('rs-hover-button', className)} {...props}>
    <span className="rs-button-dot" aria-hidden="true" />
    <span className="rs-button-label">{children}</span>
    <ArrowRight className="rs-button-arrow" size={16} aria-hidden="true" />
  </button>;
}
