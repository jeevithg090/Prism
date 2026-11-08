import Image, { type StaticImageData } from "next/image";
import { cn } from "@/lib/utils";

/**
 * A capture of the running Keystone app (taken with Hallmark's capture script, demo data only),
 * framed in the system's card surface. Never a drawn browser bar or device frame.
 */
export function ProductShot({
  src,
  alt,
  caption,
  preload = false,
  sizes = "(min-width: 1024px) 58vw, 100vw",
  className,
}: {
  src: StaticImageData;
  alt: string;
  caption?: React.ReactNode;
  preload?: boolean;
  sizes?: string;
  className?: string;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      <div data-kind="product" className="overflow-hidden rounded-2xl border bg-card shadow-sm">
        <Image src={src} alt={alt} sizes={sizes} preload={preload} className="h-auto w-full" />
      </div>
      {caption && <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">{caption}</figcaption>}
    </figure>
  );
}
