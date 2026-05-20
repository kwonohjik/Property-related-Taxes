"use client";

/**
 * InheritanceTaxForm Steps 0~5 — 800줄 정책 분리
 *
 * InheritanceTaxForm.tsx에서 추출. FormState 타입은 인근에서 import.
 */

import { DateInput } from "@/components/ui/date-input";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { HeirComposition } from "@/components/calc/HeirComposition";
import { PresumedInheritanceInput } from "./PresumedInheritanceInput";
import { DebtAllocationInput } from "./DebtAllocationInput";
import type { FormState, FormSet } from "./shared";

// ============================================================
// Step 0 — 피상속인 기본 정보
// ============================================================

export function Step0({ form, set }: { form: FormState; set: FormSet }) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        피상속인(돌아가신 분)의 기본 정보를 입력하세요.
      </p>
      <div className="space-y-2">
        <label className="block text-sm font-medium">거주자 여부</label>
        <div className="grid grid-cols-2 gap-3">
          {(["resident", "non_resident"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => set({ decedentType: v })}
              className={`rounded-lg border-2 py-3 px-4 text-sm font-medium transition-colors ${
                form.decedentType === v
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              {v === "resident" ? "거주자" : "비거주자"}
              <p className="text-xs font-normal text-muted-foreground mt-0.5">
                {v === "resident" ? "국내에 주소 or 183일 이상 거소" : "거주자 이외"}
              </p>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          상속개시일 (사망일) <span className="text-destructive">*</span>
        </label>
        <DateInput value={form.deathDate} onChange={(v) => set({ deathDate: v })} />
        <p className="text-xs text-muted-foreground">
          평가기준일·신고기한(6개월) 계산의 기준이 됩니다.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Step 1 — 상속재산 평가 + 추정상속재산 §15
// ============================================================

export function Step1({ form, set }: { form: FormState; set: FormSet }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        상속재산을 모두 입력하세요. 주식은 아래 별도 섹션에 입력합니다.
      </p>
      <PropertyValuationForm
        items={form.estateItems}
        onChange={(items) => set({ estateItems: items })}
        mode="inheritance"
      />
      <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
        <StockValuationForm
          items={form.stockItems}
          onChange={(items) => set({ stockItems: items })}
          mode="inheritance"
          valuationDate={form.deathDate}
        />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            추정상속재산 §15
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            상속개시 전 2년 이내 처분·인출·차입 중 사용처가 객관적으로 불분명한 금액
            (1년 이내 2억 OR 2년 이내 5억 임계).
          </p>
        </div>
        <PresumedInheritanceInput
          items={form.presumedItems}
          heirs={form.heirs}
          onChange={(items) => set({ presumedItems: items })}
        />
      </div>
    </div>
  );
}

// ============================================================
// Step 2 — 비과세·장례비·채무 (debtItems 협의분할 모드 추가)
// ============================================================

export function Step2({ form, set }: { form: FormState; set: FormSet }) {
  const usesDebtItems = form.debtItems.length > 0;
  return (
    <div className="space-y-6">
      <ExemptionChecklist
        category="inheritance"
        value={form.exemptionItems}
        onChange={(items) => set({ exemptionItems: items })}
      />

      {/* 협의분할 모드 토글 */}
      <ToggleCard
        tone="amber"
        title="채무·공과·장례비 협의분할 입력 (Phase A0)"
        description="ON: 항목별 채권자명·상속인별 변제 분담 입력 / OFF: 합계 단일 금액 입력"
        checked={usesDebtItems}
        onCheckedChange={(v) => {
          if (v) {
            // 토글 ON — 빈 debtItems[]로 초기화 (사용자가 항목 추가)
            set({
              debtItems: [],
              funeralExpense: "",
              funeralIncludesBongan: false,
              debts: "",
            });
            // 초기화 직후 빈 배열이라 토글이 다시 OFF로 보일 수 있음 — 위젯 사용자가 추가하면 자연스러움
          } else {
            set({ debtItems: [] });
          }
        }}
      />

      {usesDebtItems ? (
        <DebtAllocationInput
          items={form.debtItems}
          heirs={form.heirs}
          onChange={(items) => set({ debtItems: items })}
        />
      ) : (
        <>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              장례비 (§14①3호)
            </h3>
            <CurrencyInput
              label="장례비용"
              value={form.funeralExpense}
              onChange={(v) => set({ funeralExpense: v })}
              hint="최대 1,500만원 한도 자동 적용"
              placeholder="금액 입력 (원)"
            />
            <ToggleCard
              tone="violet"
              size="sm"
              title="봉안시설 이용"
              description="추가 +500만원"
              checked={form.funeralIncludesBongan}
              onCheckedChange={(v) => set({ funeralIncludesBongan: v })}
            />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <CurrencyInput
              label="공과금 + 채무 합계 (§14①1·2호)"
              value={form.debts}
              onChange={(v) => set({ debts: v })}
              hint="상속개시일 현재 피상속인이 부담해야 할 채무 총액"
              placeholder="없으면 빈칸"
            />
          </div>
        </>
      )}

      {/* 채무·공과·장례 협의분할 + 추가 입력 토글 — 빈 debtItems로 시작 시 항목 추가 안내 */}
      {usesDebtItems && form.debtItems.length === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 italic px-2">
          위에서 채무·공과금·장례비를 카테고리별로 추가하세요.
        </p>
      )}
    </div>
  );
}

// ============================================================
// Step 3 — 사전증여재산
// ============================================================

export function Step3({ form, set }: { form: FormState; set: FormSet }) {
  return (
    <PriorGiftInput
      gifts={form.priorGifts}
      onChange={(gifts) => set({ priorGifts: gifts })}
      mode="inheritance"
    />
  );
}

// ============================================================
// Step 4 — 상속인 구성 + 공제 (Phase D·E 직접 입력 모드)
// ============================================================

export function Step4({ form, set }: { form: FormState; set: FormSet }) {
  const hasSpouse = form.heirs.some((h) => h.relation === "spouse");

  return (
    <div className="space-y-6">
      <HeirComposition heirs={form.heirs} onChange={(heirs) => set({ heirs })} />

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          추가 공제 입력 (선택)
        </h3>

        {hasSpouse && (
          <CurrencyInput
            label="배우자 실제 상속액 (§19)"
            value={form.spouseActualAmount}
            onChange={(v) => set({ spouseActualAmount: v })}
            hint="미입력 시 법정상속분으로 자동 산정 (최소 5억, 최대 30억 한도)"
          />
        )}

        <CurrencyInput
          label="순 금융재산 (§22 금융재산공제용)"
          value={form.netFinancialAssets}
          onChange={(v) => set({ netFinancialAssets: v })}
          hint="예금·펀드·채권 등 — 20% 공제, 최대 2억"
          placeholder="없으면 빈칸"
        />

        <CurrencyInput
          label="동거주택 공시가격 (§23의2)"
          value={form.cohabitHouseStdPrice}
          onChange={(v) => set({ cohabitHouseStdPrice: v })}
          hint="10년 이상 동거 + 무주택 자녀 상속 — 공시가 80%, 최대 6억"
          placeholder="없으면 빈칸"
        />

        <CurrencyInput
          label="동거주택공제 직접 입력 (Phase E)"
          value={form.cohabitDirectAmount}
          onChange={(v) => set({ cohabitDirectAmount: v })}
          hint="요건 판정 생략 모드 — 입력값 그대로 적용 (한도 6억 유지). 공시가격 입력보다 우선."
          placeholder="없으면 빈칸"
        />

        <CurrencyInput
          label="영농상속재산가액 (§23)"
          value={form.farmingAssetValue}
          onChange={(v) => set({ farmingAssetValue: v })}
          hint="농지·목장·어선 등 — 최대 30억"
          placeholder="없으면 빈칸"
        />

        <div className="space-y-2">
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
          hint="요건 판정 생략 모드 — 입력값 그대로 적용 (한도 600억 유지). 가업재산가액 입력보다 우선."
          placeholder="없으면 빈칸"
        />

        {/* Phase D §19·§24 보정용 입력 */}
        <CurrencyInput
          label="상속외자 유증 금액 (§19·§24 분자 차감)"
          value={form.legateeAmountNonHeir}
          onChange={(v) => set({ legateeAmountNonHeir: v })}
          hint="상속인이 아닌 자(수유자 손자녀·기타)에게 유증한 재산가액"
          placeholder="없으면 빈칸"
        />

        <CurrencyInput
          label="사전증여 증여재산공제 합계 (§24 분자 차감)"
          value={form.priorGiftDeductionTotal}
          onChange={(v) => set({ priorGiftDeductionTotal: v })}
          hint="배우자 6억·직계비속 5천만 등 사전증여 시 적용된 증여재산공제 합"
          placeholder="없으면 빈칸"
        />

        <ToggleCard
          tone="violet"
          title="일괄공제 선택 (§21 5억)"
          description="미체크 시 기초공제+인적공제·배우자공제 합산과 자동 비교하여 큰 금액 적용"
          checked={form.preferLumpSum}
          onCheckedChange={(v) => set({ preferLumpSum: v })}
        />
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
