// localStorage с префиксом 'ogc.'. Без хранилища (приватный режим, песочница) живём в памяти.
const PREFIX = 'ogc.';

export const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(PREFIX + key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch { /* без хранилища живём в памяти */ }
  },
};
