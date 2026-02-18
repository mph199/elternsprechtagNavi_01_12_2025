import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { useAuth } from '../contexts/useAuth';
import './GlobalTopHeader.css';

export function GlobalTopHeader() {
  const headerRef = useRef<HTMLElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout, activeView, setActiveView } = useAuth();

  const pathname = location.pathname;
  const onLogin = pathname === '/login' || pathname === '/login/';
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const inTeacher = pathname === '/teacher' || pathname.startsWith('/teacher/');
  const showAreaMenu = Boolean(isAuthenticated && (inAdmin || inTeacher));
  const showModuleTitle = !onLogin && !inAdmin && !inTeacher;
  const isPublic = showModuleTitle;
  const isArea = showAreaMenu;
  const canSwitchView = Boolean(user?.role === 'admin' && user.teacherId);

  const userLabel = user?.fullName || user?.username;

  const areaLabel = useMemo(() => {
    if (!showAreaMenu) return null;

    if (inTeacher) {
      if (pathname === '/teacher' || pathname === '/teacher/') return 'Lehrkraft · Start';
      if (pathname.includes('/teacher/requests')) return 'Lehrkraft · Anfragen verwalten';
      if (pathname.includes('/teacher/bookings')) return 'Lehrkraft · Buchungen einsehen';
      if (pathname.includes('/teacher/password')) return 'Lehrkraft · Passwort ändern';
      if (pathname.includes('/teacher/feedback')) return 'Lehrkraft · Feedback senden';
      return 'Lehrkraft';
    }

    if (pathname === '/admin' || pathname === '/admin/') return 'Admin · Übersicht';
    if (pathname.includes('/admin/teachers')) return 'Admin · Lehrkräfte verwalten';
    if (pathname.includes('/admin/events')) return 'Admin · Eltern- und Ausbildersprechtage verwalten';
    if (pathname.includes('/admin/slots')) return 'Admin · Slots verwalten';
    if (pathname.includes('/admin/users')) return 'Admin · Benutzer & Rechte verwalten';
    if (pathname.includes('/admin/feedback')) return 'Admin · Feedback einsehen';
    return 'Admin';
  }, [inTeacher, pathname, showAreaMenu]);

  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;

    const setHeightVar = () => {
      const height = element.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--globalTopHeaderHeight', `${Math.round(height)}px`);
    };

    setHeightVar();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => setHeightVar());
      observer.observe(element);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', setHeightVar);
    return () => window.removeEventListener('resize', setHeightVar);
  }, []);

  return (
    <header
      ref={headerRef}
      className={`globalTopHeader${isPublic ? ' globalTopHeader--public' : ''}${isArea ? ' globalTopHeader--area' : ''}`}
      aria-label="BKSB Buchungssystem"
    >
      <div className="globalTopHeader__inner">
        <div className="globalTopHeader__left">
          {showAreaMenu ? (
            <Sidebar
              label="Menü"
              ariaLabel="Menü"
              variant="icon"
              side="left"
              noWrapper
              buttonClassName="globalTopHeader__menuButton"
              footer={
                inTeacher ? (
                  <div className="dropdown__note" role="note">
                    Bei technischen Anliegen wendet euch gerne an HUM (
                    <a href="mailto:marc.huhn@bksb.nrw">marc.huhn@bksb.nrw</a>)
                  </div>
                ) : undefined
              }
            >
              {({ close }) => (
                <>
                  <div className="dropdown__sectionTitle">Aktionen</div>

                  {inTeacher ? (
                    <>
                      <button
                        type="button"
                        className={pathname === '/teacher' || pathname === '/teacher/' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/teacher');
                          close();
                        }}
                      >
                        <span>Startseite</span>
                        {(pathname === '/teacher' || pathname === '/teacher/') && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/teacher/requests' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/teacher/requests');
                          close();
                        }}
                      >
                        <span>Anfragen verwalten</span>
                        {pathname === '/teacher/requests' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/teacher/bookings' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/teacher/bookings');
                          close();
                        }}
                      >
                        <span>Buchungen einsehen</span>
                        {pathname === '/teacher/bookings' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/teacher/password' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/teacher/password');
                          close();
                        }}
                      >
                        <span>Passwort ändern</span>
                        {pathname === '/teacher/password' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/teacher/feedback' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/teacher/feedback');
                          close();
                        }}
                      >
                        <span>Feedback senden</span>
                        {pathname === '/teacher/feedback' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={pathname === '/admin' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/admin');
                          close();
                        }}
                      >
                        <span>Übersicht öffnen</span>
                        {pathname === '/admin' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/admin/teachers' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/admin/teachers');
                          close();
                        }}
                      >
                        <span>Lehrkräfte verwalten</span>
                        {pathname === '/admin/teachers' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/admin/events' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/admin/events');
                          close();
                        }}
                      >
                        <span>Eltern- und Ausbildersprechtage verwalten</span>
                        {pathname === '/admin/events' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/admin/slots' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/admin/slots');
                          close();
                        }}
                      >
                        <span>Slots verwalten</span>
                        {pathname === '/admin/slots' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/admin/users' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/admin/users');
                          close();
                        }}
                      >
                        <span>Benutzer & Rechte verwalten</span>
                        {pathname === '/admin/users' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={pathname === '/admin/feedback' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          navigate('/admin/feedback');
                          close();
                        }}
                      >
                        <span>Feedback einsehen</span>
                        {pathname === '/admin/feedback' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                    </>
                  )}

                  {canSwitchView && (
                    <>
                      <div className="dropdown__divider" role="separator" />
                      <div className="dropdown__sectionTitle">Ansicht</div>
                      <button
                        type="button"
                        className={(activeView ?? (inTeacher ? 'teacher' : 'admin')) === 'teacher' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          setActiveView('teacher');
                          navigate('/teacher', { replace: true });
                          close();
                        }}
                      >
                        <span>Lehrkraft</span>
                        {(activeView ?? (inTeacher ? 'teacher' : 'admin')) === 'teacher' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                      <button
                        type="button"
                        className={(activeView ?? (inTeacher ? 'teacher' : 'admin')) === 'admin' ? 'dropdown__item dropdown__item--active' : 'dropdown__item'}
                        onClick={() => {
                          setActiveView('admin');
                          navigate('/admin', { replace: true });
                          close();
                        }}
                      >
                        <span>Admin</span>
                        {(activeView ?? (inTeacher ? 'teacher' : 'admin')) === 'admin' && <span className="dropdown__hint">Aktiv</span>}
                      </button>
                    </>
                  )}

                  <div className="dropdown__divider" role="separator" />
                  <button
                    type="button"
                    className="dropdown__item"
                    onClick={() => {
                      navigate('/');
                      close();
                    }}
                  >
                    <span>Zur Buchungsseite</span>
                  </button>
                  <button
                    type="button"
                    className="dropdown__item dropdown__item--danger"
                    onClick={() => {
                      close();
                      void (async () => {
                        await logout();
                        navigate('/login');
                      })();
                    }}
                  >
                    <span>Abmelden</span>
                  </button>
                </>
              )}
            </Sidebar>
          ) : null}

          <div className="globalTopHeader__brand" aria-label="BKSB Buchungssystem">
            <div className="globalTopHeader__brandTop">BKSB</div>
            <div className="globalTopHeader__brandBottom">Buchungssystem</div>
          </div>

          {showModuleTitle ? <div className="globalTopHeader__moduleTitle">Eltern- und Ausbildersprechtag</div> : null}

          {areaLabel ? <div className="globalTopHeader__areaLabel">{areaLabel}</div> : null}
        </div>

        <div className="globalTopHeader__right">
          {showAreaMenu ? (
            <div className="globalTopHeader__user" aria-label="Angemeldeter Benutzer">
              Angemeldet als{userLabel ? (
                <>
                  : <strong>{userLabel}</strong>
                </>
              ) : null}
            </div>
          ) : !onLogin ? (
            <Link className="globalTopHeader__login" to="/login">
              Login
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
