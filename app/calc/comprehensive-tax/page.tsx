"use client";

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
import { useRouter } from "next/navigation";
import { StepIndicator } from "@/components/calc/StepIndicator";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";
import { PropertyListInput } from "@/components/calc/PropertyListInput";
import { ExclusionInfoInput } from "@/components/calc/ExclusionInfoInput";
import { ComprehensiveTaxResultView } from "@/components/calc/results/ComprehensiveTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";

// ============================================================
// 상수
// ============================================================

const STEPS = ["기본 정보", "주택 목록", "합산배제", "토지 정보", "세부담 상한"];

// 임대주택 합산배제 유형 (rentalInfo 필드 구성에 사용)
const RENTAL_TYPES = new Set([
  "private_construction_rental",
  "private_purchase_rental_long",
  "private_purchase_rental_short",
  "public_support_rental",
  "public_construction_rental",
  "public_purchase_rental",
]);

// 기타 합산배제 유형 (otherInfo 필드 구성에 사용)
const OTHER_INFO_TYPES = new Set([
  "unsold_housing",
  "daycare_housing",
  "employee_housing",
]);

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
// Step 1: 기본 정보
// ============================================================

function Step1Basic() {
  const { formData, updateFormData, reset } = useComprehensiveWizardStore();

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ResetButton onReset={reset} />
      </div>
      {/* 과세연도 */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium">
          과세연도 <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          inputMode="numeric"
          value={formData.assessmentYear}
          onChange={(e) =>
            updateFormData({ assessmentYear: e.target.value.replace(/\D/g, "").slice(0, 4) })
          }
          placeholder="2024"
          maxLength={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground">
          과세기준일: {formData.assessmentYear}-06-01 (종합부동산세법 §16①)
        </p>
      </div>

      {/* 1세대1주택 여부 */}
      <div className="rounded-md border p-4 space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="one-house-owner"
            checked={formData.isOneHouseOwner}
            onChange={(e) => updateFormData({ isOneHouseOwner: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="one-house-owner" className="text-sm font-medium cursor-pointer">
            1세대 1주택자
          </label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          기본공제 12억 적용 + 고령자·장기보유 세액공제 적용 (§8③, §9②)
        </p>
      </div>

      {/* 1세대1주택자 추가 정보 */}
      {formData.isOneHouseOwner && (
        <div className="rounded-md bg-blue-50/50 border border-blue-100 p-4 space-y-4">
          <p className="text-xs text-blue-700 font-medium">
            1세대1주택자 세액공제 적용을 위한 추가 정보
          </p>

          {/* 생년월일 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              생년월일 (고령자 세액공제용)
            </label>
            <DateInput
              value={formData.birthDate}
              onChange={(v) => updateFormData({ birthDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              만 60세 이상: 20%, 65세: 30%, 70세: 40% (최대 80% 합산)
            </p>
          </div>

          {/* 최초 취득일 */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">
              최초 취득일 (장기보유 세액공제용)
            </label>
            <DateInput
              value={formData.acquisitionDate}
              onChange={(v) => updateFormData({ acquisitionDate: v })}
            />
            <p className="text-xs text-muted-foreground">
              5년 이상: 20%, 10년: 40%, 15년: 50% (고령자공제 합산 최대 80%)
            </p>
          </div>
        </div>
      )}
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
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="has-aggregate-land"
            checked={formData.hasAggregateLand}
            onChange={(e) => updateFormData({ hasAggregateLand: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="has-aggregate-land" className="text-sm font-medium cursor-pointer">
            종합합산 토지 보유 (§11)
          </label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          나대지·잡종지 등 — 기본공제 5억원, 세율 1%~3%
        </p>

        {formData.hasAggregateLand && (
          <div className="rounded-md border p-4 space-y-4 ml-7">
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
          </div>
        )}
      </section>

      <hr className="border-muted" />

      {/* 별도합산 토지 */}
      <section className="space-y-3">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="has-separate-land"
            checked={formData.hasSeparateLand}
            onChange={(e) => updateFormData({ hasSeparateLand: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <label htmlFor="has-separate-land" className="text-sm font-medium cursor-pointer">
            별도합산 토지 보유 (§12)
          </label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          사업용 건축물 부속 토지 등 — 기본공제 80억원, 세율 0.5%~0.7%
        </p>

        {formData.hasSeparateLand && (
          <div className="space-y-3 ml-7">
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
      </section>
    </div>
  );
}

// ============================================================
// Step 5: 세부담 상한
// ============================================================

function Step5TaxCap() {
  const { formData, updateFormData } = useComprehensiveWizardStore();

  return (
    <div className="space-y-6">
      {/* 다주택 조정대상지역 */}
      <div className="rounded-md border p-4 space-y-2">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="multi-house-adjusted"
            checked={formData.isMultiHouseInAdjustedArea}
            onChange={(e) =>
              updateFormData({ isMultiHouseInAdjustedArea: e.target.checked })
            }
            className="h-4 w-4 rounded border-input"
          />
          <label
            htmlFor="multi-house-adjusted"
            className="text-sm font-medium cursor-pointer"
          >
            조정대상지역 2주택 이상
          </label>
        </div>
        <p className="text-xs text-muted-foreground pl-7">
          체크 시 세부담 상한율 300% 적용, 미체크 시 150% 적용 (§10)
        </p>
      </div>

      {/* 전년도 세액 */}
      <div className="space-y-2">
        <CurrencyInput
          label="전년도 총세액 (선택)"
          value={formData.previousYearTotalTax}
          onChange={(v) => updateFormData({ previousYearTotalTax: v })}
          placeholder="0"
          hint="전년도 종합부동산세 + 재산세 합계 (농특세 제외). 미입력 시 세부담 상한 계산 생략."
        />
        <div className="rounded-md bg-muted/30 border px-4 py-3 text-xs text-muted-foreground">
          <p className="font-medium mb-1">세부담 상한 계산 방식 (§10)</p>
          <p>
            상한액 = 전년도 세액 × 상한율 (150% 또는 300%)
          </p>
          <p className="mt-1">
            당해 종부세가 상한액을 초과하면 상한액 - 재산세 = 확정 종부세
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// API 호출 및 데이터 변환
// ============================================================

// store의 exclusionType → validator의 registrationType 매핑
// (임대주택 합산배제 신청 시 UI 선택값을 API 검증 스키마 값으로 변환)
function toRegistrationType(exclusionType: string): string {
  const map: Record<string, string> = {
    private_construction_rental: "private_construction",
    private_purchase_rental_long: "private_purchase_long",
    private_purchase_rental_short: "private_purchase_short",
    public_support_rental: "public_support",
    public_construction_rental: "public_construction",
    public_purchase_rental: "public_purchase",
  };
  return map[exclusionType] ?? "private_purchase_long";
}

async function callComprehensiveApi(
  formData: ReturnType<typeof useComprehensiveWizardStore.getState>["formData"],
): Promise<ComprehensiveTaxResult> {

  const properties = formData.properties.map((p) => {
    const base = {
      propertyId: p.id,
      assessedValue: parseAmount(p.assessedValue),
      area: p.area ? parseFloat(p.area) : undefined,
      location: p.location,
      exclusionType: p.exclusionType !== "none" ? p.exclusionType : undefined,
    };

    // 임대주택 합산배제 상세
    if (RENTAL_TYPES.has(p.exclusionType)) {
      const registrationType = p.rentalRegistrationType || toRegistrationType(p.exclusionType);
      return {
        ...base,
        rentalInfo: {
          registrationType,
          rentalRegistrationDate: p.rentalRegistrationDate || `${formData.assessmentYear}-01-01`,
          rentalStartDate: p.rentalStartDate || `${formData.assessmentYear}-01-01`,
          assessedValue: base.assessedValue,
          area: p.area ? parseFloat(p.area) : 60,
          location: p.location,
          previousRent: p.previousRent ? parseAmount(p.previousRent) : undefined,
          currentRent: parseAmount(p.currentRent),
          isInitialContract: p.isInitialContract,
        },
      };
    }

    // 기타 합산배제 상세
    if (OTHER_INFO_TYPES.has(p.exclusionType)) {
      return {
        ...base,
        otherInfo: {
          recruitmentNoticeDate: p.recruitmentNoticeDate || undefined,
          acquisitionDate: p.acquisitionDate || undefined,
          isFirstSale: p.isFirstSale,
          hasDaycarePermit: p.hasDaycarePermit,
          isActuallyUsedAsDaycare: p.isActuallyUsedAsDaycare,
          isProvidedToEmployee: p.isProvidedToEmployee,
          rentalFeeRate: p.rentalFeeRate ? parseFloat(p.rentalFeeRate) / 100 : undefined,
        },
      };
    }

    return base;
  });

  // 종합합산 토지
  const landAggregate =
    formData.hasAggregateLand && parseAmount(formData.landAggregate.totalOfficialValue) > 0
      ? {
          totalOfficialValue: parseAmount(formData.landAggregate.totalOfficialValue),
          propertyTaxBase: parseAmount(formData.landAggregate.propertyTaxBase),
          propertyTaxAmount: parseAmount(formData.landAggregate.propertyTaxAmount),
          previousYearTotalTax: formData.landAggregate.previousYearTotalTax
            ? parseAmount(formData.landAggregate.previousYearTotalTax) || undefined
            : undefined,
        }
      : undefined;

  // 별도합산 토지
  const landSeparate =
    formData.hasSeparateLand && formData.landSeparate.length > 0
      ? formData.landSeparate
          .filter((l) => parseAmount(l.publicPrice) > 0)
          .map((l) => ({
            landId: l.id,
            publicPrice: parseAmount(l.publicPrice),
            propertyTaxBase: parseAmount(l.propertyTaxBase),
            propertyTaxAmount: parseAmount(l.propertyTaxAmount),
          }))
      : undefined;

  const body = {
    assessmentYear: parseInt(formData.assessmentYear) || new Date().getFullYear(),
    isOneHouseOwner: formData.isOneHouseOwner,
    birthDate: formData.birthDate || undefined,
    acquisitionDate: formData.acquisitionDate || undefined,
    isMultiHouseInAdjustedArea: formData.isMultiHouseInAdjustedArea || undefined,
    previousYearTotalTax: formData.previousYearTotalTax
      ? parseAmount(formData.previousYearTotalTax) || undefined
      : undefined,
    properties,
    landAggregate,
    landSeparate,
  };

  const res = await fetch("/api/calc/comprehensive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error?.message ?? "계산 요청 실패");
  }
  return json.data as ComprehensiveTaxResult;
}

// ============================================================
// 메인 페이지
// ============================================================

export default function ComprehensiveTaxPage() {
  const router = useRouter();
  const { currentStep, setStep, formData, setResult, result, reset } =
    useComprehensiveWizardStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <ComprehensiveTaxResultView result={result} />
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
        </div>
      ) : (
        <div className="space-y-6">
          {/* 단계 표시 */}
          <StepIndicator steps={STEPS} current={currentStep} />

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
  );
}
