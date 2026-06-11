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
import { CurrencyInput, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { callComprehensiveApi } from "@/lib/calc/comprehensive-api";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DateInput } from "@/components/ui/date-input";
import { PropertyListInput } from "@/components/calc/PropertyListInput";
import { ExclusionInfoInput } from "@/components/calc/ExclusionInfoInput";
import { ComprehensiveTaxResultView } from "@/components/calc/results/ComprehensiveTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { useComprehensiveWizardStore } from "@/lib/stores/comprehensive-wizard-store";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { runComprehensiveManualSave, formatComprehensiveSaveMessage } from "@/components/calc/comprehensive-tax-save-handler";
import { useRecordCount } from "@/components/calc/shared/save-handler-builders";
import { SaveButton } from "@/components/calc/shared/SaveButton";
import { SaveToast, type SaveToastMessage } from "@/components/calc/shared/SaveToast";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import {
  COMPREHENSIVE_SUPPORTED_YEARS,
  getComprehensiveParams,
} from "@/lib/tax-engine/data/comprehensive-historical";

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
// Step 1: 기본 정보
// ============================================================

// 연도별 세법 요약 힌트 카드
function YearLawHintCard({ year }: { year: number }) {
  const currentYear = new Date().getFullYear();
  const params = getComprehensiveParams(year);
  const hasMultiHouseCap = year < 2023;
  const isPreUnified = year < 2023;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-amber-900 space-y-1">
      <p className="font-semibold">
        {year} 귀속 적용 기준{isPreUnified ? " (개정 전 구법)" : ""}
        {year === currentYear ? (
          <span className="ml-1.5 rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
            현재
          </span>
        ) : null}
      </p>
      <p>
        기본공제: 일반 {formatKRW(params.basicDeductionGeneral)} / 1세대1주택{" "}
        {formatKRW(params.basicDeductionOneHouse)}
      </p>
      <p>
        공정시장가액비율 (주택분): {(params.fairMarketRatioHousing * 100).toFixed(0)}%
      </p>
      {isPreUnified ? (
        <p>
          세율: 일반(2주택 이하) 0.6%~3.0% / 다주택(조정2주택·3주택+) 1.2%~6.0%
          (종합부동산세법 §9① 구법)
        </p>
      ) : (
        <p>
          세율: 2주택 이하 0.5%~2.7% / 3주택 이상 12억 초과 중과 2.0%~5.0%
          (§9①2호 — 주택 수 자동 적용)
        </p>
      )}
      {hasMultiHouseCap ? (
        <p>
          세부담 상한: 일반 150% / 조정대상지역 2주택+ 또는 3주택+ 300%
          (§10② 구법)
        </p>
      ) : (
        <p>세부담 상한: 전년도 세액의 150% (§10)</p>
      )}
    </div>
  );
}

