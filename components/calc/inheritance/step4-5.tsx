"use client";

/**
 * InheritanceTaxForm Step 4·5 — 800줄 정책 분리.
 *
 * 신규 Phase D·E 필드(familyBusinessDirectAmount·cohabitDirectAmount·legateeAmountNonHeir·priorGiftDeductionTotal)
 * 통합 위치. shared.ts의 FormState를 import.
 */

import { useMemo } from "react";

import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { HeirComposition } from "@/components/calc/HeirComposition";
import { AutoSuggestBadge } from "./AutoSuggestBadge";
import {
  suggestCohabitHouseCandidates,
  suggestFamilyBusinessValue,
  suggestFarmingAssetValue,
  suggestLegateeAmountNonHeir,
  suggestNetFinancialAssets,
  suggestPriorGiftDeductionTotal,
  suggestSpouseActualAmount,
} from "@/lib/calc/inheritance-deduction-suggest";
import {
  resolveEffectiveQualifiedHeirIds,
  evaluateFarmingEligibility,
} from "@/lib/tax-engine/deductions/inheritance-deductions";
import { FarmingEligibilitySection } from "./FarmingEligibilitySection";
import type { FormState, FormSet } from "./shared";

// ============================================================
// Step 4 — 상속인 구성 + 공제 (Phase D·E 직접 입력 포함)
// ============================================================

