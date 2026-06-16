"use client";

import { ProfessionalClientGate } from "@/components/calc/ProfessionalClientGate";

/**
 * 종합부동산세 계산기 — 5단계 StepWizard (T-16)
 *
 * Step 1: 기본 정보 (1세대1주택, 생년월일, 취득일, 과세연도)
 * Step 2: 주택 목록 (공시가격, 면적, 수도권, 합산배제 유형)
 * Step 3: 합산배제 상세 (임대주택·미분양·어린이집·사원용 요건)
 * Step 4: 토지 정보 (종합합산·별도합산, 선택)
 * Step 5: 세부담 상한 (전년도 세액, 선택)
 *
 * 종합부동산세법 §8~§15 기반
 */

import { useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { callComprehensiveApi, validateLandParcels, validateAppurtenantSplit, validateMultiFamily, deriveCorporateClass } from "@/lib/calc/comprehensive-api";
import { requiredCorporateReqKey } from "@/lib/tax-engine/comprehensive-corporate-class";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { PropertyListInput } from "@/components/calc/PropertyListInput";
import { LandParcelSection } from "@/components/calc/comprehensive/LandParcelSection";
import { ExclusionInfoInput } from "@/components/calc/ExclusionInfoInput";
import { ComprehensiveTaxResultView } from "@/components/calc/results/ComprehensiveTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { runComprehensiveManualSave, formatComprehensiveSaveMessage } from "@/components/calc/comprehensive-tax-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import { Step1Basic } from "./Step1Basic";

// ============================================================
// 상수
// ============================================================

const STEPS = ["기본 정보", "주택 목록", "합산배제", "토지 정보", "세부담 상한"];

// ============================================================
// 네비게이션 버튼
// ============================================================

function NavButtons({
  step,
  onPrev,
  onNext,
  nextLabel = "다음",
  loading = false,
}: {
  step: number;
  onPrev: () => void;
  onNext: () => void;
  nextLabel?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex gap-3 pt-4">
      <button
        type="button"
        onClick={onPrev}
        className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        {step === 0 ? "홈으로" : "이전"}
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={loading}
        className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {loading ? "계산 중..." : nextLabel}
      </button>
    </div>
  );
}

// ============================================================
// Step 2: 주택 목록
// ============================================================

function Step2Properties() {
  const { formData, addProperty, removeProperty, updateProperty } =
    useComprehensiveWizardStore();

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
        <p>
          합산배제 신청 주택을 포함한 보유 주택 전체를 입력해주세요.
          합산배제 요건은 다음 단계에서 입력합니다.
        </p>
      </div>
      <PropertyListInput
        properties={formData.properties}
        isCorporate={(formData.taxpayerType ?? "individual") !== "individual"}
        referenceDate={`${formData.assessmentYear}-06-01`}
        onAdd={addProperty}
        onRemove={removeProperty}
        onUpdate={updateProperty}
      />
    </div>
  );
}

// ============================================================
// Step 3: 합산배제 상세
// ============================================================

