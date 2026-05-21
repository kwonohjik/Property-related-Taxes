"use client";

/**
 * InheritanceTaxResultView — 상속세 계산 결과 화면 (#36)
 */

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import type {
  EstateItem,
  InheritanceTaxResult,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FarmingDeductionDetail } from "@/lib/tax-engine/types/inheritance-farming.types";
import type {
  FamilyBusinessDeductionDetail,
  FamilyBusinessIneligibleReason,
} from "@/lib/tax-engine/types/inheritance-family-business.types";
import {
  resolveFinancialDebt,
  resolveFinancialEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { TaxCreditBreakdownCard } from "@/components/calc/TaxCreditBreakdownCard";
import { HeirAllocationTable } from "@/components/calc/results/HeirAllocationTable";
import { DebtAllocationResultCard } from "@/components/calc/results/DebtAllocationResultCard";
import type { DebtItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";

// ============================================================
// 헬퍼 컴포넌트
// ============================================================

function Row({
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

function FinancialDeductionCountRow({
  estateItems,
  debtItems,
}: {
  estateItems: EstateItem[];
  debtItems?: DebtItem[];
}) {
  const eligibleAssets = estateItems.filter(resolveFinancialEligibility);
  const eligibleDebts = (debtItems ?? []).filter(resolveFinancialDebt);
  if (eligibleAssets.length === 0 && eligibleDebts.length === 0) return null;

  const assetTotal = eligibleAssets.reduce((sum, i) => {
    const v =
      i.marketValue ??
      i.appraisedValue ??
      i.standardPrice ??
      (i.listedStockAvgPrice && i.listedStockShares
        ? i.listedStockAvgPrice * i.listedStockShares
        : 0);
    return sum + (v ?? 0);
  }, 0);
  const debtTotal = eligibleDebts.reduce((sum, d) => sum + d.amount, 0);

  return (
    <div className="px-4 pb-2 -mt-1">
      <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-3">
        ⓘ §22 대상: 자산 {eligibleAssets.length}건 (
        {formatKRW(assetTotal)}) − 채무 {eligibleDebts.length}건 (
        {formatKRW(debtTotal)})
      </p>
    </div>
  );
}

/**
 * 가업상속공제 미충족 사유 한국어 라벨 매핑 (상증법 §18의2 + 상증령 §15).
 * KoreanLaw MCP 검증 2026-05-21.
 */
const FamilyBusinessIneligibleReasonLabels: Record<FamilyBusinessIneligibleReason, string> = {
  operating_years_below_10: "영위 10년 미만 (§18의2① 가업 정의 미충족)",
  enterprise_size_exceeded: "기업 규모 초과 (자산 5천억 / 매출 5천억 미만 요건 위반)",
  industry_not_eligible: "별표 업종 외 사업 (상증령 §15①1·②1)",
  decedent_ceo_requirement_failed: "피상속인 대표이사 종사 요건 미충족 (상증령 §15③1호 나)",
  decedent_majority_share_failed: "피상속인 지분 요건 미충족 — 40% (상장 20%) × 10년 (상증령 §15③1호 가)",
  heir_not_adult: "상속인 18세 미만 (상증령 §15③2호 가)",
  heir_engagement_short: "상속인 2년 가업 종사 요건 미충족 (상증령 §15③2호 나)",
  heir_officer_not_appointed: "신고기한 내 임원 미취임 (상증령 §15③2호 다)",
  heir_ceo_not_scheduled: "신고기한 후 2년 내 대표이사 미취임 예정 (상증령 §15③2호 라)",
  medium_other_estate_exceeds_200pct: "중견기업 — 가업외 상속재산이 미공제 산출세액의 200% 초과 (§18의2②)",
  tax_fraud_conviction: "조세포탈·회계부정 형 확정 (§18의2⑧1호)",
};

function FamilyBusinessDeductionDetailRow({
  detail,
}: {
  detail?: FamilyBusinessDeductionDetail;
}) {
  if (!detail) return null;

  // 직접 입력 모드
  if (detail.usedDirectInput) {
    return (
      <div className="mx-4 my-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-2 space-y-1">
        <p className="text-[11px] text-violet-700 dark:text-violet-300">
          ⓘ 가업상속공제 직접 입력 모드 — 요건 판정 우회 (한도 600억). 사후관리 위반 시 추징 (별도 Phase F).
        </p>
      </div>
    );
  }

  // 자격 미충족 — reasons 라벨 표시
  if (!detail.eligible && detail.ineligibleReasons && detail.ineligibleReasons.length > 0) {
    return (
      <div className="mx-4 my-2 rounded-md border border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800 p-2 space-y-1">
        <p className="text-[11px] font-semibold text-rose-800 dark:text-rose-200">
          ⚠️ 가업상속공제 자격 미충족 — 공제 0원
        </p>
        <ul className="space-y-0.5 text-[10px] text-rose-700 dark:text-rose-300 list-disc pl-4">
          {detail.ineligibleReasons.map((r, i) => (
            <li key={i}>{FamilyBusinessIneligibleReasonLabels[r] ?? r}</li>
          ))}
        </ul>
      </div>
    );
  }

  // 자격 충족 — 한도·가액 표시 + medium 가드 메타
  if (detail.eligible && detail.deduction > 0) {
    return (
      <div className="mx-4 my-2 space-y-1">
        <p className="text-[11px] text-gray-600 dark:text-gray-400">
          ⓘ 영위 {detail.operatingYears}년 → 한도 {formatBillion(detail.appliedCap)}
          {detail.autoDerivedValue !== undefined && detail.autoDerivedValue > 0 && (
            <> · 자동합산 {formatKRW(detail.autoDerivedValue)}</>
          )}
          {detail.manualValue !== undefined && (
            <> · 사용자 입력 {formatKRW(detail.manualValue)}</>
          )}
        </p>
        {detail.mediumGuard && (
          <div className="mt-1 rounded-md border border-sky-200 bg-sky-50/60 dark:bg-sky-950/20 dark:border-sky-800 p-2 text-[10px] text-sky-800 dark:text-sky-300">
            <p className="font-semibold mb-1">§18의2② 200% 가드 (중견기업)</p>
            <ul className="space-y-0.5 list-disc pl-4">
              <li>미공제 산출세액: {formatKRW(detail.mediumGuard.taxIfNoFBD)}</li>
              <li>200% 상한: {formatKRW(detail.mediumGuard.cap200pct)}</li>
              <li>가업외 상속재산 net: {formatKRW(detail.mediumGuard.otherEstateNet)}</li>
              <li>판정: {detail.mediumGuard.exceeded ? "초과 → 공제 배제" : "통과"}</li>
            </ul>
          </div>
        )}
      </div>
    );
  }

  return null;
}

/** 한도 가독화 — 60_000_000_000 → "600억". */
function formatBillion(amount: number): string {
  if (amount === 0) return "0";
  const eok = amount / 100_000_000;
  return `${eok.toLocaleString()}억`;
}

function FarmingDeductionDetailRow({
  detail,
}: {
  detail?: FarmingDeductionDetail;
}) {
  if (!detail) return null;

  // RD-5: legacy (evaluated=false)
  if (!detail.evaluated) {
    return (
      <div className="mx-4 my-2 rounded-md border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800 p-2">
        <p className="text-[11px] text-violet-700 dark:text-violet-300">
          ⓘ 요건 미평가 (legacy 모드). Step4에서 영농상속공제 요건 입력을 활성화하면 자격을 자동 평가합니다.
        </p>
      </div>
    );
  }

  // RD-3: 미충족 + 사용자 입력 존재
  if (!detail.eligible && detail.appliedAssetValue > 0) {
    return (
      <div className="mx-4 my-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-2 space-y-1">
        <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">
          ⚠️ 입력 자산 {formatKRW(detail.appliedAssetValue)} — 자격 미충족으로 공제 0원
        </p>
        <ul className="space-y-0.5 text-[10px] text-amber-700 dark:text-amber-300 list-disc pl-4">
          {detail.ineligibleReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </div>
    );
  }

  // RD-2·RD-4: cappedDeduction=0
  if (detail.cappedDeduction === 0) {
    return (
      <div className="mx-4 my-2 text-[11px] text-gray-500 dark:text-gray-400">
        ⓘ {detail.eligible ? "영농 자산 미입력" : "자격 미충족 + 자산 미입력"}
      </div>
    );
  }

  // RD-1·RD-1b: 정상 (cap 적용 여부 분기)
  const capped = detail.appliedAssetValue > 3_000_000_000;
  return (
    <div className="mx-4 my-2 text-[11px] text-gray-600 dark:text-gray-400">
      ⓘ 영농자산 {formatKRW(detail.appliedAssetValue)}
      {capped && ` (30억 한도 적용 → ${formatKRW(detail.cappedDeduction)})`}
    </div>
  );
}

function LawBadge({ law }: { law: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 mr-1 mb-1">
      {law}
    </span>
  );
}

// ============================================================
// 연부연납 안내
// ============================================================

function InstallmentGuide({ finalTax }: { finalTax: number }) {
  const result = calcInstallmentPayment({ finalTax });
  if (!result.eligible) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
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
// 메인 컴포넌트
// ============================================================

interface Props {
  result: InheritanceTaxResult;
  onReset: () => void;
  onBack: () => void;
  /** 1단계로 이동 (입력값 보존) */
  onGoToFirst?: () => void;
  showLoginPrompt?: boolean;
  /** 상속인·수유자·영리법인 배열 — HeirAllocationTable 표시용 */
  heirs?: Heir[];
  /** 채무·공과·장례비 협의분할 항목 (방안 C — undefined: OFF 모드) */
  debtItems?: DebtItem[];
  /** 상속재산 입력 — §22 카운트 계산용 */
  estateItems?: EstateItem[];
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
}: Props) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showValuation, setShowValuation] = useState(false);

  const taxBeforeCredit = result.computedTax + result.generationSkipSurcharge;

  return (
    <div className="space-y-5">
      {/* PDF 버튼 */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted transition-colors"
        >
          🖨️ PDF / 인쇄
        </button>
      </div>

      {/* 핵심 결과 카드 */}
      <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
        <p className="text-sm font-medium text-muted-foreground mb-1">상속세 결정세액</p>
        <p className="text-4xl font-bold tracking-tight">{formatKRW(result.finalTax)}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
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
          <Row label="상속재산 평가액" value={formatKRW(result.grossEstateValue)} />
          {result.exemptAmount > 0 && (
            <Row label="비과세 차감" value={`- ${formatKRW(result.exemptAmount)}`} sub deduction />
          )}
          {result.deductedBeforeAggregation > 0 && (
            <Row
              label="장례비·채무 차감"
              value={`- ${formatKRW(result.deductedBeforeAggregation)}`}
              sub
              deduction
            />
          )}
          {result.priorGiftAggregated > 0 && (
            <Row
              label="사전증여재산 합산"
              value={`+ ${formatKRW(result.priorGiftAggregated)}`}
              sub
            />
          )}
          <Row label="상속세 과세가액" value={formatKRW(result.taxableEstateValue)} highlight />
          <Row label="상속공제 합계" value={`- ${formatKRW(result.totalDeduction)}`} sub deduction />
          <Row label="과세표준" value={formatKRW(result.taxBase)} highlight />
          <Row label="산출세액 (누진세율)" value={formatKRW(result.computedTax)} />
          {result.generationSkipSurcharge > 0 && (
            <Row
              label="세대생략 할증 (30% / 40%)"
              value={`+ ${formatKRW(result.generationSkipSurcharge)}`}
            />
          )}
          {result.totalTaxCredit > 0 && (
            <Row
              label="세액공제"
              value={`- ${formatKRW(result.totalTaxCredit)}`}
              deduction
            />
          )}
          <Row label="결정세액" value={formatKRW(result.finalTax)} highlight />
        </div>
      </div>

      {/* 세액공제 상세 */}
      {result.totalTaxCredit > 0 && (
        <TaxCreditBreakdownCard
          credit={result.creditDetail}
          taxBeforeCredit={taxBeforeCredit}
        />
      )}

      {/* 영리법인 사전증여 면제 (§3의2② + 집행기준 28-0-1) */}
      {result.corporateExemption && result.corporateExemption.amount > 0 && (
        <div className="rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-900/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[10px] bg-violet-200 text-violet-800 rounded px-2 py-0.5">
              🏢 §3의2②
            </span>
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              영리법인 사전증여 면제 (§3의2② · 집행기준 28-0-1)
            </p>
          </div>
          {result.corporateExemption.breakdown.map((step, i) => (
            <div
              key={i}
              className="flex justify-between text-xs text-gray-700 dark:text-gray-300"
            >
              <span>{step.label}</span>
              <span className="font-mono">{formatKRW(step.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm font-bold text-violet-800 dark:text-violet-200 border-t border-violet-200 dark:border-violet-700 pt-2">
            <span>상속세 산출세액에서 차감 (면제)</span>
            <span>− {formatKRW(result.corporateExemption.amount)}</span>
          </div>
        </div>
      )}

      {/* 채무·공과·장례비 협의분할 결과 카드 (debtItems ON 모드 + heirAllocationResult 있을 때) */}
      {result.heirAllocationResult &&
        debtItems !== undefined &&
        debtItems.length > 0 &&
        heirs &&
        heirs.length > 0 && (
          <DebtAllocationResultCard
            debtItems={debtItems}
            heirAllocationResult={result.heirAllocationResult}
            heirs={heirs}
          />
        )}

      {/* 상속인별 배부 표 — 종합사례 PDF 책 1859 재현 (heirAllocationResult 있을 때만) */}
      {result.heirAllocationResult && heirs && heirs.length > 0 && (
        <HeirAllocationTable result={result} heirs={heirs} />
      )}

      {/* 공제 내역 접기 */}
      <div className="border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-sm font-medium"
        >
          <span>상속공제 상세 내역</span>
          <span>{showBreakdown ? "▲" : "▼"}</span>
        </button>
        {showBreakdown && (
          <div className="divide-y divide-border text-xs">
            {result.deductionDetail.chosenMethod === "lump_sum" ? (
              <Row label="일괄공제 (§21)" value={formatKRW(result.deductionDetail.lumpSumDeduction)} />
            ) : (
              <>
                <Row label="기초공제 (§18)" value={formatKRW(result.deductionDetail.basicDeduction)} />
                <Row label="배우자 공제 (§19)" value={formatKRW(result.deductionDetail.spouseDeduction)} />
                <Row
                  label="인적공제 합계 (§20)"
                  value={formatKRW(result.deductionDetail.personalDeductionTotal)}
                />
              </>
            )}
            {result.deductionDetail.financialDeduction > 0 && (
              <>
                <Row
                  label="금융재산 공제 (§22)"
                  value={formatKRW(result.deductionDetail.financialDeduction)}
                />
                {estateItems && (
                  <FinancialDeductionCountRow
                    estateItems={estateItems}
                    debtItems={debtItems}
                  />
                )}
              </>
            )}
            {result.deductionDetail.cohabitationDeduction > 0 && (
              <Row
                label="동거주택 공제 (§23의2)"
                value={formatKRW(result.deductionDetail.cohabitationDeduction)}
              />
            )}
            {(result.deductionDetail.farmingDeduction > 0 ||
              result.deductionDetail.farmingDetail !== undefined) && (
              <>
                {result.deductionDetail.farmingDeduction > 0 && (
                  <Row
                    label="영농상속 공제 (§18의3)"
                    value={formatKRW(result.deductionDetail.farmingDeduction)}
                  />
                )}
                <FarmingDeductionDetailRow
                  detail={result.deductionDetail.farmingDetail}
                />
              </>
            )}
            {(result.deductionDetail.familyBusinessDeduction > 0 ||
              result.deductionDetail.familyBusinessDetail !== undefined) && (
              <>
                {result.deductionDetail.familyBusinessDeduction > 0 && (
                  <Row
                    label="가업상속 공제 (§18의2)"
                    value={formatKRW(result.deductionDetail.familyBusinessDeduction)}
                  />
                )}
                <FamilyBusinessDeductionDetailRow
                  detail={result.deductionDetail.familyBusinessDetail}
                />
              </>
            )}
            <Row label="공제 합계" value={formatKRW(result.totalDeduction)} highlight />
          </div>
        )}
      </div>

      {/* 영농상속공제 사후관리 안내 (PR-G) — farmingDeduction > 0 시만 노출 */}
      {result.deductionDetail.farmingDeduction > 0 && (
        <div className="rounded-md border border-blue-200 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-800 p-3 space-y-2 print:hidden">
          <p className="text-xs font-semibold text-blue-800 dark:text-blue-200">
            💡 영농상속공제 사후관리 안내 (§18의3④ + §16⑦⑧)
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
          <span>{showValuation ? "▲" : "▼"}</span>
        </button>
        {showValuation && (
          <div className="divide-y divide-border text-xs">
            {result.valuationResults.map((vr, i) => (
              <div key={i} className="px-4 py-2.5 space-y-0.5">
                <div className="flex justify-between font-medium text-sm">
                  <span>{vr.estateItemId}</span>
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
                    ⚠️ {w}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

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
                ⚠️ {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 근거 조문 */}
      {result.appliedLaws.length > 0 && (
        <div className="flex flex-wrap">
          {result.appliedLaws.map((law) => (
            <LawBadge key={law} law={law} />
          ))}
        </div>
      )}

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
