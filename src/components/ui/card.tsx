import { cn } from "@/lib/utils";

/**
 * Optional pair of colors used to tint the card with a subtle diagonal
 * gradient — handy for match cards where the two team jersey colors give
 * each fixture a unique sense of place without dominating the dark UI.
 *
 * Pass transparent-ish rgba() values (e.g. `teamPalette().tint`) so the
 * effect stays in the "atmosphere" register rather than screaming.
 */
export type CardTint = {
  left: string;
  right: string;
};

export function Card({
  className,
  children,
  tint,
  style,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tint?: CardTint }) {
  const tintStyle: React.CSSProperties | undefined = tint
    ? {
        backgroundImage: `linear-gradient(135deg, ${tint.left} 0%, transparent 45%, transparent 55%, ${tint.right} 100%)`,
      }
    : undefined;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-surface",
        className,
      )}
      style={{ ...tintStyle, ...style }}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardSection({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn("px-5 py-4", className)}
      {...props}
    >
      {children}
    </section>
  );
}
