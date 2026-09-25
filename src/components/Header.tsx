import type { Tab } from '../state/appState';

// Знак — тот же, что на иконке приложения (update.py, render_app_icon): буква O из логотипа Outerplane с искрой.
function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="bm-ring" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="40">
          <stop offset="0" stopColor="#f8c848" /><stop offset="1" stopColor="#ee7a1a" />
        </linearGradient>
        <linearGradient id="bm-spark" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="40">
          <stop offset="0" stopColor="#fffcf4" /><stop offset="1" stopColor="#ffdd9a" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="8" fill="#151a22" />
      <path fill="url(#bm-ring)" fillRule="evenodd" d="M6.74 20a13.26 15.444 0 1 0 26.52 0a13.26 15.444 0 1 0-26.52 0Zm6.033 0a7.227 10.27 0 1 1 14.454 0a7.227 10.27 0 1 1-14.454 0Z" />
      <path fill="url(#bm-spark)" d="M20 10.757Q20 20 24.336 20Q20 20 20 29.243Q20 20 15.664 20Q20 20 20 10.757Z" />
    </svg>
  );
}

export function Header({ tab, onTab, rosterSize }: { tab: Tab; onTab: (t: Tab) => void; rosterSize: number }) {
  return (
    <header className="top">
      <div className="brand">
        <BrandMark />
        <div>
          <h1>Gear Check</h1>
          <p>Outerplane · что оставить, что разобрать</p>
        </div>
      </div>
      <nav className="tabs" role="tablist" aria-label="Разделы">
        <button type="button" role="tab" id="tab-eval" aria-controls="view-eval" aria-selected={tab === 'eval'} onClick={() => onTab('eval')}>Оценка предмета</button>
        <button type="button" role="tab" id="tab-chars" aria-controls="view-chars" aria-selected={tab === 'chars'} onClick={() => onTab('chars')}>
          Персонажи <span className="count">{rosterSize ? `★ ${rosterSize}` : ''}</span>
        </button>
      </nav>
    </header>
  );
}
