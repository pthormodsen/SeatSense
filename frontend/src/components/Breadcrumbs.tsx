import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  // Omitted for the current page.
  to?: string;
}

const Breadcrumbs = ({ items }: { items: BreadcrumbItem[] }) => (
  <nav aria-label="Breadcrumb">
    <ol className="flex flex-wrap items-center gap-1.5 text-sm text-slate-400">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
          {index > 0 ? <span aria-hidden="true">›</span> : null}
          {item.to ? (
            <Link to={item.to} className="text-cyan-200 hover:text-cyan-100">{item.label}</Link>
          ) : (
            <span aria-current="page" className="text-slate-300">{item.label}</span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

export default Breadcrumbs;
