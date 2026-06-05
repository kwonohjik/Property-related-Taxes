"use client";

/**
 * CulturalHeritageDeferralCard — §74 지정문화유산 등 징수유예 결과 카드.
 *
 * 산식(산출세액 × 재산가액 ÷ 상속재산 = 징수유예세액) + 납부세액(결정세액 − 징수유예) +
 * 대상 재산 내역(담보 면제 여부) + §74② 사후관리 안내.
 * 엔진 result.culturalHeritageDeferralDetail만 소비(재계산 0).
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";

const HERITAGE_LABEL: Record<string, string> = {
  heritage_data: "1호 문화유산자료등",
  museum: "2호 박물관자료등",
  designated: "3호 국가지정문화유산등",
  natural_monument: "4호 천연기념물등",
};

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt
        className={
          strong
            ? "font-semibold text-emerald-900 dark:text-emerald-100"
            : "text-emerald-800 dark:text-emerald-200"
        }
      >
        {label}
      </dt>
      <dd
        className={`text-right font-mono tabular-nums whitespace-nowrap ${strong ? "font-semibold" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

export function CulturalHeritageDeferralCard({ result }: { result: InheritanceTaxResult }) {
  const detail = result.culturalHeritageDeferralDetail;
  const deferred = result.culturalHeritageDeferredTax ?? 0;
  if (!detail || deferred <= 0) return null;
  const payable = result.finalTax - deferred;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
      <h3 className="mb-2 text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        문화유산 등 징수유예 (상증법 §74)
      </h3>

      <dl className="space-y-1 text-sm">
        <Row label="상속세 산출세액" value={formatKRW(detail.computedTaxBase)} />
        <Row label="× 문화유산 등 재산가액" value={formatKRW(detail.qualifyingAssetValue)} />
        <Row
          label="÷ 상속재산가액 (§13 가산증여 포함)"
          value={formatKRW(detail.totalEstateWithPriorGifts)}
        />
        <Row label="= 징수유예세액 (별지9호 ㉖)" value={formatKRW(deferred)} strong />
        <div className="my-1 border-t border-emerald-200 dark:border-emerald-800" />
        <Row label="결정세액" value={formatKRW(result.finalTax)} />
        <Row label="− 징수유예세액" value={formatKRW(deferred)} />
        <Row label="= 납부할세액 (별지9호 ㊳)" value={formatKRW(payable)} strong />
      </dl>

      {detail.items.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            대상 재산
          </p>
          <table className="w-full text-xs">
            <tbody>
              {detail.items.map((it) => (
                <tr
                  key={it.estateItemId}
                  className="border-b border-emerald-100 dark:border-emerald-900"
                >
                  <td className="py-1">{it.itemName?.trim() || HERITAGE_LABEL[it.heritageType]}</td>
                  <td className="py-1 text-emerald-700 dark:text-emerald-300">
                    {HERITAGE_LABEL[it.heritageType]}
                  </td>
                  <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(it.valuatedAmount)}
                  </td>
                  <td className="py-1 text-right text-emerald-600 dark:text-emerald-400">
                    {it.collateralExemptible ? "담보면제" : "담보필요"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/70 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        징수유예 재산을 유상양도하거나 인출하는 경우 즉시 징수됩니다 (상증법 §74②).
      </div>
    </div>
  );
}
