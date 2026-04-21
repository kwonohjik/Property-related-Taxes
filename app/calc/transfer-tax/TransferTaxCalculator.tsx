"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { TransferTaxResultView } from "@/components/calc/results/TransferTaxResultView";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import type { TransferTaxPenaltyResult } from "@/lib/tax-engine/transfer-tax-penalty";
import { validateStep } from "@/lib/calc/transfer-tax-validate";
import { getFilingDeadline, isFilingOverdue } from "@/lib/calc/filing-deadline";
import { Step1 } from "./steps/Step1";
import { Step2 } from "./steps/Step2";
import { Step3 } from "./steps/Step3";
import { Step4 } from "./steps/Step4";
import { Step5 } from "./steps/Step5";
import { Step6 } from "./steps/Step6";

const STEPS_SINGLE = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인", "가산세"];
const STEPS_MULTI = ["물건 유형", "양도 정보", "취득 정보", "보유 상황", "감면 확인"];

// 메인 컴포넌트
// ============================================================
interface TransferTaxCalculatorProps {
  /** 다건 모드: 현재 자산 저장 후 새 자산 추가 (마법사 step 0으로 리셋) */
  onSaveAndAddNext?: () => void;
  /** 다건 모드: 현재 자산 저장 후 공통 설정 단계로 이동 */
  onSaveAndGoToSettings?: () => void;
}

