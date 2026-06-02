"use client";

/**
 * InheritanceTaxResultView — 상속세 계산 결과 화면 (#36)
 * 상속공제 상세 내역 섹션 → DeductionBreakdownSection 위임 (U1 분리)
 */

import { useState, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import type {
  EstateItem,
  InheritanceTaxResult,
  Heir,
  PriorGift,
  DebtItem,
  PresumedInheritanceItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingDeductionDetail } from "@/lib/tax-engine/types/inheritance-farming.types";
import type { FamilyBusinessInheritanceInput } from "@/lib/tax-engine/types/inheritance-family-business.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { HeirAllocationSummaryTable } from "@/components/calc/results/HeirAllocationSummaryTable";
import { FilingForm9CoverSection } from "@/components/calc/inheritance/filing-form-9/FilingForm9CoverSection";
import { BesshiBuppyo2Section } from "@/components/calc/inheritance/besshi-buppyo-2";
import { DeductionBesshiFormsSection } from "@/components/calc/inheritance/deduction-besshi";
import { InheritanceFilingFormTable } from "@/components/calc/results/InheritanceFilingFormTable";
import { CorporateExemptionSection } from "@/components/calc/results/CorporateExemptionSection";
import { DebtAllocationResultCard } from "@/components/calc/results/DebtAllocationResultCard";
import { UnlistedStockBesshiResultSection } from "@/components/calc/results/UnlistedStockBesshiResultSection";
import { ListedStockBesshiResultSection } from "@/components/calc/results/ListedStockBesshiResultSection";
import { SourceDataSummarySection } from "@/components/calc/results/source-summary/SourceDataSummarySection";
import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";
import { DeductionBreakdownSection } from "./deduction-breakdown/DeductionBreakdownSection";
import { AllocationBreakdownSection } from "./allocation-breakdown/AllocationBreakdownSection";
import { expandToggleClass, expandToggleLabel } from "./shared/ExpandToggleButton";
// re-export 보존 — shared.tsx 에서 실제 구현
export { Row, formatBillion, LawBadge } from "./deduction-breakdown/shared";
// re-export 보존 — FarmingDeductionDetailRow (farming-section.test.tsx 사용)
export { FarmingDeductionDetailRow } from "./deduction-breakdown/FarmingDeductionDetailRowExport";

// ============================================================
// 연부연납 안내
// ============================================================

function InstallmentGuide({ finalTax }: { finalTax: number }) {
  const result = calcInstallmentPayment({ finalTax });
  if (!result.eligible) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <h4 className="text-sm font-medium text-amber-800 dark:text-amber-200">
          연부연납 안내 (상증법 §71)
        </h4>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          결정세액 2천만원 초과 시 최대 5년 분할납부 가능
        </p>
      </div>
      <div className="p-3 text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
        <div className="flex justify-between">
          <span>허가 즉시 납부</span>
          <span className="font-medium">{formatKRW(result.initialPayment)}</span>
        </div>
        <div className="flex justify-between">
          <span>연간 납부 원금 ({result.appliedYears}회)</span>
          <span className="font-medium">{formatKRW(result.annualPrincipal)}</span>
        </div>
        <p className="text-amber-600 dark:text-amber-400 mt-1">
          ※ 이자 상당액(연 1.8% 기준) 별도 납부 — 세무사 확인 권장
        </p>
      </div>
    </div>
  );
}

// ============================================================
// 과세 요약 Row
// ============================================================

