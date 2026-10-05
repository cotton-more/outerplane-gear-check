// Сообщение экипировки с «Вернуть» — после «Надеть», импорта кода, правки ростера, перехода Core Fusion, выбора билда.
// «Вернуть» после «Надеть» — обратная операция только этого действия: другие правки за эти 8 секунд остаются; после
// импорта — всё, как было до импорта (Р8). tab — где показать: на «Персонажах» оно легло бы на карточку вещи.
// undo — откат по хранилищу, after — остальное (ростер, форма); нет ни того, ни другого — без кнопки.
import type { GearStore } from '@/features/gear/model/gear';
import type { Tab } from '@/shared/tab';

export interface GearMsg {
  text: string;
  note: string;
  tab: Tab;
  undo?: (st: GearStore) => GearStore;
  after?: () => void;
}

// как долго сообщение на экране
export const GEAR_MSG_MS = 8000;
