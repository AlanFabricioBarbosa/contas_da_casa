import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { MONTH_NAMES, shiftMonth, currentMonth } from '@/lib/format';

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const nowYear = Number(currentMonth().slice(0, 4));
  const years = Array.from({ length: 9 }, (_, i) => nowYear - 5 + i);
  if (!years.includes(y)) years.push(y);
  years.sort((a, b) => a - b);

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Escolher mês e ano">
      <Button variant="outline" size="icon" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Mês anterior">
        <ChevronLeft className="size-5" />
      </Button>
      <Select
        aria-label="Mês"
        className="w-auto min-w-[8.5rem]"
        value={m}
        onChange={(e) => onChange(`${y}-${String(e.target.value).padStart(2, '0')}`)}
      >
        {MONTH_NAMES.map((n, i) => (
          <option key={n} value={i + 1}>
            {n.charAt(0).toUpperCase() + n.slice(1)}
          </option>
        ))}
      </Select>
      <Select aria-label="Ano" className="w-auto min-w-0" value={y} onChange={(e) => onChange(`${e.target.value}-${String(m).padStart(2, '0')}`)}>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy}
          </option>
        ))}
      </Select>
      <Button variant="outline" size="icon" onClick={() => onChange(shiftMonth(month, 1))} aria-label="Próximo mês">
        <ChevronRight className="size-5" />
      </Button>
    </div>
  );
}
