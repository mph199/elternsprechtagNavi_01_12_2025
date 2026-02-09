import './ExperimentalHeader.css';

import type { ReactNode } from 'react';

export type ExperimentalHeaderProps = {
  sectionLabel: string;
  userLabel?: string;
  menu?: ReactNode;
  hint?: string | null;
};

export function ExperimentalHeader({ sectionLabel, userLabel, menu, hint }: ExperimentalHeaderProps) {
  const resolvedHint = hint === undefined ? 'Navigation über das Menü' : hint;

  return (
    <header className="expHeader" aria-label="Bereichs-Navigation">
      <div className="expHeader__inner">
        <div className="expHeader__left">
          {menu ?? null}

          <div className="expHeader__brand">
            <div className="expHeader__brandBottom">{sectionLabel}</div>
          </div>
        </div>

        <div className="expHeader__meta">
          <div className="expHeader__welcome">
            Angemeldet als{userLabel ? (
              <>
                : <strong>{userLabel}</strong>
              </>
            ) : null}
          </div>
          {resolvedHint ? <div className="expHeader__hint">{resolvedHint}</div> : null}
        </div>
      </div>
    </header>
  );
}
