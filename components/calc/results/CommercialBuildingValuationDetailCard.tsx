"use client";

/**
 * CommercialBuildingValuationDetailCard
 *
 * 상업용건물·오피스텔 환산취득가 산정 근거 표 + 토지/건물 분리 결과.
 * result.commercialBuildingValuationDetail 가 있을 때만 렌더.
 *
 * 산식 표기 규칙 (강제):
 *  - 변수 약어(P_F, Sum_A) 금지 → 한국어 풀어쓰기
 *  - "산출세액 × 10%" 라벨 금지 → 지방세법 §103조의3 누진 함수 직접 호출 명시
 *  - 보유기간: "만 21년 2개월 (1년 미만 절사 → 21년)" 형식
 *  - 장특공: "MIN(15, 보유연수) × 2%" 명시
 *  - 개산공제율: "토지·건물 3% (시행령 §163⑥)" 명시
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

/** 엔진 결과 타입 (transfer.types.ts 엔진 구현 완료 후 정확 타입으로 교체) */
export interface CommercialBuildingValuationResult {
  floorAreaTotal: number;
  unitPriceTotalAtTransfer: number;
  unitPriceTotalAtFirst?: number;
  combinedStdAtAcq?: number;
  combinedStdAtFirst?: number;
  combinedStdAtTransfer?: number;
  estimatedBasisAtAcq?: number;
  estimatedAcquisitionTotal: number;
  estimatedAcquisitionLand: number;
  estimatedAcquisitionBuilding: number;
  estimatedDeductionTotal: number;
  estimatedDeductionLand: number;
  estimatedDeductionBuilding: number;
}

interface Props {
  detail: CommercialBuildingValuationResult;
  transferPrice: number;
  acquisitionGain?: number;
  longTermDeduction?: number;
  taxableIncome?: number;
  taxBase?: number;
  taxAmount?: number;
  localTax?: number;
  totalTax?: number;
  holdingYears?: number;
  holdingMonths?: number;
  lthdRate?: number;
  /** 토지 양도차익 */
  landGain?: number;
  /** 건물 양도차익 */
  buildingGain?: number;
  /** §97②2호 단서 swap 발동 — true면 개산공제(가목) 대신 자본적지출+양도비(나목)가 필요경비로 적용됨. */
  swapApplied?: boolean;
}

function Row({ label, value, sub = false, highlight = false }: {
  label: string;
  value: string | number | null | undefined;
  sub?: boolean;
  highlight?: boolean;
}) {
  if (value === null || value === undefined) return null;
  const fmt = typeof value === "number" ? formatKRW(value) : value;
  return (
    <tr className={highlight ? "bg-emerald-50/60 font-semibold" : ""}>
      <td className={`py-1 pr-3 text-xs ${sub ? "pl-4 text-muted-foreground" : "font-medium"}`}>{label}</td>
      <td className="py-1 text-right text-xs tabular-nums">{fmt}</td>
    </tr>
  );
}

