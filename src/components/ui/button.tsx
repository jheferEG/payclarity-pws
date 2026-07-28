import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        /* navy → blue: main CTA */
        default:
          "rounded-xl bg-gradient-primary text-white shadow-elegant hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] hover:shadow-btn",
        /* sky blue → cyan: bright highlight actions */
        cta:
          "rounded-xl bg-gradient-cta text-white shadow-btn hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]",
        /* muted blue fill */
        secondary:
          "rounded-xl bg-secondary text-secondary-foreground border border-sky-200/60 dark:border-sky-800/60 hover:bg-sky-100 dark:hover:bg-sky-900/40 hover:border-sky-300 dark:hover:border-sky-700 active:scale-[0.98]",
        /* outlined */
        outline:
          "rounded-xl border-2 border-accent/40 bg-white dark:bg-transparent text-accent hover:bg-accent hover:text-white hover:border-accent active:scale-[0.98]",
        /* ghost */
        ghost:
          "rounded-lg hover:bg-accent/10 hover:text-accent active:scale-[0.98]",
        /* danger */
        destructive:
          "rounded-xl bg-destructive text-white shadow-sm hover:bg-destructive/90 hover:scale-[1.02] active:scale-[0.98]",
        /* text link */
        link: "text-accent underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-3 text-xs rounded-lg",
        lg: "h-12 px-8 text-base rounded-2xl",
        icon: "h-9 w-9 rounded-xl",
        "icon-sm": "h-8 w-8 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
