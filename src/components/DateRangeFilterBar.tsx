import React from 'react';
import { CalendarDays, X } from 'lucide-react';
import { parseFirestoreDate } from '../lib/utils';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatLocalYMD(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toLocalYMD(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }
  const parsed = parseFirestoreDate(value);
  if (!parsed || isNaN(parsed.getTime())) return null;
  return formatLocalYMD(parsed);
}

export function isWithinDateRange(value: any, startDate: string, endDate: string): boolean {
  const cleanStart = startDate.trim();
  const cleanEnd = endDate.trim();
  if (!cleanStart && !cleanEnd) return true;

  const ymd = toLocalYMD(value);
  if (!ymd) return false;

  let minD = cleanStart;
  let maxD = cleanEnd;
  if (minD && maxD && minD > maxD) {
    [minD, maxD] = [maxD, minD];
  }

  if (minD && ymd < minD) return false;
  if (maxD && ymd > maxD) return false;
  return true;
}

interface DateRangeFilterBarProps {
  label: string;
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onClear: () => void;
  position?: 'top' | 'bottom';
}

export const DateRangeFilterBar: React.FC<DateRangeFilterBarProps> = ({
  label,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  onClear,
  position = 'top',
}) => {
  const hasRange = Boolean(startDate || endDate);
  const dividerClass =
    position === 'top'
      ? 'pb-2.5 mb-2.5 border-b border-gray-100'
      : 'mt-2.5 pt-2.5 border-t border-gray-100';

  return (
    <div className={`${dividerClass} flex flex-col md:flex-row md:items-center gap-2 min-w-0`}>
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500">
          <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
          <span className="whitespace-nowrap">{label}</span>
        </div>

        {hasRange && (
          <button
            type="button"
            onClick={onClear}
            className="md:hidden h-7 px-2 inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-md transition-colors cursor-pointer shrink-0"
            title="Reset rentang tanggal"
          >
            <X className="w-3 h-3" />
            <span>Reset</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:flex md:flex-wrap md:items-center gap-2 w-full md:w-auto min-w-0">
        <label className="relative flex items-center justify-between gap-2 h-9 md:h-8.5 bg-gray-50/70 border border-gray-200 rounded-lg px-2.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition w-full md:w-auto min-w-0">
          <span className="text-[11px] font-medium text-gray-400 shrink-0 select-none">
            Dari
          </span>
          <input
            type="date"
            value={startDate}
            max={endDate || undefined}
            onChange={(e) => onStartDateChange(e.target.value)}
            aria-label={`${label} dari`}
            className="bg-transparent text-xs text-gray-800 focus:outline-none cursor-pointer flex-1 md:flex-none min-w-0 md:min-w-[136px] tabular-nums"
          />
        </label>

        <span className="text-xs text-gray-400 select-none hidden md:inline shrink-0">–</span>

        <label className="relative flex items-center justify-between gap-2 h-9 md:h-8.5 bg-gray-50/70 border border-gray-200 rounded-lg px-2.5 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 transition w-full md:w-auto min-w-0">
          <span className="text-[11px] font-medium text-gray-400 shrink-0 select-none">
            Sampai
          </span>
          <input
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-label={`${label} sampai`}
            className="bg-transparent text-xs text-gray-800 focus:outline-none cursor-pointer flex-1 md:flex-none min-w-0 md:min-w-[136px] tabular-nums"
          />
        </label>

        {hasRange && (
          <button
            type="button"
            onClick={onClear}
            className="hidden md:inline-flex h-8.5 px-2.5 items-center gap-1 text-xs font-medium text-gray-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-gray-200 hover:border-indigo-200 rounded-lg transition-colors cursor-pointer shrink-0"
            title="Reset rentang tanggal"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        )}
      </div>
    </div>
  );
};
