import type { ReactNode } from 'react';
import Breadcrumbs, { type BreadcrumbItem } from './Breadcrumbs';

interface PageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  title: ReactNode;
  description?: ReactNode;
  // Right-aligned on wide screens, e.g. a floor selector or secondary button.
  actions?: ReactNode;
}

// Header for the building, floor and room pages. The home hero is separate.
const PageHeader = ({ breadcrumbs, title, description, actions }: PageHeaderProps) => (
  <header className="space-y-5">
    <Breadcrumbs items={breadcrumbs} />
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-x-4 gap-y-2 text-4xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl">
          {title}
        </h1>
        {description ? <div className="mt-4 max-w-2xl text-sm text-slate-400 sm:text-base">{description}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  </header>
);

export default PageHeader;
