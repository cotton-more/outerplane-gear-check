import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { IndexContext } from './components/IndexContext';
import { CFG } from './config';
import { createIndex } from './data';
import { applyLayout } from './hooks/useLayout';
import * as logic from './logic/evaluate';
import { flatFactor, scoreBuild, subWeights } from './logic/score';
import './styles/base.css';
import './styles/eval.css';
import './styles/verdict.css';
import './styles/chars.css';

const D = window.OGC_DATA;
applyLayout(); // классы раскладки на <html> — до первого рендера
const root = createRoot(document.getElementById('root')!);

if (!D) {
  root.render(<p className="empty">Нет данных. Собери страницу: <code>task build:single</code> или <code>task build:pwa</code>.</p>);
} else {
  const idx = createIndex(D);
  root.render(
    <StrictMode>
      <IndexContext.Provider value={idx}>
        <App />
      </IndexContext.Provider>
    </StrictMode>,
  );
  // для отладки из консоли: чистые функции оценки и датасет
  window.__ogc = { D, idx, CFG, evaluate: logic.evaluate, scoreBuild, flatFactor, subWeights };
}