function Step3Exclusion() {
  const { formData, updateProperty } = useComprehensiveWizardStore();

  const propertiesWithExclusion = formData.properties.filter(
    (p) => p.exclusionType !== "none",
  );

  if (propertiesWithExclusion.length === 0) {
    return (
      <div className="rounded-md bg-muted/30 border px-4 py-6 text-center text-sm text-muted-foreground">
        합산배제 신청 주택이 없습니다.
        <br />
        다음 단계로 진행해주세요.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
        합산배제 신청 주택의 요건 정보를 입력해주세요.
        요건 미충족 시 해당 주택은 과세 대상에 포함됩니다.
      </div>
      {propertiesWithExclusion.map((property, index) => (
        <ExclusionInfoInput
          key={property.id}
          index={index}
          property={property}
          onUpdate={(data) => updateProperty(property.id, data)}
        />
      ))}
    </div>
  );
}

// ============================================================
// Step 4: 토지 정보
// ============================================================

function Step4Land() {
  const { formData, updateFormData, addSeparateLand, removeSeparateLand, updateSeparateLand } =
    useComprehensiveWizardStore();

  return (
    <div className="space-y-6">
      {/* 종합합산 토지 */}
      <ToggleCard
        tone="sky"
        title="종합합산 토지 보유 (§11)"
        description="나대지·잡종지 등 — 기본공제 5억원, 세율 1%~3%"
        checked={formData.hasAggregateLand}
        onCheckedChange={(v) => updateFormData({ hasAggregateLand: v })}
      >
        <LandParcelSection kind="aggregate" />
        {formData.landAggregateMode === "summary" && (
          <>
            <CurrencyInput
              label="공시지가 합산 (원)"
              value={formData.landAggregate.totalOfficialValue}
              onChange={(v) =>
                updateFormData({
                  landAggregate: { ...formData.landAggregate, totalOfficialValue: v },
                })
              }
              placeholder="0"
              required
              hint="인별 종합합산 토지 공시지가 합산액"
            />
            <CurrencyInput
              label="재산세 과세표준 (원)"
              value={formData.landAggregate.propertyTaxBase}
              onChange={(v) =>
                updateFormData({
                  landAggregate: { ...formData.landAggregate, propertyTaxBase: v },
                })
              }
              placeholder="0"
              required
              hint="비율 안분 공제 계산용 — 재산세 고지서에서 확인"
            />
            <CurrencyInput
              label="재산세 부과세액 (원)"
              value={formData.landAggregate.propertyTaxAmount}
              onChange={(v) =>
                updateFormData({
                  landAggregate: { ...formData.landAggregate, propertyTaxAmount: v },
                })
              }
              placeholder="0"
              required
              hint="재산세 고지서의 부과세액"
            />
            <CurrencyInput
              label="전년도 세액 (원, 선택)"
              value={formData.landAggregate.previousYearTotalTax}
              onChange={(v) =>
                updateFormData({
                  landAggregate: { ...formData.landAggregate, previousYearTotalTax: v },
                })
              }
              placeholder="0"
              hint="전년도 종합합산 토지 세부담 상한 계산용 (미입력 시 상한 생략)"
            />
          </>
        )}
      </ToggleCard>

      <hr className="border-muted" />

      {/* 별도합산 토지 */}
      <ToggleCard
        tone="sky"
        title="별도합산 토지 보유 (§12)"
        description="사업용 건축물 부속 토지 등 — 기본공제 80억원, 세율 0.5%~0.7%"
        checked={formData.hasSeparateLand}
        onCheckedChange={(v) => updateFormData({ hasSeparateLand: v })}
      >
        <LandParcelSection kind="separate" />
        {formData.landSeparateMode === "summary" && (
        <div className="space-y-3">
            {formData.landSeparate.map((land, index) => (
              <div key={land.id} className="rounded-md border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">토지 {index + 1}</h4>
                  {formData.landSeparate.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSeparateLand(land.id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <CurrencyInput
                  label="개별공시지가 × 면적 (원)"
                  value={land.publicPrice}
                  onChange={(v) => updateSeparateLand(land.id, { publicPrice: v })}
                  placeholder="0"
                  required
                />
                <CurrencyInput
                  label="재산세 과세표준 (원)"
                  value={land.propertyTaxBase}
                  onChange={(v) => updateSeparateLand(land.id, { propertyTaxBase: v })}
                  placeholder="0"
                  required
                />
                <CurrencyInput
                  label="재산세 부과세액 (원)"
                  value={land.propertyTaxAmount}
                  onChange={(v) => updateSeparateLand(land.id, { propertyTaxAmount: v })}
                  placeholder="0"
                  required
                />
              </div>
            ))}
            <button
              type="button"
              onClick={addSeparateLand}
              className="w-full rounded-md border border-dashed border-muted-foreground/50 px-4 py-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              + 토지 추가
            </button>
        </div>
        )}
      </ToggleCard>
    </div>
  );
}

// ============================================================
// Step 5: 세부담 상한
// ============================================================

function Step5TaxCap() {
  const { formData, updateFormData } = useComprehensiveWizardStore();
  const year = parseInt(formData.assessmentYear) || new Date().getFullYear();
  const showMultiHouseCap = year < 2023;
  const isMultiHouseOn = formData.isMultiHouseInAdjustedArea;
  // 법인 §9② class 도출 (엔진 헬퍼 단일 진실) — 가시성 분기
  const corporateClass = deriveCorporateClass(formData);
  // corporate_special(§9②3호): 세부담상한 미적용 → 전년도 세액 입력 숨김
  const isCorporateSpecial = corporateClass === "corporate_special";
  // corporate_general(§9②1호): 주택 수 무관 → 조정대상지역 2주택 토글 숨김
  const isCorporateGeneral = corporateClass === "corporate_general";

  return (
    <div className="space-y-6">
      {/* corporate_special(§9②3호): 세부담상한 미적용 안내 */}
      {isCorporateSpecial && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 px-4 py-3 text-xs text-violet-900">
          <p className="font-semibold">§9②3호 법인 — 세부담 상한 미적용</p>
          <p className="mt-1">
            종합부동산세법 §10 단서에 따라 §9②3호 세율(단일 비례세율)이 적용되는 법인에는
            세부담 상한이 적용되지 않습니다. 전년도 세액 입력이 필요하지 않습니다.
          </p>
        </div>
      )}

      {/* 조정대상지역 2주택 이상 — 과세연도 < 2023 이고 corporate_general이 아닐 때만 노출 */}
      {showMultiHouseCap && !isCorporateGeneral && (
        <ToggleCard
          tone="rose"
          title="조정대상지역 2주택 이상"
          description={`세부담 상한 300% 적용 (종합부동산세법 §10② 구법 — ${year} 귀속 이전)\n3주택 이상은 주택 수로 자동 적용됩니다 — 이 토글은 조정대상지역 2주택 보유 시에만 켜세요`}
          checked={formData.isMultiHouseInAdjustedArea}
          onCheckedChange={(v) => updateFormData({ isMultiHouseInAdjustedArea: v })}
        >
          <p className="text-xs text-rose-700">
            {year} 귀속(과세기준일 {year}-06-01)까지 조정대상지역 2주택 이상 보유자에게
            적용된 규정입니다. 2023년부터 해당 조항이 삭제되어 150%로 단일화됩니다.
          </p>
        </ToggleCard>
      )}

      {/* 전년도 세액 — corporate_special(상한 미적용)은 숨김 */}
      {!isCorporateSpecial && (
        <div className="space-y-4">
          {/* 입력 방식 선택 */}
          <RadioCardGroup
            name="previousYearCapMode"
            tone="sky"
            layout="inline"
            value={formData.previousYearCapMode ?? "direct"}
            onChange={(v) => updateFormData({ previousYearCapMode: v as "direct" | "auto" })}
            options={[
              {
                value: "direct",
                label: "전년도 총세액 직접 입력",
                description: "재산세·종부세 고지서에서 확인한 합계액 입력",
                testId: "cap-mode-direct",
              },
              {
                value: "auto",
                label: "직전연도 공시가격으로 자동 계산",
                description: "공시가격 입력 시 엔진이 상당액 자동 산출 (§10의2 준용)",
                testId: "cap-mode-auto",
              },
            ]}
          />

          {/* 직접 입력 모드 */}
          {(formData.previousYearCapMode ?? "direct") === "direct" && (
            <div className="space-y-2">
              <CurrencyInput
                label="전년도 총세액 (선택)"
                value={formData.previousYearTotalTax}
                onChange={(v) => updateFormData({ previousYearTotalTax: v })}
                placeholder="0"
                hint="전년도 종합부동산세 + 재산세 합계 (농특세 제외). 미입력 시 세부담 상한 계산 생략."
              />
            </div>
          )}

          {/* 자동 계산 모드 */}
          {formData.previousYearCapMode === "auto" && (
            <div className="rounded-md border border-sky-200 bg-sky-50/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-sky-700">직전연도 공시가격 정보</p>

              {formData.properties.length <= 1 ? (
                /* 당해 1주택 — 직전 공시 합계 단일 입력 */
                <CurrencyInput
                  label="직전연도 공시가격 합계 (원)"
                  value={formData.previousYearAutoAssessedValue}
                  onChange={(v) =>
                    updateFormData({ previousYearAutoAssessedValue: v })
                  }
                  placeholder="0"
                  required
                  hint="직전연도 6월 1일 기준 보유 주택 공시가격 합계"
                />
              ) : (
                /* 당해 2주택+ — 직전 주택별 공시 입력 (재산세 주택별 합산) */
                <div className="space-y-2">
                  {formData.properties.map((p, i) => (
                    <CurrencyInput
                      key={p.id}
                      label={`주택 ${i + 1} 직전연도 공시가격 (원)`}
                      value={formData.previousYearAutoHouseValues[i] ?? ""}
                      onChange={(v) => {
                        const next = [...formData.previousYearAutoHouseValues];
                        next[i] = v;
                        updateFormData({ previousYearAutoHouseValues: next });
                      }}
                      placeholder="0"
                      required
                    />
                  ))}
                  <p className="text-xs text-sky-700">
                    재산세상당액은 주택별로 계산 후 합산됩니다 (누진세율).
                  </p>
                </div>
              )}

              {/* 직전연도 조정대상지역 2주택 — 당해 < 2023(중과 존재) 이고 다주택일 때 */}
              {showMultiHouseCap && formData.properties.length > 1 && (
                <ToggleCard
                  tone="rose"
                  title="직전연도 조정대상지역 2주택 이상"
                  description={`직전연도 종합부동산세상당액에 중과세율 적용\n${year - 1} 귀속 기준 — 당해연도 1세대1주택 의제(일시적 2주택 등)와 별개`}
                  checked={formData.previousYearAutoIsMultiAdjusted}
                  onCheckedChange={(v) =>
                    updateFormData({ previousYearAutoIsMultiAdjusted: v })
                  }
                />
              )}

              <ToggleCard
                tone="violet"
                title="직전연도 1세대1주택자"
                description="직전연도에 1세대1주택 특례를 적용받은 경우 켜세요"
                checked={formData.previousYearAutoIsOneHouse}
                onCheckedChange={(v) => updateFormData({ previousYearAutoIsOneHouse: v })}
              />

              <div className="rounded-md bg-muted/30 border px-3 py-2 text-xs text-muted-foreground">
                <p>생년월일·취득일은 기본정보(1단계)에서 자동으로 사용됩니다.</p>
              </div>
            </div>
          )}

          <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
            <p className="font-medium mb-1">세부담 상한 계산 방식</p>
            {showMultiHouseCap ? (
              <>
                <p>
                  상한액 = 전년도 세액 ×{" "}
                  {isMultiHouseOn ? "300% (조정대상지역 2주택 이상 §10②)" : "150% (일반 §10①)"}
                </p>
                <p className="mt-1">
                  3주택 이상은 자동으로 300% 상한이 적용됩니다.
                </p>
              </>
            ) : (
              <p>상한액 = 전년도 세액 × 150% (종합부동산세법 §10)</p>
            )}
            <p className="mt-1">
              당해 종부세가 상한액을 초과하면 상한액 - 재산세 = 확정 종부세
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 메인 페이지
// ============================================================
// (API 호출·변환은 lib/calc/comprehensive-api.ts — 800줄 정책 분리)

export default function ComprehensiveTaxPage() {
  const router = useRouter();
  const { currentStep, setStep, formData, setResult, result, reset } =
    useComprehensiveWizardStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { activeClientId } = useProfessionalStore();

  // 로컬 이력 자동 저장 — 결과 화면 진입 시 1회
  const autoSave = useAutoSaveCalculation({
    taxType: "comprehensive_property",
    inputData: formData as unknown as Record<string, unknown>,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: `${formData.assessmentYear || new Date().getFullYear()}-06-01`,
    clientId: activeClientId,
  });

  // 수동 저장 — 자동저장과 별개로 사용자가 원할 때 즉시 이력 저장(갱신)
  const [saveMessage, setSaveMessage] = useState<SaveToastMessage | null>(null);
  const recordCount = useRecordCount(result);
  const handleManualSave = async () => {
    setSaveMessage(null);
    try {
      const outcome = await runComprehensiveManualSave({
        form: formData as unknown as Record<string, unknown>,
        result,
        clientId: activeClientId ?? null,
      });
      setSaveMessage(formatComprehensiveSaveMessage(outcome, recordCount));
    } catch (e) {
      setSaveMessage(
        formatComprehensiveSaveMessage(e instanceof Error ? e : new Error(String(e)), recordCount),
      );
    }
  };

  // 이전 단계
  function handlePrev() {
    if (currentStep === 0) {
      router.push("/");
    } else if (result && currentStep === STEPS.length) {
      // 결과 화면 → 마지막 단계로
      setResult(null);
      setStep(STEPS.length - 1);
    } else {
      setStep(currentStep - 1);
    }
  }

  // 다음 단계 / 계산 실행
  async function handleNext() {
    setError(null);

    if (currentStep < STEPS.length - 1) {
      setStep(currentStep + 1);
      return;
    }

    // Step 5 (마지막 단계) — 자동 모드 필수 입력 validation (⑧ 동기화)
    const corporateClass = deriveCorporateClass(formData);
    // C-15: 법인 조건부 세부유형(민간건설임대·도시개발·사회적기업·공익법인) 요건 미응답 차단 (시행령 §4의4)
    if ((formData.taxpayerType ?? "individual") === "corporate") {
      const reqKey = requiredCorporateReqKey(formData.corporateHousingType);
      if (reqKey && formData[reqKey] === undefined) {
        setError("법인 세부 유형의 요건 충족 여부를 선택해주세요 (시행령 §4의4).");
        return;
      }
    }
    const isCorporateSpecial = corporateClass === "corporate_special";
    const capMode = formData.previousYearCapMode ?? "direct";
    if (!isCorporateSpecial && capMode === "auto") {
      // 당해 2주택+ = 주택별 직전공시(previousYearAutoHouseValues), 1주택 = 단일 합계
      const isMultiHouse = formData.properties.length > 1;
      const filledHouseValues = formData.previousYearAutoHouseValues.filter(
        (v) => v && v.trim() !== "" && v.trim() !== "0",
      ).length;
      if (isMultiHouse && filledHouseValues < formData.properties.length) {
        setError("자동 계산 모드에서는 직전연도 주택별 공시가격을 모두 입력해야 합니다.");
        return;
      }
      if (!isMultiHouse && !formData.previousYearAutoAssessedValue) {
        setError("자동 계산 모드에서는 직전연도 공시가격 합계를 입력해야 합니다.");
        return;
      }
    }

    // 사례6: 건물·부속토지 분리 시가표준액 검증 (⑧ — 분리 ON 시 시가표준액 미입력 침묵 누락 차단)
    const splitError = validateAppurtenantSplit(formData);
    if (splitError) {
      setError(splitError);
      return;
    }

    // 트랙 A: 다가구주택 면적안분 검증 (⑧ — multiFamilyEnabled ON 시 행·면적·합계 필수)
    const multiFamilyError = validateMultiFamily(formData);
    if (multiFamilyError) {
      setError(multiFamilyError);
      return;
    }

    // 토지 필지 모드 validation (⑧ — API/Zod와 동기화: UI 통과↔차단 모순 금지)
    const landError = validateLandParcels(formData);
    if (landError) {
      setError(landError);
      return;
    }

    // 마지막 단계 → 계산
    setLoading(true);
    try {
      const calcResult = await callComprehensiveApi(formData);
      setResult(calcResult);
      setStep(STEPS.length); // 결과 화면 step
    } catch (err) {
      setError(err instanceof Error ? err.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  // 결과 화면
  const showResult = currentStep === STEPS.length && result;

  return (
    <ProfessionalClientGate>
    <div className="mx-auto max-w-2xl px-4 py-8">
      {/* 헤더 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">종합부동산세 계산기</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          주택·토지 보유 현황 입력 → 합산배제 판정 → 세액 자동 계산
        </p>
      </div>

      {/* 결과 화면 */}
      {showResult ? (
        <div className="space-y-6">
          <div className="flex justify-end">
            <SaveButton onSave={handleManualSave} />
          </div>
          <ComprehensiveTaxResultView result={result} savedId={autoSave.savedId ?? undefined} />
          <LoginPromptBanner />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handlePrev}
              className="flex-1 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
            >
              수정하기
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
              }}
              className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              다시 계산
            </button>
          </div>
          <SaveToast message={saveMessage} onClose={() => setSaveMessage(null)} />
        </div>
      ) : (
        <div className="space-y-6">
          {/* 단계 표시 */}
          <StepIndicator
            steps={STEPS}
            current={currentStep}
            onStepClick={(i) => setStep(i)}
          />

          {/* 단계별 콘텐츠 */}
          {currentStep === 0 && <Step1Basic />}
          {currentStep === 1 && <Step2Properties />}
          {currentStep === 2 && <Step3Exclusion />}
          {currentStep === 3 && <Step4Land />}
          {currentStep === 4 && <Step5TaxCap />}

          {/* 오류 메시지 */}
          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* 네비게이션 */}
          <NavButtons
            step={currentStep}
            onPrev={handlePrev}
            onNext={handleNext}
            nextLabel={currentStep === STEPS.length - 1 ? "계산하기" : "다음"}
            loading={loading}
          />

          {/* 면책 배너 */}
          {currentStep === 0 && <DisclaimerBanner />}
        </div>
      )}
    </div>
    </ProfessionalClientGate>
  );
}
