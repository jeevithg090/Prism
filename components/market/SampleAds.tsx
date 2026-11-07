import { ExternalLink } from "lucide-react";
import { SectionCard } from "@/components/keystone";
import type { RoleDemand } from "@/lib/types";

export function SampleAds({ ads }: { ads: RoleDemand["sampleAds"] }) {
  return (
    <SectionCard title="Sample ads">
      <ul className="flex flex-col gap-2">
        {ads.map((ad) => (
          <li key={ad.url}>
            <a href={ad.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              {ad.title}
              <ExternalLink aria-hidden size={14} />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
            <span className="text-muted-foreground"> · {ad.company}</span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}
