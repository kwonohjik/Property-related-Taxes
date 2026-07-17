"use client";

/**
 * Step4Deductions — 상속세 Step4 공제·세액공제 입력
 *
 * steps.tsx 800줄 정책 분리로 추출 (2026-06-13).
 * 외부 import: steps.tsx에서 re-export → import 경로 무변경.
 *
 * 개선 내역:
 *  - 상단에 Step4DeductionChecklist 패널 추가 (항목 한눈에 조망)
 *  - 자동 항목(배우자·금융·동거주택·영농): 무조건 렌더 (배우자만 hasSpouse 게이트 유지)
 *    → isAutoItemVisible 기반 게이팅 제거: 미감지 시에도 입력 경로를 차단하지 않음
 *  - 수동 항목(가업·유증·사전증여공제·§54보정·재해손실·감정수수료·외국납부·단기재상속): isManualItemActive 게이트
 *  - 그룹 B·C 수동 항목 0이면 "위 체크리스트에서 항목을 선택하세요" 안내문
 *  - 신고 상태·그룹 D(납부 방법)는 항상 노출 (공제 아닌 공통 입력)
 *
 * 정책:
 *  - useEffect → store 미러링 절대 금지 (feedback_useeffect_store_mirror_forbidden)
 *  - 자동 항목 게이팅 제거: isAutoItemVisible·autoVisible 파생 삭제
 *    근거: isApplicable이 false여도 사용자가 직접 입력해야 하는 경우가 있음
 *    (e.g. 동거주택 isApplicable=false이지만 입력 후 엔진 계산 필요)
 *  - 수동 항목 게이팅: isManualItemActive(form, key) — 값 없고 체크 안 하면 섹션 숨김
 *  - CasualtyLossSection은 casualtyLossEnabled 단일 진실 — 체크리스트 칩 = 동일 필드 토글
 */

import { useMemo, useState } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { AutoSuggestBadge } from "./AutoSuggestBadge";
import { FamilyBusinessEligibilitySection } from "./FamilyBusinessEligibilitySection";
import { InstallmentInputSection } from "./InstallmentInputSection";
import { PaymentInKindInputSection } from "./PaymentInKindInputSection";
import { ShortTermReinheritSection } from "./ShortTermReinheritSection";
import { AppraisalFeeSection } from "@/components/calc/deductions/AppraisalFeeSection";
import { resolveValuationMethod } from "@/lib/tax-engine/property-valuation";
import { CohabitAncillaryLandBlock } from "./CohabitAncillaryLandBlock";
import { Step4DeductionGroup } from "./Step4DeductionGroup";
import { CasualtyLossSection } from "./CasualtyLossSection";
import { InheritanceReviewSummary } from "./InheritanceReviewSummary";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { Step4DeductionChecklist } from "./Step4DeductionChecklist";
import { isManualItemActive } from "@/lib/calc/inheritance-deduction-checklist";
import type { FormState, FormSet } from "./shared";
import type { Step4Autos } from "./steps";

// ────────────────────────────────────────────────────
// autoFillValue — steps.tsx와 동일 (DRY 불가 — 순환 import 회피)
// ────────────────────────────────────────────────────
import type { DeductionSuggestion } from "@/lib/calc/inheritance-deduction-suggest";

function autoFillValue(raw: string, s: DeductionSuggestion): string {
  if (raw !== "") return raw;
  return s.isApplicable && s.value > 0 ? s.value.toLocaleString("ko-KR") : "";
}

// ────────────────────────────────────────────────────
// 빈 그룹 안내문 컴포넌트
// ────────────────────────────────────────────────────

function EmptyGroupNotice() {
  return (
    <p className="text-caption text-gray-400 dark:text-gray-500 py-1">
      위 체크리스트에서 항목을 선택하면 입력 섹션이 열립니다.
    </p>
  );
}

// ────────────────────────────────────────────────────
// Step4 메인
// ────────────────────────────────────────────────────

