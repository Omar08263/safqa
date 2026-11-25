import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { cn } from '../../lib/utils';

// Button hierarchy (styles in styles.css, colors from the section accent):
// primary = gradient pill · secondary = tinted squircle · outline · ghost · icon · chip · fab · destructive
const buttonVariants = cva('btn text-sm disabled:pointer-events-none disabled:opacity-50', {
  variants: {
    variant: {
      default: 'btn-primary',
      primary: 'btn-primary',
      secondary: 'btn-secondary',
      outline: 'rounded-full border border-border bg-card hover:bg-accent',
      ghost: 'btn-ghost',
      icon: 'btn-icon',
      chip: 'btn-chip',
      fab: 'btn-fab',
      destructive: 'btn-danger',
    },
    size: {
      default: '',
      sm: '!h-8 !px-3 text-xs',
      lg: '!h-12 !px-6 text-base',
      icon: '!h-10 !w-10 !p-0',
    },
  },
  compoundVariants: [{ variant: 'outline', size: 'default', class: 'h-10 px-4' }],
  defaultVariants: { variant: 'default', size: 'default' },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';
export { buttonVariants };
