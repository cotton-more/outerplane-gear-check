// Справка для новичка: карточка при первом запуске (пока ростер пуст) и окно «Справка».
import { CODE_PREFIX } from '../logic/itemCode';
import { Rich } from './Rich';

export interface InstallInfo { canInstall: boolean; onInstall: () => void; ios: boolean }

// коротко: на разделённом экране карточка не должна закрывать форму целиком
const STEPS = [
  '**Отметь своих персонажей** — пока их нет, оценка идёт по всем персонажам игры.',
  '**Вбей вещь:** слот, грейд (L — Etheric, E — Steel), сет или предмет, сабстаты с жёлтыми сегментами.',
  '**Вердикт** — сразу, с объяснением. «Сброс» — к следующей вещи.',
];

// установка: на Android — кнопка (beforeinstallprompt), на iPhone и iPad — только вручную через «Поделиться»
function InstallHint({ install }: { install: InstallInfo }) {
  if (install.canInstall) {
    return (
      <p className="guide-install">
        <span>Можно установить как приложение — работает и без сети.</span>
        <button type="button" className="btn" onClick={install.onInstall}>Установить</button>
      </p>
    );
  }
  if (install.ios) return <p className="guide-install"><span><Rich text="**iPhone и iPad:** Safari → «Поделиться» → «На экран „Домой“» — будет работать и без сети." /></span></p>;
  return null;
}

export function Welcome({ install, onRoster, onClose }: { install: InstallInfo; onRoster: () => void; onClose: () => void }) {
  return (
    <section className="panel welcome" aria-label="Как пользоваться">
      <h2>Как пользоваться</h2>
      <ol>{STEPS.map((t) => <li key={t}><Rich text={t} /></li>)}</ol>
      <InstallHint install={install} />
      <div className="welcome-actions">
        <button type="button" className="btn primary" onClick={onRoster}>Отметить персонажей</button>
        <button type="button" className="btn" onClick={onClose}>Понятно</button>
      </div>
    </section>
  );
}

const VERDICTS: [string, string][] = [
  ['Оставить', 'вещь нужна — носи и прокачивай. «Стоит прокачать» — ролл хороший, выгодно вкладывать Reforge.'],
  ['Временно', 'нужной пассивки нет, но main stat и ролл годятся: носи, пока не найдёшь рекомендованную.'],
  ['Фоддер', 'оставь на Breakthrough такой же вещи с правильным main stat.'],
  ['Спорно', 'решай сам — в подробностях написано, в чём сомнение (например, вещь хороша для персонажа не из твоего ростера).'],
  ['Разобрать', 'твоим персонажам не подходит или ролл слабый.'],
];

// содержимое окна «Справка»
export function Help({ install }: { install: InstallInfo }) {
  return (
    <div className="guide">
      <h4>Как пользоваться</h4>
      <ol>{STEPS.map((t) => <li key={t}><Rich text={t} /></li>)}</ol>
      <h4>Ввод вещи</h4>
      <ul>
        <li><Rich text="**Броня** — сет: он в названии после «of» (Etheric Gloves of Speed → Speed Set)." /></li>
        <li><Rich text="**Legendary оружие и аксессуар** — найди предмет, потом выбери main stat. Совсем новый, которого нет в списке, — «нет в списке»." /></li>
        <li><Rich text="**Epic оружие и аксессуар** (Steel…) — пассивки нет, сразу main stat." /></li>
        <li>Нажми на выбранный сабстат, чтобы заменить его, ✕ — убрать. Всё ниже 6★ Epic — сразу в разбор.</li>
      </ul>
      <h4>Вердикт</h4>
      <ul>{VERDICTS.map(([k, t]) => <li key={k}><b>{k}</b> — {t}</li>)}</ul>
      <h4>Персонажи</h4>
      <ul>
        <li>Звёздочка отмечает персонажа в ростере; с галочкой «только мои персонажи» оценка учитывает только их. «Экспорт / импорт» переносит ростер кодом на другое устройство.</li>
        <li>Нажми на персонажа — откроются его билды: сеты, оружие, приоритет сабстатов.</li>
      </ul>
      <h4>Код для гильдии</h4>
      <p>В подробностях вердикта есть код вещи, например {CODE_PREFIX} KXRM TPWA. Скопируй его в чат игры; кто получил — нажимает «Ввести код» и перепечатывает. Оценка у каждого — по своему ростеру.</p>
      <h4>Установка</h4>
      <InstallHint install={{ ...install, ios: false }} /> {/* для iPhone — строка в списке ниже */}
      <ul>
        <li><Rich text="**Android (Chrome):** меню ⋮ → «Установить приложение» или «Добавить на главный экран»." /></li>
        <li><Rich text="**iPhone и iPad:** в Safari «Поделиться» → «На экран „Домой“»." /></li>
        <li>Установленное приложение работает без сети. Когда выйдут новые данные, появится плашка «Обновить».</li>
      </ul>
    </div>
  );
}
