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
  <header className="space-y-3">
    <Breadcrumbs items={breadcrumbs} />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2.5 text-3xl font-semibold text-white">{title}</h1>
        {description ? <div className="mt-2 max-w-2xl text-sm text-slate-400">{description}</div> : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  </header>
);

export default PageHeader;