export default function TransferTaxCalculator({
  onSaveAndAddNext,
  onSaveAndGoToSettings,
}: TransferTaxCalculatorProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  // 다건 양도 편집 모드 내 임베딩 여부
  const isEmbeddedInMulti = pathname?.includes("/multi") ?? false;
  // 다건 모드는 5단계 (가산세 제외 — 합산 결과 기준이므로 공통 설정에서 입력)
  const STEPS = isEmbeddedInMulti ? STEPS_MULTI : STEPS_SINGLE;
  const { currentStep, formData, result, setStep, updateFormData, setResult, reset, clearPendingMigration } =
    useCalcWizardStore();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [penaltyResult, setPenaltyResult] = useState<TransferTaxPenaltyResult | null>(null);
  const [isPenaltyLoading, setIsPenaltyLoading] = useState(false);
  /** 가산세 계산하기로 얻은 결정세액 — unpaidTax 자동 계산용 */
  const [calcDeterminedTax, setCalcDeterminedTax] = useState<number | null>(null);

  // 로그인 상태 확인 (클라이언트 사이드)
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    import("@/lib/supabase/client").then(({ createClient }) => {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        setIsLoggedIn(!!data.user);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
        setIsLoggedIn(!!session?.user);
      });
      return () => subscription.unsubscribe();
    });
  }, []);

  const totalSteps = STEPS.length;
  const isLastStep = currentStep === totalSteps - 1;
  const isResult = result !== null && currentStep === totalSteps;

  // 잘못된 step 상태 복구: currentStep >= totalSteps인데 result가 없으면 step 0으로 리셋
  useEffect(() => {
    if (currentStep >= totalSteps && !result) {
      setStep(0);
    }
  }, [currentStep, result, setStep]);

  // 신고일·양도일 변경 시 가산세 필드 자동 설정
  //   - 신고기한 초과 시: 무신고(filingType="none") + 지연납부 자동 ON, paymentDeadline=신고기한, actualPaymentDate=신고일
  //   - 신고기한 이내 또는 신고일 미입력: 가산세 자동 OFF
  useEffect(() => {
    const { transferDate, filingDate } = formData;
    if (!transferDate || !filingDate) {
      if (formData.enablePenalty) {
        updateFormData({
          enablePenalty: false,
          filingType: "correct",
          paymentDeadline: "",
          actualPaymentDate: "",
        });
      }
      return;
    }
    const overdue = isFilingOverdue(transferDate, filingDate);
    if (overdue) {
      const deadline = getFilingDeadline(transferDate);
      if (
        !formData.enablePenalty ||
        formData.filingType !== "none" ||
        formData.paymentDeadline !== deadline ||
        formData.actualPaymentDate !== filingDate
      ) {
        updateFormData({
          enablePenalty: true,
          filingType: "none",
          penaltyReason: formData.penaltyReason || "normal",
          paymentDeadline: deadline,
          actualPaymentDate: filingDate,
        });
      }
    } else {
      if (formData.enablePenalty) {
        updateFormData({
          enablePenalty: false,
          filingType: "correct",
          paymentDeadline: "",
          actualPaymentDate: "",
        });
      }
    }
    // 의도적으로 일부 필드만 의존성에 포함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.transferDate, formData.filingDate]);

  function handleNext() {
    const err = validateStep(currentStep, formData);
    if (err) { setError(err); return; }
    setError(null);
    setStep(currentStep + 1);
  }

  function handleBack() {
    setError(null);
    if (currentStep === 0) {
      if (!isEmbeddedInMulti) router.push("/");
    } else {
      setStep(currentStep - 1);
    }
  }

  async function handleSubmit() {
    setError(null);
    setIsLoading(true);
    try {
      const res = await callTransferTaxAPI(formData);
      setResult(res);
      setStep(totalSteps); // 결과 화면

      // 로그인된 사용자면 이력 자동 저장
      if (isLoggedIn) {
        const { saveCalculation } = await import("@/actions/calculations");
        await saveCalculation({
          taxType: "transfer",
          inputData: formData as unknown as Record<string, unknown>,
          resultData: res as unknown as Record<string, unknown>,
          // [I8] 양도일 기준 세법 버전 — 세법 적용 시점을 오늘이 아닌 양도일로 기록
          taxLawVersion: formData.transferDate || new Date().toISOString().split("T")[0],
        });
        // [I6] 이력 저장 성공 후 pendingMigration 플래그 해제
        clearPendingMigration();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePenaltyCalc() {
    setError(null);
    setIsPenaltyLoading(true);
    try {
      // 1단계: enablePenalty 없이 결정세액만 확보
      const baseRes = await callTransferTaxAPI({ ...formData, enablePenalty: false });
      const detTax = baseRes.determinedTax;
      setCalcDeterminedTax(detTax);

      // 2단계: 미납세액 자동 계산
      const priorPaid = parseAmount(formData.priorPaidTax ?? "0");
      const autoUnpaid = Math.max(0, detTax - priorPaid);
      const updatedUnpaidTax = autoUnpaid > 0 ? String(autoUnpaid) : "0";
      updateFormData({ unpaidTax: updatedUnpaidTax });

      // 3단계: 계산된 unpaidTax로 가산세 포함 재계산
      const penaltyRes = await callTransferTaxAPI({ ...formData, unpaidTax: updatedUnpaidTax });
      setPenaltyResult(penaltyRes.penaltyDetail ?? null);
      if (!penaltyRes.penaltyDetail) {
        setError("가산세 항목을 입력해 주세요. (신고 유형 또는 미납세액+납부기한)");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "가산세 계산 중 오류가 발생했습니다.");
    } finally {
      setIsPenaltyLoading(false);
    }
  }

  function handleReset() {
    reset();
    setError(null);
    setPenaltyResult(null);
  }

  const stepComponentsAll = [
    <Step1
      key={0}
      form={formData}
      onChange={updateFormData}
      onReset={() => {
        reset();
        setError(null);
        setPenaltyResult(null);
      }}
    />,
    <Step2 key={1} form={formData} onChange={updateFormData} />,
    <Step3 key={2} form={formData} onChange={updateFormData} />,
    <Step4 key={3} form={formData} onChange={updateFormData} />,
    <Step5 key={4} form={formData} onChange={updateFormData} />,
    <Step6 key={5} form={formData} onChange={updateFormData} determinedTax={calcDeterminedTax} />,
  ];
  // 다건 모드는 가산세(Step6) 제외
  const stepComponents = isEmbeddedInMulti ? stepComponentsAll.slice(0, 5) : stepComponentsAll;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <p className="text-xs text-muted-foreground mb-1">한국 부동산 세금 계산기</p>
        <h1 className="text-2xl font-bold">양도소득세 계산기</h1>
        <div className="mt-2">
          <a
            href="/calc/transfer-tax/multi"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary text-primary text-xs font-medium hover:bg-primary hover:text-primary-foreground transition-colors"
          >
            여러건 양도 계산 →
          </a>
        </div>
      </div>

      {isResult && result ? (
        <TransferTaxResultView
          result={result}
          onReset={handleReset}
          onBack={() => {
            setStep(totalSteps - 1); // 마지막 입력 단계(감면 확인)로 복귀
            setError(null);
          }}
          onLoginPrompt={!isLoggedIn}
        />
      ) : (
        <>
          <StepIndicator
            steps={STEPS}
            current={currentStep}
            onStepClick={(i) => {
              if (i === currentStep) return;
              setError(null);
              setStep(i);
            }}
          />

          {/* 단계 제목 */}
          <h2 className="text-base font-semibold mb-4">
            {["물건 유형 선택", "양도 정보 입력", "취득 정보 입력", "보유 상황 입력", "감면 확인", "가산세 입력"][currentStep]}
          </h2>

          {/* 폼 내용 */}
          <div className="min-h-[280px]">
            {stepComponents[currentStep]}
          </div>

          {/* 가산세 계산 결과 인라인 카드 */}
          {isLastStep && penaltyResult && (
            <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
              <p className="text-sm font-semibold text-primary">가산세 계산 결과</p>
              {penaltyResult.filingPenalty && (
                <div className="space-y-1 text-sm">
                  <p className="font-medium text-muted-foreground">신고불성실가산세</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">납부세액 기준</span>
                    <span>{penaltyResult.filingPenalty.penaltyBase.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">적용 세율</span>
                    <span>{(penaltyResult.filingPenalty.penaltyRate * 100).toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>신고불성실가산세</span>
                    <span className="text-destructive">{penaltyResult.filingPenalty.filingPenalty.toLocaleString()}원</span>
                  </div>
                </div>
              )}
              {penaltyResult.delayedPaymentPenalty && (
                <div className="space-y-1 text-sm border-t border-border/40 pt-3">
                  <p className="font-medium text-muted-foreground">지연납부가산세</p>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">미납세액</span>
                    <span>{penaltyResult.delayedPaymentPenalty.unpaidTax.toLocaleString()}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">경과일수</span>
                    <span>{penaltyResult.delayedPaymentPenalty.elapsedDays}일</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">일 이자율</span>
                    <span>{(penaltyResult.delayedPaymentPenalty.dailyRate * 100).toFixed(3)}%</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>지연납부가산세</span>
                    <span className="text-destructive">{penaltyResult.delayedPaymentPenalty.delayedPaymentPenalty.toLocaleString()}원</span>
                  </div>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>가산세 합계</span>
                <span className="text-destructive">{penaltyResult.totalPenalty.toLocaleString()}원</span>
              </div>
            </div>
          )}

          {/* 에러 메시지 */}
          {error && (
            <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <p>{error}</p>
              {isLastStep && (
                <button
                  type="button"
                  onClick={() => { setError(null); handleSubmit(); }}
                  className="mt-2 text-xs underline underline-offset-2 hover:opacity-70 transition-opacity"
                >
                  다시 계산하기
                </button>
              )}
            </div>
          )}

          {/* 네비게이션 — 뒤로가기(항상) + 다음/계산 */}
          <div className="mt-6 space-y-2">
            {isLastStep && !isEmbeddedInMulti && formData.enablePenalty && (
              <button
                type="button"
                onClick={handlePenaltyCalc}
                disabled={isPenaltyLoading}
                className="w-full rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60 transition-colors"
              >
                {isPenaltyLoading ? "계산 중..." : "가산세 계산하기"}
              </button>
            )}
            <div className="flex gap-3">
              {/* 다건 편집 모드 내 step 0에서는 홈으로 버튼 미표시 */}
              {!(isEmbeddedInMulti && currentStep === 0) && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
                >
                  {currentStep === 0 ? "홈으로" : "이전"}
                </button>
              )}
              {isLastStep ? (
                isEmbeddedInMulti ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const err = validateStep(currentStep, formData);
                        if (err) { setError(err); return; }
                        setError(null);
                        onSaveAndAddNext?.();
                      }}
                      className="flex-1 rounded-lg border border-primary py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 transition-colors"
                    >
                      + 양도 건 추가
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const err = validateStep(currentStep, formData);
                        if (err) { setError(err); return; }
                        setError(null);
                        onSaveAndGoToSettings?.();
                      }}
                      className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      공통 설정으로 →
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isLoading}
                    className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
                  >
                    {isLoading ? "계산 중..." : "세금 계산하기"}
                  </button>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  다음
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
