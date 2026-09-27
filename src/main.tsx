import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { IndexContext } from './components/IndexContext';
import { CFG } from './config';
import { MAIN_GRID, STAT_ICON, createIndex } from './data';
import { applyLayout } from './hooks/useLayout';
import { SET_ICON, statIcon } from './icons/own';
import { TEXTS, savedLang } from './i18n';
import { makeCtx } from './logic/context';
import * as logic from './logic/evaluate';
import { MAINS as CODE_MAINS } from './logic/itemCode';
import { flatFactor, scoreBuild, subWeights } from './logic/score';
import { CORE_ANCHORS } from './tour/core';
import './styles/base.css';
import './styles/eval.css';
import './styles/verdict.css';
import './styles/chars.css';
import './styles/tour.css';
import './styles/motion.css';

const D = window.OGC_DATA;
applyLayout(); // классы раскладки на <html> — до первого рендера
const root = createRoot(document.getElementById('root')!);

if (!D) {
  root.render(<p className="empty">{TEXTS[savedLang()].ui.noData} <code>task build:single</code> / <code>task build:pwa</code>.</p>);
} else {
  const idx = createIndex(D);
  root.render(
    <StrictMode>
      <IndexContext.Provider value={idx}>
        <App />
      </IndexContext.Provider>
    </StrictMode>,
  );
  // для отладки из консоли и проверки данных перед публикацией (scripts/check-data.mjs): чистые функции оценки и датасет;
  // known — какие main страница умеет показать и записать в код: новая метка в данных без них — красная проверка.
  // icons — метки, у которых есть и свой значок, и картинка из игры; setIcons — сеты со своим значком (нет — предупреждение)
  const icons = Object.keys(STAT_ICON).filter((k) => statIcon(k, true));
  const known = { codeMains: CODE_MAINS, gridMains: MAIN_GRID, icons, setIcons: Object.keys(SET_ICON) };
  // tour.core — якоря главного тура: check-data проверяет, что они есть на стартовом экране
  const tour = { core: CORE_ANCHORS };
  window.__ogc = { D, idx, CFG, build: __BUILD__, makeCtx, evaluate: logic.evaluate, scoreBuild, flatFactor, subWeights, known, tour };
}
