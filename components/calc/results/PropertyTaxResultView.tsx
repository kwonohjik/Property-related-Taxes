"use client";

/**
 * 재산세 계산 결과 표시 컴포넌트 (P1-15)
 *
 * 표시 항목:
 * - 과세표준 (공정시장가액비율 포함)
 * - 산출세액 (세율 + 1세대1주택 특례 뱃지)
 * - 세부담상한 적용 후 확정세액
 * - 부가세 분해 (지방교육세·도시지역분·지역자원시설세)
 * - 총 납부세액
 * - 분납 안내
 */

import type { PropertyTaxResult } from "@/lib/tax-engine/types/property.types";
import { LawArticleModal } from "@/components/ui/law-article-modal";

function formatKRW(amount: number): string {
  return amount.toLocaleString("ko-KR") + "원";
}

function formatRate(rate: number): string {
  return (rate * 100).toFixed(4).replace(/\.?0+$/, "") + "%";
}

interface Props {
  result: PropertyTaxResult;
}

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
  note,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
  note?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between py-2 ${
        highlight
          ? "border-t-2 border-foreground font-bold text-base"
          : sub
          ? "pl-4 text-sm text-muted-foreground"
          : "text-sm"
      }`}
    >
      <span>
        {label}
        {note && (
          <span className="ml-1 text-xs text-muted-foreground">({note})</span>
        )}
      </span>
      <span className={highlight ? "text-primary" : ""}>{formatKRW(amount)}</span>
    </div>
  );
}

export function PropertyTaxResultView({ result }: Props) {
  const {
    publishedPrice,
    fairMarketRatio,
    taxBase,
    appliedRate,
    calculatedTax,
    calculatedTaxBeforeCap,
    taxCapRate,
    determinedTax,
    surtax,
    totalSurtax,
    totalPayable,
    installment,
    oneHouseSpecialApplied,
    warnings,
    legalBasis,
  } = result;

  const capApplied = determinedTax < calculatedTaxBeforeCap;

  return (
    <div className="space-y-6">
      {/* ─── 경고 메시지 ─── */}
      {warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* ─── 과세표준 ─── */}
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          과세표준
        </h3>
        <div className="rounded-md border divide-y">
          <TaxRow
            label="공시가격"
            amount={publishedPrice}
          />
          <TaxRow
            label={`공정시장가액비율 (${formatRate(fairMarketRatio)})`}
            amount={Math.floor(publishedPrice * fairMarketRatio)}
            sub
          />
          <TaxRow
            label="과세표준 (천원 절사)"
            amount={taxBase}
            highlight
          />
        </div>
      </section>

      {/* ─── 산출세액 ─── */}
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          산출세액
          {oneHouseSpecialApplied && (
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
              1세대1주택 특례
            </span>
          )}
        </h3>
        <div className="rounded-md border divide-y">
          <TaxRow
            label={`적용 세율 (${formatRate(appliedRate)})`}
            amount={calculatedTax}
            sub
          />
          <TaxRow label="산출세액" amount={calculatedTax} />
          {capApplied && (
            <>
              <TaxRow
                label={`세부담상한 적용 (상한율 ${formatRate(taxCapRate)})`}
                amount={determinedTax}
                sub
                note={`전년도 × ${taxCapRate * 100 - 100 > 0 ? `${((taxCapRate - 1) * 100).toFixed(0)}% 가산`  : "상한"}`}
              />
              <TaxRow label="확정세액 (상한 적용 후)" amount={determinedTax} highlight />
            </>
          )}
          {!capApplied && (
            <TaxRow label="확정세액" amount={determinedTax} highlight />
          )}
        </div>
      </section>

      {/* ─── 부가세 ─── */}
      <section className="space-y-1">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          부가세
        </h3>
        <div className="rounded-md border divide-y">
          <TaxRow
            label="지방교육세"
            amount={surtax.localEducationTax}
            note="재산세 × 20%"
            sub
          />
          {surtax.urbanAreaTax > 0 && (
            <TaxRow
              label="도시지역분"
              amount={surtax.urbanAreaTax}
              note="과세표준 × 0.14%"
              sub
            />
          )}
          {surtax.regionalResourceTax > 0 && (
            <TaxRow
              label="지역자원시설세"
              amount={surtax.regionalResourceTax}
              note="건축물 시가표준액 누진"
              sub
            />
          )}
          <TaxRow label="부가세 합계" amount={totalSurtax} />
        </div>
      </section>

      {/* ─── 총 납부세액 ─── */}
      <section>
        <div className="rounded-md border bg-primary/5 divide-y">
          <TaxRow label="재산세 (확정세액)" amount={determinedTax} />
          <TaxRow label="부가세 합계" amount={totalSurtax} />
          <TaxRow label="총 납부세액" amount={totalPayable} highlight />
        </div>
      </section>

      {/* ─── 분납 안내 ─── */}
      {installment.eligible && (
        <section className="rounded-md bg-blue-50 border border-blue-200 p-4 space-y-2">
          <h4 className="text-sm font-semibold text-blue-800">
            분납 안내 (지방세법 §115)
          </h4>
          <p className="text-xs text-blue-700">
            재산세 산출세액이 20만원을 초과하여 7월과 9월에 나누어 납부할 수 있습니다.
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded bg-white border p-2 text-center">
              <div className="text-xs text-muted-foreground mb-1">1차 (7월)</div>
              <div className="font-semibold">{formatKRW(installment.firstPayment)}</div>
            </div>
            <div className="rounded bg-white border p-2 text-center">
              <div className="text-xs text-muted-foreground mb-1">2차 (9월)</div>
              <div className="font-semibold">{formatKRW(installment.secondPayment)}</div>
            </div>
          </div>
        </section>
      )}

      {/* ─── 법령 근거 ─── */}
      {legalBasis.length > 0 && (
        <section>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground transition-colors">
              법령 근거 보기 ({legalBasis.length}건)
            </summary>
            <ul className="mt-2 space-y-0.5 pl-3 list-disc">
              {legalBasis.map((b, i) => (
                <li key={i}>
                  <LawArticleModal legalBasis={b} className="hover:text-primary hover:underline transition-colors text-xs" />
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </div>
  );
}
