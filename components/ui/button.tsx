import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "cn"

// Keystone controls (DESIGN.md "Controls"): the filled action is ink board, the quiet one is a cotton card.
// Eight states: rest, hover (one signal), focus (instant 2px ring, never transitioned), active (1px press),
// disabled (opacity + not-allowed + native attribute), busy (aria-busy), invalid (aria-invalid), expanded.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,color,border-color,box-shadow,transform] duration-(--dur-short) ease-(--ease-out) outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:not-aria-[haspopup]:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 aria-busy:cursor-progress aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-board text-board-type shadow-sm hover:bg-board-hover",
        outline:
          "bg-card text-foreground shadow-stock hover:-translate-y-px hover:shadow-stock-lift active:shadow-stock aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-foreground hover:bg-muted aria-expanded:bg-muted",
        destructive:
          "border-destructive/40 bg-card text-destructive hover:bg-destructive/10",
        link: "h-auto! px-0! text-primary underline decoration-1 underline-offset-4 hover:decoration-2",
      },
      size: {
        default:
          "h-9 gap-2 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-8 gap-1.5 rounded-lg px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-lg px-3 text-xs has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-lg",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
