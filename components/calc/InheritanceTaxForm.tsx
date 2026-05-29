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

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { InheritanceTaxResultView } from "@/components/calc/results/InheritanceTaxResultView";
import { InheritanceSidebar } from "@/components/calc/inheritance/InheritanceSidebar";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import {
  runInheritanceManualSave,
  formatInheritanceSaveMessage,
  buildInheritanceAutoSaveToast,
  isInheritanceFormEmpty,
  useRecordCount,
} from "@/components/calc/inheritance-tax-save-handler";
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
  validateInheritanceTaxInput,
  validateUnlistedStockV2,
} from "@/lib/calc/inheritance-validate";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
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
    if (form.heirs.length === 0)
      return "상속인·수유자를 1명 이상 등록하세요. (협의분할·법정상속분 안분의 기준)";
  }
  if (step === 1) {
    const total = form.estateItems.length + form.stockItems.length;
    if (total === 0) return "상속재산을 1개 이상 입력하세요.";
    // 비상장주식 V2 입력 검증 — 진행 차단
    // ctx.evaluationDateFallback = deathDate — display fallback과 동일 fallback 인식 (CLAUDE.md ⑧)
    const evalCtx = { evaluationDateFallback: form.deathDate || undefined };
    for (const item of [...form.estateItems, ...form.stockItems]) {
      const e = validateUnlistedStockV2(item, evalCtx);
      if (e) return e;
    }
  }
  if (step === 2) {
    // 방안 C — 협의분할 ON 모드일 때만 항목 검증
    if (form.debtItems !== undefined) {
      if (form.debtItems.length === 0) {
        return "협의분할 모드 ON — 채무·공과·장례비 항목을 1개 이상 추가하거나 토글을 끄세요.";
      }
      for (const [idx, di] of form.debtItems.entries()) {
        if (!di.name.trim()) {
          return `채무·공과·장례비 ${idx + 1}번째 항목 — 채권자/내용을 입력하세요.`;
        }
        if (!Number.isFinite(di.amount) || di.amount <= 0) {
          return `채무·공과·장례비 "${di.name}" 항목 — 금액을 0보다 큰 값으로 입력하세요.`;
        }
        // 협의분할 합계 ≠ 금액 차단 (기존 validateDebtItemAllocations 동일 규칙)
        if (di.heirAllocations && di.heirAllocations.length > 0 && di.category !== "funeral") {
          const sum = di.heirAllocations.reduce((s, a) => s + a.amount, 0);
          if (sum !== di.amount) {
            return `채무 "${di.name}" 협의분할 합계 ${sum.toLocaleString()}원 ≠ 금액 ${di.amount.toLocaleString()}원`;
          }
        }
      }
    }
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

  // 로컬 이력 자동 저장 — v4 draft 승격 통합
  const autoSave = useAutoSaveCalculation({
    taxType: "inheritance",
    inputData: form as unknown as Record<string, unknown>,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: form.deathDate || new Date().toISOString().split("T")[0],
    clientId: activeClientId,
  });
  const recordCount = useRecordCount(autoSave.savedId);
  // useMemo로 참조 안정화 — buildInheritanceAutoSaveToast는 매 렌더 새 객체를 반환하므로
  // 그대로 useEffect 의존성에 넣으면 status="saved" 안정 상태에서도 매 렌더 재실행 →
  // setSaveMessage(새 객체) → 재렌더 무한 루프 (Maximum update depth). 원시값 의존으로 차단.
  const autoSaveToast = useMemo(
    () =>
      buildInheritanceAutoSaveToast({
        status: autoSave.status,
        savedId: autoSave.savedId,
        created: autoSave.created,
        promotedDraftCount: autoSave.promotedDraftCount ?? 0,
        count: recordCount,
      }),
    [
      autoSave.status,
      autoSave.savedId,
      autoSave.created,
      autoSave.promotedDraftCount,
      recordCount,
    ],
  );
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  useEffect(() => { if (autoSaveToast) setSaveMessage(autoSaveToast); }, [autoSaveToast]);

  const handleManualSaveForForm = async () => {
    setSaveMessage(null);
    try {
      const outcome = await runInheritanceManualSave({
        form: form as unknown as Record<string, unknown> & { deathDate?: string; assets?: unknown[]; heirs?: unknown[] },
        result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatInheritanceSaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(formatInheritanceSaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount));
    }
  };
  const isEmpty = isInheritanceFormEmpty(form as unknown as { deathDate?: string; assets?: unknown[]; heirs?: unknown[] });

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
    // 비상장주식 모드 strip — simple 모드인데 V2가 잔존하는 경우 엔진 전달 전 제거 (PR-3)
    const allItems = [...form.estateItems, ...form.stockItems].map(
      resolveActiveUnlistedValuation,
    );
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
      // 영농상속공제 정밀화 (2026-05-21, §18의3 + 시행령 §16)
      // form.farming: undefined(legacy) | FarmingInheritanceInput(활성)
      farming: form.farming,
      // 가업상속공제 요건 입력 (2026-05-21, §18의2 + 상증령 §15)
      // form.familyBusiness: undefined(legacy) | FamilyBusinessInheritanceInput(활성)
      familyBusiness: form.familyBusiness,
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
    // 방안 C 3-state: undefined / [] / [...]. ON 모드 == debtItems !== undefined
    const usesDebtItems = form.debtItems !== undefined && form.debtItems.length > 0;
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
      const input = buildInput();
      // 클라이언트 전체 검증 — API 왕복 전 1차 차단 (지점 ⑧)
      const preErr = validateInheritanceTaxInput(input);
      if (preErr) {
        setError(preErr);
        setLoading(false);
        return;
      }
      // lib/calc/inheritance-api 단일 진입점 — body spread 신규 필드 누락 차단 (지점 ④⑬)
      const res = await callInheritanceTaxAPI(input);
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
      <div className="space-y-4">
        <div className="flex justify-end">
          <SaveButton onSave={handleManualSaveForForm} />
        </div>
        <InheritanceTaxResultView
          result={result}
          onReset={handleReset}
          onBack={() => { setResult(null); setStep(STEPS.length - 1); }}
          onGoToFirst={() => { setResult(null); setStep(0); }}
          heirs={form.heirs}
          debtItems={form.debtItems}
          estateItems={[...form.estateItems, ...form.stockItems]}
          priorGifts={form.priorGifts}
          deathDate={form.deathDate}
          presumedItems={form.presumedItems}
        />
        <div className="flex justify-end">
          <SaveButton variant="primary" onSave={handleManualSaveForForm} />
        </div>
        <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
      </div>
    );
  }

  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="space-y-6">
      {/* 홈으로 · 초기화 — 내비게이션 바 위쪽 우측 */}
      <div className="flex items-center justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        <SaveButton onSave={handleManualSaveForForm} disabled={isEmpty} disabledReason="한 가지 이상 입력 후 저장해주세요." />
        <ResetButton
          onReset={() => {
            setForm(INITIAL_FORM);
            setStep(0);
            setResult(null);
            setError(null);
          }}
        />
      </div>

      {/* StepIndicator — 헤더 바로 아래 sticky (인쇄 시 일반 흐름) */}
      <div className="sticky top-14 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-border/60 mb-4 print:static print:bg-transparent print:backdrop-blur-0 print:border-0">
        <StepIndicator
          steps={[...STEPS]}
          current={step}
          onStepClick={(i) => setStep(i)}
          className="!mb-0"
        />
      </div>

      {/* 그리드: 데스크톱 좌(사이드바) · 우(입력) / 모바일 상단 stack / 인쇄 단일 컬럼 */}
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-start print:block">
        {/* 사이드바 합계 (지점 ⑥) — 좌측 sticky (데스크톱) / 상단 stack (모바일·인쇄) */}
        <aside className="order-first lg:sticky lg:top-36 self-start max-h-[calc(100vh-9rem)] overflow-y-auto print:static print:max-h-none print:overflow-visible">
          <InheritanceSidebar form={{ ...form, valuationDate: form.deathDate || undefined }} result={result} />
        </aside>

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
        </div>
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
          {loading ? "계산 중..." : isLastStep ? "계산하기" : "다음 →"}
        </button>
        <SaveButton variant="primary" onSave={handleManualSaveForForm} disabled={isEmpty} disabledReason="한 가지 이상 입력 후 저장해주세요." />
      </div>
      <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
    </div>
  );
}
