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
import { ChevronLeft } from "lucide-react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { InheritanceTaxResultView } from "@/components/calc/results/InheritanceTaxResultView";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type {
  InheritanceTaxInput,
  InheritanceTaxResult,
  InheritanceDeductionInput,
  InheritanceTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  callInheritanceTaxAPI,
  formatInheritanceApiError as formatApiError,
} from "@/lib/calc/inheritance-api";
import {
  type FormState,
  INITIAL_FORM,
  STEPS,
} from "@/components/calc/inheritance/shared";
import {
  Step0,
  Step1,
  Step2,
  Step3,
  Step4,
  Step5,
} from "@/components/calc/inheritance/steps";


// ============================================================
// API 에러 상세화 — Zod issues → 한국어 라벨 + 메시지
// ============================================================

const INHERITANCE_FIELD_LABELS: Record<string, string> = {
  inheritanceDate: "상속개시일",
  reportDate: "신고일",
  decedentRelation: "피상속인 관계",
  hasSpouse: "배우자 유무",
  hasLinealDescendant: "직계비속 유무",
  estateItems: "상속재산",
  category: "재산 종류",
  name: "자산 명칭",
  marketValue: "시가",
  standardPrice: "기준시가/공시가격",
  appraisedValue: "감정평가액",
  listedStockAvgPrice: "상장주식 평균종가",
  listedStockShares: "상장주식 수량",
  listedStockCode: "상장주식 종목코드",
  leaseDeposit: "임대보증금",
  mortgageAmount: "저당권 설정액",
  heirAllocations: "협의분할 — 상속인별 분배",
  funeralExpense: "장례비",
  debtAmount: "채무액",
  publicCharges: "공과금",
  spouseDeduction: "배우자공제",
  lumpSumDeduction: "일괄공제",
  basicDeduction: "기초공제",
  financialAssetDeduction: "금융재산공제",
  cohabitingHouseDeduction: "동거주택 상속공제",
  familyBusinessDeduction: "가업상속공제",
  farmlandDeduction: "영농상속공제",
  shortTermRedeemDeduction: "단기재상속공제",
  foreignTaxPaid: "외국납부세액",
  filedWithinDeadline: "법정신고기한 내 신고",
  priorGiftsTotal: "10년 내 사전증여 합계",
  generationSkipAssetAmount: "세대생략 상속재산",
};

interface ApiIssue {
  path: string[];
  message: string;
  code?: string;
}

function labelForInheritancePath(path: string[]): string {
  if (path.length === 0) return "입력";
  const parts: string[] = [];
  for (const seg of path) {
    if (/^\d+$/.test(seg)) {
      parts.push(`${Number(seg) + 1}번`);
    } else {
      parts.push(INHERITANCE_FIELD_LABELS[seg] ?? seg);
    }
  }
  return parts.join(" › ");
}

function formatInheritanceApiError(data: { error?: string; issues?: ApiIssue[] }): string {
  if (Array.isArray(data.issues) && data.issues.length > 0) {
    const lines = data.issues.slice(0, 8).map((iss) => {
      const label = labelForInheritancePath(iss.path);
      return `• ${label}: ${iss.message}`;
    });
    const more = data.issues.length > 8 ? `\n(외 ${data.issues.length - 8}건)` : "";
    return `${data.error ?? "입력값이 올바르지 않습니다."}\n${lines.join("\n")}${more}`;
  }
  return data.error ?? "계산 중 오류가 발생했습니다.";
}

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
// 메인 컴포넌트
// ============================================================

export function InheritanceTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InheritanceTaxResult | null>(null);

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  useAutoSaveCalculation({
    taxType: "inheritance",
    inputData: form as unknown as Record<string, unknown>,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: form.deathDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

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
      // Phase D·E 신규 — 종합사례 PDF
      familyBusinessDirectAmount: parseAmount(form.familyBusinessDirectAmount) || undefined,
      cohabitDirectAmount: parseAmount(form.cohabitDirectAmount) || undefined,
      legateeAmountNonHeir: parseAmount(form.legateeAmountNonHeir) || undefined,
      priorGiftDeductionTotal: parseAmount(form.priorGiftDeductionTotal) || undefined,
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
    // 종합사례 PDF — debtItems 입력 시 legacy debts·funeralExpense는 0으로 (엔진 분기 통일)
    const usesDebtItems = form.debtItems.length > 0;
    return {
      decedentType: form.decedentType,
      deathDate: form.deathDate,
      estateItems: allItems,
      funeralExpense: usesDebtItems ? 0 : parseAmount(form.funeralExpense),
      funeralIncludesBongan: usesDebtItems ? false : form.funeralIncludesBongan,
      debts: usesDebtItems ? 0 : parseAmount(form.debts),
      debtItems: usesDebtItems ? form.debtItems : undefined,
      presumedItems: form.presumedItems.length > 0 ? form.presumedItems : undefined,
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
      // lib/calc/inheritance-api 단일 진입점 — body spread 신규 필드 누락 차단 (지점 ④⑬)
      const res = await callInheritanceTaxAPI(buildInput());
      if (!res.ok || !("success" in res.data) || !res.data.success) {
        setError(
          "error" in res.data || "issues" in res.data
            ? formatApiError(res.data)
            : "계산 요청 처리에 실패했습니다.",
        );
        return;
      }
      setResult(res.data.result);
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

  // 결과 화면
  if (result) {
    return (
      <InheritanceTaxResultView
        result={result}
        onReset={handleReset}
        onBack={() => { setResult(null); setStep(STEPS.length - 1); }}
        onGoToFirst={() => { setResult(null); setStep(0); }}
        heirs={form.heirs}
      />
    );
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="space-y-6">
      {/* 홈으로 · 초기화 — 내비게이션 바 위쪽 우측 */}
      <div className="flex items-center justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        <ResetButton
          onReset={() => {
            setForm(INITIAL_FORM);
            setStep(0);
            setResult(null);
            setError(null);
          }}
        />
      </div>

      <StepIndicator steps={[...STEPS]} current={step} onStepClick={(i) => setStep(i)} />

      <div className="min-h-[300px]">
        {step === 0 && (
          <Step0
            form={form}
            set={set}
          />
        )}
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} set={set} />}
        {step === 3 && <Step3 form={form} set={set} />}
        {step === 4 && <Step4 form={form} set={set} />}
        {step === 5 && <Step5 form={form} set={set} />}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive whitespace-pre-line">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleBack}
          className="flex-1 rounded-md border border-border py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? "홈으로" : "이전"}
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