export function Step4({ form, set }: { form: FormState; set: FormSet }) {
  const hasSpouse = form.heirs.some((h) => h.relation === "spouse");

  // 자동 제안 — 모두 순수 함수 derive (useMemo)
  const allEstateItems = useMemo(
    () => [...form.estateItems, ...form.stockItems],
    [form.estateItems, form.stockItems],
  );
  const suggestSpouse = useMemo(
    () => suggestSpouseActualAmount(allEstateItems, form.heirs, form.debtItems),
    [allEstateItems, form.heirs, form.debtItems],
  );
  const suggestNet = useMemo(
    () => suggestNetFinancialAssets(allEstateItems, form.debtItems),
    [allEstateItems, form.debtItems],
  );
  const suggestFamilyBiz = useMemo(
    () => suggestFamilyBusinessValue(allEstateItems),
    [allEstateItems],
  );
  const suggestLegatee = useMemo(
    () => suggestLegateeAmountNonHeir(allEstateItems, form.heirs),
    [allEstateItems, form.heirs],
  );
  const suggestPriorGift = useMemo(
    () => suggestPriorGiftDeductionTotal(form.priorGifts),
    [form.priorGifts],
  );
  const cohabitCandidates = useMemo(
    () => suggestCohabitHouseCandidates(allEstateItems, form.heirs),
    [allEstateItems, form.heirs],
  );
  // 부록 A — 명시 override 우선, 미입력 시 자동 도출 (PR5 resolveEffectiveQualifiedHeirIds)
  const farmingWithDerivedIds = useMemo(() => {
    if (!form.farming || form.farming.heirAssessments === undefined) return form.farming;
    const effective = resolveEffectiveQualifiedHeirIds(form.farming);
    return effective !== undefined ? { ...form.farming, qualifiedHeirIds: effective } : form.farming;
  }, [form.farming]);

  const suggestFarming = useMemo(
    () => suggestFarmingAssetValue(allEstateItems, farmingWithDerivedIds),
    [allEstateItems, farmingWithDerivedIds],
  );
  const farmingEligible = useMemo(() => {
    if (!form.farming) return true;
    // 부록 A — 명시 override 우선·자동 도출 fallback, 자격자 1명 이상이면 eligible
    if (form.farming.heirAssessments !== undefined) {
      const effective = resolveEffectiveQualifiedHeirIds(form.farming);
      return effective !== undefined && effective.length > 0;
    }
    return evaluateFarmingEligibility(form.farming).eligible;
  }, [form.farming]);

  return (
    <div className="space-y-6">
      <HeirComposition heirs={form.heirs} onChange={(heirs) => set({ heirs })} />

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          추가 공제 입력 (선택)
        </h3>

        {hasSpouse && (
          <div className="space-y-2">
            <AutoSuggestBadge
              suggestion={suggestSpouse}
              currentValue={form.spouseActualAmount}
              onApply={(v) => set({ spouseActualAmount: v })}
              label="배우자 실제 상속액"
            />
            <CurrencyInput
              label="배우자 실제 상속액 (§19)"
              value={form.spouseActualAmount}
              onChange={(v) => set({ spouseActualAmount: v })}
              hint="미입력 시 법정상속분으로 자동 산정 (최소 5억, 최대 30억 한도)"
            />
          </div>
        )}

        <div className="space-y-2">
          <AutoSuggestBadge
            suggestion={suggestNet}
            currentValue={form.netFinancialAssets}
            onApply={(v) => set({ netFinancialAssets: v })}
            label="순 금융재산"
          />
          <CurrencyInput
            label="순 금융재산 (§22 금융재산공제용)"
            value={form.netFinancialAssets}
            onChange={(v) => set({ netFinancialAssets: v })}
            hint="예금·펀드·채권 등 — 20% 공제, 최대 2억"
            placeholder="없으면 빈칸"
          />
        </div>

        <div className="space-y-2">
          {cohabitCandidates.isApplicable && (
            <div className="rounded-md border border-dashed border-violet-300 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800 p-3 space-y-2">
              <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
                💡 동거주택 후보 — 자녀 상속인 중 동거 표시된 주택 자산
              </p>
              <div className="space-y-1.5">
                {cohabitCandidates.candidates.map((c) => {
                  const isSelected =
                    form.cohabitHouseStdPrice === String(c.stdPrice);
                  return (
                    <button
                      key={c.itemId}
                      type="button"
                      onClick={() =>
                        set({
                          cohabitHouseStdPrice: isSelected ? "" : String(c.stdPrice),
                        })
                      }
                      className={`w-full text-left rounded border p-2 text-xs transition-colors ${
                        isSelected
                          ? "border-violet-400 bg-violet-100 dark:bg-violet-900/40"
                          : "border-violet-200 bg-white dark:bg-gray-900 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                      }`}
                    >
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-2 font-mono text-gray-700 dark:text-gray-300">
                        {c.stdPrice.toLocaleString("ko-KR")}원
                      </span>
                      {isSelected && (
                        <span className="ml-2 text-[10px] text-violet-700 dark:text-violet-300">
                          ✓ 선택됨
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-violet-600 dark:text-violet-400">
                ⓘ §23의2 — 10년 이상 동거 + 무주택 자녀 요건은 별도 확인 필요
              </p>
            </div>
          )}
          {!cohabitCandidates.hasCohabitantChild &&
            cohabitCandidates.candidates.length > 0 && (
              <p className="text-[10px] text-amber-700 dark:text-amber-300">
                ⚠️ 주택 자산은 있으나 동거 표시(isCohabitant)된 자녀 상속인이 없습니다 — Step4 상단 상속인 구성에서 동거 토글 확인.
              </p>
            )}
          <CurrencyInput
            label="동거주택 공시가격 (§23의2)"
            value={form.cohabitHouseStdPrice}
            onChange={(v) => set({ cohabitHouseStdPrice: v })}
            hint="10년 이상 동거 + 무주택 자녀 상속 — 공시가 80%, 최대 6억"
            placeholder="없으면 빈칸"
          />
        </div>

        <CurrencyInput
          label="동거주택공제 직접 입력 (Phase E)"
          value={form.cohabitDirectAmount}
          onChange={(v) => set({ cohabitDirectAmount: v })}
          hint="요건 판정 생략 모드 — 입력값 그대로 적용 (한도 6억). 공시가 입력보다 우선."
          placeholder="없으면 빈칸"
        />

        {/* ── 영농상속공제 §18의3 ── (F-5 통합) */}
        <div className="space-y-3 border-t border-violet-100 dark:border-violet-900 pt-3">
          <h4 className="text-sm font-semibold text-violet-800 dark:text-violet-200">
            영농상속공제 (§18의3)
          </h4>

          <FarmingEligibilitySection
            farming={form.farming}
            estateItems={allEstateItems}
            heirs={form.heirs}
            onChange={(v) => set({ farming: v })}
          />

          {farmingEligible ? (
            <AutoSuggestBadge
              suggestion={suggestFarming}
              currentValue={form.farmingAssetValue}
              onApply={(v) => set({ farmingAssetValue: v })}
              label="영농상속재산가액"
            />
          ) : suggestFarming.isApplicable ? (
            <div className="rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-2">
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                ⚠️ 자격 미충족 — 자동 채움이 비활성화됐습니다. 요건을 충족하거나 수동 입력하세요.
              </p>
            </div>
          ) : null}

          <CurrencyInput
            label="영농상속재산가액 (§18의3)"
            value={form.farmingAssetValue}
            onChange={(v) => set({ farmingAssetValue: v })}
            hint="농지·초지·산림지·어선·어업권·농업용 건축물·염전 등 — 최대 30억"
            placeholder="없으면 빈칸"
          />
        </div>

        <div className="space-y-2">
          <AutoSuggestBadge
            suggestion={suggestFamilyBiz}
            currentValue={form.familyBusinessValue}
            onApply={(v) => set({ familyBusinessValue: v })}
            label="가업상속재산가액"
          />
          <CurrencyInput
            label="가업상속재산가액 (§18의2)"
            value={form.familyBusinessValue}
            onChange={(v) => set({ familyBusinessValue: v })}
            hint="중소·중견기업 가업 — 영위 기간에 따라 최대 600억"
            placeholder="없으면 빈칸"
          />
          {parseAmount(form.familyBusinessValue) > 0 && (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                가업 영위 기간 (년)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={form.familyBusinessYears}
                onChange={(e) =>
                  set({ familyBusinessYears: e.target.value.replace(/\D/g, "") })
                }
                placeholder="보유기간 입력 (년)"
                className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>

        <CurrencyInput
          label="가업상속공제 직접 입력 (Phase E)"
          value={form.familyBusinessDirectAmount}
          onChange={(v) => set({ familyBusinessDirectAmount: v })}
          hint="요건 판정 생략 모드 — 입력값 그대로 적용 (한도 600억). 가업재산가액 입력보다 우선."
          placeholder="없으면 빈칸"
        />

        <div className="space-y-2">
          <AutoSuggestBadge
            suggestion={suggestLegatee}
            currentValue={form.legateeAmountNonHeir}
            onApply={(v) => set({ legateeAmountNonHeir: v })}
            label="상속외자 유증 금액"
          />
          <CurrencyInput
            label="상속외자 유증 금액 (§19·§24 분자 차감)"
            value={form.legateeAmountNonHeir}
            onChange={(v) => set({ legateeAmountNonHeir: v })}
            hint="상속인이 아닌 자(수유자 손자녀·기타)에게 유증한 재산가액"
            placeholder="없으면 빈칸"
          />
        </div>

        <div className="space-y-2">
          <AutoSuggestBadge
            suggestion={suggestPriorGift}
            currentValue={form.priorGiftDeductionTotal}
            onApply={(v) => set({ priorGiftDeductionTotal: v })}
            label="사전증여 증여재산공제 합계"
          />
          <CurrencyInput
            label="사전증여 증여재산공제 합계 (§24 분자 차감)"
            value={form.priorGiftDeductionTotal}
            onChange={(v) => set({ priorGiftDeductionTotal: v })}
            hint="비우면 사전증여 수증자 관계(§53 배우자 6억·직계비속 5천만 등)로 자동 계산됩니다. 직접 입력하면 그 값으로 덮어씁니다."
            placeholder="비우면 자동 계산"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Step 5 — 세액공제
// ============================================================

export function Step5({ form, set }: { form: FormState; set: FormSet }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        세액공제 항목을 입력하면 납부세액이 줄어듭니다.
      </p>

      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          세대생략 할증과세 (§27)
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          자녀를 건너뛴 손자·외손자 등이 상속받는 경우 산출세액의 30%(또는 40%) 할증
        </p>
        <ToggleCard
          tone="violet"
          title="세대생략 상속 해당"
          checked={form.isGenerationSkip}
          onCheckedChange={(v) =>
            set({
              isGenerationSkip: v,
              isMinorHeir: v ? form.isMinorHeir : false,
              generationSkipAssetAmount: v ? form.generationSkipAssetAmount : "",
            })
          }
        >
          <ToggleCard
            tone="violet"
            size="sm"
            title="세대생략 상속인이 미성년자"
            description="미성년자 + 과세표준 20억 초과 시 40% 할증"
            checked={form.isMinorHeir}
            onCheckedChange={(v) => set({ isMinorHeir: v })}
          />
          <CurrencyInput
            label="세대생략 해당 상속재산가액 (일부만 세대생략인 경우)"
            value={form.generationSkipAssetAmount}
            onChange={(v) => set({ generationSkipAssetAmount: v })}
            hint="전체 상속인 중 일부만 세대생략인 경우 해당 재산가액 입력. 전체가 세대생략이면 빈칸."
            placeholder="없으면 빈칸 (전액 할증 적용)"
          />
        </ToggleCard>
      </div>

      <ToggleCard
        tone="violet"
        title="법정신고기한 내 신고 (§69 신고세액공제 3%)"
        description="상속개시일로부터 6개월 이내 신고 시 산출세액의 3% 공제"
        checked={form.isFiledOnTime}
        onCheckedChange={(v) => set({ isFiledOnTime: v })}
      />

      <CurrencyInput
        label="외국납부세액 (§29)"
        value={form.foreignTaxPaid}
        onChange={(v) => set({ foreignTaxPaid: v })}
        hint="해외 소재 상속재산에 대해 납부한 외국 세액"
        placeholder="없으면 빈칸"
      />

      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          단기재상속공제 (§30)
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          피상속인이 10년 이내에 상속받은 재산이 있는 경우 이전 납부 세액의 일부 공제
        </p>
        <div className="space-y-1">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
            전(前) 상속 경과 연수
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={form.shortTermReinheritYears}
            onChange={(e) =>
              set({ shortTermReinheritYears: e.target.value.replace(/\D/g, "") })
            }
            placeholder="거주기간 입력 (년)"
            className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        {form.shortTermReinheritYears && (
          <CurrencyInput
            label="당시 납부한 상속세"
            value={form.shortTermReinheritTaxPaid}
            onChange={(v) => set({ shortTermReinheritTaxPaid: v })}
            placeholder="이전 상속세 납부액"
          />
        )}
      </div>
    </div>
  );
}
