// Булавка «Не отдавать надетое» (R10.2) на плитке героя: значок и то же словами для диктора. Вид — по className.
import { Icon } from '@/game/icons/Img';

export function PinMark({ label, className }: { label: string; className: string }) {
  return <span className={className} title={label}><Icon name="pin" /><span className="sr-only">{label}</span></span>;
}
