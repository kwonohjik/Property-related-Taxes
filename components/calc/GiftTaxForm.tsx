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
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
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
import { buildGiftTaxInput, buildSimultaneousGiftInputs } from "@/lib/calc/gift-api";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { callGiftBurdenedTransferAPI, callGiftStockBurdenedTransferAPI } from "@/lib/calc/gift-burdened-transfer-api";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  type FormState,
  INITIAL_FORM,
  STEPS,
  DONOR_LABELS,
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
  // 동시증여 추가 건 결과 (⑦-e 지점)
  const [simultaneousResults, setSimultaneousResults] = useState<GiftTaxResult[]>([]);
  const [simultaneousResultLabels, setSimultaneousResultLabels] = useState<string[]>([]);
  const [transferTaxResults, setTransferTaxResults] = useState<TransferTaxResult[]>([]);
  const [transferTaxError, setTransferTaxError] = useState<string | null>(null);
  const [stockTransferTaxResults, setStockTransferTaxResults] = useState<StockTransferResult[]>([]);
  // 단순증여(채무 0) baseline 증여세 — 부담부 자산 있을 때만 산출, 비교 카드용
  const [simpleGiftResult, setSimpleGiftResult] = useState<GiftTaxResult | null>(null);
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
      // ⑬ 지점: simultaneousGiftForms 있으면 다건 경로, 없으면 단건 경로
      const isSimultaneous =
        form.simultaneousGiftForms !== undefined &&
        form.simultaneousGiftForms.length > 0;

      // engineInput은 단순증여 baseline 계산용 (건 0)
      const engineInput = buildGiftTaxInput(form);

      let requestBody: unknown;
      if (isSimultaneous) {
        // 다건 경로 (⑬ 지점): buildSimultaneousGiftInputs = [건0, 건1, ...] 전부 GiftTaxInput 변환됨.
        // Zod giftSimultaneousRequestSchema = 건0 필드 최상위 spread + simultaneousGiftForms: GiftTaxInput[].
        // → 건0를 spread, 추가 건(변환된 GiftTaxInput)을 simultaneousGiftForms로 전송.
        const inputs = buildSimultaneousGiftInputs(form);
        requestBody = {
          ...inputs[0],
          simultaneousGiftForms: inputs.slice(1),
        };
      } else {
        // 단건 경로: 기존 단건 input
        requestBody = engineInput;
      }
      const res = await fetch("/api/calc/gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(formatGiftApiError(data));
        return;
      }
      setResult(data.result);

      // 동시증여 추가 건 결과 처리 (⑦-e 지점)
      if (data.simultaneousResults && Array.isArray(data.simultaneousResults)) {
        setSimultaneousResults(data.simultaneousResults as GiftTaxResult[]);
        // 라벨 생성: DONOR_LABELS[subForm.donor] + 과세가액
        const labels = (form.simultaneousGiftForms ?? []).map((sub, i) => {
          const sr = (data.simultaneousResults as GiftTaxResult[])[i];
          const donorLabel = DONOR_LABELS[sub.donor] ?? "기타";
          const grossValue = sr?.grossGiftValue?.toLocaleString("ko-KR") ?? "";
          return `${donorLabel}로부터 — ${grossValue}원 증여`;
        });
        setSimultaneousResultLabels(labels);
      } else {
        setSimultaneousResults([]);
        setSimultaneousResultLabels([]);
      }

      // 단순증여 baseline — 부담부 자산(채무>0) 있을 때만 calcGiftTax 동기 호출.
      // engineInput.giftItems는 [...giftItems, ...stockItems] 병합분(gift-api.ts:42)이므로
      // 전체 배열의 assumedDebtForGift를 0으로 덮어써 전액 무상증여 케이스를 산출(원본 불변).
      const hasBurdenedDebt = engineInput.giftItems.some(
        (it) => (it.assumedDebtForGift ?? 0) > 0,
      );
      if (hasBurdenedDebt) {
        const simpleInput = {
          ...engineInput,
          giftItems: engineInput.giftItems.map((it) => ({
            ...it,
            assumedDebtForGift: 0,
          })),
        };
        setSimpleGiftResult(calcGiftTax(simpleInput));
      } else {
        setSimpleGiftResult(null);
      }

      // 부담부증여 양도소득세 직렬 계산 — burdenedGiftTransferTax ON 자산만 순서대로 호출
      const burdenedItems = form.giftItems.filter(
        (it) => it.burdenedGiftTransferTax !== undefined,
      );
      if (burdenedItems.length > 0) {
        const txResults: TransferTaxResult[] = [];
        const txErrors: string[] = [];
        for (const item of burdenedItems) {
          try {
            const txResult = await callGiftBurdenedTransferAPI(item, form);
            if (txResult) txResults.push(txResult);
          } catch (e) {
            // 단건 실패 — 증여세 결과는 이미 표시, 경고만 기록
            const msg = e instanceof Error ? e.message : String(e);
            txErrors.push(`${item.name.trim() || "자산"}: ${msg}`);
          }
        }
        if (txErrors.length > 0) {
          setTransferTaxError(
            `부담부증여 양도소득세 계산에 실패했습니다. 취득일·기준시가를 확인하세요.\n${txErrors.join("\n")}`
          );
        } else {
          setTransferTaxError(null);
        }
        setTransferTaxResults(txResults);
      } else {
        setTransferTaxResults([]);
      }

      // 주식 부담부증여 양도소득세 직렬 계산 — burdenedGiftStockTransferTax ON 주식만
      const stockBurdenedItems = form.stockItems.filter(
        (it) => it.burdenedGiftStockTransferTax !== undefined,
      );
      if (stockBurdenedItems.length > 0) {
        const stockTxResults: StockTransferResult[] = [];
        for (const item of stockBurdenedItems) {
          try {
            const stockTxResult = await callGiftStockBurdenedTransferAPI(item, form);
            if (stockTxResult) stockTxResults.push(stockTxResult);
          } catch {
            // 단건 실패 — 증여세 결과는 이미 표시됨. 주식 양도세는 증여세 결과에 부가이므로 무시
          }
        }
        setStockTransferTaxResults(stockTxResults);
      } else {
        setStockTransferTaxResults([]);
      }

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
    setSimultaneousResults([]);
    setSimultaneousResultLabels([]);
    setTransferTaxResults([]);
    setTransferTaxError(null);
    setStockTransferTaxResults([]);
    setSimpleGiftResult(null);
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
        transferTaxResults={transferTaxResults}
        transferTaxError={transferTaxError ?? undefined}
        stockTransferTaxResults={stockTransferTaxResults}
        simpleGiftResult={simpleGiftResult ?? undefined}
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
        simultaneousResults={simultaneousResults.length > 0 ? simultaneousResults : undefined}
        simultaneousResultLabels={simultaneousResultLabels.length > 0 ? simultaneousResultLabels : undefined}
        mainDonor={form.donor}
      />
    );
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="space-y-6">
      {/* 홈으로 · 초기화 — 내비게이션 바 위쪽 우측 */}
      <div className="flex items-center justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        {step > 0 && (
          <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />
        )}
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
        <WizardBackNav isFirstStep={step === 0} onBack={handleBack} />
        <div className="flex items-center gap-2">
          <SaveButton
            variant="primary"
            onSave={handleManualSaveForForm}
            disabled={!result}
            disabledReason="결과를 먼저 계산하시면 자동으로 이력에 저장됩니다."
          />
          {isLastStep ? (
            <CtaButton onClick={handleNext} disabled={loading}>
              {loading ? "계산 중..." : "계산하기"}
            </CtaButton>
          ) : (
            <NavButton direction="next" label="다음" onClick={handleNext} disabled={loading} />
          )}
        </div>
      </div>
    </div>
  );
}
