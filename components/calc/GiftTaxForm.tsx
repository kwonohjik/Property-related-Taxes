"use client";

/**
 * GiftTaxForm — 증여세 계산 4단계 마법사 오케스트레이터 (#27)
 *
 * Step 0: 증여 기본 정보 (증여일, 증여자 관계)
 * Step 1: 증여재산 평가 (부동산·금융·주식)
 * Step 2: 비과세·사전증여
 * Step 3: 공제·세액공제 입력 → 결과
 *
 * 타입·상수·Step 컴포넌트는 gift-tax-form-shared.tsx 로 분리 (800줄 정책).
 */

import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { runGiftManualSave, formatGiftSaveMessage } from "@/components/calc/gift-tax-save-handler";
import { GiftTaxResultView } from "@/components/calc/results/GiftTaxResultView";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import {
  type FormState,
  INITIAL_FORM,
  STEPS,
  formatGiftApiError,
  validateStep,
  Step0,
  Step1,
  Step2,
  Step3,
} from "@/components/calc/gift-tax-form-shared";

// ============================================================
// 메인 컴포넌트
// ============================================================

export function GiftTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GiftTaxResult | null>(null);
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);

  const { activeClientId } = useProfessionalStore();

  // G-M8: 이력 불러오기 hydration — 마운트 시 1회만 실행, sessionStorage 키 즉시 소비
  // normalizeRestoredFormDates 호출로 V2 비상장주식 Date 필드 복원 (H-5 버그 gift 재현 방지)
  useEffect(() => {
    const raw = sessionStorage.getItem("giftTaxResumeInput");
    if (!raw) return;
    sessionStorage.removeItem("giftTaxResumeInput");
    try {
      const parsed = JSON.parse(raw) as Partial<FormState>;
      const normalized = normalizeRestoredFormDates(parsed);
      setForm((prev) => ({ ...prev, ...normalized }));
      setStep(0);
    } catch {
      // JSON 파싱 실패 시 무시 (빈 폼 유지)
    }
  }, []);

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  const autoSave = useAutoSaveCalculation({
    taxType: "gift",
    inputData: form as unknown as Record<string, unknown>,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: form.giftDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  // 자동저장 상태 → SaveToastMessage 변환 (결과 화면 진입 시 1회 노출)
  const autoSaveToast: SaveToastMessage | null =
    autoSave.status === "saved" && autoSave.savedId
      ? {
          kind: "success",
          text: autoSave.created
            ? `✓ 이력에 자동 저장되었습니다 (ID: ${autoSave.savedId.slice(0, 8)})`
            : `✓ 동일 입력의 기존 이력이 갱신되었습니다 (ID: ${autoSave.savedId.slice(0, 8)})`,
        }
      : autoSave.status === "error"
      ? {
          kind: "error",
          text: "자동 저장 실패 — 우상단 저장하기 버튼으로 재시도하세요.",
        }
      : null;

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

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/calc/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildGiftTaxInput(form)),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(formatGiftApiError(data));
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

  // 결과 미계산 시 NO_RESULT sentinel throw — 호출자가 info 토스트 분기
  const handleManualSave = async (): Promise<{
    id: string;
    created: boolean;
    isDraft: boolean;
  }> => {
    const outcome = await runGiftManualSave({
      form: form as unknown as Record<string, unknown> & { giftDate?: string },
      result,
      clientId: activeClientId ?? null,
    });
    return { ...outcome, isDraft: false };
  };

  // 폼 화면용 wrapper — 토스트 표시
  const handleManualSaveForForm = async () => {
    setSaveMessage(null);
    try {
      const outcome = await handleManualSave();
      setSaveMessage(formatGiftSaveMessage(outcome));
    } catch (e) {
      setSaveMessage(formatGiftSaveMessage(e instanceof Error ? e : new Error(String(e))));
    }
  };

  if (result) {
    return (
      <GiftTaxResultView
        result={result}
        onReset={handleReset}
        onBack={() => { setResult(null); setStep(STEPS.length - 1); }}
        onGoToFirst={() => { setResult(null); setStep(0); }}
        onSave={handleManualSave}
        autoSaveToast={autoSaveToast}
        savedId={autoSave.savedId ?? undefined}
        estateItems={[...form.giftItems, ...form.stockItems]}
        giftDate={form.giftDate}
        priorGifts={form.priorGifts.map((pg) => ({
          giftDate: pg.giftDate,
          giftAmount: pg.giftAmount,
          sourceCalculationId: pg.sourceCalculationId,
          donor: pg.donor,
          // 부표 1 표시 메타 (2026-05-20) — 결과 화면 ②/③ 컬럼 표시용
          propertyCategory: pg.propertyCategory,
          propertyName: pg.propertyName,
          propertyLocation: pg.propertyLocation,
        }))}
        splitPaymentEnabled={form.splitPaymentEnabled}
        splitPaymentAmount={form.splitPaymentAmount}
      />
    );
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="space-y-6">
      {/* 홈으로 · 초기화 — 내비게이션 바 위쪽 우측 */}
      <div className="flex items-center justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        <SaveButton
          onSave={handleManualSaveForForm}
          disabled={!result}
          disabledReason="결과를 먼저 계산하시면 자동으로 이력에 저장됩니다."
        />
        <ResetButton
          onReset={() => {
            setForm(INITIAL_FORM);
            setStep(0);
            setResult(null);
            setError(null);
          }}
        />
      </div>

      <StepIndicator steps={STEPS} current={step} onStepClick={(i) => setStep(i)} />

      <div className="min-h-[300px]">
        {step === 0 && (
          <Step0
            form={form}
            set={set}
          />
        )}
        {step === 1 && <Step1 form={form} set={set} />}
        {step === 2 && <Step2 form={form} set={set} activeClientId={activeClientId} />}
        {step === 3 && <Step3 form={form} set={set} />}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive whitespace-pre-line">
          {error}
        </div>
      )}

      <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1 rounded-md border border-border px-5 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? "홈으로" : "이전"}
        </button>
        <div className="flex items-center gap-2">
          <SaveButton
            variant="primary"
            onSave={handleManualSaveForForm}
            disabled={!result}
            disabledReason="결과를 먼저 계산하시면 자동으로 이력에 저장됩니다."
          />
          <button
            type="button"
            onClick={handleNext}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading
              ? "계산 중..."
              : isLastStep
              ? "계산하기"
              : "다음 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
