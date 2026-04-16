"use client";

/**
 * ComprehensiveTaxResultView — 종합부동산세 계산 결과 표시 (T-17)
 *
 * 표시 항목:
 * - 합산배제 내역 (배제 주택 수·금액)
 * - 주택분 과세표준 흐름 (공시가격합산 → 기본공제 → 공정시장가액비율 → 과세표준)
 * - 산출세액 + 1세대1주택 세액공제 breakdown
 * - 재산세 비율 안분 공제 (핵심: 종부세↔재산세 연동)
 * - 세부담 상한 적용 여부
 * - 주택분 최종 세액 (종부세 + 농특세)
 * - 토지분 (종합합산·별도합산) 별도 섹션
 * - 총 납부세액 (주택분 + 토지분 + 재산세)
 * - 주의 안내 배너
 */

import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

// ============================================================
// 포맷 헬퍼
// ============================================================

function formatRate(rate: number, digits = 2): string {
  return (rate * 100).toFixed(digits).replace(/\.?0+$/, "") + "%";
}

// ============================================================
// 공통 행 컴포넌트
// ============================================================

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
  note,
  badge,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
  note?: string;
  badge?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between py-2 gap-2 ${
        highlight
          ? "border-t-2 border-foreground font-bold text-base"
          : sub
          ? "pl-4 text-sm text-muted-foreground"
          : "text-sm"
      }`}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        {label}
        {note && (
          <span className="text-xs text-muted-foreground">({note})</span>
        )}
        {badge && (
          <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </span>
      <span className={`shrink-0 tabular-nums ${highlight ? "text-primary" : ""}`}>
        {formatKRW(amount)}
      </span>
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
      {children}
    </h3>
  );
}

// ============================================================
// 합산배제 내역 섹션
// ============================================================

function AggregationExclusionSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  const { aggregationExclusion } = result;
  if (aggregationExclusion.excludedCount === 0) return null;

  return (
    <section className="space-y-2">
      <SectionHeader>합산배제 적용 내역</SectionHeader>
      <div className="rounded-md border bg-blue-50/50 divide-y">
        <div className="flex justify-between px-3 py-2 text-sm">
          <span>합산배제 주택 수</span>
          <span className="font-medium">{aggregationExclusion.excludedCount}건</span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span>합산배제 공시가격 합계</span>
          <span className="font-medium text-blue-700">
            {formatKRW(aggregationExclusion.totalExcludedValue)}
          </span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span>과세 대상 주택 수</span>
          <span className="font-medium">{aggregationExclusion.includedCount}건</span>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// 주택분 과세표준 섹션
// ============================================================

function HousingTaxBaseSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  return (
    <section className="space-y-2">
      <SectionHeader>주택분 과세표준 계산</SectionHeader>
      <div className="rounded-md border divide-y">
        <TaxRow
          label="공시가격 합산 (합산배제 후)"
          amount={result.includedAssessedValue}
        />
        <TaxRow
          label={`기본공제 (${result.isOneHouseOwner ? "1세대1주택 12억" : "일반 9억"})`}
          amount={result.basicDeduction}
          sub
        />
        <TaxRow
          label="공제 후 금액"
          amount={Math.max(result.includedAssessedValue - result.basicDeduction, 0)}
          sub
        />
        <TaxRow
          label={`공정시장가액비율 적용 (${formatRate(result.fairMarketRatio)})`}
          amount={result.taxBase}
          note="만원 미만 절사"
          highlight={result.isSubjectToHousingTax}
        />
      </div>
      {!result.isSubjectToHousingTax && (
        <div className="rounded-md bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-800 font-medium">
            ✓ 기본공제 이하 — 종합부동산세 납세의무 없음
          </p>
        </div>
      )}
    </section>
  );
}

// ============================================================
// 주택분 세액 계산 섹션
// ============================================================

function HousingTaxSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  if (!result.isSubjectToHousingTax) return null;
  const { oneHouseDeduction, propertyTaxCredit, taxCap } = result;

  return (
    <section className="space-y-2">
      <SectionHeader>주택분 세액 계산</SectionHeader>
      <div className="rounded-md border divide-y">
        {/* 산출세액 */}
        <TaxRow
          label={`세율 적용 (${formatRate(result.appliedRate, 4)})`}
          amount={result.calculatedTax}
          note={`누진공제 ${formatKRW(result.progressiveDeduction)}`}
          sub
        />
        <TaxRow label="산출세액" amount={result.calculatedTax} />

        {/* 1세대1주택 세액공제 */}
        {oneHouseDeduction && oneHouseDeduction.deductionAmount > 0 && (
          <>
            <div className="pl-4 py-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>고령자 공제율</span>
                <span>{formatRate(oneHouseDeduction.seniorRate)}</span>
              </div>
              <div className="flex justify-between mt-0.5">
                <span>장기보유 공제율</span>
                <span>{formatRate(oneHouseDeduction.longTermRate)}</span>
              </div>
              <div className="flex justify-between mt-0.5 font-medium text-foreground">
                <span>
                  합산 공제율
                  {oneHouseDeduction.isMaxCapApplied && (
                    <span className="ml-1 text-xs text-amber-600">(80% 상한 적용)</span>
                  )}
                </span>
                <span>{formatRate(oneHouseDeduction.combinedRate)}</span>
              </div>
            </div>
            <TaxRow
              label="1세대1주택 세액공제"
              amount={-oneHouseDeduction.deductionAmount}
              sub
              badge="§9②"
            />
          </>
        )}

        {/* 재산세 비율 안분 공제 */}
        <div className="pl-4 py-2 text-sm text-muted-foreground space-y-0.5">
          <div className="flex justify-between">
            <span>재산세 부과세액</span>
            <span>{formatKRW(propertyTaxCredit.totalPropertyTax)}</span>
          </div>
          <div className="flex justify-between">
            <span>안분 비율 (종부세 / 재산세 과세표준)</span>
            <span>{formatRate(propertyTaxCredit.ratio)}</span>
          </div>
        </div>
        <TaxRow
          label="재산세 비율 안분 공제"
          amount={-propertyTaxCredit.creditAmount}
          sub
          badge="시행령 §4의2"
        />

        {/* 세부담 상한 */}
        {taxCap && (
          <>
            <TaxRow
              label={`세부담 상한 (${formatRate(taxCap.capRate)} = ${formatKRW(taxCap.capAmount)})`}
              amount={taxCap.cappedTax}
              note={taxCap.isApplied ? "상한 적용됨" : "상한 미도달"}
              sub
            />
          </>
        )}

        {/* 결정세액 */}
        <TaxRow
          label="종합부동산세 결정세액"
          amount={result.determinedHousingTax}
          highlight
        />
        <TaxRow
          label="농어촌특별세"
          amount={result.housingRuralSpecialTax}
          note="결정세액 × 20%"
          sub
        />
        <TaxRow
          label="주택분 총납부세액"
          amount={result.totalHousingTax}
          highlight
        />
      </div>
    </section>
  );
}

// ============================================================
// 토지분 — 종합합산
// ============================================================

function AggregateLandSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  const land = result.aggregateLandTax;
  if (!land) return null;

  return (
    <section className="space-y-2">
      <SectionHeader>토지분 — 종합합산 (§11)</SectionHeader>
      <div className="rounded-md border divide-y">
        <TaxRow label="공시지가 합산" amount={land.totalOfficialValue} />
        <TaxRow label="기본공제 (5억)" amount={land.basicDeduction} sub />
        <TaxRow
          label="과세표준"
          amount={land.taxBase}
          note={`세율 ${formatRate(land.appliedRate, 4)}`}
          highlight={land.isSubjectToTax}
        />
        {land.isSubjectToTax && (
          <>
            <TaxRow label="산출세액" amount={land.calculatedTax} />
            <TaxRow
              label="재산세 비율 안분 공제"
              amount={-land.propertyTaxCredit.creditAmount}
              sub
            />
            {land.taxCap && (
              <TaxRow
                label={`세부담 상한 (150%)`}
                amount={land.taxCap.cappedTax}
                note={land.taxCap.isApplied ? "상한 적용됨" : "상한 미도달"}
                sub
              />
            )}
            <TaxRow label="결정세액" amount={land.determinedTax} highlight />
            <TaxRow label="농어촌특별세" amount={land.ruralSpecialTax} note="× 20%" sub />
            <TaxRow label="종합합산 토지 합계" amount={land.totalTax} highlight />
          </>
        )}
        {!land.isSubjectToTax && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            기본공제(5억) 이하 — 납세의무 없음
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// 토지분 — 별도합산
// ============================================================

function SeparateLandSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  const land = result.separateLandTax;
  if (!land) return null;

  return (
    <section className="space-y-2">
      <SectionHeader>토지분 — 별도합산 (§12)</SectionHeader>
      <div className="rounded-md border divide-y">
        <TaxRow label="공시지가 합산" amount={land.totalPublicPrice} />
        <TaxRow label="기본공제 (80억)" amount={land.basicDeduction} sub />
        <TaxRow
          label="과세표준"
          amount={land.taxBase}
          note={`세율 ${formatRate(land.appliedRate, 4)}`}
          highlight={land.isSubjectToTax}
        />
        {land.isSubjectToTax && (
          <>
            <TaxRow label="산출세액" amount={land.calculatedTax} />
            <TaxRow
              label="재산세 비율 안분 공제"
              amount={-land.propertyTaxCredit.creditAmount}
              sub
            />
            <TaxRow label="결정세액 (세부담 상한 없음)" amount={land.determinedTax} highlight />
            <TaxRow label="농어촌특별세" amount={land.ruralSpecialTax} note="× 20%" sub />
            <TaxRow label="별도합산 토지 합계" amount={land.totalTax} highlight />
          </>
        )}
        {!land.isSubjectToTax && (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            기본공제(80억) 이하 — 납세의무 없음
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// 최종 합계 섹션
// ============================================================

function GrandTotalSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  return (
    <section>
      <div className="rounded-md border bg-primary/5 divide-y">
        {result.isSubjectToHousingTax && (
          <>
            <TaxRow label="주택분 종부세 (결정세액)" amount={result.determinedHousingTax} />
            <TaxRow label="주택분 농어촌특별세" amount={result.housingRuralSpecialTax} sub />
          </>
        )}
        {result.aggregateLandTax?.isSubjectToTax && (
          <TaxRow label="종합합산 토지분 합계" amount={result.aggregateLandTax.totalTax} />
        )}
        {result.separateLandTax?.isSubjectToTax && (
          <TaxRow label="별도합산 토지분 합계" amount={result.separateLandTax.totalTax} />
        )}
        <TaxRow label="재산세 (참고)" amount={result.totalPropertyTax} note="재산세 별도 고지" />
        <TaxRow label="종합 납부 합계" amount={result.grandTotal} highlight />
      </div>
    </section>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface Props {
  result: ComprehensiveTaxResult;
}

export function ComprehensiveTaxResultView({ result }: Props) {
  return (
    <div className="space-y-6">
      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
      )}

      {/* 합산배제 */}
      <AggregationExclusionSection result={result} />

      {/* 과세표준 */}
      <HousingTaxBaseSection result={result} />

      {/* 주택분 세액 */}
      <HousingTaxSection result={result} />

      {/* 토지분 */}
      <AggregateLandSection result={result} />
      <SeparateLandSection result={result} />

      {/* 총 납부세액 */}
      <GrandTotalSection result={result} />

      {/* 과세기준일 및 법령 정보 */}
      <div className="text-xs text-muted-foreground space-y-0.5">
        <p>과세기준일: {result.assessmentDate}</p>
        <p>적용 법령 기준일: {result.appliedLawDate}</p>
      </div>

      {/* 안내 배너 */}
      <div className="rounded-md bg-slate-50 border border-slate-200 p-4 space-y-2">
        <h4 className="text-sm font-semibold text-slate-700">
          ⚠ 세무사 상담 권장
        </h4>
        <ul className="text-xs text-slate-600 space-y-1 list-disc pl-4">
          <li>
            본 결과는 입력 정보를 기반으로 계산한 추정값입니다.
            실제 고지세액과 차이가 있을 수 있습니다.
          </li>
          <li>
            합산배제 신고, 세액공제 적용, 분납 여부 등은
            세무 전문가와 상담하시기 바랍니다.
          </li>
          <li>
            종합부동산세 납부 기한: 매년 12월 1일 ~ 12월 15일
          </li>
        </ul>
      </div>
    </div>
  );
}
