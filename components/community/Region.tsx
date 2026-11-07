import * as React from "react";

/** The one card recipe on this page: cotton, a hairline and a light cast. */
export const CARD = "rounded-2xl border bg-card shadow-sm";

/**
 * A region set on the paper: its head sits above the content card, so the loading, empty and error
 * cards replace the content at the same level and a card never lands inside another card.
 */
export function Region({
  id, title, description, note, actions, children, className, headWidth = "max-w-[60ch]",
}: {
  id: string;
  title: string;
  description?: React.ReactNode;
  note?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Measure cap for the head text; a narrower cap lets the actions sit beside it. */
  headWidth?: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className={`min-w-0 ${headWidth}`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h2 id={id} className="text-xl font-semibold text-balance text-foreground">{title}</h2>
            {note}
          </div>
          {description && <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
