// Значение, которое само гаснет через ms: сообщение с «Вернуть». Новое значение — отсчёт заново.
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function useTimed<T>(ms: number): [T | null, Dispatch<SetStateAction<T | null>>] {
  const [value, set] = useState<T | null>(null);
  useEffect(() => {
    if (!value) return;
    const id = setTimeout(() => set(null), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return [value, set];
}
