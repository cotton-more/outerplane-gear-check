// Переключатели «Ещё» → «Настройки»: язык и значки.
import { LANG_NAME, LANGS, useT, type Lang } from '@/i18n';
import { SegSwitch } from '@/shared/ui/SegSwitch';

// «Язык: Русский · English» — в «Ещё» и в справке
export function LangSwitch({ lang, onLang }: { lang: Lang; onLang: (l: Lang) => void }) {
  const t = useT();
  return (
    <SegSwitch className="lang" label={`${t.ui.language}:`} group={t.ui.language} value={lang} onChange={onLang}
      options={LANGS.map((l) => ({ value: l, label: LANG_NAME[l], lang: l }))} />
  );
}

// «Значки: из игры · свои» — картинки из игры или свои контуры (портреты персонажей — из игры всегда); без выбора — из игры
export function IconSwitch({ game, onChange }: { game: boolean; onChange: (game: boolean) => void }) {
  const t = useT();
  return (
    <SegSwitch className="lang" label={`${t.ui.icons}:`} group={t.ui.icons} value={game} onChange={onChange}
      options={[{ value: true, label: t.ui.iconsGame }, { value: false, label: t.ui.iconsOwn }]} />
  );
}
