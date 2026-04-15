"use client";

/**
 * InheritanceTaxForm — 상속세 계산 5단계 마법사 (#26)
 *
 * Step 0: 피상속인 기본 정보 (거주자 여부, 사망일)
 * Step 1: 상속재산 평가 (부동산·금융·주식)
 * Step 2: 비과세·장례비·채무
 * Step 3: 사전증여재산 (§13)
 * Step 4: 상속인 구성 + 공제 입력
 * Step 5: 세액공제 입력 → 결과
 */

import { useState } from "react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { HeirComposition } from "@/components/calc/HeirComposition";
import { InheritanceTaxResultView } from "@/components/calc/results/InheritanceTaxResultView";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import type {
  EstateItem,
  Heir,
  PriorGift,
  ExemptionInput,
  InheritanceTaxInput,
  InheritanceTaxResult,
  InheritanceDeductionInput,
  InheritanceTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";

// ============================================================
// 폼 상태 타입
// ============================================================

interface FormState {
  // Step 0
  decedentType: "resident" | "non_resident";
  deathDate: string;
  // Step 1
  estateItems: EstateItem[];        // 부동산·금융
  stockItems: EstateItem[];         // 주식
  // Step 2
  exemptionItems: ExemptionCheckedItem[];
  funeralExpense: string;
  funeralIncludesBongan: boolean;
  debts: string;
  // Step 3
  priorGifts: PriorGift[];
  // Step 4
  heirs: Heir[];
  spouseActualAmount: string;
  preferLumpSum: boolean;
  netFinancialAssets: string;
  cohabitHouseStdPrice: string;
  farmingAssetValue: string;
  familyBusinessValue: string;
  familyBusinessYears: string;
  // Step 5
  isGenerationSkip: boolean;
  isMinorHeir: boolean;
  generationSkipAssetAmount: string;
  isFiledOnTime: boolean;
  foreignTaxPaid: string;
  shortTermReinheritYears: string;
  shortTermReinheritTaxPaid: string;
}

const INITIAL_FORM: FormState = {
  decedentType: "resident",
  deathDate: "",
  estateItems: [],
  stockItems: [],
  exemptionItems: [],
  funeralExpense: "",
  funeralIncludesBongan: false,
  debts: "",
  priorGifts: [],
  heirs: [],
  spouseActualAmount: "",
  preferLumpSum: false,
  netFinancialAssets: "",
  cohabitHouseStdPrice: "",
  farmingAssetValue: "",
  familyBusinessValue: "",
  familyBusinessYears: "",
  isGenerationSkip: false,
  isMinorHeir: false,
  generationSkipAssetAmount: "",
  isFiledOnTime: true,
  foreignTaxPaid: "",
  shortTermReinheritYears: "",
  shortTermReinheritTaxPaid: "",
};

const STEPS = [
  "피상속인 정보",
  "상속재산",
  "비과세·장례비",
  "사전증여",
  "상속인·공제",
  "세액공제",
];

// ============================================================
// 단계별 유효성 검사
// ============================================================

function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.deathDate) return "상속개시일(사망일)을 입력하세요.";
  }
  if (step === 1) {
    const total = form.estateItems.length + form.stockItems.length;
    if (total === 0) return "상속재산을 1개 이상 입력하세요.";
  }
  if (step === 4) {
    if (form.heirs.length === 0) return "상속인을 1명 이상 입력하세요.";
  }
  return null;
}

// ============================================================
// Step 0 — 피상속인 기본 정보
// ============================================================

