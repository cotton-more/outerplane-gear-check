// Строка-радио в шторке выбора: имя жирным, справа метка (k — «3 из 4»), ниже мелко подпись. Общая у шторки закрепления
// (features/worn/PinSheet) и заказа обмена (features/trade/ui/OrderSheet); список — <ul className="alist" role="radiogroup">
export function RadioRow({ checked, name, k, sub, onClick }: { checked: boolean; name: string; k?: string; sub?: string; onClick: () => void }) {
  return (
    <li>
      <button type="button" role="radio" aria-checked={checked} className="arow" onClick={onClick}>
        <span className="arow-h"><b>{name}</b>{k && <span className="pin-k">{k}</span>}</span>
        {sub && <span className="arow-l">{sub}</span>}
      </button>
    </li>
  );
}
