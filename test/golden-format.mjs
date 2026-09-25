// Компактная запись результата оценки для эталона (test/golden.json).
// Общая для старой страницы (scripts/golden-old.mjs) и новой логики (test/golden.test.ts):
// одинаковый формат — значит, сравнение честное.

const round = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
const HEAD_ROWS = 12; // столько строк секции видно без «показать всех»; порядок остальных сверяется по хэшу

// FNV-1a: короткий отпечаток полного списка строк
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

const partsText = (parts) => parts.map((p) => `${p.key}${p.ok ? `${p.half ? '½' : ''}${p.tier + 1}` : '×'}`).join(' ');
const combosText = (combos) => (combos ? combos.map((cb) => cb.map((p) => `${p.set}x${p.n}`).join('+')).join(',') : '');
const mainsText = (m) => (m.mainOk === undefined ? '' : `${m.mainOk ? '+' : '-'}${m.mains.join('/')}`);

// класс оценки строки — так же, как его выбирает строка вердикта
function scoreClass(m, qualifies, keepCount) {
  if (m.good == null) return '';
  const ok = qualifies ? qualifies(m) : m.good >= keepCount;
  return ok ? 'hi' : m.good >= 2 ? 'mid' : 'lo';
}

export function compactRow(m, qualifies, keepCount) {
  return [m.c.id, m.b.name, m.alt.join('|'), m.good, m.yellow ?? 0, round(m.ratio), m.spd ? 1 : 0,
    partsText(m.parts), scoreClass(m, qualifies, keepCount), combosText(m.combos), mainsText(m)];
}

function compactRows(rows) {
  return { rows: rows.slice(0, HEAD_ROWS), all: rows.length > HEAD_ROWS ? fnv1a(JSON.stringify(rows)) : '' };
}

export function compactVerdict(res, { text, keepCount }) {
  return {
    v: res.v,
    title: text(res.title),
    lines: res.lines.map(text),
    badge: res.badge || '',
    foot: text(res.foot),
    secs: res.sections.map((s) => ({
      t: s.title,
      n: s.count ?? s.rows.length,
      lim: s.limit ?? null,
      col: s.collapsed ? 1 : 0,
      dim: s.dim ? 1 : 0,
      mn: s.mainNote ?? null,
      ...compactRows(s.rows.map((m) => compactRow(m, res.qualifies, keepCount))),
    })),
  };
}

// подвал вердикта — одна из пары длинных констант: в случае храним номер, тексты — в meta.feet
export function internFeet(cases, feet = []) {
  for (const c of cases) {
    let i = feet.indexOf(c.out.foot);
    if (i < 0) i = feet.push(c.out.foot) - 1;
    c.out.foot = i;
  }
  return feet;
}

// один случай — одна строка: diff эталона читается построчно
export function stringifyGolden(golden) {
  const lines = (arr) => arr.map((x) => '  ' + JSON.stringify(x)).join(',\n');
  return `{\n"meta": ${JSON.stringify(golden.meta)},\n"cases": [\n${lines(golden.cases)}\n],\n"lists": [\n${lines(golden.lists)}\n]\n}\n`;
}
