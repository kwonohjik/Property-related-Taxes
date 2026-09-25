"use client";

/**
 * StockTransferTaxCalculator — 주식 양도소득세 마법사 오케스트레이터
 *
 * 4단계: Step1(자산·시장) → Step2(양도·취득가) → Step3(필요경비·신고) → Step4(결과)
 *
 * 부동산 양도세 마법사와 완전히 분리된 독립 도메인.
 */

import { useCallback, useState, useMemo } from "react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { StockSidebar } from "@/components/calc/stock-transfer/StockSidebar";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { Step1 } from "./steps/Step1";
import { Step2 } from "./steps/Step2";
import { Step3 } from "./steps/Step3";
import { Step4 } from "./steps/Step4";
import { useStockTransferStore } from "@/lib/stores/calc-wizard-stock-store";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import { callStockTransferTaxAPI } from "@/lib/calc/stock-transfer-tax-api";
import { callStockTransferTaxAggregateAPI } from "@/lib/calc/stock-transfer-tax-api";
import { validateFilingItems } from "@/lib/calc/stock-transfer-tax-validate";
import { StockItemListCard } from "@/components/calc/stock-transfer/StockItemListCard";
import { StockAggregateSummaryCard } from "@/components/calc/results/StockAggregateSummaryCard";
// ⚠️ 한 라인에 한 named만 — lint-staged `eslint --fix`가 미사용 import를 지울 때
//    같은 라인의 **사용 중인** named까지 함께 날린다(CLAUDE.md의 ESLint --fix 함정).
import { validateStepByIndex } from "@/lib/calc/stock-transfer-tax-validate";
import { validateStep3 } from "@/lib/calc/stock-transfer-tax-validate";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { runStockManualSave, formatStockSaveMessage } from "@/components/calc/stock-transfer-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { extractStockTransferDate } from "@/lib/storage/title-generator";
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
import { ValidationWarnings } from "@/components/calc/shared/ValidationWarnings";

const STEPS = ["자산·시장·대주주", "양도·취득가액", "필요경비·신고", "결과"] as const;

