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

import { useEffect, useMemo, useRef, useState } from "react";
import { NavButton, CtaButton, WizardBackNav } from "@/components/calc/shared/WizardNav";
import { StepIndicator, type StepStatus } from "@/components/calc/StepIndicator";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { InheritanceTaxResultView } from "@/components/calc/results/InheritanceTaxResultView";
import { InheritanceSidebar } from "@/components/calc/inheritance/InheritanceSidebar";
import { InheritanceMobileSummaryBar } from "@/components/calc/inheritance/InheritanceMobileSummaryBar";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
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
  AncillaryLandRegion,
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
  warnCohabitHouseRightType,
} from "@/lib/calc/inheritance-validate";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import { injectSuperficiesRemainingYears, injectIntangibleRemainingYears, injectSavingsAccrualIfAuto, injectReceivableValuationDate, injectCbValuationDate, injectTrustBenefitRemainingYears, injectPeriodicRemainingYears, injectCryptoUnitPriceIfTimeseries } from "@/lib/calc/estate-item-valuation";
import { buildAppraisalFee } from "@/lib/calc/appraisal-fee-form";
import { buildFilingPenaltyInput } from "@/lib/calc/inheritance-gift-filing-penalty-input";
import { getInheritanceFilingDueDates } from "@/lib/calc/inheritance-gift-filing-deadline";
import { applyCorporateGiftTaxFallback } from "@/lib/calc/prior-gift-auto-tax";
import {
  suggestSpouseActualAmount,
  suggestNetFinancialAssets,
  suggestLegateeAmountNonHeir,
  suggestFarmingAssetValue,
  deriveCohabitHouseStdPrice,
} from "@/lib/calc/inheritance-deduction-suggest";
import { resolveFamilyBusinessHeirId } from "@/lib/tax-engine/deductions/family-business";
import { isManualItemActive } from "@/lib/calc/inheritance-deduction-checklist";
import {
  type FormState,
  INITIAL_FORM,
  STEPS,
  pruneOrphanHeirReferences,
  migrateLegacyOtherHeirs,
  resolveInheritanceFilingStatus,
} from "@/components/calc/inheritance/shared";
import { normalizeRestoredFormDates } from "@/components/calc/inheritance/normalize-restored-form-dates";
import {
  Step0,
  Step1,
  Step2,
  Step3,
  Step4,
} from "@/components/calc/inheritance/steps";
// ─── 단계 오류 수집·문구 — InheritanceTaxFormErrors.ts로 분리 (800줄 정책) ───
import { collectStepErrors, formatStepErrors, formatInheritanceApiError } from "./InheritanceTaxFormErrors";

