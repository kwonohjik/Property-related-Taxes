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
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { AcquisitionTaxResultView } from "@/components/calc/results/AcquisitionTaxResultView";
import { callAcquisitionTaxAPI } from "@/lib/calc/acquisition-tax-api";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import {
  runAcquisitionManualSave,
  formatAcquisitionSaveMessage,
  type AcquisitionForm,
} from "@/components/calc/acquisition-tax-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
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

/**
 * 이 폼에서 **실제로 거치는** 단계 목록 — skip 규칙의 단일 소스(`computeNextStep`)를 그대로 걷는다.
 *
 * 🔑 「비주택이면 ③ 건너뜀」 같은 규칙을 여기 다시 적으면 둘이 갈린다. 걷기만 한다.
 */
function activeStepIndices(form: FormState): number[] {
  const visited: number[] = [];
  let s = 0;
  while (s >= 0 && s < STEPS.length && !visited.includes(s)) {
    visited.push(s);
    const next = computeNextStep(s, form, true);
    if (next === -1) break; // 간주취득 — 여기서 계산으로 넘어간다
    s = next;
  }
  return visited;
}

/**
 * 거치는 단계 중 **첫 번째** 차단 오류. `upTo`가 있으면 그 앞까지만 본다(전진 점프 검사용).
 *
 * 🔴 이것이 없으면 사이드바로 마지막 단계에 점프해 **필수 입력을 건너뛴 채 계산**할 수 있다.
 *    `handleNext`가 **현재 단계만** 보기 때문이다 — ⑥에는 필수가 없어 그대로 통과했고,
 *    API는 빈 입력을 200으로 받아 **«0원» 결과 화면**을 냈다(실측).
 *    양도세는 이미 같은 가드를 갖고 있다(`TransferTaxCalculator.tsx` `handleSubmit`).
 */
function firstInvalidStep(
  form: FormState,
  upTo?: number,
): { step: number; message: string } | null {
  for (const s of activeStepIndices(form)) {
    if (upTo !== undefined && s >= upTo) break;
    const message = validateStep(s, form);
    if (message) return { step: s, message };
  }
  return null;
}

export function AcquisitionTaxForm() {
  const [step, setStep] = useState(0);
  /**
   * 사용자가 **가 본 가장 먼 단계** — 사이드바 오류 표식의 범위(주식 마법사와 동일 규약).
   *
   * 🔴 없으면 **아직 가 본 적 없는 단계가 빨개진다.** ①에서 연부취득 토글을 켜거나
   *    간주취득(과점주주)을 고르는 순간 ②「물건 상세」가 rose가 된다(실측 —
   *    「최소 2회차 이상」·「장부상 총가액을 입력하세요」). 사용자는 ②를 본 적도 없다.
   *    빈 폼에서 무효 단계가 ① 하나뿐이라 이 함정이 오래 드러나지 않았을 뿐이다.
   */
  const [maxVisitedStep, setMaxVisitedStep] = useState(0);
  const visitStep = (target: number) => {
    setMaxVisitedStep((m) => Math.max(m, target));
    setStep(target);
  };
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AcquisitionTaxResult | null>(null);
  /** 토지·농지 시가표준액 단가 (StandardPriceInput 내부 상태 유지용) */
  const [standardValuePerSqm, setStandardValuePerSqm] = useState("");

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  const autoSave = useAutoSaveCalculation({
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

  // 수동 저장 — 자동저장과 별개로 사용자가 원할 때 즉시 이력 저장(갱신)
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  const recordCount = useRecordCount(result);
  const handleManualSave = async () => {
    setSaveMessage(null);
    try {
      const outcome = await runAcquisitionManualSave({
        form: form as unknown as AcquisitionForm,
        result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatAcquisitionSaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(
        formatAcquisitionSaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount),
      );
    }
  };

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

    // 계산으로 넘어가기 직전 — 거쳐온 단계를 전부 재검증한다(점프·필드 비우기 우회 차단).
    if (nextStep === -1 || isLastStep) {
      const blocking = firstInvalidStep(form);
      if (blocking) {
        setStep(blocking.step); // 누락된 그 단계로 데려간다 — 어디가 문제인지 즉시 보이게
        setError(blocking.message);
        return;
      }
    }

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
      visitStep(nextStep);
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

  /**
   * 사이드바·StepIndicator 점프 — **앞으로 가는 점프만** 검사한다.
   *
   * 🔑 뒤로 가는 것은 막지 않는다. 고치러 돌아가는 길이라 막으면 사용자가 갇힌다.
   * 🔑 막을 때는 **건너뛰려던 첫 무효 단계로 데려간다** — 「못 갑니다」만 띄우면
   *    어디를 고쳐야 하는지 알 수 없다(F-2에서 판정 마법사에 세운 것과 같은 규약).
   */
  const handleStepJump = (target: number) => {
    if (target > step) {
      const blocking = firstInvalidStep(form, target);
      if (blocking) {
        setResult(null);
        setStep(blocking.step);
        setError(blocking.message);
        return;
      }
    }
    setResult(null);
    setError(null);
    visitStep(target);
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
          maxVisitedStep={maxVisitedStep}
          form={form}
          currentStep={step}
          onStepClick={handleStepJump}
        />
      </div>

      {/* 메인 마법사 */}
      <div className="space-y-6">
      {step > 0 && (
        <div className="flex justify-end">
          <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />
        </div>
      )}
      <StepIndicator
        steps={activeSteps}
        current={step}
        onStepClick={handleStepJump}
      />

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
              <div className="flex justify-end">
                <SaveButton onSave={handleManualSave} />
              </div>
              <AcquisitionTaxResultView
                result={result}
                isRegulatedArea={form.isRegulatedArea}
                isCorporation={isCorporation}
                onGoToStep={handleStepJump}
                installmentRows={form.installments?.map((r) => ({ label: r.label, paymentDate: r.paymentDate, amount: r.amount }))}
                savedId={autoSave.savedId ?? undefined}
              />
              <CtaButton tone="outline" className="mt-2" onClick={() => { setResult(null); }}>
                조건 변경 후 재계산
              </CtaButton>
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
              <div className="flex justify-end">
                <SaveButton onSave={handleManualSave} />
              </div>
              <AcquisitionTaxResultView
                result={result}
                isRegulatedArea={form.isRegulatedArea}
                isCorporation={isCorporation}
                onGoToStep={handleStepJump}
                installmentRows={form.installments?.map((r) => ({ label: r.label, paymentDate: r.paymentDate, amount: r.amount }))}
                savedId={autoSave.savedId ?? undefined}
              />
              <CtaButton tone="outline" className="mt-2" onClick={() => { setResult(null); }}>
                조건 변경 후 재계산
              </CtaButton>
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
        <div className="flex items-center justify-between gap-2">
          <WizardBackNav isFirstStep={step === 0} onBack={handleBack} />
          {(isDeemed && step === 1) || isLastStep ? (
            <CtaButton onClick={handleNext} disabled={loading}>
              {loading ? "계산 중..." : "취득세 계산"}
            </CtaButton>
          ) : (
            <NavButton direction="next" label="다음" onClick={handleNext} disabled={loading} />
          )}
        </div>
      )}
      <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
      </div> {/* 메인 마법사 끝 */}
    </div>
  );
}