export default function StockTransferTaxCalculator() {

  // atomic selector (무한 루프 방지)
  const currentStep = useStockTransferStore((s) => s.currentStep);
  const formData = useStockTransferStore((s) => s.formData);
  const result = useStockTransferStore((s) => s.result);
  const error = useStockTransferStore((s) => s.error);
  const isLoading = useStockTransferStore((s) => s.isLoading);

  const savedItems = useStockTransferStore((s) => s.savedItems);
  const aggregateResult = useStockTransferStore((s) => s.aggregateResult);

  const {
    setStep, updateFormData, setResult, setAggregateResult, setError, setLoading, reset,
    commitCurrentItem, editSavedItem, removeSavedItem,
  } = useStockTransferStore();

  /**
   * 종목 확정 게이트 — 종목명과 시장 분류가 없으면 목록에서 구분할 수 없다.
   * ⚠️ 전체 validate를 걸지 않는다: 사용자가 종목을 오가며 채우는 흐름을 막게 된다.
   *   최종 계산 시점에 route의 Zod가 종목별로 검증한다(⑫).
   */
  const canCommitCurrentItem =
    formData.securityName.trim() !== "" && formData.marketType !== "";
  const commitDisabledReason = canCommitCurrentItem
    ? undefined
    : "종목명과 시장 분류를 입력해야 종목을 확정할 수 있습니다.";

  /**
   * 입력이 덜 끝난 확정 종목 — 목록에서 바로 보이게 한다.
   * 계산 시점 차단(`handleCalculate`)과 **같은 판정**을 쓴다(단일 소스).
   */
  const incompleteIndexes = useMemo(
    () =>
      savedItems
        .map((f, i) => (validateFilingItems([f]).length > 0 ? i : -1))
        .filter((i) => i >= 0),
    [savedItems],
  );
  // 홈 카드(?new=1) 진입 = 새 계산 → 빈 폼으로 초기화 (작업 중 새로고침은 보존)
  useResetOnNewParam(reset);

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면(step 3) 진입 + result 있을 때 1회
  const isResult = currentStep === 3 && result !== null;
  /**
   * 🔴 **다종목은 신고서 전체를 싣는다** (계획서 §4.1 G-B).
   *
   * 종전에는 `inputData: formData` · `resultData: result`였다. 그런데 합산 경로에서 `result`는
   * `agg.items.at(-1)`(마지막 종목 per-item)이고 `formData`도 편집 중이던 **한 종목**이라,
   * 2종목을 합산 계산하면 **앞 종목이 이력에서 통째로 사라지고** 납부세액에는 마지막 종목의
   * per-item 세액(차손 종목이면 **0**)이 저장됐다.
   *
   * 규약은 부동산 다건(`MultiTransferTaxCalculator.tsx:151`)과 같은 층위다 —
   * 표지 플래그 + 전체 입력. 복원은 `buildStockResumeState`가 대칭으로 되돌린다.
   *
   * ⚠️ 착수 전 실측(계획서 §3 M-2)에서 이 객체를 오염시키고 전건 21,549건을 돌렸을 때
   *    **실패가 0이었다** — 안전망이 없었다. 지금은 `stock-multi-record-identity` anchor가 본다.
   */
  const isMultiFiling = savedItems.length > 0;
  const historyInput = useMemo(
    () =>
      isMultiFiling
        ? ({ __multiStock: true, items: [...savedItems, formData] } as unknown as Record<string, unknown>)
        : (formData as unknown as Record<string, unknown>),
    [isMultiFiling, savedItems, formData],
  );
  // v2: pendingEditId·saveAsUpdate·saveAsNew API 폐기 — saveOrUpdateByContent 자동 dedup
  useAutoSaveCalculation({
    taxType: "stock_transfer",
    inputData: historyInput,
    resultData: isResult
      ? ((isMultiFiling ? aggregateResult : result) as unknown as Record<string, unknown> | null)
      : null,
    taxLawVersion: extractStockTransferDate(historyInput) ?? new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });

  // 수동 저장 — 자동저장과 별개로 사용자가 원할 때 즉시 이력 저장(갱신)
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  const recordCount = useRecordCount(result);
  const handleManualSave = async () => {
    setSaveMessage(null);
    try {
      // 자동저장과 **같은 규약**으로 싣는다 — 여기만 단건 폼을 보내면 [저장하기]가 다종목
      // 신고서를 마지막 종목 한 건으로 쪼개 저장한다(계획서 §4.1 G-B).
      const outcome = await runStockManualSave({
        form: historyInput,
        result: isMultiFiling ? aggregateResult : result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatStockSaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(
        formatStockSaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount),
      );
    }
  };

  /**
   * 현재 단계의 검증 결과 **전체**(오류 + 경고).
   *
   * 🔑 `handleNext`·경고 배너·사이드바 배지가 **같은 한 벌**(`validateStepByIndex`)을 쓴다.
   *    사본이 갈리면 셋이 서로 다른 단계를 가리킨다. 판정 마법사와 같은 규약이다.
   * 🔑 결과 화면(3)은 빈 배열이라 경고 카드가 뜨지 않는다 — 그래야 한다: 다종목 모드에서
   *    `commitCurrentItem`이 확정 직후 `formData`를 비우므로
   *    (`calc-wizard-stock-store.ts:200-207`) 결과 화면에 `formData` 파생 경고를 띄우면
   *    계산에 들어간 종목이 아니라 **빈 편집기**를 설명하게 된다. 판정 마법사는 다종목
   *    개념이 없어 결과 화면에도 띄운다 — 두 마법사가 갈리는 유일한 지점이다.
   */
  const currentStepErrors = useMemo(
    () => validateStepByIndex(formData, currentStep),
    [currentStep, formData],
  );

  // 다음 단계 진행 (validation 체크)
  const handleNext = useCallback(() => {
    const errors = currentStepErrors;

    const hasError = errors.some((e) => e.severity === "error");
    if (hasError) {
      const firstError = errors.find((e) => e.severity === "error");
      setError(firstError?.message ?? "입력 오류가 있습니다. 확인해주세요.");
      // 에러 배너가 페이지 상단에 있어 스크롤 하단의 다음 버튼 클릭 시 보이지 않는 문제 — 상단으로 스크롤
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    setError(null);
    setStep(currentStep + 1);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep, currentStepErrors, setError, setStep]);

  const handleBack = useCallback(() => {
    // step 0에서는 `WizardBackNav`가 `onBack`을 부르지 않는다 — `WizardNav.tsx:56`이
    // HomeButton을 직접 렌더한다(anchor: `__tests__/components/wizard-nav.test.tsx:46`).
    // 종전의 `router.push("/")`는 그래서 **도달하지 않는 홈 이동**이었다 — 읽는 사람에게
    // 「step 0 뒤로가기 = 홈」이라 오독시켰다. 경계 가드만 남긴다.
    if (currentStep === 0) return;
    setStep(currentStep - 1);
  }, [currentStep, setStep]);

  // 계산 실행
  //
  // 🔑 확정한 종목이 있으면 **합산 경로**로 간다. 종목별로 단건 호출을 반복하면
  //    §103①2호 기본공제가 종목마다 250만원씩 적용되고(과소과세), §102② 통산과
  //    §118의6①1호 B/C 안분이 아예 계산되지 않는다.
  const handleCalculate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (savedItems.length > 0) {
        // ⑧ 확정 종목 전수 검증 — 불완전 종목이 섞이면 엔진이 500 으로 터지고 사용자는
        //    **어느 종목이 문제인지 알 수 없다**(V-3 실측). 계산 전에 순번으로 지목해 막는다.
        const itemErrors = validateFilingItems([...savedItems, formData]);
        if (itemErrors.length > 0) {
          setError(itemErrors.map((e) => e.message).join("\n"));
          return;
        }
        const agg = await callStockTransferTaxAggregateAPI([...savedItems, formData]);
        setAggregateResult(agg);
        // 결과 화면·이력이 단건 `result`를 전제하므로 **마지막(편집 중이던) 종목**을 대표로 둔다.
        setResult(agg.items[agg.items.length - 1] ?? null);
      } else {
        const res = await callStockTransferTaxAPI(formData);
        setAggregateResult(null);
        setResult(res);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "계산 오류가 발생했습니다.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [formData, savedItems, setLoading, setError, setResult, setAggregateResult]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">주식 양도소득세</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              소득세법 §94①3·4 · 2026.4.21. 시행
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* onBeforeNavigate: 결과 화면에서 홈 이동 시 stale 결과 방지(스토어 메모리 정리, 입력 보존) */}
            <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" onBeforeNavigate={() => { if (isResult) { setResult(null); setStep(0); } }} />
            {currentStep > 0 && (
              <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />
            )}
            <SaveButton onSave={handleManualSave} />
            <ResetButton onReset={handleReset} />
          </div>
        </div>

        <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />

        {/* 단계 인디케이터 */}
        <div className="mb-6">
          <StepIndicator
            steps={Array.from(STEPS)}
            current={currentStep}
            onStepClick={(i) => setStep(i)}
          />
        </div>

        {/* 에러 배너 — 종목별 오류는 줄바꿈으로 나열되므로 `whitespace-pre-line` 으로 개행을 살린다 */}
        {error && currentStep < 3 && (
          <div className="mb-4 whitespace-pre-line rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {/*
          경고(`severity: "warning"`) — 오류 배너 **아래**.
          결과 화면 제외는 여기서 가드하지 않는다: `currentStepErrors`가 그 단계에서 빈 배열을
          돌려주고(위 switch `default`), 빈 배열이면 이 컴포넌트가 `null`을 낸다. 같은 규칙을
          두 곳에 두면 한쪽만 고쳐질 때 갈린다.
        */}
        <ValidationWarnings
          items={currentStepErrors}
          title="확인이 필요합니다"
          testId="stock-validation-warnings"
        />

        {/* 메인 레이아웃: 폼 + 사이드바 */}
        <div className="flex gap-8">
          {/* 폼 영역 */}
          <div className="flex-1 min-w-0">
            {currentStep === 0 && (
              <>
                {/*
                  다종목 합산신고 — §103①2호 기본공제는 국내·국외주식 통산액에서 연 1회이므로
                  여러 종목을 **한 계산**에 담아야 한다. 국외전출세는 별도 트랙이라 제외한다.
                */}
                {formData.marketType !== "exit_tax" && (
                  <div className="mb-8">
                    {/* 1단계는 **목록만** — 확정 버튼은 마지막 입력 단계(3단계)에 있다. */}
                    <StockItemListCard
                      savedItems={savedItems}
                      onAddCurrent={commitCurrentItem}
                      onEdit={editSavedItem}
                      onRemove={removeSavedItem}
                      canAddCurrent={canCommitCurrentItem}
                      addDisabledReason={commitDisabledReason}
                      incompleteIndexes={incompleteIndexes}
                    />
                  </div>
                )}
                <Step1 form={formData} onChange={updateFormData} />
              </>
            )}
            {currentStep === 1 && (
              <Step2 form={formData} onChange={updateFormData} />
            )}
            {currentStep === 2 && (
              <>
                <Step3 form={formData} onChange={updateFormData} savedItems={savedItems} />
                {/*
                  🔑 확정 버튼은 **마지막 입력 단계**에 둔다 — 양도가액은 2단계, 필요경비·신고는
                  3단계라 1단계에서 확정하면 금액이 빈 종목이 목록에 들어간다.
                  확정 후에는 1단계로 돌려 다음 종목을 처음부터 입력하게 한다.
                */}
                {formData.marketType !== "exit_tax" && (
                  <div className="mt-8">
                    <StockItemListCard
                      savedItems={savedItems}
                      onAddCurrent={() => {
                        commitCurrentItem();
                        setStep(0);
                      }}
                      onEdit={(i) => {
                        editSavedItem(i);
                        setStep(0);
                      }}
                      onRemove={removeSavedItem}
                      canAddCurrent={canCommitCurrentItem}
                      addDisabledReason={commitDisabledReason}
                      incompleteIndexes={incompleteIndexes}
                      showAddButton
                    />
                  </div>
                )}
              </>
            )}
            {currentStep === 3 && (
              <>
                <Step4
                  result={result}
                  form={formData}
                  error={error}
                  isLoading={isLoading}
                  onCalculate={handleCalculate}
                  aggregate={
                    aggregateResult
                      ? { items: aggregateResult.items, aggregated: aggregateResult }
                      : undefined
                  }
                />
                {/*
                  다종목 합산 요약 — 종목별 소득금액·통산·외국납부세액 한도.
                  🔑 **결과뷰 뒤**다. 종전에는 Step4 앞이라 신고서 양식 표가 화면 아래로
                  밀렸다(제보 —「신고서 양식이 맨 첫번째 위치하도록」). 신고서가 이 화면의
                  주된 산출물이므로 먼저 오고, 종목별 분해는 그 뒤를 받친다.
                  순서 고정: `e2e/stock-result-section-order.spec.ts` SO-1.
                */}
                {aggregateResult && (
                  <div className="mt-8">
                    <StockAggregateSummaryCard
                      aggregate={aggregateResult}
                      names={[...savedItems, formData].map((f) => f.securityName)}
                    />
                  </div>
                )}
              </>
            )}

            {/* 하단 네비게이션 */}
            <div className="mt-8 flex items-center justify-between border-t pt-6">
              <WizardBackNav isFirstStep={currentStep === 0} onBack={handleBack} />

              {currentStep < 2 && (
                <NavButton direction="next" label="다음" onClick={handleNext} />
              )}

              {currentStep === 2 && (
                <CtaButton
                  onClick={() => {
                    const errs = validateStep3(formData).filter((e) => e.severity === "error");
                    if (errs.length > 0) {
                      setError(errs[0].message);
                      return;
                    }
                    setError(null);
                    setStep(3);
                    // 계산은 Step4에서 사용자가 실행
                  }}
                >
                  결과 보기
                </CtaButton>
              )}
            </div>
          </div>

          {/* 사이드바 (lg 이상) */}
          <div className="hidden lg:block w-72 flex-shrink-0">
            <div className="sticky top-8">
              <StockSidebar
                currentStep={currentStep}
                onStepClick={(i) => setStep(i)}
                stockName={formData.securityName || undefined}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
