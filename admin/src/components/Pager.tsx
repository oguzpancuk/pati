interface Props {
  offset: number;
  limit: number;
  total: number;
  onChange: (offset: number) => void;
}

export default function Pager({ offset, limit, total, onChange }: Props) {
  if (total === 0) return null;
  const from = offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="pager">
      <button
        className="small"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        ← Önceki
      </button>
      <span>
        {from}–{to} / {total}
      </span>
      <button className="small" disabled={to >= total} onClick={() => onChange(offset + limit)}>
        Sonraki →
      </button>
    </div>
  );
}