function SummaryRow({
  label,
  value,
  sub = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-muted/50 font-semibold" : ""
      } ${sub ? "pl-7" : ""}`}
    >
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>{label}</span>
      <span className={`font-mono text-sm ${deduction ? "text-blue-600 dark:text-blue-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

/**
 * 재산 평가 내역 표시명 — 사용자가 자산 이름(name)을 비우면 내부 id(prop-…·stock-…) 대신
 * 카테고리 한글 라벨 표시. (출처: CategoryChangeDialog CATEGORY_LABELS + listed/unlisted_stock)
 */
const ASSET_CATEGORY_LABELS: Record<EstateItem["category"], string> = {
  real_estate_land: "토지",
  real_estate_building: "단독주택·건물",
  real_estate_apartment: "아파트·공동주택",
  listed_stock: "상장주식",
  unlisted_stock: "비상장주식",
  cash: "현금",
  financial: "예금·펀드·채권·공제금",
  deposit: "전세보증금 반환채권",
  other: "기타 재산",
};

interface Props {
  result: InheritanceTaxResult;
  onReset: () => void;
  onBack: () => void;
  /** 1단계로 이동 (입력값 보존) */
  onGoToFirst?: () => void;
  showLoginPrompt?: boolean;
  /** 상속인·수유자·영리법인 배열 — HeirAllocationSummaryTable 표시용 */
  heirs?: Heir[];
  /** 채무·공과·장례비 협의분할 항목 (방안 C — undefined: OFF 모드) */
  debtItems?: DebtItem[];
  /** 상속재산 입력 — §22 카운트 계산용 */
  estateItems?: EstateItem[];
  /** 사전증여 행별 명세 — InheritanceFilingFormTable 표시용 (Phase 3) */
  priorGifts?: PriorGift[];
  /** 상속개시일 (ISO date) — InheritanceFilingFormTable 13년 cutoff 분기용 */
  deathDate?: string;
  /** 추정상속재산 입력 — SourceDataSummarySection Table B용 (2026-05-28) */
  presumedItems?: PresumedInheritanceItem[];
  /** 가업상속 입력 — 별지 제1호서식(가업상속공제신고서) 나·다 칸용 */
  familyBusinessInput?: FamilyBusinessInheritanceInput;
  /** 피상속인 성명 — 각 신고서 인적사항 칸 (계산 미사용, 식별정보) */
  decedentName?: string;
  /** 피상속인 주민등록번호 — 각 신고서 인적사항 칸 */
  decedentResidentNumber?: string;
}

export function InheritanceTaxResultView({
  result,
  onReset,
  onBack,
  onGoToFirst,
  showLoginPrompt = false,
  heirs,
  debtItems,
  estateItems,
  priorGifts,
  deathDate,
  presumedItems,
  familyBusinessInput,
  decedentName,
  decedentResidentNumber,
}: Props) {
  const [showValuation, setShowValuation] = useState(false);

  // 재산 평가 내역 표시명 — 자산 id → name(있으면) 또는 카테고리 한글 라벨 (내부 id 노출 방지)
  const assetNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const it of estateItems ?? []) {
      map.set(it.id, it.name?.trim() || ASSET_CATEGORY_LABELS[it.category] || "재산");
    }
    return map;
  }, [estateItems]);

  return (
    <div className="space-y-5">
      {/* PDF 버튼 */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          PDF / 인쇄
        </button>
      </div>

      {/* 핵심 결과 카드 */}
      <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
        <p className="text-sm font-medium text-muted-foreground mb-1">상속세 결정세액</p>
        <p className="text-xl font-bold tracking-tight">{formatKRW(result.finalTax)}</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div>
            <span>산출세액</span>
            <p className="font-semibold text-foreground text-base mt-0.5">
              {formatKRW(result.computedTax)}
            </p>
          </div>
          {result.generationSkipSurcharge > 0 && (
            <div>
              <span>세대생략 할증</span>
              <p className="font-semibold text-amber-600 dark:text-amber-400 text-base mt-0.5">
                + {formatKRW(result.generationSkipSurcharge)}
              </p>
            </div>
          )}
          {result.totalTaxCredit > 0 && (
            <div>
              <span>세액공제 합계</span>
              <p className="font-semibold text-blue-600 dark:text-blue-400 text-base mt-0.5">
                - {formatKRW(result.totalTaxCredit)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 과세 요약 */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="text-sm font-semibold">상속세 과세 요약</h3>
        </div>
        <div className="divide-y divide-border">
          <SummaryRow label="상속재산 평가액" value={formatKRW(result.grossEstateValue)} />
          {result.exemptAmount > 0 && (
            <SummaryRow label="비과세 차감" value={`- ${formatKRW(result.exemptAmount)}`} sub deduction />
          )}
          {result.deductedBeforeAggregation > 0 && (
            <SummaryRow
              label="장례비·채무 차감"
              value={`- ${formatKRW(result.deductedBeforeAggregation)}`}
              sub
              deduction
            />
          )}
          {result.priorGiftAggregated > 0 && (
            <SummaryRow
              label="사전증여재산 합산"
              value={`+ ${formatKRW(result.priorGiftAggregated)}`}
              sub
            />
          )}
          <SummaryRow label="상속세 과세가액" value={formatKRW(result.taxableEstateValue)} highlight />
          <SummaryRow label="상속공제 합계" value={`- ${formatKRW(result.totalDeduction)}`} sub deduction />
          <SummaryRow label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <SummaryRow label="산출세액 (누진세율)" value={formatKRW(result.computedTax)} />
          {result.generationSkipSurcharge > 0 && (
            <SummaryRow
              label="세대생략 할증 (30% / 40%)"
              value={`+ ${formatKRW(result.generationSkipSurcharge)}`}
            />
          )}
          {result.corporateExemption && result.corporateExemption.amount > 0 && (
            <SummaryRow
              label="영리법인 면제 (§3의2②)"
              value={`- ${formatKRW(result.corporateExemption.amount)}`}
              deduction
            />
          )}
          {result.totalTaxCredit > 0 && (
            <SummaryRow
              label="세액공제"
              value={`- ${formatKRW(result.totalTaxCredit)}`}
              deduction
            />
          )}
          <SummaryRow label="결정세액" value={formatKRW(result.finalTax)} highlight />
        </div>
      </div>

      {/* 세액공제 상세: 결정세액 카드 요약 + AllocationBreakdownSection ⑩·⑫ 로 노출 (별도 카드 숨김) */}

      {/* §27 세대생략 할증 산식: ⑧ 세대생략 가산액 펼침 내부로 통합 (AllocationBreakdownSection) */}

      {/* 상속개시자료 요약 — 4표 (Table A·B·C·D) — 사전증여재산 명세 바로 위 */}
      {heirs && heirs.length > 0 && (
        <SourceDataSummarySection
          deathDate={deathDate}
          heirs={heirs}
          estateItems={estateItems}
          presumedItems={presumedItems}
          presumedResultItems={result.presumedInheritanceDetail?.items}
          presumedTotal={result.presumedInheritanceDetail?.total}
          debtItems={debtItems}
          priorGifts={priorGifts}
        />
      )}

      {/* 사전증여재산 명세 */}
      {priorGifts && priorGifts.length > 0 && deathDate && (
        <InheritanceFilingFormTable
          priorGifts={priorGifts}
          heirs={heirs}
          priorGiftAggregated={result.priorGiftAggregated}
          deathDate={deathDate}
        />
      )}

      {/* 영리법인 상속세 면제 (§3의2②) — 면제 산출 요약 + 부표 5 명세서 단일 섹션 */}
      {result.corporateExemption && result.corporateExemption.amount > 0 && (
        <CorporateExemptionSection
          corporateExemption={result.corporateExemption}
          heirs={heirs}
        />
      )}

      {/* 채무·공과·장례비 협의분할 결과 카드 */}
      {result.heirAllocationResult &&
        debtItems !== undefined &&
        debtItems.length > 0 &&
        heirs &&
        heirs.length > 0 && (
          <DebtAllocationResultCard
            debtItems={debtItems}
            heirAllocationResult={result.heirAllocationResult}
            heirs={heirs}
            collateralDebtDetail={result.collateralDebtDetail}
          />
        )}

      {/* 상속인별 상속세부담액 집계 표 */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <HeirAllocationSummaryTable result={result} heirs={heirs} />
      )}

      {/* 상속공제 상세 내역 (U1 분리 → DeductionBreakdownSection) */}
      <DeductionBreakdownSection
        result={result}
        estateItems={estateItems}
        debtItems={debtItems}
      />

      {/* 상속세 산출세액·증여세액공제 계산 근거 (배부 6항목 펼침) */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <AllocationBreakdownSection result={result} heirs={heirs} />
      )}

      {/* 영농상속공제 사후관리 안내 */}
      {result.deductionDetail.farmingDeduction > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2 print:hidden">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
            영농상속공제 사후관리 안내 (§18의3④ + §16⑦⑧)
          </p>
          <p className="text-[11px] text-blue-700 dark:text-blue-300">
            상속개시일부터 5년 이내 영농상속재산을 처분하거나 영농 종사를 중단하면
            공제받은 금액 100%가 추징되고 이자상당액이 가산됩니다. 조세포탈·회계부정 형 확정 시 5년 무관 추징.
          </p>
          <a
            href={`/calc/inheritance-postmgmt?originalDeduction=${result.deductionDetail.farmingDeduction}`}
            className="inline-block text-xs font-medium text-blue-700 dark:text-blue-300 underline hover:text-blue-900 dark:hover:text-blue-100"
          >
            → 사후관리 추징 시뮬레이터 진입
          </a>
        </div>
      )}

      {/* 재산 평가 내역 */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowValuation((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span>재산 평가 내역 ({result.valuationResults.length}건)</span>
          <span className={expandToggleClass("slate")}>{expandToggleLabel(showValuation)}</span>
        </button>
        {showValuation && (
          <div className="divide-y divide-border text-xs">
            {result.valuationResults.map((vr, i) => (
              <div key={i} className="px-4 py-2.5 space-y-0.5">
                <div className="flex justify-between font-medium text-sm">
                  <span>{assetNameById.get(vr.estateItemId) ?? "재산"}</span>
                  <span>{formatKRW(vr.valuatedAmount)}</span>
                </div>
                <p className="text-gray-400">
                  평가방법:{" "}
                  {{
                    market_value: "시가",
                    appraisal: "감정평가",
                    standard_price: "보충적 평가",
                    similar_sales: "유사매매사례",
                    acquisition_cost: "취득가액",
                    book_value: "장부가액",
                  }[vr.method]}
                </p>
                {vr.warnings.map((w, j) => (
                  <p key={j} className="text-amber-600 dark:text-amber-400">
                    {w}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 비상장주식 별지 부표3 출력 (정식평가 V2 자산) */}
      {estateItems && <UnlistedStockBesshiResultSection estateItems={estateItems} />}

      {/* 상장주식 평가조서(갑·을) 출력 */}
      {estateItems && (
        <ListedStockBesshiResultSection
          estateItems={estateItems}
          valuationDate={deathDate}
        />
      )}

      {/* 별지 제9호서식 상속세과세표준신고 및 자진납부계산서 (앞쪽) */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <FilingForm9CoverSection
          result={result}
          heirs={heirs}
          deathDate={deathDate}
          decedentName={decedentName}
          decedentResidentNumber={decedentResidentNumber}
        />
      )}

      {/* 별지 제9호서식 부표 2 — 상속인별 상속재산 및 평가명세서 (A4 가로, 상속인별 N장) */}
      {result.heirAllocationResult &&
        heirs &&
        heirs.length > 0 &&
        (estateItems || priorGifts) && (
          <BesshiBuppyo2Section
            result={result}
            heirs={heirs}
            estateItems={estateItems}
            priorGifts={priorGifts}
            deathDate={deathDate}
          />
        )}

      {/* 채무·공과금·장례비·상속공제 명세 (부표3·별지5호·별지1호) */}
      {result.deductionDetail && (
        <DeductionBesshiFormsSection
          result={result}
          heirs={heirs}
          debtItems={debtItems}
          estateItems={estateItems}
          familyBusinessInput={familyBusinessInput}
          deathDate={deathDate}
          decedentName={decedentName}
          decedentResidentNumber={decedentResidentNumber}
        />
      )}

      {/* 연부연납 안내 */}
      <InstallmentGuide finalTax={result.finalTax} />

      {/* 경고 메시지 */}
      {result.warnings.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-700 rounded-xl p-4 space-y-2">
          <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            주의 사항
          </h4>
          <ul className="space-y-1.5">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 근거 조문 배지 모음 숨김 — 각 카드·산식에 조문 링크가 이미 노출됨 */}

      {/* 로그인 유도 */}
      {showLoginPrompt && <LoginPromptBanner />}

      {/* 면책고지 */}
      <DisclaimerBanner />

      {/* 버튼 */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center gap-1 rounded-md border border-border py-2.5 px-4 text-sm font-medium hover:bg-muted transition-colors"
          aria-label="바로 앞 단계로 돌아가기"
        >
          <ChevronLeft className="w-4 h-4" />
          뒤로 가기
        </button>
        <button
          type="button"
          onClick={onGoToFirst ?? onBack}
          className="flex-1 min-w-[120px] rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          다시 계산
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 min-w-[120px] rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          처음으로
        </button>
      </div>
    </div>
  );
}

// ============================================================
// 하위 호환 re-export (FarmingDeductionDetail 타입 노출)
// ============================================================
export type { FarmingDeductionDetail };