export function Step4({
  form,
  set,
  autos,
}: {
  form: FormState;
  set: FormSet;
  autos: Step4Autos;
}) {
  const hasSpouse = form.heirs.some((h) => h.relation === "spouse");

  // ── 자동 감지 boolean 4개 — 체크리스트 패널 표시용 (useMemo — autos 의존) ──
  // ★ 자동 항목 렌더 게이팅에는 사용하지 않음 (설계 보정 2026-06-13)
  const autoDetected = useMemo(
    () => ({
      spouse: hasSpouse,
      financial: autos.netFin.isApplicable,
      cohabit: autos.cohabit.isApplicable,
      farming: autos.farming.isApplicable,
    }),
     
    [hasSpouse, autos.netFin.isApplicable, autos.cohabit.isApplicable, autos.farming.isApplicable],
  );

  // ── isManualItemActive 파생 ──
  const manualActive = useMemo(
    () => ({
      familyBusiness: isManualItemActive(form, "familyBusiness"),
      legatee: isManualItemActive(form, "legatee"),
      heirWaiver: isManualItemActive(form, "heirWaiver"),
      priorGiftDeduction: isManualItemActive(form, "priorGiftDeduction"),
      disasterAdjust: isManualItemActive(form, "disasterAdjust"),
      casualtyLoss: isManualItemActive(form, "casualtyLoss"),
      appraisalFee: isManualItemActive(form, "appraisalFee"),
      foreignTax: isManualItemActive(form, "foreignTax"),
      shortTermReinherit: isManualItemActive(form, "shortTermReinherit"),
    }),
     
    [form],
  );

  // ── 그룹별 "입력됨" 배지용 ──
  const has = (s: string) => s.trim() !== "";
  const groupDeductionData =
    [
      form.spouseActualAmount,
      form.netFinancialAssets,
      form.cohabitHouseStdPrice,
      form.cohabitDirectAmount,
      form.ancillaryLandArea,
      form.farmingAssetValue,
      form.familyBusinessValue,
      form.familyBusinessDirectAmount,
    ].some(has) || form.familyBusiness != null;
  const groupAdjustData =
    [
      form.legateeAmountNonHeir,
      form.priorGiftDeductionTotal,
      form.disasterLossDeduction,
      form.appraisalRealEstateFee,
      form.appraisalUnlistedFee,
      form.appraisalTangibleFee,
    ].some(has) || form.casualtyLossEnabled;
  const groupCreditData =
    form.isUnfiled ||
    !form.isFiledOnTime ||
    form.shortTermReinheritAssets.length > 0 ||
    [
      form.foreignTaxPaid,
      form.foreignInheritanceTaxBase,
      form.shortTermReinheritPriorDeathDate,
      form.shortTermReinheritTaxPaid,
      form.shortTermReinheritAssetValue,
      form.shortTermReinheritPriorEstateValue,
      form.shortTermReinheritYears,
    ].some(has);
  const groupPaymentData =
    form.installmentEnabled || form.splitPaymentEnabled || form.paymentInKindEnabled;

  // ── 그룹 controlled open 상태 ──
  // 초기값: 해당 그룹에 이미 입력/활성 데이터가 있으면 true(세션 복원·이력 불러오기 지원),
  //          없으면 false(디폴트 접힘 — 체크리스트 패널 + 그룹 헤더만 노출).
  // ★ useEffect → state 미러링 금지. 칩 onClick 핸들러에서 직접 set.
  const [groupOpen, setGroupOpen] = useState<
    Record<"deduction" | "adjust" | "credit" | "payment", boolean>
  >(() => ({
    deduction: groupDeductionData,
    adjust: groupAdjustData,
    credit: groupCreditData,
    payment: groupPaymentData,
  }));

  // ── 그룹 A 노출 항목 수 (자동 항목 4개 무조건 노출 — 배우자만 hasSpouse 게이트) ──
  const groupAVisibleCount =
    (hasSpouse ? 1 : 0) + // spouse: hasSpouse만으로 판단
    1 + // financial: 항상
    1 + // cohabit: 항상
    1 + // farming: 항상
    (manualActive.familyBusiness ? 1 : 0);

  // ── 그룹 B 노출 항목 수 ──
  const groupBVisibleCount =
    (manualActive.legatee ? 1 : 0) +
    (manualActive.priorGiftDeduction ? 1 : 0) +
    (manualActive.disasterAdjust ? 1 : 0) +
    (manualActive.casualtyLoss ? 1 : 0) +
    (manualActive.appraisalFee ? 1 : 0);

  // ── 그룹 C 노출 항목 수 (신고 상태·세대생략은 항상 노출이므로 수동 항목만 카운트) ──
  const groupCManualVisibleCount =
    (manualActive.foreignTax ? 1 : 0) + (manualActive.shortTermReinherit ? 1 : 0);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          공제·세액공제 입력 (선택)
        </h3>
        <p className="mt-1 text-caption text-gray-500 dark:text-gray-400">
          ⓘ 자산 카드·상속인 구성에서 도출 가능한 값은 자동으로 적용됩니다.
          수동 항목은 아래 체크리스트에서 선택하면 입력 섹션이 열립니다.
        </p>
      </div>

      {/* ── 체크리스트 패널 ── */}
      <Step4DeductionChecklist
        form={form}
        set={set}
        autoDetected={autoDetected}
        onAutoChipClick={() => {
          // 자동 항목 칩 클릭 → 그룹 A(deduction) 펼침
          // ★ onClick 핸들러 내 직접 set — useEffect 미러링 금지
          setGroupOpen((p) => ({ ...p, deduction: true }));
        }}
        onManualChipToggle={(chipKey, willBeActive) => {
          // 수동 항목 칩 활성화(체크) 시 해당 그룹 자동 펼침
          // willBeActive=true(체크됨) 시에만 펼침, 해제 시는 그룹 상태 유지
          if (!willBeActive) return;
          // 항목 → 그룹 매핑
          const GROUP_MAP: Record<
            import("@/lib/calc/inheritance-deduction-checklist").ManualChecklistKey,
            "deduction" | "adjust" | "credit"
          > = {
            familyBusiness: "deduction",
            legatee: "adjust",
            heirWaiver: "adjust",
            priorGiftDeduction: "adjust",
            disasterAdjust: "adjust",
            casualtyLoss: "adjust",
            appraisalFee: "adjust",
            foreignTax: "credit",
            shortTermReinherit: "credit",
          };
          const groupKey = GROUP_MAP[chipKey];
          setGroupOpen((p) => ({ ...p, [groupKey]: true }));
        }}
      />

      {/* ── 그룹 A: 상속공제 (추가) ── */}
      <Step4DeductionGroup
        title="상속공제 — 배우자·금융재산·동거주택·영농·가업"
        tone="emerald"
        hasData={groupDeductionData}
        open={groupOpen.deduction}
        onToggle={() => setGroupOpen((p) => ({ ...p, deduction: !p.deduction }))}
        testId="step4-group-deduction"
      >
        {groupAVisibleCount === 0 ? (
          <EmptyGroupNotice />
        ) : (
          <>
            {/* 배우자 §19 — hasSpouse 게이트만 유지 (자동 항목은 항상 노출) */}
            {hasSpouse && (
              <div className="space-y-2">
                <CurrencyInput
                  label="배우자 실제 상속액 (§19 · 최소 5억·최대 30억)"
                  value={autoFillValue(form.spouseActualAmount, autos.spouse)}
                  onChange={(v) => set({ spouseActualAmount: v })}
                  hint="협의분할 입력 시 배우자 배분액에서 자동 도출. 실제 상속액이 법정상속분보다 적을 때만 직접 입력."
                />
                <LawArticleModal legalBasis="상속세및증여세법 §19" label="§19 배우자 상속공제" />
                <AutoSuggestBadge
                  suggestion={autos.spouse}
                  currentValue={autoFillValue(form.spouseActualAmount, autos.spouse)}
                  onApply={(v) => set({ spouseActualAmount: v })}
                  label="배우자 실제 상속액"
                />
              </div>
            )}

            {/* 금융재산 §22 — 항상 노출 */}
            <div className="space-y-2">
                <CurrencyInput
                  label="순 금융재산 (§22 금융재산공제용)"
                  value={autoFillValue(form.netFinancialAssets, autos.netFin)}
                  onChange={(v) => set({ netFinancialAssets: v })}
                  hint="예금·펀드·채권 등 — 자산 카드의 금융재산에서 자동 도출. 20% 공제, 최대 2억."
                />
                <LawArticleModal legalBasis="상속세및증여세법 §22" label="§22 금융재산 상속공제" />
                <AutoSuggestBadge
                  suggestion={autos.netFin}
                  currentValue={autoFillValue(form.netFinancialAssets, autos.netFin)}
                  onApply={(v) => set({ netFinancialAssets: v })}
                  label="순 금융재산"
                />
            </div>

            {/* 동거주택 §23의2 — 항상 노출 */}
            <>
              <div className="space-y-2">
                <CurrencyInput
                  label="동거주택 공시가격 (§23의2 · 공제 최대 6억)"
                  value={autoFillValue(form.cohabitHouseStdPrice, autos.cohabit)}
                  onChange={(v) => set({ cohabitHouseStdPrice: v })}
                  hint="자산 카드에서 주택을 '동거주택'으로 체크하면 기준시가가 자동 도출됩니다. 공시가 100%(2020.1.1.~)·이전 80%, 담보채무 차감."
                  placeholder="자산 카드 동거주택 체크 또는 직접 입력"
                />
                <LawArticleModal legalBasis="상속세및증여세법 §23의2" label="§23의2 동거주택 상속공제" />
                <AutoSuggestBadge
                  suggestion={autos.cohabit}
                  currentValue={autoFillValue(form.cohabitHouseStdPrice, autos.cohabit)}
                  onApply={(v) => set({ cohabitHouseStdPrice: v })}
                  label="동거주택 공시가격"
                />
              </div>
              <CurrencyInput
                label="동거주택공제 직접 입력 (공제 최대 6억)"
                value={form.cohabitDirectAmount}
                onChange={(v) => set({ cohabitDirectAmount: v })}
                hint="요건 판정 생략 모드 — 입력값 그대로 적용. 공시가격 입력보다 우선."
              />
              {/* G4 §23의2① 주택부수토지 면적한도 차감 */}
              <CohabitAncillaryLandBlock
                ancillaryLandArea={form.ancillaryLandArea}
                buildingFootprintArea={form.buildingFootprintArea}
                ancillaryLandRegion={form.ancillaryLandRegion}
                ancillaryLandStdPrice={form.ancillaryLandStdPrice}
                onChange={(patch) => set(patch)}
              />
            </>

            {/* 영농 §18의3 — 항상 노출 */}
            <div className="space-y-2">
              <CurrencyInput
                label="영농상속재산가액 (§18의3 · 공제 최대 30억)"
                value={autoFillValue(form.farmingAssetValue, autos.farming)}
                onChange={(v) => set({ farmingAssetValue: v })}
                hint="자산 카드에서 농지·초지·어선 등으로 분류하면 자동 도출(시행령 §16⑤)."
              />
              <LawArticleModal legalBasis="상속세및증여세법 §18의3" label="§18의3 영농상속공제" />
              <AutoSuggestBadge
                suggestion={autos.farming}
                currentValue={autoFillValue(form.farmingAssetValue, autos.farming)}
                onApply={(v) => set({ farmingAssetValue: v })}
                label="영농상속재산가액"
              />
            </div>

            {/* 가업상속공제 §18의2 — 수동 항목 */}
            {manualActive.familyBusiness && (
              <div className="space-y-3 border-t border-amber-100 dark:border-amber-900 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    가업상속공제 (§18의2)
                  </h4>
                  <LawArticleModal legalBasis="상속세및증여세법 §18의2" label="§18의2" />
                </div>

                <FamilyBusinessEligibilitySection
                  familyBusiness={form.familyBusiness}
                  onChange={(v) => set({ familyBusiness: v })}
                  deathDate={form.deathDate}
                  heirs={form.heirs}
                  mainBusinessValue={parseAmount(form.familyBusinessValue)}
                />

                <div className="space-y-2">
                  <CurrencyInput
                    label="가업상속재산가액 (legacy / 요건 미입력 시)"
                    value={form.familyBusinessValue}
                    onChange={(v) => set({ familyBusinessValue: v })}
                    hint="요건 판정 모드 미사용 시 가업재산가액 직접 입력 — 중소·중견기업 가업 (최대 600억)"
                  />
                  {parseAmount(form.familyBusinessValue) > 0 && !form.familyBusiness && (
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                        가업 영위 기간 (년) — legacy 모드
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={form.familyBusinessYears}
                        onChange={(e) =>
                          set({ familyBusinessYears: e.target.value.replace(/\D/g, "") })
                        }
                        placeholder="영위 기간 입력 (년)"
                        className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-violet-200 bg-violet-50/60 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-2">
                  <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                    직접 입력 모드 (Phase E escape hatch)
                  </p>
                  <p className="text-micro text-violet-700 dark:text-violet-300">
                    요건 판정 생략 — 입력값 그대로 적용 (한도 600억 유지). 위 가업재산가액 입력보다 우선.
                  </p>
                  <CurrencyInput
                    label="가업상속공제 직접 입력액 (원)"
                    value={form.familyBusinessDirectAmount}
                    onChange={(v) => set({ familyBusinessDirectAmount: v })}
                    hint="법정 요건 생략 — 직접 확인하고 입력하는 경우만 사용"
                  />
                </div>
              </div>
            )}
          </>
        )}
      </Step4DeductionGroup>

      {/* ── 그룹 B: 종합한도 보정·재해손실·감정평가수수료 ── */}
      <Step4DeductionGroup
        title="종합한도 보정·재해손실·감정평가수수료"
        tone="amber"
        hasData={groupAdjustData}
        open={groupOpen.adjust}
        onToggle={() => setGroupOpen((p) => ({ ...p, adjust: !p.adjust }))}
        testId="step4-group-adjust"
      >
        {groupBVisibleCount === 0 ? (
          <EmptyGroupNotice />
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              <LawArticleModal legalBasis="상속세및증여세법 §24" label="§24 공제 적용 한도" />
            </div>
            {/* 상속외자 유증 §19·§24 분자 차감 */}
            {manualActive.legatee && (
              <CurrencyInput
                label="상속외자 유증 금액 (§19·§24 분자 차감)"
                value={form.legateeAmountNonHeir}
                onChange={(v) => set({ legateeAmountNonHeir: v })}
                hint="상속인이 아닌 자(수유자 손자녀·기타)에게 유증한 재산가액"
              />
            )}

            {/* §24 ②2호 선순위 상속포기 → 후순위 수령 (대습상속 제외) */}
            {manualActive.heirWaiver && (
              <CurrencyInput
                label="상속포기 후순위 상속 금액 (§24② 분자 차감)"
                value={form.heirWaiverAmount}
                onChange={(v) => set({ heirWaiverAmount: v })}
                hint="선순위 상속인의 상속포기로 다음 순위 상속인이 상속받은 재산가액. 대습상속(선순위 사망·결격)은 제외 — 상속포기 시에만 입력"
              />
            )}

            {/* 사전증여 공제합계 §24 */}
            {manualActive.priorGiftDeduction && (
              <CurrencyInput
                label="사전증여 증여재산공제 합계 (§24 분자 차감)"
                value={form.priorGiftDeductionTotal}
                onChange={(v) => set({ priorGiftDeductionTotal: v })}
                hint="배우자 6억·직계비속 5천만 등 사전증여 시 적용된 증여재산공제 합"
              />
            )}

            {/* §24 분자 보정 — §54 재해손실공제 */}
            {manualActive.disasterAdjust && (
              <CurrencyInput
                label="§24 분자 보정 — 사전증여 기간 §54 재해손실공제 (보정용)"
                value={form.disasterLossDeduction}
                onChange={(v) => set({ disasterLossDeduction: v })}
                hint="사전증여재산에 적용된 §54 증여세 재해손실공제 합산액. §24 종합한도 분자에서 사전증여 합산가액을 차감할 때 보정에 사용. (상속세 §23 재해손실공제는 아래 '재해손실공제 신청(§23)' 토글에서 입력)"
              />
            )}

            {/* §23 재해손실공제 — CasualtyLossSection 자체에 ToggleCard. casualtyLossEnabled가 단일 진실. */}
            {/* 체크리스트 칩 = casualtyLossEnabled 직접 토글 → 이중 토글 없음 */}
            {manualActive.casualtyLoss && <CasualtyLossSection form={form} set={set} />}

            {/* 감정평가수수료 §25 */}
            {manualActive.appraisalFee && (
              <AppraisalFeeSection
                taxType="inheritance"
                value={form}
                onChange={set}
                hasAppraisalAsset={form.estateItems.some(
                  (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
                )}
              />
            )}
          </>
        )}
      </Step4DeductionGroup>

      {/* ── 그룹 C: 신고 상태·외국납부·단기재상속 세액공제 ── */}
      <Step4DeductionGroup
        title="신고 상태·외국납부·단기재상속 세액공제"
        tone="violet"
        hasData={groupCreditData}
        open={groupOpen.credit}
        onToggle={() => setGroupOpen((p) => ({ ...p, credit: !p.credit }))}
        testId="step4-group-credit"
      >
        {/* 세대생략 안내 — 항상 노출(read-only) */}
        {form.heirs.some((h) => h.isGenerationSkipBeneficiary) && (
          <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-700 dark:bg-sky-900/20 px-3 py-2 text-caption text-sky-800 dark:text-sky-200">
            ℹ️ <strong>세대생략 할증과세 (§27)</strong> — 상속인 등록 단계에서 수유자에 체크한
            세대생략 대상 정보를 기반으로 자동 산출됩니다. 별도 입력이 필요하지 않습니다.
          </div>
        )}

        {/* 신고 상태 — 항상 노출(공제 아닌 공통 상태) */}
        <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-violet-700">
              신고 상태 (§67 · §69 신고세액공제 · §21① 일괄공제)
            </p>
            <LawArticleModal legalBasis="상속세및증여세법 §69" label="§69 신고세액공제" />
            <LawArticleModal legalBasis="상속세및증여세법 §21" label="§21 일괄공제" />
            <LawArticleModal legalBasis="상속세및증여세법 §18" label="§18 기초공제" />
            <LawArticleModal legalBasis="상속세및증여세법 §20" label="§20 인적공제" />
          </div>
          <RadioCardGroup
            lawLinks="상증법"
            name="filing-status"
            tone="violet"
            value={form.isUnfiled ? "none" : form.isFiledOnTime ? "on_time" : "late"}
            onChange={(v) => {
              if (v === "on_time") set({ isFiledOnTime: true, isUnfiled: false });
              else if (v === "late") set({ isFiledOnTime: false, isUnfiled: false });
              else set({ isFiledOnTime: false, isUnfiled: true });
            }}
            options={[
              {
                value: "on_time",
                label: "법정기한 내 신고 (정기신고)",
                description:
                  "상속개시일로부터 6개월 이내 신고 — 신고세액공제 3% 적용 · 일괄공제 max(기초+인적, 5억)",
              },
              {
                value: "late",
                label: "기한후신고 (국세기본법 §45의3)",
                description:
                  "법정기한 경과 후 신고 — 신고세액공제 미적용 · 일괄공제 max 적용 (단서 미해당)",
              },
              {
                value: "none",
                label: "무신고",
                description:
                  "정기·기한후신고 모두 없음 — 신고세액공제 미적용 · 일괄공제 5억 고정 (§21① 단서)",
              },
            ]}
          />
        </div>

        {/* 외국납부세액공제 §29 — 수동 항목 */}
        {manualActive.foreignTax && (
          <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-semibold text-violet-700">외국납부세액공제 (§29)</p>
              <LawArticleModal legalBasis="상속세및증여세법 §29" label="§29" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              해외 소재 상속재산에 외국 법령에 따라 부과된 상속세를 공제합니다. 한도는
              산출세액 × (국외 상속재산 과세표준 ÷ 상속세 과세표준)으로 계산됩니다 (상증령 §21①).
            </p>
            <FieldCard
              label="외국에서 납부한 상속세액"
              hint="외국 법령에 따라 부과된 상속세액 (한도 비교 대상)."
            >
              <CurrencyInput
                label="외국에서 납부한 상속세액"
                hideLabel
                value={form.foreignTaxPaid}
                onChange={(v) => set({ foreignTaxPaid: v })}
              />
            </FieldCard>
            <FieldCard
              label="국외 상속재산 과세표준"
              hint="외국에서 상속세가 부과된 상속재산의 과세표준 (한도식 분자). 미입력 시 외국납부세액공제가 적용되지 않습니다. 전체 상속세 과세표준(분모)은 자동 계산됩니다."
            >
              <CurrencyInput
                label="국외 상속재산 과세표준"
                hideLabel
                value={form.foreignInheritanceTaxBase}
                onChange={(v) => set({ foreignInheritanceTaxBase: v })}
              />
            </FieldCard>
          </div>
        )}

        {/* 단기재상속공제 §30 — 수동 항목 */}
        {manualActive.shortTermReinherit && (
          <ShortTermReinheritSection form={form} set={set} />
        )}

        {/* 수동 항목 모두 미체크 시 안내 */}
        {groupCManualVisibleCount === 0 && (
          <p className="text-caption text-gray-400 dark:text-gray-500">
            외국납부세액공제·단기재상속공제가 해당하면 위 체크리스트에서 선택하세요.
          </p>
        )}
      </Step4DeductionGroup>

      {/* ── 그룹 D: 납부 방법 — 항상 노출 ── */}
      <Step4DeductionGroup
        title="납부 방법 — 연부연납·분납·물납"
        tone="sky"
        hasData={groupPaymentData}
        open={groupOpen.payment}
        onToggle={() => setGroupOpen((p) => ({ ...p, payment: !p.payment }))}
        testId="step4-group-payment"
      >
        <InstallmentInputSection form={form} set={set} />
        <PaymentInKindInputSection form={form} set={set} />
      </Step4DeductionGroup>

      {/* 계산 직전 입력 요약 */}
      <InheritanceReviewSummary form={form} autos={autos} />
    </div>
  );
}
