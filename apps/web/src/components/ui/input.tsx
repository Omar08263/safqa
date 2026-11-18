import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-full border border-border bg-card px-4 text-sm outline-none placeholder:text-muted focus:border-primary',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