export function InheritanceTaxForm() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InheritanceTaxResult | null>(null);
  // 오류 박스 — 표시될 때 시야로 스크롤(긴 Step4에서 하단 오류를 놓치지 않도록)
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  const { activeClientId } = useProfessionalStore();

  // 이력 "수정" hydration — 마운트 시 1회만 실행, sessionStorage 키 즉시 소비.
  // 증여세(giftTaxResumeInput)와 동일 패턴. 누락 시 상속개시일·상속인·상속재산이
  // 모두 빈 폼으로 떠서 사용자 입력 데이터가 복원되지 않음.
  useEffect(() => {
    const raw = sessionStorage.getItem("inheritanceTaxResumeInput");
    if (!raw) return;
    sessionStorage.removeItem("inheritanceTaxResumeInput");
    try {
      const parsed = JSON.parse(raw) as Partial<FormState>;
      // H-5: JSON.parse 후 Date 필드가 ISO 문자열로 역직렬화됨.
      // normalizeRestoredFormDates로 V2 비상장주식의 Date 필드를 Date 객체로 복원.
      // (validateUnlistedStockV2의 instanceof Date 검사가 string에서 false → 진행 불가 버그 방지)
      const normalized = normalizeRestoredFormDates(parsed);
      // 과거 저장된 "기타(other)" 상속인(isHeir 미설정)을 비상속인(false)으로 정규화 —
      // 신규 추가 기본값과 일치(§13①2호 5년). 대습·명시값은 보존(4촌 방계는 토글 ON 복구).
      const migrated = migrateLegacyOtherHeirs(normalized);
      // 저장된 이력에 삭제된 상속인을 참조하는 고아 협의분할·doneeId가 남아 있을 수
      // 있으므로 복원 직후 정리(연쇄 삭제 미적용 시기에 저장된 레코드 healing).
      setForm((prev) => pruneOrphanHeirReferences({ ...prev, ...migrated }));
      setStep(0);
    } catch {
      // JSON 파싱 실패 시 무시 (빈 폼 유지)
    }
  }, []);

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

  // 상속인 변경 전용 — 삭제 시 그 상속인을 참조하던 협의분할·doneeId·영농 자격자를
  // 연쇄 정리하여 고아 참조(validateHeirReferences 차단)를 사전 차단.
  const setHeirs = (heirs: FormState["heirs"]) =>
    setForm((prev) => pruneOrphanHeirReferences({ ...prev, heirs }));

  const handleNext = () => {
    const errs = collectStepErrors(step, form);
    if (errs.length > 0) {
      setError(formatStepErrors(errs));
      return;
    }
    setError(null);
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      handleCalculate();
    }
  };

  // 단계별 완료/주의 배지 — 오류 0건이면 complete(✓), 지나친 단계에 오류 있으면 attention(!),
  // 아직 도달 전이면 neutral(번호). collectStepErrors와 동일 규칙으로 handleNext 차단과 일관.
  const stepStatuses = useMemo<StepStatus[]>(
    () =>
      STEPS.map((_, i) => {
        const hasError = collectStepErrors(i, form).length > 0;
        if (hasError) return i < step ? "attention" : "neutral";
        return i <= step ? "complete" : "neutral";
      }),
    [form, step],
  );

  const handleBack = () => {
    setError(null);
    if (step === 0) {
      window.history.back();
    } else {
      setStep(step - 1);
    }
  };

  // 추가공제 자동 도출값 — display fallback(Step4)과 API autoOrManual(buildInput)이 공유(3중 일치).
  const autoAllItems = useMemo(
    () =>
      [...form.estateItems, ...form.stockItems].map(resolveActiveUnlistedValuation),
    [form.estateItems, form.stockItems],
  );
  const autos = useMemo(
    () => ({
      spouse: suggestSpouseActualAmount(autoAllItems, form.heirs, form.debtItems),
      netFin: suggestNetFinancialAssets(autoAllItems, form.debtItems),
      cohabit: deriveCohabitHouseStdPrice(autoAllItems, form.heirs),
      farming: suggestFarmingAssetValue(autoAllItems, form.farming, form.deathDate),
      legatee: suggestLegateeAmountNonHeir(autoAllItems, form.heirs),
    }),
    [autoAllItems, form.heirs, form.debtItems, form.farming, form.deathDate],
  );

  const buildInput = (): InheritanceTaxInput => {
    // 비상장주식 모드 strip — simple 모드인데 V2가 잔존하는 경우 엔진 전달 전 제거 (PR-3)
    // 지상권 잔존연수 합성 — 평가기준일(상속개시일) 기준 (§61③, override 우선)
    // §63④ 예금 자동 계산 주입 — auto 모드 시 미수이자·원천징수세액 pre-inject
    const deathDateObj = form.deathDate ? new Date(form.deathDate) : undefined;
    const allItems = [...form.estateItems, ...form.stockItems]
      .map(resolveActiveUnlistedValuation)
      .map((i) => injectSuperficiesRemainingYears(i, form.deathDate || undefined))
      .map((i) => injectIntangibleRemainingYears(i, form.deathDate || undefined))
      .map((i) => (deathDateObj ? injectSavingsAccrualIfAuto(i, deathDateObj) : i))
      .map((i) => injectReceivableValuationDate(i, form.deathDate || undefined))
      .map((i) => injectCbValuationDate(i, form.deathDate || undefined))
      .map((i) => injectTrustBenefitRemainingYears(i, form.deathDate || undefined))
      .map((i) => injectPeriodicRemainingYears(i, form.deathDate || undefined))
      .map(injectCryptoUnitPriceIfTimeseries);
    // 자동 도출 (mirror, R4): 빈 문자열(미입력)일 때만 자산·협의분할 기반 자동, "0"·명시값 우선.
    // store는 불변(form 그대로) — useEffect→store 미러링 아님. UI는 자동값을 display fallback으로 표시.
    // autos는 component-scope useMemo와 동일 산식(3중 일치 — display ↔ API autoOrManual).
    const autoOrManual = (raw: string, auto: number): number | undefined =>
      raw === "" ? (auto > 0 ? auto : undefined) : parseAmount(raw) || undefined;
    const spouseAuto = autos.spouse.value;
    const netFinAuto = autos.netFin.value;
    const legateeAuto = autos.legatee.value;
    const deductionInput: InheritanceDeductionInput = {
      heirs: form.heirs,
      // §20 P1 동거가족 — 별도 배열(옵션 B). inheritance-api.ts:82 deductionInput spread 자동.
      cohabitantDependents: form.cohabitantDependents,
      spouseActualAmount: autoOrManual(form.spouseActualAmount, spouseAuto),
      netFinancialAssets: autoOrManual(form.netFinancialAssets, netFinAuto),
      cohabitHouseStdPrice: autoOrManual(form.cohabitHouseStdPrice, autos.cohabit.value),
      cohabitSecuredDebt: autos.cohabit.securedDebt || undefined,
      // §23의2 자산유형(입주권·분양권) — 미적용 게이트(엔진). 동거주택 단일 자산에서 도출.
      cohabitHouseRightType: form.estateItems.find((i) => i.isCohabitantHouse === true)
        ?.cohabitHouseRightType,
      farmingAssetValue: autoOrManual(form.farmingAssetValue, autos.farming.value),
      // ④ 체크리스트 게이팅 — isManualItemActive(form, key) false이면 undefined (값 보존, 계산 제외)
      // 자동 항목(spouse/financial/cohabit/farming)은 게이트 없음(법정 강행 공제)
      familyBusinessValue: isManualItemActive(form, "familyBusiness")
        ? parseAmount(form.familyBusinessValue) || undefined
        : undefined,
      familyBusinessYears:
        isManualItemActive(form, "familyBusiness") && form.familyBusinessYears
          ? parseInt(form.familyBusinessYears, 10)
          : undefined,
      // Phase D·E 신규 — 종합사례 PDF
      familyBusinessDirectAmount: isManualItemActive(form, "familyBusiness")
        ? parseAmount(form.familyBusinessDirectAmount) || undefined
        : undefined,
      cohabitDirectAmount: parseAmount(form.cohabitDirectAmount) || undefined,
      legateeAmountNonHeir: isManualItemActive(form, "legatee")
        ? autoOrManual(form.legateeAmountNonHeir, legateeAuto)
        : undefined,
      // §24 ②2호 선순위 상속포기→후순위 수령 (대습 제외 — 명시 입력만, 자동도출 없음) (H-19)
      heirWaiverAmount: isManualItemActive(form, "heirWaiver")
        ? parseAmount(form.heirWaiverAmount) || undefined
        : undefined,
      priorGiftDeductionTotal: isManualItemActive(form, "priorGiftDeduction")
        ? parseAmount(form.priorGiftDeductionTotal) || undefined
        : undefined,
      disasterLossDeduction: isManualItemActive(form, "disasterAdjust")
        ? parseAmount(form.disasterLossDeduction) || undefined
        : undefined,
      // ④⑬ §23 재해손실공제 — 토글 OFF → undefined (3-state, feedback_three_state_optional_mode_toggle)
      // casualtyLoss는 casualtyLossEnabled 단일 진실 (isManualItemActive("casualtyLoss") = casualtyLossEnabled)
      // API max(0,loss−comp) fallback은 엔진이 처리 (⑧ validate와 동일 로직 3중 패턴)
      casualtyLoss: form.casualtyLossEnabled
        ? {
            lossValue: parseAmount(form.casualtyLossValue),
            compensatedValue: parseAmount(form.casualtyLossCompensated) || undefined,
            disasterType: form.casualtyLossType || undefined,
            disasterDate: form.casualtyLossDate || undefined,
          }
        : undefined,
      deathDate: form.deathDate || undefined,
      // 영농상속공제 정밀화 (2026-05-21, §18의3 + 시행령 §16)
      // form.farming: undefined(legacy) | FarmingInheritanceInput(활성)
      farming: form.farming,
      // 가업상속공제 요건 입력 (2026-05-21, §18의2 + 상증령 §15)
      // H-3 fix: heirId=undefined 시 자연인 1명이면 자동선택 fallback (resolveFamilyBusinessHeirId).
      //   UI display fallback(FamilyBusinessHeirSelector effectiveHeirId)과 동일 규칙 — 3중 패턴.
      familyBusiness:
        isManualItemActive(form, "familyBusiness") && form.familyBusiness
          ? {
              ...form.familyBusiness,
              heirId: resolveFamilyBusinessHeirId(form.heirs, form.familyBusiness.heirId),
            }
          : undefined,
      // §21① 단서 — 완전 무신고 시 일괄공제 5억 고정 (2026-06-07)
      isUnfiled: form.isUnfiled || undefined,
      // G4 §23의2① 주택부수토지 면적한도 차감 (Phase 3 — 4필드 전부 또는 전무, 토지분 가액 포함)
      ancillaryLandArea:
        parseDecimal(form.ancillaryLandArea) > 0
          ? parseDecimal(form.ancillaryLandArea)
          : undefined,
      buildingFootprintArea:
        parseDecimal(form.buildingFootprintArea) > 0
          ? parseDecimal(form.buildingFootprintArea)
          : undefined,
      ancillaryLandRegion: form.ancillaryLandRegion
        ? (form.ancillaryLandRegion as AncillaryLandRegion)
        : undefined,
      ancillaryLandStdPrice: parseAmount(form.ancillaryLandStdPrice) || undefined,
    };
    // 영리법인 §3의2② 산출세액 상당액 진입 fallback (phase2-후속): cgct 미설정 + 가액 → autoCompute.
    // 표시 fallback(GiftRowEditor)과 동일 산식 — mirror 3중 single-source. store는 불변(엔진 전달용 정제).
    const normalizedPriorGifts = applyCorporateGiftTaxFallback(form.priorGifts);
    // ④ creditInput — 수동 항목은 isManualItemActive 게이팅 (⑧ validate와 동기화).
    // foreignTax / shortTermReinherit 비활성 시 해당 필드 undefined → validate §29·§30 검증 통과.
    // validate.ts의 if(foreignCreditInput) / if(shortTermCreditInput) 분기가 undefined를 무시하므로
    // UI 통과 ↔ validate 차단 모순 없음 (CLAUDE.md ⑧ 3중 패턴 충족).
    const creditInput: InheritanceTaxCreditInput = {
      priorGifts: normalizedPriorGifts,
      // §29 외국납부세액공제 — 체크리스트 "foreignTax" 비활성 시 undefined
      foreignTaxPaid: isManualItemActive(form, "foreignTax")
        ? parseAmount(form.foreignTaxPaid) || undefined
        : undefined,
      foreignInheritanceTaxBase: isManualItemActive(form, "foreignTax")
        ? parseAmount(form.foreignInheritanceTaxBase) || undefined
        : undefined,
      // §30 단기재상속 — 체크리스트 "shortTermReinherit" 비활성 시 undefined
      // §30 banding 자동 도출 — 1차 상속개시일 (2차 = deathDate)
      shortTermReinheritPriorDeathDate: isManualItemActive(form, "shortTermReinherit")
        ? form.shortTermReinheritPriorDeathDate || undefined
        : undefined,
      // §30 재상속분 재산 배열 — 빈 행/0가액 제외 (검토 #4-12)
      shortTermReinheritAssets: (() => {
        if (!isManualItemActive(form, "shortTermReinherit")) return undefined;
        const rows = form.shortTermReinheritAssets
          .map((a) => ({
            name: a.name.trim() || undefined,
            priorValue: parseAmount(a.value),
          }))
          .filter((a) => a.priorValue > 0);
        return rows.length > 0 ? rows : undefined;
      })(),
      shortTermReinheritYears:
        isManualItemActive(form, "shortTermReinherit") && form.shortTermReinheritYears
          ? parseInt(form.shortTermReinheritYears, 10)
          : undefined,
      shortTermReinheritTaxPaid: isManualItemActive(form, "shortTermReinherit")
        ? parseAmount(form.shortTermReinheritTaxPaid) || undefined
        : undefined,
      shortTermReinheritAssetValue: isManualItemActive(form, "shortTermReinherit")
        ? parseAmount(form.shortTermReinheritAssetValue) || undefined
        : undefined,
      shortTermReinheritPriorEstateValue: isManualItemActive(form, "shortTermReinherit")
        ? parseAmount(form.shortTermReinheritPriorEstateValue) || undefined
        : undefined,
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
      // §9②2호: 봉안시설·자연장지 별도 금액. 빈 문자열이면 undefined(legacy boolean 경로 유지)
      funeralBonganExpense:
        usesDebtItems || form.funeralBonganExpense === ""
          ? undefined
          : parseAmount(form.funeralBonganExpense) || undefined,
      funeralIncludesBongan: usesDebtItems ? false : form.funeralIncludesBongan,
      debts: usesDebtItems ? 0 : parseAmount(form.debts),
      debtItems: usesDebtItems ? form.debtItems : undefined,
      presumedItems: form.presumedItems.length > 0 ? form.presumedItems : undefined,
      exemptions: form.exemptionItems.length > 0 ? form.exemptionItems : undefined,
      preGiftsWithin10Years: normalizedPriorGifts,
      heirs: form.heirs,
      deductionInput,
      creditInput,
      isGenerationSkip: form.isGenerationSkip || undefined,
      isMinorHeir: form.isGenerationSkip && form.isMinorHeir ? true : undefined,
      generationSkipAssetAmount:
        form.isGenerationSkip && form.generationSkipAssetAmount
          ? parseAmount(form.generationSkipAssetAmount) || undefined
          : undefined,
      // 감정평가수수료 공제 (§25①2호·시행령 §20의3)
      appraisalFee: buildAppraisalFee(form),
      // 🔴 G-07 B1 — 신고불성실가산세 (「국세기본법」 §47의2·§47의3).
      //   게이팅은 증여와 공용 leaf. 여기서 넘기는 것은 **상속 고유의 법정신고기한**뿐 —
      //   §67① 상속개시일이 속한 달의 말일 + 6개월, §67④ 비거주자 9개월.
      ...buildFilingPenaltyInput(
        resolveInheritanceFilingStatus(form),
        form,
        getInheritanceFilingDueDates(form.deathDate, form.decedentType).filing || undefined,
      ),
    };
  };

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    setWarnings([]);
    try {
      const input = buildInput();
      // 클라이언트 전체 검증 — API 왕복 전 1차 차단 (지점 ⑧)
      const preErr = validateInheritanceTaxInput(input);
      if (preErr) {
        setError(preErr);
        setLoading(false);
        return;
      }
      // CV-1·CV-3 동거주택 자산 유형 경고 (비차단 — 계산 계속)
      const cohabitWarns = warnCohabitHouseRightType(
        form.estateItems,
        form.cohabitHouseStdPrice,
        form.cohabitDirectAmount,
      );
      if (cohabitWarns.length > 0) setWarnings(cohabitWarns);
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
    setWarnings([]);
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
          onEditStep={(s) => { setResult(null); setStep(s); }}
          heirs={form.heirs}
          debtItems={form.debtItems}
          estateItems={[...form.estateItems, ...form.stockItems]}
          priorGifts={form.priorGifts}
          exemptions={form.exemptionItems}
          deathDate={form.deathDate}
          presumedItems={form.presumedItems}
          familyBusinessInput={form.familyBusiness}
          decedentName={form.decedentName}
          decedentResidentNumber={form.decedentResidentNumber}
          decedentAddress={form.decedentAddress}
          savedId={autoSave.savedId ?? undefined}
          installmentEnabled={form.installmentEnabled}
          installmentYears={form.installmentYears}
          installmentFamilyBusiness={form.installmentFamilyBusiness}
          installmentFbMode={form.installmentFbMode}
          installmentFutureRate={form.installmentFutureRate}
          splitPaymentEnabled={form.splitPaymentEnabled}
          splitPaymentAmount={form.splitPaymentAmount}
          paymentInKindEnabled={form.paymentInKindEnabled}
          paymentInKindIneligibleAmount={form.paymentInKindIneligibleAmount}
          paymentInKindRequestedAmount={form.paymentInKindRequestedAmount}
          decedentType={form.decedentType}
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
        {step > 0 && (
          <NavButton direction="prev" label="이전" onClick={handleBack} aria-label="이전 단계로 이동" />
        )}
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

      {/* StepIndicator — 헤더 바로 아래 sticky (인쇄 시 일반 흐름).
          모바일 합계 미니바(⑧)를 같은 sticky 컨테이너에 넣어 단일 sticky 요소로 처리. */}
      <div className="sticky top-14 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-border/60 mb-4 print:static print:bg-transparent print:backdrop-blur-0 print:border-0">
        <StepIndicator
          steps={[...STEPS]}
          current={step}
          onStepClick={(i) => setStep(i)}
          stepStatus={stepStatuses}
          className="!mb-0"
        />
        {/* 모바일 전용 접이식 합계 미니바 — 데스크톱은 좌측 사이드바가 담당.
            (이 렌더 경로는 result===null 입력 모드에서만 도달) */}
        <InheritanceMobileSummaryBar
          form={{ ...form, valuationDate: form.deathDate || undefined }}
          result={result}
        />
      </div>

      {/* 그리드: 데스크톱 좌(사이드바) · 우(입력) / 인쇄 단일 컬럼 (모바일은 미니바가 대체) */}
      <div className="grid grid-cols-1 lg:grid-cols-[180px_1fr] gap-6 items-start print:block">
        {/* 사이드바 합계 (지점 ⑥) — 좌측 sticky (데스크톱) / 인쇄 표시 / 모바일 숨김(미니바 대체) */}
        <aside className="hidden lg:block lg:sticky lg:top-36 self-start max-h-[calc(100vh-9rem)] overflow-y-auto print:block print:static print:max-h-none print:overflow-visible">
          <InheritanceSidebar form={{ ...form, valuationDate: form.deathDate || undefined }} result={result} />
        </aside>

        <div className="min-h-[300px]">
          {step === 0 && (
            <Step0
              form={form}
              set={set}
              setHeirs={setHeirs}
            />
          )}
          {step === 1 && <Step1 form={form} set={set} />}
          {step === 2 && <Step2 form={form} set={set} />}
          {step === 3 && <Step3 form={form} set={set} />}
          {step === 4 && <Step4 form={form} set={set} autos={autos} />}
        </div>
      </div>

      {error && (
        <div
          ref={errorRef}
          data-testid="inheritance-step-error"
          className="rounded-md bg-destructive/10 border border-destructive/30 px-4 py-2.5 text-sm text-destructive whitespace-pre-line"
        >
          {error}
        </div>
      )}

      {/* CV-1·CV-3 비차단 경고 — 계산은 계속 진행 */}
      {warnings.length > 0 && (
        <div
          className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-4 py-2.5 text-sm text-amber-800 dark:text-amber-200 space-y-1"
          data-testid="cohabit-right-type-warnings"
        >
          {warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <WizardBackNav isFirstStep={step === 0} onBack={handleBack} />
        <div className="flex items-center gap-2">
          <SaveButton variant="primary" onSave={handleManualSaveForForm} disabled={isEmpty} disabledReason="한 가지 이상 입력 후 저장해주세요." />
          {isLastStep ? (
            <CtaButton onClick={handleNext} disabled={loading}>
              {loading ? "계산 중..." : "계산하기"}
            </CtaButton>
          ) : (
            <NavButton direction="next" label="다음" onClick={handleNext} disabled={loading} />
          )}
        </div>
      </div>
      <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
    </div>
  );
}
