// Код героя для показа по ссылке (.x/0060-share-code SPEC 3): «OGH» и base62 с CRC-32 (shared/bits). Ссылка — адрес
// сайта и код после «#»: всё после «#» браузер на сервер не шлёт.

export const HERO_PREFIX = 'OGH';

// код героя из вставленного текста: сам код или ссылка с ним после «#». Пробелы, переносы и дефисы (мессенджер, игрок)
// не мешают. Не код героя — null
export function heroCodeIn(text: string): string | null {
  const s = text.replace(/[\s-]+/g, '');
  const at = s.lastIndexOf('#');
  const code = at >= 0 ? s.slice(at + 1) : s;
  return code.startsWith(HERO_PREFIX) && code.length > HERO_PREFIX.length ? code : null;
}
