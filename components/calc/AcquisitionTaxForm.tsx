"use client";

/**
 * AcquisitionTaxForm — 취득세 계산 6단계 마법사 (P5UI-10 업그레이드)
 *
 * Step 0: 취득 정보 (취득자유형·물건종류·취득원인·취득가액·취득일)
 * Step 1: 물건 상세 (전용면적·시가표준액·사치성·특수관계인)
 * Step 2: 주택 현황 (보유 주택 카드·세대·권리취득일) — 주택 선택 시 활성
 * Step 3: 중과 분기 (조정대상지역·일시적·지정 전 계약·무상취득 단서)
 * Step 4: 법인·특수 (법인 중과·세율특례 §15) — 해당 시 활성
 * Step 5: 감면 확인 (생애최초·자경농지·농특세 분기) → 계산
 */

import { useState, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { AcquisitionTaxResultView } from "@/components/calc/results/AcquisitionTaxResultView";
import { callAcquisitionTaxAPI } from "@/lib/calc/acquisition-tax-api";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import {
  STEPS,
  INITIAL_FORM,
  validateStep,
  isDeemedAcquisitionCause,
  type FormState,
} from "./acquisition/shared";
import { Step0 } from "./acquisition/Step0";
import { Step1 } from "./acquisition/Step1";
import { Step2 } from "./acquisition/Step2";
import { Step3 } from "./acquisition/Step3";
import { Step4 } from "./acquisition/Step4";
import { Step5 } from "./acquisition/Step5";
import { AcquisitionSidebar } from "./acquisition/AcquisitionSidebar";

// ============================================================
// Skip 로직
// ============================================================

/**
 * 다음 단계 계산 (skip 포함)
 * - 간주취득: Step 0 → Step 1 → -1 (API 호출 시그널)
 * - Step 2 (주택 현황): 비주택이면 건너뜀
 * - Step 4 (법인·특수): 비법인 + 비사치성 + 세율특례 없으면 건너뜀
 */
function computeNextStep(
  current: number,
  form: FormState,
  forward: boolean,
): number {
  const isDeemed = isDeemedAcquisitionCause(form.acquisitionCause);

  // 간주취득: Step 0 → Step 1 → API 호출 (-1 시그널)
  if (isDeemed) {
    if (forward) {
      if (current === 0) return 1;
      if (current === 1) return -1;
    } else {
      if (current === 1) return 0;
      if (current === 0) return -99; // 홈으로
    }
  }

  const isHousing = form.propertyType === "housing";
  const isCorporation = form.acquiredBy === "corporation";
  const isLuxury = form.isLuxuryProperty;
  const hasSpecialRate = !!form.specialRateType;

  const shouldSkipStep2 = !isHousing;
  const shouldSkipStep4 = !isCorporation && !isLuxury && !hasSpecialRate;

  if (forward) {
    let next = current + 1;
    if (next === 2 && shouldSkipStep2) next = 3;
    if (next === 4 && shouldSkipStep4) next = 5;
    return next;
  } else {
    let prev = current - 1;
    if (prev === 4 && shouldSkipStep4) prev = 3;
    if (prev === 2 && shouldSkipStep2) prev = 1;
    return prev;
  }
}

export function AcquisitionTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AcquisitionTaxResult | null>(null);
  /** 토지·농지 시가표준액 단가 (StandardPriceInput 내부 상태 유지용) */
  const [standardValuePerSqm, setStandardValuePerSqm] = useState("");

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  useAutoSaveCalculation({
    taxType: "acquisition",
    inputData: form as unknown as Record<string, unknown>,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion:
      form.balancePaymentDate ||
      form.registrationDate ||
      form.contractDate ||
      new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  const isOriginal = ["new_construction", "extension", "reconstruction", "reclamation"].includes(form.acquisitionCause);
  const isBurdened = form.acquisitionCause === "burdened_gift";
  const isOnerous = ["purchase", "exchange", "auction", "in_kind_investment"].includes(form.acquisitionCause);
  const isInheritance = ["inheritance", "inheritance_farmland"].includes(form.acquisitionCause);
  const isGiftLike = ["gift", "burdened_gift", "donation"].includes(form.acquisitionCause);
  const isHousing = form.propertyType === "housing";
  const isFarmland = form.propertyType === "land_farmland";
  const isLand = form.propertyType === "land" || form.propertyType === "land_farmland";
  const isIndividual = form.acquiredBy === "individual";
  const isCorporation = form.acquiredBy === "corporation";
  const isDeemed = isDeemedAcquisitionCause(form.acquisitionCause);

  // 간주취득 시 2단계만 표시
  const activeSteps = isDeemed
    ? ["취득 정보", "간주취득 상세"]
    : STEPS;

  const totalSteps = isDeemed ? 2 : STEPS.length;
  const isLastStep = isDeemed ? step === 1 : step === STEPS.length - 1;

  const handleNext = async () => {
    const err = validateStep(step, form);
    if (err) { setError(err); return; }
    setError(null);

    const nextStep = computeNextStep(step, form, true);

    if (nextStep === -1) {
      // 간주취득: Step 1에서 바로 API 호출
      setLoading(true);
      try {
        const res = await callAcquisitionTaxAPI(form);
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!isLastStep) {
      setStep(nextStep);
    } else {
      // Step 5 (감면 확인) → 계산 실행
      setLoading(true);
      try {
        const res = await callAcquisitionTaxAPI(form);
        setResult(res);
      } catch (e) {
        setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleBack = () => {
    if (step === 0) {
      window.location.href = "/";
    } else {
      const prevStep = computeNextStep(step, form, false);
      if (prevStep === -99) {
        window.location.href = "/";
        return;
      }
      setError(null);
      setResult(null);
      setStep(prevStep);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 lg:items-start">
      {/* 사이드바 — lg 이상에서 좌측 sticky */}
      <div className="hidden lg:block">
        <AcquisitionSidebar
          form={form}
          currentStep={step}
          onStepClick={(s) => { setResult(null); setError(null); setStep(s); }}
        />
      </div>

      {/* 메인 마법사 */}
      <div className="space-y-6">
      <StepIndicator steps={activeSteps} current={step} />

      {/* ── Step 0: 취득 정보 ── */}
      {step === 0 && (
        <Step0
          form={form}
          set={set}
          setForm={setForm}
          setStep={setStep}
          setResult={setResult}
          setError={setError}
          isOnerous={isOnerous}
          isBurdened={isBurdened}
          isOriginal={isOriginal}
          isGiftLike={isGiftLike}
          isInheritance={isInheritance}
        />
      )}

      {/* ── Step 1: 물건 상세 (간주취득 시: 결과 또는 간주취득 패널) ── */}
      {step === 1 && (
        <>
          {isDeemed && result ? (
            <div className="space-y-4">
              <AcquisitionTaxResultView
                result={result}
                isRegulatedArea={form.isRegulatedArea}
                isCorporation={isCorporation}
                onGoToStep={(s) => { setResult(null); setError(null); setStep(s); }}
                installmentRows={form.installments?.map((r) => ({ label: r.label, paymentDate: r.paymentDate, amount: r.amount }))}
              />
              <button
                type="button"
                className="mt-2 w-full rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
                onClick={() => { setResult(null); }}
              >
                조건 변경 후 재계산
              </button>
            </div>
          ) : (
            <Step1
              form={form}
              set={set}
              standardValuePerSqm={standardValuePerSqm}
              onStandardValuePerSqmChange={setStandardValuePerSqm}
              referenceDate={form.balancePaymentDate || form.contractDate}
              isHousing={isHousing}
            />
          )}
        </>
      )}

      {/* ── Step 2: 주택 현황 ── */}
      {step === 2 && (
        <Step2
          form={form}
          set={set}
          isHousing={isHousing}
          isCorporation={isCorporation}
          isIndividual={isIndividual}
        />
      )}

      {/* ── Step 3: 중과 분기 ── */}
      {step === 3 && (
        <Step3
          form={form}
          set={set}
          isHousing={isHousing}
          isIndividual={isIndividual}
          isCorporation={isCorporation}
          isGiftLike={isGiftLike}
        />
      )}

      {/* ── Step 4: 법인·특수 ── */}
      {step === 4 && (
        <Step4
          form={form}
          set={set}
          isHousing={isHousing}
          isCorporation={isCorporation}
          isLand={isLand}
        />
      )}

      {/* ── Step 5: 감면 확인 → 계산 ── */}
      {step === 5 && (
        <>
          {result ? (
            <div className="space-y-4">
              <AcquisitionTaxResultView
                result={result}
                isRegulatedArea={form.isRegulatedArea}
                isCorporation={isCorporation}
                onGoToStep={(s) => { setResult(null); setError(null); setStep(s); }}
                installmentRows={form.installments?.map((r) => ({ label: r.label, paymentDate: r.paymentDate, amount: r.amount }))}
              />
              <button
                type="button"
                className="mt-2 w-full rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  setResult(null);
                }}
              >
                조건 변경 후 재계산
              </button>
            </div>
          ) : (
            <Step5
              form={form}
              set={set}
              isHousing={isHousing}
              isIndividual={isIndividual}
              isFarmland={isFarmland}
              isGiftLike={isGiftLike}
            />
          )}
        </>
      )}

      {/* 오류 표시 */}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* 네비게이션 — 결과 표시 중에는 숨김 */}
      {!result && (
        <div className="flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
            onClick={handleBack}
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? "홈으로" : "이전"}
          </button>
          <button
            type="button"
            className="flex-1 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            onClick={handleNext}
            disabled={loading}
          >
            {loading ? "계산 중..." : (isDeemed && step === 1) || isLastStep ? "취득세 계산" : "다음"}
          </button>
        </div>
      )}
      </div> {/* 메인 마법사 끝 */}
    </div>
  );
}
