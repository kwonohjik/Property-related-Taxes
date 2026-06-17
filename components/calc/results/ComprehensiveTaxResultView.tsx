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
import { useState, useMemo } from "react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  COMPREHENSIVE_PRINT_SECTIONS,
  type ComprehensivePrintSectionId,
} from "@/lib/print/comprehensive-print-sections";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import { ComprehensiveFilingFormSection } from "@/components/calc/results/comprehensive-filing";
import {
  HousingPayableTaxCalcCard,
  LandPayableTaxCalcCard,
} from "@/components/calc/results/comprehensive-payable-calc";

// ============================================================
// 포맷 헬퍼
// ============================================================

function formatRate(rate: number, digits = 2): string {
  return (rate * 100).toFixed(digits).replace(/\.?0+$/, "") + "%";
}

// ============================================================
// 공통 행 컴포넌트
// ============================================================

/** 금액 대신 라벨 문자열을 표시하는 행 (기본공제 "적용 없음" 등) */
function TaxLabelRow({
  label,
  valueLabel,
  sub = false,
  badge,
  legalBasis,
}: {
  label: string;
  valueLabel: string;
  sub?: boolean;
  badge?: string;
  /** 있으면 badge 옆에 LawArticleModal(조문 클릭 팝업) 렌더. badge 텍스트는 그대로 보존. */
  legalBasis?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between py-2 gap-2 ${
        sub ? "pl-4 text-sm text-muted-foreground" : "text-sm"
      }`}
    >
      <span className="flex items-center gap-1.5 flex-wrap">
        {label}
        {badge && (
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
            {legalBasis && <LawArticleModal legalBasis={legalBasis} label={badge} />}
          </span>
        )}
      </span>
      <span className="shrink-0 text-muted-foreground italic">{valueLabel}</span>
    </div>
  );
}

function TaxRow({
  label,
  amount,
  highlight = false,
  sub = false,
  note,
  badge,
  legalBasis,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
  sub?: boolean;
  note?: string;
  badge?: string;
  /** 있으면 badge 옆에 LawArticleModal(조문 클릭 팝업) 렌더. badge 텍스트는 그대로 보존. */
  legalBasis?: string;
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
          <span className="inline-flex items-center gap-1">
            <span className="text-xs font-medium bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
              {badge}
            </span>
            {legalBasis && <LawArticleModal legalBasis={legalBasis} label={badge} />}
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

      {/* 의무임대기간 미충족 경고 (시행령 §3① — 사후 추징 위험) */}
      {aggregationExclusion.propertyResults.some(
        (r) => r.warnings && r.warnings.length > 0,
      ) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-800">의무임대기간 확인 필요</p>
          <ul className="mt-1 space-y-1">
            {aggregationExclusion.propertyResults.flatMap((r, idx) =>
              (r.warnings ?? []).map((w, wi) => (
                <li key={`${idx}-${wi}`} className="text-xs text-amber-700">
                  임대주택 {idx + 1}번째: {w}
                </li>
              )),
            )}
          </ul>
        </div>
      )}
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
  const isCorporateSpecial = result.corporateHousingClass === "corporate_special";

  return (
    <section className="space-y-2">
      <SectionHeader>주택분 과세표준 계산</SectionHeader>
      <div className="rounded-md border divide-y">
        <TaxRow
          label="공시가격 합산 (합산배제 후)"
          amount={result.includedAssessedValue}
        />
        {/* 법인 §9②3호: 기본공제 0원 (§8①2호 — "적용 없음" 라벨) */}
        {isCorporateSpecial ? (
          <TaxLabelRow
            label="기본공제"
            valueLabel="적용 없음"
            sub
            badge="§8①2호"
            legalBasis="종합부동산세법 §8"
          />
        ) : (
          <TaxRow
            label={`기본공제 (${
              result.isOneHouseOwner
                ? "1세대1주택"
                : result.isJointOwnershipApplied
                ? "부부 공동명의 특례 (1세대1주택 의제)"
                : result.section8para4Detail
                ? "§8④ 1세대1주택자 의제"
                : "일반"
            } ${formatKRW(result.basicDeduction)})`}
            amount={result.basicDeduction}
            sub
          />
        )}
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
  const isCorporateSpecial = result.corporateHousingClass === "corporate_special";

  // 산출세액 배지 — taxpayerType 기준 (corporate_special은 isMultiHouseRateApplied와 무관하게 별도 배지)
  function getCalculatedTaxBadge(): string | undefined {
    // 법인 세부 유형(시행령 §4의4) 한글 라벨 — 도출 호 배지에 병기 (audit)
    const CORP_TYPE_LABEL: Record<string, string> = {
      public_housing_operator: "공공주택사업자",
      housing_association: "주택조합",
      redevelopment_operator: "정비사업시행자",
      private_rental_operator: "민간건설임대사업자",
      urban_dev_operator: "도시개발·재정비 시행자",
      social_enterprise: "사회적기업·사회적협동조합",
      clan: "종중",
      public_interest_corp: "공익법인등",
      general_corp: "일반법인",
    };
    const corpType = result.corporateHousingType
      ? CORP_TYPE_LABEL[result.corporateHousingType]
      : undefined;
    if (isCorporateSpecial) return "§9② 법인 단일세율";
    if (result.corporateHousingClass === "corporate_general")
      return `§9②1호 ${corpType ?? "공공주택사업자 등"} — 일반 누진세율 (주택 수 무관)`;
    if (result.corporateHousingClass === "corporate_public")
      return `§9②2호 ${corpType ?? "공익법인등"} — §9①각호 세율`;
    if (result.isJointOwnershipApplied) return "§10의2 부부 공동명의 특례";
    if (result.section8para4Detail) {
      const TYPE_LABEL: Record<string, string> = {
        appurtenant_land_only: "§8④1호 부속토지",
        temporary_two_house: "§8④2호 일시적 2주택",
        inherited_house: "§8④3호 상속주택",
        regional_low_price: "§8④4호 지방 저가주택",
      };
      return result.section8para4Detail.appliedTypes
        .map((t) => TYPE_LABEL[t] ?? t)
        .join(" · ");
    }
    if (result.isMultiHouseRateApplied) {
      return parseInt(result.assessmentDate.slice(0, 4)) <= 2022
        ? "다주택 중과세율 적용 (조정대상지역 2주택 또는 3주택 이상 — 구 §9①3호)"
        : "3주택 이상 중과세율 적용 (§9①2호 — 12억 초과 구간)";
    }
    return undefined;
  }

  // getCalculatedTaxBadge() 분기별 클릭 팝업용 본법 조문(검증 완료분만).
  // §10의2(부부 공동명의)·구 §9①3호(현행 삭제)는 undefined → 링크 미생성(badge 텍스트는 유지).
  function getCalculatedTaxLegalBasis(): string | undefined {
    if (isCorporateSpecial) return "종합부동산세법 §9";
    if (result.corporateHousingClass === "corporate_general")
      return "종합부동산세법 §9";
    if (result.corporateHousingClass === "corporate_public")
      return "종합부동산세법 §9";
    if (result.isJointOwnershipApplied) return "종합부동산세법 §10의2"; // 공동명의 1주택자 특례 (검증 2026-06-17)
    if (result.section8para4Detail) return "종합부동산세법 §8";
    if (result.isMultiHouseRateApplied)
      return parseInt(result.assessmentDate.slice(0, 4)) <= 2022
        ? undefined // 구 §9①3호 — 현행 삭제, 보류
        : "종합부동산세법 §9";
    return undefined;
  }

  return (
    <section className="space-y-2">
      <SectionHeader>주택분 세액 계산</SectionHeader>
      <div className="rounded-md border divide-y">
        {/* 산출세액 */}
        <TaxRow
          label={`세율 적용 (${formatRate(result.appliedRate, 4)})`}
          amount={result.calculatedTax}
          note={
            isCorporateSpecial
              ? "누진공제 없음 (단일 비례세율)"
              : `누진공제 ${formatKRW(result.progressiveDeduction)}`
          }
          sub
        />
        <TaxRow
          label="산출세액"
          amount={result.calculatedTax}
          badge={getCalculatedTaxBadge()}
          legalBasis={getCalculatedTaxLegalBasis()}
        />

        {/* 재산세 비율 안분 공제 (GAP-1: 세액공제보다 선적용 — §9③) */}
        <div className="pl-4 py-2 text-sm text-muted-foreground space-y-0.5">
          <div className="flex justify-between">
            <span>재산세 부과세액</span>
            <span>{formatKRW(propertyTaxCredit.totalPropertyTax)}</span>
          </div>
          <div className="flex justify-between">
            <span>안분 비율 (종부세 과세표준분 표준세율 재산세 ÷ 전체 표준세율 재산세)</span>
            <span>{formatRate(propertyTaxCredit.ratio)}</span>
          </div>
        </div>
        <TaxRow
          label="재산세 비율 안분 공제"
          amount={-propertyTaxCredit.creditAmount}
          sub
          badge="시행령 §4의3"
          legalBasis="종합부동산세법 시행령 §4의3"
        />

        {/* 1세대1주택 세액공제 (재산세 공제 후 세액 기준 — §9⑥⑧) */}
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
              {/* §8④ 의제 시 §9⑦⑨ 공시가격 안분 (echo — UI 재계산 금지) */}
              {oneHouseDeduction.apportionmentRatio && (
                <div className="flex justify-between mt-0.5">
                  <span>
                    1주택분 안분 (
                    {formatKRW(oneHouseDeduction.apportionmentRatio.mainHouseAssessedValue)} ÷{" "}
                    {formatKRW(oneHouseDeduction.apportionmentRatio.totalAssessedValue)})
                  </span>
                  <span>§9⑦⑨</span>
                </div>
              )}
            </div>
            <TaxRow
              label="1세대1주택 세액공제"
              amount={-oneHouseDeduction.deductionAmount}
              sub
              badge={oneHouseDeduction.apportionmentRatio ? "§9⑤~⑨ (§8④ 안분)" : "§9⑤~⑨"}
              legalBasis="종합부동산세법 §9"
            />
          </>
        )}

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
        {/* corporate_special: taxCap이 undefined → 세부담상한 미적용 안내 */}
        {isCorporateSpecial && !taxCap && (
          <div className="pl-4 py-2 text-xs text-muted-foreground italic">
            세부담 상한 미적용 (§10 단서 — §9②3호 세율 적용 법인 배제)
          </div>
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
      <SectionHeader>
        토지분 — 종합합산{" "}
        <LawArticleModal legalBasis="종합부동산세법 §11" label="§11" />
      </SectionHeader>
      <div className="rounded-md border divide-y">
        <TaxRow label="공시지가 합산" amount={land.totalOfficialValue} />
        <TaxRow label="기본공제 (5억)" amount={land.basicDeduction} sub />
        <TaxRow
          label="과세표준"
          amount={land.taxBase}
          note={`공정시장가액비율 ${formatRate(land.fairMarketRatio)} · 세율 ${formatRate(land.appliedRate, 4)}`}
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
      <SectionHeader>
        토지분 — 별도합산{" "}
        <LawArticleModal legalBasis="종합부동산세법 §12" label="§12" />
      </SectionHeader>
      <div className="rounded-md border divide-y">
        <TaxRow label="공시지가 합산" amount={land.totalPublicPrice} />
        <TaxRow label="기본공제 (80억)" amount={land.basicDeduction} sub />
        <TaxRow
          label="과세표준"
          amount={land.taxBase}
          note={`공정시장가액비율 ${formatRate(land.fairMarketRatio)} · 세율 ${formatRate(land.appliedRate, 4)}`}
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
  /** 저장된 계산 id — 서버 PDF 선택 출력(PR-E)용. 미저장/비로그인 시 undefined */
  savedId?: string;
}

export function ComprehensiveTaxResultView({ result, savedId }: Props) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );

  // 서식 표시용 store 값 (landArea·buildingArea) — 서식 전용, 엔진 계산 미영향
  const { formData } = useComprehensiveWizardStore();
  // 첫 번째 주택의 landArea를 서식 표시용으로 사용 (사례12 단일 주택 기준)
  const filingLandArea = formData.properties[0]?.landArea ?? "";
  const filingBuildingArea = formData.properties[0]?.area ?? "";
  // 직전 세액 직접입력 제거(2단계 통합) — 직전 세부담상한은 엔진 previousYearEquivalent.total 사용

  // 선택 항목 서버 PDF 다운로드 (PR-E). savedId(로그인+저장) 있을 때만 활성.
  async function handlePrintPdf(pdfSections: string[]) {
    if (!savedId || pdfSections.length === 0) return;
    setPdfBusy(true);
    try {
      const res = await fetch(`/api/pdf/result/${savedId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: pdfSections }),
      });
      if (!res.ok) throw new Error("PDF 생성 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `종합부동산세_계산결과_${savedId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("PDF 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPdfBusy(false);
    }
  }

  // 현재 결과뷰에 실제 렌더되는 leaf id (각 sub 컴포넌트 가드와 1:1 — 설계 §2.4)
  const availablePrintIds = useMemo<Set<ComprehensivePrintSectionId>>(() => {
    const s = new Set<ComprehensivePrintSectionId>();
    if (result.aggregationExclusion.excludedCount > 0) s.add("aggregation-exclusion");
    s.add("housing-tax-base");
    if (result.isSubjectToHousingTax) s.add("housing-tax");
    if (result.aggregateLandTax) s.add("aggregate-land");
    if (result.separateLandTax) s.add("separate-land");
    s.add("grand-total");
    if (result.warnings.length > 0) s.add("warnings");
    // 서식 4종 — 항상 가용 (taxCap·previousYearEquivalent 조건은 ComprehensiveFilingFormSection 내부 게이팅)
    s.add("filing-form-main");
    s.add("filing-form-buppyo3");
    if (result.taxCap) s.add("filing-form-buppyo5");
    if (result.previousYearEquivalent) s.add("filing-form-buppyo5sub");
    // 산출근거 카드 — 주택분 계산이 있으면 항상 가용(비대상도 "납세의무 없음" 표기)
    s.add("housing-payable-calc");
    if (result.aggregateLandTax) s.add("land-agg-payable-calc");
    if (result.separateLandTax) s.add("land-sep-payable-calc");
    return s;
  }, [result]);

  return (
    <div className="space-y-6">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={COMPREHENSIVE_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={!!savedId}
        pdfBusy={pdfBusy}
      />

      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <PrintSection id="warnings" selectedIds={selectedPrintIds}>
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-1">
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠ {w}
            </p>
          ))}
        </div>
        </PrintSection>
      )}

      {/* 합산배제 */}
      <PrintSection id="aggregation-exclusion" selectedIds={selectedPrintIds}>
        <AggregationExclusionSection result={result} />
      </PrintSection>

      {/* 과세표준 */}
      <PrintSection id="housing-tax-base" selectedIds={selectedPrintIds}>
        <HousingTaxBaseSection result={result} />
      </PrintSection>

      {/* 주택분 세액 */}
      <PrintSection id="housing-tax" selectedIds={selectedPrintIds}>
        <HousingTaxSection result={result} />
      </PrintSection>

      {/* 토지분 */}
      <PrintSection id="aggregate-land" selectedIds={selectedPrintIds}>
        <AggregateLandSection result={result} />
      </PrintSection>
      <PrintSection id="separate-land" selectedIds={selectedPrintIds}>
        <SeparateLandSection result={result} />
      </PrintSection>

      {/* 총 납부세액 */}
      <PrintSection id="grand-total" selectedIds={selectedPrintIds}>
        <GrandTotalSection result={result} />
      </PrintSection>

      {/* 신고서 서식 4종 (2022년판)
          인쇄 선택: 4개 id 중 하나라도 선택되면 컨테이너 표시.
          ComprehensiveFilingFormSection 내부에서 개별 서식 조건부 표시.
          PrintSection data-print-id는 인쇄 필터용 — 화면에서는 항상 노출. */}
      <PrintSection id="filing-form-main" selectedIds={selectedPrintIds}>
        <ComprehensiveFilingFormSection
          result={result}
          landArea={filingLandArea}
          buildingArea={filingBuildingArea}
        />
      </PrintSection>

      {/* 산출근거 — 교재(계산 사례) "주택분 종합부동산세 납부할세액의 계산" 형식 (기본 접힘) */}
      <PrintSection id="housing-payable-calc" selectedIds={selectedPrintIds}>
        <HousingPayableTaxCalcCard result={result} properties={formData.properties} />
      </PrintSection>

      {/* 토지분 산출근거 — 종합합산·별도합산 (필지 모드 시 풀 분해, 집계 모드 시 축약) */}
      {result.aggregateLandTax && (
        <PrintSection id="land-agg-payable-calc" selectedIds={selectedPrintIds}>
          <LandPayableTaxCalcCard
            kind="aggregate"
            result={result.aggregateLandTax}
            assessmentYear={parseInt(result.assessmentDate.slice(0, 4))}
          />
        </PrintSection>
      )}
      {result.separateLandTax && (
        <PrintSection id="land-sep-payable-calc" selectedIds={selectedPrintIds}>
          <LandPayableTaxCalcCard
            kind="separate"
            result={result.separateLandTax}
            assessmentYear={parseInt(result.assessmentDate.slice(0, 4))}
          />
        </PrintSection>
      )}

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
