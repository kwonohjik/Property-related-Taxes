"use client";

/**
 * GiftTaxForm — 증여세 계산 4단계 마법사 (#27)
 *
 * Step 0: 증여 기본 정보 (증여일, 증여자 관계, 세대생략)
 * Step 1: 증여재산 평가 (부동산·금융·주식)
 * Step 2: 비과세·사전증여
 * Step 3: 공제·세액공제 입력 → 결과
 */

import { useState } from "react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { ExemptionChecklist } from "@/components/calc/exemption/ExemptionChecklist";
import { PriorGiftInput } from "@/components/calc/PriorGiftInput";
import { GiftTaxResultView } from "@/components/calc/results/GiftTaxResultView";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import type {
  EstateItem,
  PriorGift,
  GiftTaxInput,
  GiftTaxResult,
  GiftDeductionInput,
  GiftTaxCreditInput,
  DonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";

// ============================================================
// 폼 상태 타입
// ============================================================

interface FormState {
  // Step 0
  giftDate: string;
  donorRelation: DonorRelation;
  isGenerationSkip: boolean;
  isMinorDonee: boolean;
  // Step 1
  giftItems: EstateItem[];
  stockItems: EstateItem[];
  // Step 2
  exemptionItems: ExemptionCheckedItem[];
  priorGifts: PriorGift[];
  // Step 3
  marriageExemption: string;
  birthExemption: string;
  priorUsedDeduction: string;
  isFiledOnTime: boolean;
  foreignTaxPaid: string;
  specialTreatment: "" | "startup" | "family_business";
}

const INITIAL_FORM: FormState = {
  giftDate: "",
  donorRelation: "lineal_ascendant_adult",
  isGenerationSkip: false,
  isMinorDonee: false,
  giftItems: [],
  stockItems: [],
  exemptionItems: [],
  priorGifts: [],
  marriageExemption: "",
  birthExemption: "",
  priorUsedDeduction: "",
  isFiledOnTime: true,
  foreignTaxPaid: "",
  specialTreatment: "",
};

const STEPS = ["증여 정보", "증여재산", "비과세·합산", "공제·세액공제"];

// ============================================================
// 관계 레이블
// ============================================================

const RELATION_LABELS: Record<DonorRelation, string> = {
  spouse: "배우자 (6억 공제)",
  lineal_ascendant_adult: "직계존속 — 성인 수증자 (5천만원)",
  lineal_ascendant_minor: "직계존속 — 미성년 수증자 (2천만원)",
  lineal_descendant: "직계비속 (5천만원)",
  other_relative: "기타 친족 (1천만원)",
};

// ============================================================
// 단계별 유효성 검사
// ============================================================

function validateStep(step: number, form: FormState): string | null {
  if (step === 0) {
    if (!form.giftDate) return "증여일을 입력하세요.";
  }
  if (step === 1) {
    if (form.giftItems.length + form.stockItems.length === 0) {
      return "증여재산을 1개 이상 입력하세요.";
    }
  }
  return null;
}

// ============================================================
// Step 0 — 증여 기본 정보
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
        증여의 기본 정보를 입력하세요.
      </p>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          증여일 <span className="text-destructive">*</span>
        </label>
        <DateInput
          value={form.giftDate}
          onChange={(v) => set({ giftDate: v })}
        />
        <p className="text-xs text-muted-foreground">
          신고기한(3개월) · 10년 합산 기준일
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium">
          증여자와 수증자의 관계 <span className="text-destructive">*</span>
        </label>
        <div className="space-y-2">
          {(Object.entries(RELATION_LABELS) as [DonorRelation, string][]).map(
            ([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  const isAscendant = val === "lineal_ascendant_adult" || val === "lineal_ascendant_minor";
                  set({
                    donorRelation: val,
                    ...(isAscendant ? {} : { marriageExemption: "", birthExemption: "" }),
                  });
                }}
                className={`w-full text-left rounded-lg border-2 px-4 py-3 text-sm transition-colors ${
                  form.donorRelation === val
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200"
                    : "border-border hover:border-muted-foreground/50"
                }`}
              >
                {label}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.isGenerationSkip}
            onChange={(e) => set({ isGenerationSkip: e.target.checked })}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
              세대생략 증여 (§57 할증)
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              수증자가 증여자의 자녀가 아닌 직계비속(손자 등) — 산출세액 30% 할증
            </p>
          </div>
        </label>

        {form.isGenerationSkip && (
          <label className="flex items-start gap-3 ml-7 cursor-pointer">
            <input
              type="checkbox"
              checked={form.isMinorDonee}
              onChange={(e) => set({ isMinorDonee: e.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600"
            />
            <div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                수증자 미성년자
              </span>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                20억 초과분에 대해 40% 할증 적용
              </p>
            </div>
          </label>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Step 1 — 증여재산 평가
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
        증여하는 재산을 모두 입력하세요.
      </p>
      <PropertyValuationForm
        items={form.giftItems}
        onChange={(items) => set({ giftItems: items })}
        mode="gift"
      />
      <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
        <StockValuationForm
          items={form.stockItems}
          onChange={(items) => set({ stockItems: items })}
          mode="gift"
        />
      </div>
    </div>
  );
}

// ============================================================
// Step 2 — 비과세·사전증여
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
        category="gift"
        value={form.exemptionItems}
        onChange={(items) => set({ exemptionItems: items })}
      />
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <PriorGiftInput
          gifts={form.priorGifts}
          onChange={(gifts) => set({ priorGifts: gifts })}
          mode="gift"
        />
      </div>
    </div>
  );
}

// ============================================================
// Step 3 — 공제·세액공제
// ============================================================

function Step3({
  form,
  set,
}: {
  form: FormState;
  set: (p: Partial<FormState>) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        공제 항목을 입력하면 납부세액이 줄어듭니다.
      </p>

      {/* 혼인·출산 공제 */}
      {(form.donorRelation === "lineal_ascendant_adult" || form.donorRelation === "lineal_ascendant_minor") && (
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            혼인·출산 공제 (§53의2, 최대 각 1억)
          </h4>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            직계존속으로부터 증여 시 적용. 혼인신고일 전후 2년 이내 / 자녀 출생일로부터 2년 이내 증여분. 합산 1억 한도.
          </p>
          <CurrencyInput
            label="혼인공제"
            value={form.marriageExemption}
            onChange={(v) => set({ marriageExemption: v })}
            hint="최대 1억원"
            placeholder="없으면 빈칸"
          />
          <CurrencyInput
            label="출산공제"
            value={form.birthExemption}
            onChange={(v) => set({ birthExemption: v })}
            hint="최대 1억원"
            placeholder="없으면 빈칸"
          />
        </div>
      )}

      {/* 기사용 공제 */}
      <CurrencyInput
        label="10년 내 기사용 증여재산공제 합계"
        value={form.priorUsedDeduction}
        onChange={(v) => set({ priorUsedDeduction: v })}
        hint="동일 관계(그룹)에서 10년 이내 이미 공제받은 합계"
        placeholder="없으면 빈칸"
      />

      {/* 신고세액공제 */}
      <label className="flex items-start gap-3 cursor-pointer p-4 border rounded-lg">
        <input
          type="checkbox"
          checked={form.isFiledOnTime}
          onChange={(e) => set({ isFiledOnTime: e.target.checked })}
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-emerald-600"
        />
        <div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            법정신고기한 내 신고 (§69 신고세액공제 3%)
          </span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            증여일로부터 3개월 이내 신고 시 산출세액의 3% 공제
          </p>
        </div>
      </label>

      {/* 외국납부세액 */}
      <CurrencyInput
        label="외국납부세액 (§59)"
        value={form.foreignTaxPaid}
        onChange={(v) => set({ foreignTaxPaid: v })}
        hint="해외 소재 증여재산에 대해 납부한 외국 세액"
        placeholder="없으면 빈칸"
      />

      {/* 조특법 과세특례 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
          조특법 과세특례 (창업·가업)
        </label>
        <div className="space-y-2">
          {(
            [
              { val: "", label: "해당 없음" },
              { val: "startup", label: "창업자금 증여세 과세특례 (§30의5)" },
              { val: "family_business", label: "가업승계 증여세 과세특례 (§30의6)" },
            ] as const
          ).map(({ val, label }) => (
            <button
              key={val}
              type="button"
              onClick={() => set({ specialTreatment: val })}
              className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                form.specialTreatment === val
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export function GiftTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GiftTaxResult | null>(null);

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

  const buildInput = (): GiftTaxInput => {
    const allItems = [...form.giftItems, ...form.stockItems];
    const deductionInput: GiftDeductionInput = {
      donorRelation: form.donorRelation,
      marriageExemption: parseAmount(form.marriageExemption) || undefined,
      birthExemption: parseAmount(form.birthExemption) || undefined,
      priorUsedDeduction: parseAmount(form.priorUsedDeduction) || undefined,
    };
    const creditInput: GiftTaxCreditInput = {
      foreignTaxPaid: parseAmount(form.foreignTaxPaid) || undefined,
      isFiledOnTime: form.isFiledOnTime,
      specialTreatment: form.specialTreatment || undefined,
    };
    return {
      giftDate: form.giftDate,
      donorRelation: form.donorRelation,
      giftItems: allItems,
      exemptions: form.exemptionItems.length > 0 ? form.exemptionItems : undefined,
      priorGiftsWithin10Years: form.priorGifts,
      isGenerationSkip: form.isGenerationSkip,
      isMinorDonee: form.isMinorDonee,
      deductionInput,
      creditInput,
    };
  };

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calc/gift", {
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
      setStep(STEPS.length);
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

  if (result) {
    return (
      <GiftTaxResultView
        result={result}
        onReset={handleReset}
        onBack={() => { setResult(null); setStep(STEPS.length - 1); }}
        estateItems={[...form.giftItems, ...form.stockItems]}
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