function Step0({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
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
        <DateInput
          value={form.deathDate}
          onChange={(v) => set({ deathDate: v })}
        />
        <p className="text-xs text-muted-foreground">
          평가기준일·신고기한(6개월) 계산의 기준이 됩니다.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Step 1 — 상속재산 평가
// ============================================================

function Step1({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
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
        />
      </div>
    </div>
  );
}

// ============================================================
// Step 2 — 비과세·장례비·채무
// ============================================================

function Step2({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-6">
      <ExemptionChecklist
        category="inheritance"
        value={form.exemptionItems}
        onChange={(items) => set({ exemptionItems: items })}
      />

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
          장례비 (§14①3호)
        </h3>
        <CurrencyInput
          label="장례비용"
          value={form.funeralExpense}
          onChange={(v) => set({ funeralExpense: v })}
          hint="최대 1,500만원 한도 자동 적용"
          placeholder="예: 10,000,000"
        />
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.funeralIncludesBongan}
            onChange={(e) => set({ funeralIncludesBongan: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-200">
            봉안시설 이용 (추가 +500만원)
          </span>
        </label>
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
    </div>
  );
}

// ============================================================
// Step 3 — 사전증여재산
// ============================================================

function Step3({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  return (
    <PriorGiftInput
      gifts={form.priorGifts}
      onChange={(gifts) => set({ priorGifts: gifts })}
      mode="inheritance"
    />
  );
}

// ============================================================
// Step 4 — 상속인 구성 + 공제 선택
// ============================================================

function Step4({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  const hasSpouse = form.heirs.some((h) => h.relation === "spouse");

  return (
    <div className="space-y-6">
      <HeirComposition
        heirs={form.heirs}
        onChange={(heirs) => set({ heirs })}
      />

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
                onChange={(e) => set({ familyBusinessYears: e.target.value.replace(/\D/g, "") })}
                placeholder="예: 15"
                className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.preferLumpSum}
            onChange={(e) => set({ preferLumpSum: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              일괄공제 선택 (§21 5억)
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              미체크 시 기초공제+인적공제·배우자공제 합산과 자동 비교하여 큰 금액 적용
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}

// ============================================================
// Step 5 — 세액공제 입력
// ============================================================

function Step5({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        세액공제 항목을 입력하면 납부세액이 줄어듭니다.
      </p>

      {/* 세대생략 할증 (§27) */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          세대생략 할증과세 (§27)
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          자녀를 건너뛴 손자·외손자 등이 상속받는 경우 산출세액의 30%(또는 40%) 할증
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isGenerationSkip}
            onChange={(e) =>
              set({
                isGenerationSkip: e.target.checked,
                isMinorHeir: e.target.checked ? form.isMinorHeir : false,
                generationSkipAssetAmount: e.target.checked
                  ? form.generationSkipAssetAmount
                  : "",
              })
            }
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
          />
          <span className="text-sm text-gray-700 dark:text-gray-200">
            세대생략 상속 해당
          </span>
        </label>
        {form.isGenerationSkip && (
          <div className="space-y-3 pl-4 border-l-2 border-indigo-200">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isMinorHeir}
                onChange={(e) => set({ isMinorHeir: e.target.checked })}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
              />
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-200">
                  세대생략 상속인이 미성년자
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  미성년자 + 과세표준 20억 초과 시 40% 할증
                </p>
              </div>
            </label>
            <CurrencyInput
              label="세대생략 해당 상속재산가액 (일부만 세대생략인 경우)"
              value={form.generationSkipAssetAmount}
              onChange={(v) => set({ generationSkipAssetAmount: v })}
              hint="전체 상속인 중 일부만 세대생략인 경우 해당 재산가액 입력. 전체가 세대생략이면 빈칸."
              placeholder="없으면 빈칸 (전액 할증 적용)"
            />
          </div>
        )}
      </div>

      <label className="flex items-start gap-3 cursor-pointer p-4 border rounded-lg">
        <input
          type="checkbox"
          checked={form.isFiledOnTime}
          onChange={(e) => set({ isFiledOnTime: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600"
        />
        <div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            법정신고기한 내 신고 (§69 신고세액공제 3%)
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            상속개시일로부터 6개월 이내 신고 시 산출세액의 3% 공제
          </p>
        </div>
      </label>

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
            placeholder="예: 3 (0~10년)"
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

// ============================================================
// 메인 컴포넌트
// ============================================================

export function InheritanceTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InheritanceTaxResult | null>(null);

  const set = (patch: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const handleNext = () => {
    const err = validateStep(step, form);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCalculate();
    }
  };

  const handleBack = () => {
    setError(null);
    if (step === 0) {
      window.history.back();
    } else {
      setStep(step - 1);
    }
  };

  const buildInput = (): InheritanceTaxInput => {
    const allItems = [...form.estateItems, ...form.stockItems];
    const deductionInput: InheritanceDeductionInput = {
      heirs: form.heirs,
      spouseActualAmount: parseAmount(form.spouseActualAmount) || undefined,
      preferLumpSum: form.preferLumpSum,
      netFinancialAssets: parseAmount(form.netFinancialAssets) || undefined,
      cohabitHouseStdPrice: parseAmount(form.cohabitHouseStdPrice) || undefined,
      farmingAssetValue: parseAmount(form.farmingAssetValue) || undefined,
      familyBusinessValue: parseAmount(form.familyBusinessValue) || undefined,
      familyBusinessYears: form.familyBusinessYears
        ? parseInt(form.familyBusinessYears, 10)
        : undefined,
      deathDate: form.deathDate || undefined,
    };
    const creditInput: InheritanceTaxCreditInput = {
      priorGifts: form.priorGifts,
      foreignTaxPaid: parseAmount(form.foreignTaxPaid) || undefined,
      shortTermReinheritYears: form.shortTermReinheritYears
        ? parseInt(form.shortTermReinheritYears, 10)
        : undefined,
      shortTermReinheritTaxPaid:
        parseAmount(form.shortTermReinheritTaxPaid) || undefined,
      isFiledOnTime: form.isFiledOnTime,
    };
    return {
      decedentType: form.decedentType,
      deathDate: form.deathDate,
      estateItems: allItems,
      funeralExpense: parseAmount(form.funeralExpense),
      funeralIncludesBongan: form.funeralIncludesBongan,
      debts: parseAmount(form.debts),
      exemptions: form.exemptionItems.length > 0 ? form.exemptionItems : undefined,
      preGiftsWithin10Years: form.priorGifts,
      heirs: form.heirs,
      deductionInput,
      creditInput,
      isGenerationSkip: form.isGenerationSkip || undefined,
      isMinorHeir: form.isGenerationSkip && form.isMinorHeir ? true : undefined,
      generationSkipAssetAmount:
        form.isGenerationSkip && form.generationSkipAssetAmount
          ? parseAmount(form.generationSkipAssetAmount) || undefined
          : undefined,
    };
  };

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calc/inheritance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildInput()),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "계산 중 오류가 발생했습니다.");
        return;
      }
      setResult(data.result);
      setStep(STEPS.length); // 결과 화면
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도하세요.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setResult(null);
    setStep(0);
    setError(null);
  };

  // 결과 화면
  if (result) {
    return (
      <InheritanceTaxResultView
        result={result}
        onReset={handleReset}
        onBack={() => { setResult(null); setStep(STEPS.length - 1); }}
      />
    );
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="space-y-6">
      <StepIndicator steps={STEPS} current={step} />

      <div className="min-h-[300px]">
        {step === 0 && <Step0 form={form} set={set} />}
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} set={set} />}
        {step === 3 && <Step3 form={form} set={set} />}
        {step === 4 && <Step4 form={form} set={set} />}
        {step === 5 && <Step5 form={form} set={set} />}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          {step === 0 ? "← 홈으로" : "← 이전"}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={loading}
          className="flex-1 rounded-md bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading
            ? "계산 중..."
            : isLastStep
            ? "계산하기"
            : "다음 →"}
        </button>
      </div>
    </div>
  );
}
