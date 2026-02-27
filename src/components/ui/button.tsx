import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-text)] text-white hover:bg-[var(--color-text)]/90 shadow-sm",
        destructive: "bg-red-500 text-white hover:bg-red-600 shadow-sm",
        outline: "border border-[var(--color-border)] bg-white hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] shadow-sm",
        secondary: "bg-[var(--color-secondary)] text-white hover:bg-[var(--color-secondary)]/90 shadow-sm",
        ghost: "hover:bg-[var(--color-border)]/30 text-[var(--color-text)]",
        link: "underline-offset-4 hover:underline text-[var(--color-text)]",
        accent: "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] shadow-md",
      },
      size: {
        default: "h-10 py-2 px-4",
        sm: "h-9 px-3 rounded-lg",
        lg: "h-12 px-8 rounded-2xl text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
