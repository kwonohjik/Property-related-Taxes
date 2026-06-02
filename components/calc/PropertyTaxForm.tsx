"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { PropertyTaxResultView } from "@/components/calc/results/PropertyTaxResultView";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { runPropertyManualSave, formatPropertySaveMessage } from "@/components/calc/property-tax-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { INITIAL_FORM, validateStep, callPropertyTaxAPI, type FormState } from "./property/shared";
import { Step0 } from "./property/Step0";
import { Step1 } from "./property/Step1";
import { Step2SeparateAggregate } from "./property/Step2SeparateAggregate";
import { Step2Separated } from "./property/Step2Separated";
import { Step3 } from "./property/Step3";
import type { PropertyTaxResult } from "@/lib/tax-engine/types/property.types";

export function PropertyTaxForm() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PropertyTaxResult | null>(null);
  /** 토지 전용 단가 (StandardPriceInput 내부 상태 유지용) */
  const [publishedPricePerSqm, setPublishedPricePerSqm] = useState("");

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  const autoSave = useAutoSaveCalculation({
    taxType: "property",
    inputData: form as unknown as Record<string, unknown>,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: `${new Date().getFullYear()}-06-01`, // 재산세 과세기준일
    clientId: activeClientId,
  });

  // 수동 저장 — 자동저장과 별개로 사용자가 원할 때 즉시 이력 저장(갱신)
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  const recordCount = useRecordCount(result);
  const handleManualSave = async () => {
    setSaveMessage(null);
    try {
      const outcome = await runPropertyManualSave({
        form: form as unknown as Record<string, unknown>,
        result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatPropertySaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(
        formatPropertySaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount),
      );
    }
  };

  const needsLandDetail =
    form.objectType === "land" &&
    (form.landTaxType === "separate_aggregate" || form.landTaxType === "separated");

  const visibleStepLabels: string[] = (() => {
    if (form.objectType === "land") {
      return needsLandDetail
        ? ["기본 정보", "토지 분류", "토지 상세", "전년도 세액"]
        : ["기본 정보", "토지 분류", "전년도 세액"];
    }
    return ["기본 정보", "전년도 세액"];
  })();

  const displayStep = (() => {
    if (form.objectType === "land") {
      if (needsLandDetail) return Math.min(step, 3);
      if (step === 0) return 0;
      if (step === 1) return 1;
      return 2;
    }
    return step === 0 ? 0 : 1;
  })();

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }

  function onChange(d: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...d }));
    setError(null);
  }

  function handleBack() {
    setError(null);
    if (step === 0) { router.push("/"); return; }
    if (step === 3) {
      if (form.objectType !== "land") { setStep(0); return; }
      setStep(needsLandDetail ? 2 : 1);
      return;
    }
    setStep((s) => s - 1);
  }

  async function handleNext() {
    setError(null);

    if (step === 0) {
      const err = validateStep(0, form);
      if (err) { setError(err); return; }
      setStep(form.objectType === "land" ? 1 : 3);
      return;
    }

    if (step === 1) {
      const err = validateStep(1, form);
      if (err) { setError(err); return; }
      setStep(needsLandDetail ? 2 : 3);
      return;
    }

    if (step === 2) {
      const err = validateStep(2, form);
      if (err) { setError(err); return; }
      setStep(3);
      return;
    }

    if (step === 3) {
      await runCalculation();
      return;
    }
  }

  async function runCalculation() {
    setLoading(true);
    setError(null);
    try {
      const res = await callPropertyTaxAPI(form);
      setResult(res);
      setStep(4);
    } catch (e) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setForm(INITIAL_FORM);
    setResult(null);
    setError(null);
    setStep(0);
  }

  if (step === 4 && result) {
    return (
      <div>
        <div className="flex justify-end mb-4">
          <SaveButton onSave={handleManualSave} />
        </div>
        <PropertyTaxResultView result={result} savedId={autoSave.savedId ?? undefined} />
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={handleReset}
            className="px-6 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
          >
            다시 계산하기
          </button>
          <SaveButton variant="primary" onSave={handleManualSave} className="flex-none px-6" />
        </div>
        <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <StepIndicator
        current={displayStep}
        steps={visibleStepLabels}
        onStepClick={(i) => {
          // visible 인덱스 → 실제 step 인덱스 역매핑 (objectType + needsLandDetail 기반)
          if (form.objectType === "land") {
            if (needsLandDetail) {
              setStep(i);
            } else {
              setStep(i === 0 ? 0 : i === 1 ? 1 : 3);
            }
          } else {
            setStep(i === 0 ? 0 : 3);
          }
          setError(null);
        }}
      />

      {step === 0 && (
        <Step0
          form={form}
          onChange={onChange}
          onReset={handleReset}
          publishedPrice={form.publishedPrice}
          onPublishedPriceChange={(v) => update("publishedPrice", v)}
          publishedPricePerSqm={publishedPricePerSqm}
          onPublishedPricePerSqmChange={setPublishedPricePerSqm}
          jibun={form.jibun}
        />
      )}

      {step === 1 && form.objectType === "land" && (
        <Step1 form={form} onChange={onChange} />
      )}

      {step === 2 && form.landTaxType === "separate_aggregate" && (
        <Step2SeparateAggregate form={form} onChange={onChange} />
      )}

      {step === 2 && form.landTaxType === "separated" && (
        <Step2Separated form={form} onChange={onChange} />
      )}

      {step === 3 && (
        <Step3 form={form} onChange={onChange} />
      )}

      {error && (
        <p className="text-sm text-red-500 rounded-md bg-red-50 border border-red-200 px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={handleBack}
          className="px-5 py-2 rounded-md border text-sm font-medium hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? "홈으로" : "이전"}
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={loading}
          className="px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading
            ? "계산 중..."
            : step === 3
            ? "재산세 계산하기"
            : "다음"}
        </button>
      </div>
    </div>
  );
}
