import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-base text-foreground transition-[background-color,border-color] duration-(--dur-short) outline-2 -outline-offset-2 outline-transparent placeholder:text-muted-foreground hover:bg-paper-2 focus-visible:border-foreground/40 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-55 aria-invalid:border-destructive md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
