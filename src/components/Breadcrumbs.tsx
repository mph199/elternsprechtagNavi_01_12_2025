import { Link, useLocation } from 'react-router-dom';

const labelMap: Record<string, string> = {
  '/': 'Eltern- und Ausbildersprechtag',
  '/login': 'Login',
  '/teacher': 'Lehrkraft',
  '/admin': 'Admin',
  '/admin/teachers': 'Lehrkräfte',
  '/admin/slots': 'Slots',
  '/admin/events': 'Eltern- und Ausbildersprechtage',
  '/impressum': 'Impressum',
  '/datenschutz': 'Datenschutz',
  '/verify': 'E-Mail bestätigen',
};

export function Breadcrumbs() {
  const location = useLocation();
  const path = location.pathname;

  // Build path segments for simple breadcrumbs
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((_, idx, arr) => '/' + arr.slice(0, idx + 1).join('/'));

  const crumbs = segments.length ? segments : ['/'];

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <Link to="/" className="crumb home">
        <span className="breadcrumbs__homeLong">BKSB Buchungssystem</span>
        <span className="breadcrumbs__homeShort">BKSB</span>
      </Link>
      {crumbs.map((p, i) => (
        <span className="crumb-wrap" key={p}>
          <span className="sep" aria-hidden>›</span>
          {i === crumbs.length - 1 ? (
            <span className="crumb current" aria-current="page">{labelMap[p] || p.replace('/', '')}</span>
          ) : (
            <Link to={p} className="crumb">{labelMap[p] || p.replace('/', '')}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
