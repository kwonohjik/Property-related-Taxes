"use client";

/**
 * ForeignCurrencyField — 통화 선택(목록 + 「기타」 직접 입력)
 *
 * 국외 부동산은 베트남·캐나다·호주 등 목록 밖 통화가 많다 — 「기타」를 고르면 3자리 통화 코드를 직접 입력한다(서버 ⑨가 `^[A-Z]{3}$`만 받는다).
 * 값은 코드 문자열 하나다 — 목록 안 코드면 select가 그 코드를, 아니면 「기타」를 가리키는 **파생 표시**다(effect·미러링 없음).
 */
import { CURRENCY_OPTIONS } from "@/components/calc/stock-transfer/currency-options";

const LISTED = new Set<string>(CURRENCY_OPTIONS.filter((o) => o.value !== "OTHER").map((o) => o.value));
const SELECT_CLASS =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400";

export function ForeignCurrencyField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const isOther = !LISTED.has(value);
  return (
    <div className="space-y-2">
      <select
        value={isOther ? "OTHER" : value}
        onChange={(e) => onChange(e.target.value === "OTHER" ? "" : e.target.value)}
        className={SELECT_CLASS}
        aria-label="통화"
        data-testid="foreign-currency-select"
      >
        {CURRENCY_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {isOther && (
        <input
          type="text"
          value={value}
          maxLength={3}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          aria-label="통화 코드"
          data-testid="foreign-currency-code"
        />
      )}
    </div>
  );
}
