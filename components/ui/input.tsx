import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 py-1 text-base text-foreground transition-[background-color,border-color] duration-(--dur-short) outline-2 -outline-offset-2 outline-transparent file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:bg-paper-2 focus-visible:border-foreground/40 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-55 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