export function CommercialBuildingValuationDetailCard({ detail, transferPrice, acquisitionGain, longTermDeduction, taxableIncome, taxBase, taxAmount, localTax, totalTax, holdingYears, holdingMonths, lthdRate, landGain, buildingGain, swapApplied }: Props) {
  const isPreDisclosure = detail.estimatedBasisAtAcq !== undefined;

  // 보유기간 텍스트
  const holdingText = holdingYears !== undefined && holdingMonths !== undefined
    ? `만 ${holdingYears}년 ${holdingMonths}개월 (1년 미만 절사 → ${holdingYears}년)`
    : null;
  const lthdRatePct = lthdRate !== undefined ? `${Math.round(lthdRate * 100)}%` : null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/20 p-4 space-y-4 text-sm">
      <div className="font-semibold text-amber-900 text-sm">
        상업용건물·오피스텔 환산취득가 산정 근거
        <span className="ml-1 text-xs font-normal text-amber-700">
          (소득세법 시행령 §164⑥, §176조의2②2호)
        </span>
      </div>

      {/* 기준시가합 3시점 표 (pre_disclosure 시) */}
      {isPreDisclosure && (
        <div>
          <p className="text-xs font-medium text-amber-800 mb-1">기준시가합 (소득세법 시행령 §164①)</p>
          <p className="text-caption text-muted-foreground mb-2">= 개별공시지가(원/㎡) × 대지면적(㎡) + 건물 기준시가 총액(원)</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-amber-200">
                <th className="py-1 text-left text-amber-700">시점</th>
                <th className="py-1 text-right text-amber-700">기준시가합</th>
              </tr>
            </thead>
            <tbody>
              {detail.combinedStdAtAcq !== undefined && (
                <tr><td className="py-1 text-amber-800">취득시</td><td className="py-1 text-right tabular-nums">{formatKRW(detail.combinedStdAtAcq)}</td></tr>
              )}
              {detail.combinedStdAtFirst !== undefined && (
                <tr><td className="py-1 text-amber-800">최초고시시(2005)</td><td className="py-1 text-right tabular-nums">{formatKRW(detail.combinedStdAtFirst)}</td></tr>
              )}
              {detail.combinedStdAtTransfer !== undefined && (
                <tr><td className="py-1 text-emerald-800">양도시</td><td className="py-1 text-right tabular-nums">{formatKRW(detail.combinedStdAtTransfer)}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 호별총액 + 환산기준시가 + 환산취득가 산식 */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-amber-800">산식</p>
        <table className="w-full border-collapse">
          <tbody>
            {detail.unitPriceTotalAtFirst !== undefined && (
              <Row label="최초고시 호별총액 = 최초고시 ㎡당 호별고시가 × 연면적" value={detail.unitPriceTotalAtFirst} sub />
            )}
            <Row label={`양도시 호별총액 = 양도시 ㎡당 호별고시가 × 연면적 ${detail.floorAreaTotal.toFixed(2)} ㎡`} value={detail.unitPriceTotalAtTransfer} />
            {isPreDisclosure && detail.estimatedBasisAtAcq !== undefined && (
              <Row
                label="취득시 환산기준시가 = INT(최초고시 호별총액 × 취득시 기준시가합 ÷ 최초고시시 기준시가합) — 시행령 §164⑥"
                value={detail.estimatedBasisAtAcq}
                sub
              />
            )}
            <Row
              label={`환산취득가 합계 = INT(양도가액 ${formatKRW(transferPrice)} × 취득시 환산기준시가 ÷ 양도시 호별총액) — §176조의2②2호`}
              value={detail.estimatedAcquisitionTotal}
              highlight
            />
            <Row label="환산취득가 토지분 = INT(합계 × 취득시 토지기준시가 ÷ 취득시 기준시가합)" value={detail.estimatedAcquisitionLand} sub />
            <Row label="환산취득가 건물분 = 합계 − 토지분" value={detail.estimatedAcquisitionBuilding} sub />
          </tbody>
        </table>
      </div>

      {/* 개산공제 */}
      <div>
        <p className="text-xs font-medium text-amber-800">기타필요경비 (개산공제)</p>
        <p className="text-caption text-muted-foreground mb-1">= 환산취득가 × 3% (소득세법 §97②2호 + 시행령 §163⑥ 토지·건물 3%)</p>
        <table className="w-full border-collapse">
          <tbody>
            <Row label={`개산공제 합계 = INT(${formatKRW(detail.estimatedAcquisitionTotal)} × 3%)`} value={detail.estimatedDeductionTotal} highlight />
            <Row label="개산공제 토지분" value={detail.estimatedDeductionLand} sub />
            <Row label="개산공제 건물분" value={detail.estimatedDeductionBuilding} sub />
          </tbody>
        </table>
        {swapApplied && (
          <p className="text-caption text-rose-700 mt-1">
            ※ §97②2호 단서 swap 발동 — 위 개산공제(가목) 대신 자본적지출+양도비(나목)가 필요경비로 적용되었습니다(환산취득가 미차감).
          </p>
        )}
      </div>

      {/* 토지/건물 분리 양도차익 */}
      {(landGain !== undefined || buildingGain !== undefined) && (
        <div>
          <p className="text-xs font-medium text-emerald-800">토지·건물 분리 양도차익</p>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-emerald-200">
                <th className="py-1 text-left text-xs text-emerald-700">구분</th>
                <th className="py-1 text-right text-xs text-emerald-700">토지</th>
                <th className="py-1 text-right text-xs text-emerald-700">건물</th>
                <th className="py-1 text-right text-xs text-emerald-700">합계</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="py-1 text-xs">환산취득가</td>
                <td className="py-1 text-right text-xs tabular-nums">{formatKRW(detail.estimatedAcquisitionLand)}</td>
                <td className="py-1 text-right text-xs tabular-nums">{formatKRW(detail.estimatedAcquisitionBuilding)}</td>
                <td className="py-1 text-right text-xs tabular-nums font-semibold">{formatKRW(detail.estimatedAcquisitionTotal)}</td>
              </tr>
              <tr>
                <td className="py-1 text-xs">개산공제</td>
                <td className="py-1 text-right text-xs tabular-nums">{formatKRW(detail.estimatedDeductionLand)}</td>
                <td className="py-1 text-right text-xs tabular-nums">{formatKRW(detail.estimatedDeductionBuilding)}</td>
                <td className="py-1 text-right text-xs tabular-nums font-semibold">{formatKRW(detail.estimatedDeductionTotal)}</td>
              </tr>
              {(landGain !== undefined || buildingGain !== undefined) && (
                <tr className="bg-emerald-50/60">
                  <td className="py-1 text-xs font-semibold">양도차익</td>
                  <td className="py-1 text-right text-xs tabular-nums font-semibold">{landGain !== undefined ? formatKRW(landGain) : "—"}</td>
                  <td className="py-1 text-right text-xs tabular-nums font-semibold">{buildingGain !== undefined ? formatKRW(buildingGain) : "—"}</td>
                  <td className="py-1 text-right text-xs tabular-nums font-semibold">{acquisitionGain !== undefined ? formatKRW(acquisitionGain) : "—"}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 장특공·세액 산식 */}
      {acquisitionGain !== undefined && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-emerald-800">양도차익 → 세액 산식</p>
          <table className="w-full border-collapse">
            <tbody>
              <Row label={`양도차익 = 양도가액 ${formatKRW(transferPrice)} − 환산취득가 ${formatKRW(detail.estimatedAcquisitionTotal)} − 개산공제 ${formatKRW(detail.estimatedDeductionTotal)}`} value={acquisitionGain} />
              {holdingText && (
                <tr><td colSpan={2} className="py-1 text-caption text-muted-foreground">보유기간: {holdingText}</td></tr>
              )}
              {lthdRatePct && (
                <tr><td colSpan={2} className="py-1 text-caption text-muted-foreground">장특공률: MIN(15, 보유연수) × 2% = {lthdRatePct} (상한 30%, 소법 §95② 표1 일반자산)</td></tr>
              )}
              {longTermDeduction !== undefined && (
                <Row label={`장기보유특별공제 = INT(양도차익 ${formatKRW(acquisitionGain)} × ${lthdRatePct ?? "장특공률"})`} value={longTermDeduction} />
              )}
              {taxableIncome !== undefined && (
                <Row label={`양도소득금액 = 양도차익 − 장기보유특별공제`} value={taxableIncome} />
              )}
              {taxBase !== undefined && (
                <Row label={`과세표준 = 양도소득금액 − 기본공제 2,500,000 (절사 규정 없음)`} value={taxBase} />
              )}
              {taxAmount !== undefined && (
                <Row label="산출세액 (소법 §55 양도연도 적용 누진세율)" value={taxAmount} highlight />
              )}
              {localTax !== undefined && (
                <Row label="지방소득세 (지방세법 §103조의3 양도소득분 누진세율 — 과세표준에 자체 세율표 직접 적용)" value={localTax} />
              )}
              {totalTax !== undefined && (
                <Row label="총 납부세액" value={totalTax} highlight />
              )}
            </tbody>
          </table>
          {taxAmount !== undefined && localTax !== undefined && (
            <p className="text-micro text-muted-foreground mt-1">
              ※ 지방소득세는 §103조의3 자체 누진세율표 직접 적용 (산출세액 × 10% 가정 금지)
            </p>
          )}
        </div>
      )}
    </div>
  );
}
