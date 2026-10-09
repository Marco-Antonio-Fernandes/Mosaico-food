import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  aside?: ReactNode;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  aside,
}: PageHeaderProps) {
  return (
    <section className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
      <div>
        <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted">
          {description}
        </p>
      </div>
      {aside}
    </section>
  );
}
