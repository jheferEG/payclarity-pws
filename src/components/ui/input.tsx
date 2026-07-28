import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border-2 border-sky-200 dark:border-sky-800/60 bg-white dark:bg-white/5 px-3.5 py-2",
          "text-sm text-foreground placeholder:text-muted-foreground/60",
          "shadow-sm transition-all duration-200",
          "focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-glow",
          "hover:border-sky-300 dark:hover:border-sky-700",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-muted",
          "md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