function Step1Basic() {
  const { formData, updateFormData, reset, setResult } = useComprehensiveWizardStore();
  const currentYear = new Date().getFullYear();
  const selectedYear = parseInt(formData.assessmentYear) || currentYear;
  // 지원 연도 상수(2021~2025)에 현재연도가 없으면 보강 — 매년 상수 갱신 없이 현재연도 선택 가능
  const supportedYears = (
    COMPREHENSIVE_SUPPORTED_YEARS as readonly number[]
  ).includes(currentYear)
    ? [...COMPREHENSIVE_SUPPORTED_YEARS]
    : [...COMPREHENSIVE_SUPPORTED_YEARS, currentYear];

  const params = getComprehensiveParams(selectedYear);
  // 법인 여부 파생 (dual-truth 금지 — 별도 isCorporate store 필드 없음)
  const isCorporate = formData.taxpayerType !== "individual";

  function handleYearChange(year: string) {
    updateFormData({ assessmentYear: year });
    setResult(null); // 과세연도 변경 시 기존 결과 무효화
  }

  function handleTaxpayerTypeToggle(v: string) {
    if (v === "corporate") {
      // 법인 선택 → corporate_special 기본 (하위 라디오에서 변경 가능)
      updateFormData({ taxpayerType: "corporate_special" });
    } else {
      updateFormData({ taxpayerType: "individual" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
        <ResetButton onReset={reset} />
      </div>
      {/* 과세연도 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">
          과세연도 <span className="text-destructive">*</span>
        </label>
        <RadioCardGroup
          name="assessmentYear"
          tone="sky"
          layout="inline"
          value={formData.assessmentYear as (typeof COMPREHENSIVE_SUPPORTED_YEARS)[number] extends number ? string : string}
          onChange={handleYearChange}
          options={supportedYears.map((y) => ({
            value: String(y),
            label: String(y),
            trailing:
              y === currentYear ? (
                <span className="rounded-full bg-sky-200 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                  현재
                </span>
              ) : undefined,
          }))}
        />
        <YearLawHintCard year={selectedYear} />
        <p className="text-xs text-muted-foreground">
          과세기준일: {formData.assessmentYear}-06-01 (종합부동산세법 §16①)
        </p>
      </div>

      {/* 납세의무자 유형 — [개인] [법인] */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">납세의무자 유형</label>
        <RadioCardGroup
          name="taxpayerTypeMain"
          tone="sky"
          layout="inline"
          value={isCorporate ? "corporate" : "individual"}
          onChange={handleTaxpayerTypeToggle}
          options={[
            { value: "individual", label: "개인" },
            { value: "corporate", label: "법인" },
          ]}
        />
      </div>

      {/* 법인 선택 시: 하위 법인 유형 RadioCardGroup + 안내 카드 */}
      {isCorporate && (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-4 space-y-3">
          <p className="text-xs font-semibold text-violet-800">법인 유형 선택</p>
          <RadioCardGroup
            name="taxpayerTypeCorporate"
            tone="violet"
            layout="stack"
            value={formData.taxpayerType}
            onChange={(v) =>
              updateFormData({
                taxpayerType: v as "corporate_special" | "corporate_general" | "corporate_public",
              })
            }
            options={[
              {
                value: "corporate_special",
                label: "일반 법인 — 단일세율 (§9②3호)",
                description: `기본공제 0원 · ${(params.corporateRate2HouseOrLess * 100).toFixed(1)}%/${(params.corporateRate3HouseOrMore * 100).toFixed(1)}% 비례세율 · 세부담상한 미적용`,
              },
              {
                value: "corporate_general",
                label: "공공주택사업자 등 (§9②1호 — 일반 누진세율)",
                description: "주택 수 무관 일반 누진세율 적용 · 세부담상한 적용",
              },
              {
                value: "corporate_public",
                label: "공익법인등 (§9②2호)",
                description: "주택 수 기준 일반/다주택 누진세율 · 세부담상한 적용",
              },
            ]}
          />
          <div className="rounded-md bg-violet-100/60 border border-violet-200 px-3 py-2 text-xs text-violet-900 space-y-0.5">
            <p className="font-semibold">§9②3호 법인 계산 특례</p>
            <p>기본공제: 0원 (§8①2호 — 법인 적용 없음)</p>
            <p>
              세율: 2주택 이하 {(params.corporateRate2HouseOrLess * 100).toFixed(1)}% /{" "}
              3주택 이상 (≤{selectedYear <= 2022 ? "2022 조정 2주택 포함" : "현행"}) {(params.corporateRate3HouseOrMore * 100).toFixed(1)}%
            </p>
            <p>세부담 상한: 미적용 (§10 단서)</p>
          </div>
        </div>
      )}

      {/* 개인 선택 시만 — 1세대1주택 여부 */}
      {!isCorporate && (
        <ToggleCard
          tone="sky"
          title="1세대 1주택자"
          description="기본공제 12억 적용 + 고령자·장기보유 세액공제 적용 (§8①1호, §9②)"
          checked={formData.isOneHouseOwner}
          onCheckedChange={(v) => updateFormData({ isOneHouseOwner: v })}
        >
          {/* 1세대1주택자 추가 정보 (ON 시 펼침) */}
          <p className="text-xs text-sky-700 font-medium">
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
        </ToggleCard>
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
      <ToggleCard
        tone="sky"
        title="종합합산 토지 보유 (§11)"
        description="나대지·잡종지 등 — 기본공제 5억원, 세율 1%~3%"
        checked={formData.hasAggregateLand}
        onCheckedChange={(v) => updateFormData({ hasAggregateLand: v })}
      >
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
  const taxpayerType = formData.taxpayerType ?? "individual";
  // corporate_special(§9②3호): 세부담상한 미적용 → 전년도 세액 입력 숨김
  const isCorporateSpecial = taxpayerType === "corporate_special";
  // corporate_general(§9②1호): 주택 수 무관 → 조정대상지역 2주택 토글 숨김
  const isCorporateGeneral = taxpayerType === "corporate_general";

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
        <div className="space-y-2">
          <CurrencyInput
            label="전년도 총세액 (선택)"
            value={formData.previousYearTotalTax}
            onChange={(v) => updateFormData({ previousYearTotalTax: v })}
            placeholder="0"
            hint="전년도 종합부동산세 + 재산세 합계 (농특세 제외). 미입력 시 세부담 상한 계산 생략."
          />
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
