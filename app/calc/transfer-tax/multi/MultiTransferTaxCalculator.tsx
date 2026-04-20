"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ArrowRight, Calculator, Plus, Home } from "lucide-react";
import { AssetTabBar } from "@/components/calc/transfer/AssetTabBar";
import { AggregateSettingsPanel } from "@/components/calc/transfer/AggregateSettingsPanel";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { StepIndicator } from "@/components/calc/StepIndicator";
import {
  useMultiTransferStore,
  generatePropertyId,
  type PropertyItem,
  type MultiStep,
} from "@/lib/stores/multi-transfer-tax-store";
import { useCalcWizardStore, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import {
  calcPropertyCompletion,
  validateMultiSettings,
  areAllPropertiesReady,
} from "@/lib/calc/multi-transfer-tax-validate";
import { saveCalculation } from "@/actions/calculations";
import TransferTaxCalculator from "../TransferTaxCalculator";

const STEPS: MultiStep[] = ["list", "edit", "settings", "result"];
const STEP_LABELS = ["자산 목록", "자산 편집", "공통 설정", "계산 결과"];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  housing: "주택",
  land: "토지",
  building: "건물",
  right_to_move_in: "입주권",
  presale_right: "분양권",
};

function makeDefaultForm(): TransferFormData {
  return {
    propertyType: "housing",
    isSuccessorRightToMoveIn: false,
    transferPrice: "",
    transferDate: "",
    filingDate: "",
    propertyAddressRoad: "",
    propertyAddressJibun: "",
    propertyBuildingName: "",
    propertyAddressDetail: "",
    propertyLongitude: "",
    propertyLatitude: "",
    acquisitionCause: "purchase",
    acquisitionPrice: "",
    acquisitionDate: "",
    decedentAcquisitionDate: "",
    donorAcquisitionDate: "",
    expenses: "0",
    useEstimatedAcquisition: false,
    standardPriceAtAcquisition: "",
    standardPriceAtTransfer: "",
    standardPriceAtAcquisitionLabel: "",
    standardPriceAtTransferLabel: "",
    isOneHousehold: true,
    householdHousingCount: "1",
    residencePeriodMonths: "0",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    reductionType: "",
    farmingYears: "0",
    rentalYears: "0",
    rentIncreaseRate: "5",
    reductionRegion: "metropolitan",
    expropriationCash: "",
    expropriationBond: "",
    expropriationBondHoldingYears: "none",
    expropriationApprovalDate: "",
    annualBasicDeductionUsed: "0",
    temporaryTwoHouseSpecial: false,
    previousHouseAcquisitionDate: "",
    newHouseAcquisitionDate: "",
    marriageDate: "",
    parentalCareMergeDate: "",
    nblLandType: "",
    nblLandArea: "",
    nblZoneType: "",
    nblFarmingSelf: false,
    nblFarmerResidenceDistance: "",
    nblBusinessUsePeriods: [],
    houses: [],
    sellingHouseRegion: "capital",
    acquisitionMethod: "actual",
    appraisalValue: "",
    isSelfBuilt: false,
    buildingType: "",
    constructionDate: "",
    extensionFloorArea: "",
    enablePenalty: false,
    filingType: "none",
    penaltyReason: "normal",
    priorPaidTax: "0",
    originalFiledTax: "0",
    excessRefundAmount: "0",
    interestSurcharge: "0",
    unpaidTax: "0",
    paymentDeadline: "",
    actualPaymentDate: "",
    pre1990Enabled: false,
    pre1990AreaSqm: "",
    pre1990PricePerSqm_1990: "",
    pre1990PricePerSqm_atTransfer: "",
    pre1990Grade_current: "",
    pre1990Grade_prev: "",
    pre1990Grade_atAcq: "",
    pre1990GradeMode: "number",
  };
}

// ─── Step A: 자산 목록 ────────────────────────────────────────

interface StepListProps {
  properties: PropertyItem[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onNext: () => void;
  onReset: () => void;
}

function StepList({ properties, onAdd, onEdit, onDuplicate, onRemove, onNext, onReset }: StepListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          동일 과세연도에 양도하는 모든 자산을 추가하세요. 최대 20건까지 입력 가능합니다.
        </p>
        <ResetButton onReset={onReset} />
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">아직 추가된 자산이 없습니다.</p>
          <Button type="button" onClick={onAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            첫 번째 양도 건 추가
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {properties.map((p, i) => (
            <Card key={p.propertyId} className="hover:border-primary/50 transition-colors">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{p.propertyLabel}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">
                      {PROPERTY_TYPE_LABELS[p.form.propertyType] ?? p.form.propertyType}
                    </Badge>
                    {p.form.transferDate && (
                      <span className="text-xs text-muted-foreground">
                        양도일: {p.form.transferDate}
                      </span>
                    )}
                    <Badge
                      variant={p.completionPercent >= 80 ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {p.completionPercent}%
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => onEdit(i)}>
                    편집
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDuplicate(i)}
                    title="복제"
                  >
                    복제
                  </Button>
                  {properties.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onRemove(i)}
                    >
                      삭제
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}

          {properties.length < 20 && (
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 border-dashed"
              onClick={onAdd}
            >
              <Plus className="h-4 w-4" />
              양도 건 추가
            </Button>
          )}
        </div>
      )}

      {properties.length > 0 && !areAllPropertiesReady(properties) && (
        <Alert>
          <AlertDescription className="text-sm">
            일부 자산의 필수 정보가 입력되지 않았습니다. 모든 자산을 편집하여 필수 항목을 완성해 주세요.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-4">
        <Button type="button" variant="ghost" onClick={() => window.history.back()} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          이전
        </Button>
        <Button
          type="button"
          disabled={properties.length === 0}
          onClick={onNext}
          className="gap-2"
        >
          공통 설정으로
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step B: 자산 편집 (기존 단건 마법사 재사용) ─────────────

interface StepEditProps {
  properties: PropertyItem[];
  activeIndex: number;
  onSelectProperty: (i: number) => void;
  onDuplicate: (i: number) => void;
  onRemove: (i: number) => void;
  onSaveAndBack: () => void;
  onAdd: () => void;
}

function StepEdit({
  properties,
  activeIndex,
  onSelectProperty,
  onDuplicate,
  onRemove,
  onSaveAndBack,
  onAdd,
}: StepEditProps) {
  return (
    <div className="space-y-4">
      {/* 자산 탭바 */}
      <AssetTabBar
        properties={properties}
        activeIndex={activeIndex}
        onSelect={onSelectProperty}
        onAdd={onAdd}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
      />

      <div className="border rounded-lg p-1 bg-muted/20">
        {/* 기존 단건 마법사 재사용 */}
        <TransferTaxCalculator />
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="ghost" onClick={onSaveAndBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          자산 목록으로
        </Button>
      </div>
    </div>
  );
}

// ─── Step C: 공통 설정 ────────────────────────────────────────
// AggregateSettingsPanel 재사용 (별도 파일)

// ─── 메인 컴포넌트 ─────────────────────────────────────────────

export default function MultiTransferTaxCalculator() {
  const router = useRouter();
  const {
    form,
    result,
    isCalculating,
    setForm,
    addProperty,
    updateProperty,
    removeProperty,
    duplicateProperty,
    setActiveProperty,
    setStep,
    setResult,
    setIsCalculating,
    reset: resetMulti,
  } = useMultiTransferStore();

  const {
    updateFormData,
    setStep: setWizardStep,
    reset: resetWizard,
  } = useCalcWizardStore();

  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const activeStepIndex = STEPS.indexOf(form.activeStep);

  // 자산 추가 및 편집 모드 진입
  const handleAddProperty = useCallback(() => {
    const newId = generatePropertyId();
    const newItem: PropertyItem = {
      propertyId: newId,
      propertyLabel: `양도 ${form.properties.length + 1}번`,
      form: makeDefaultForm(),
      completionPercent: 0,
    };
    addProperty(newItem);
    const newIndex = form.properties.length;
    setActiveProperty(newIndex);
    syncToWizardStore(newItem.form);
    setStep("edit");
  }, [form.properties.length, addProperty, setActiveProperty, setStep]);

  const syncToWizardStore = useCallback(
    (propertyForm: TransferFormData) => {
      resetWizard();
      updateFormData(propertyForm);
      setWizardStep(0);
    },
    [resetWizard, updateFormData, setWizardStep],
  );

  const handleEditProperty = useCallback(
    (index: number) => {
      setActiveProperty(index);
      const property = form.properties[index];
      if (property) {
        syncToWizardStore(property.form);
      }
      setStep("edit");
    },
    [form.properties, setActiveProperty, syncToWizardStore, setStep],
  );

  // 편집 완료 — calc-wizard-store의 현재 formData를 multi-store에 반영
  const handleSaveAndBack = useCallback(() => {
    const wizardForm = useCalcWizardStore.getState().formData;
    const completion = calcPropertyCompletion(wizardForm);
    updateProperty(form.activePropertyIndex, {
      form: wizardForm,
      completionPercent: completion,
    });
    resetWizard(); // wizard 상태를 step 0으로 초기화
    setStep("list");
  }, [form.activePropertyIndex, updateProperty, resetWizard, setStep]);

  // 마법사 마지막 단계에서 호출 — 현재 자산 저장 후 새 자산 추가 (step 0으로 리셋)
  const handleSaveAndAddNext = useCallback(() => {
    const wizardForm = useCalcWizardStore.getState().formData;
    const completion = calcPropertyCompletion(wizardForm);
    updateProperty(form.activePropertyIndex, {
      form: wizardForm,
      completionPercent: completion,
    });
    handleAddProperty();
  }, [form.activePropertyIndex, updateProperty, handleAddProperty]);

  // 마법사 마지막 단계에서 호출 — 현재 자산 저장 후 공통 설정 단계로 이동
  const handleSaveAndGoToSettings = useCallback(() => {
    const wizardForm = useCalcWizardStore.getState().formData;
    const completion = calcPropertyCompletion(wizardForm);
    updateProperty(form.activePropertyIndex, {
      form: wizardForm,
      completionPercent: completion,
    });
    resetWizard();
    setStep("settings");
  }, [form.activePropertyIndex, updateProperty, resetWizard, setStep]);

  // 진입 시 자산이 0개면 자동으로 첫 자산 추가 → 즉시 마법사 step 0으로 이동
  useEffect(() => {
    if (form.properties.length === 0 && form.activeStep === "list") {
      handleAddProperty();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectPropertyInEdit = useCallback(
    (index: number) => {
      // 현재 편집 내용 저장
      const wizardForm = useCalcWizardStore.getState().formData;
      const completion = calcPropertyCompletion(wizardForm);
      updateProperty(form.activePropertyIndex, {
        form: wizardForm,
        completionPercent: completion,
      });
      // 새 자산으로 전환
      setActiveProperty(index);
      const property = form.properties[index];
      if (property) {
        syncToWizardStore(property.form);
      }
    },
    [form.activePropertyIndex, form.properties, updateProperty, setActiveProperty, syncToWizardStore],
  );

  // 계산 실행
  const handleCalculate = async () => {
    setError(null);
    const validationError = validateMultiSettings(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsCalculating(true);
    try {
      const res = await callMultiTransferTaxAPI(form, form.properties);
      setResult(res);
      setStep("result");

      // 로그인 시 이력 저장
      try {
        if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
          const { createClient } = await import("@/lib/supabase/client");
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            setIsLoggedIn(true);
            const saveRes = await saveCalculation({
              taxType: "transfer_multi",
              inputData: {
                taxYear: form.taxYear,
                properties: form.properties.map((p) => ({
                  propertyId: p.propertyId,
                  propertyLabel: p.propertyLabel,
                })),
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              resultData: res as unknown as Record<string, any>,
              taxLawVersion: "2024",
            });
            if (saveRes.id) setSavedId(saveRes.id);
          }
        }
      } catch {
        // 이력 저장 실패는 무시
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "계산 중 오류가 발생했습니다.");
    } finally {
      setIsCalculating(false);
    }
  };

  const goToStep = (step: MultiStep) => {
    if (step === "edit" && form.activeStep !== "edit") {
      // 목록에서 편집으로 가는 경우는 handleEditProperty 사용
      return;
    }
    setStep(step);
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* 헤더 */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => router.push("/")} className="hover:text-foreground flex items-center gap-1">
            <Home className="h-3.5 w-3.5" />
            홈
          </button>
          <span>/</span>
          <button onClick={() => router.push("/calc/transfer-tax")} className="hover:text-foreground">
            양도소득세
          </button>
          <span>/</span>
          <span className="text-foreground">다건 동시 양도</span>
        </div>
        <h1 className="text-2xl font-bold">양도소득세 다건 동시 양도 계산</h1>
        <p className="text-sm text-muted-foreground">
          같은 과세연도에 여러 자산을 양도하는 경우, 양도차손 통산 및 비교과세를 적용하여 정확한 세액을 산출합니다.
        </p>
      </div>

      {/* 단계 표시 */}
      {form.activeStep !== "edit" && (
        <StepIndicator
          steps={["자산 목록", "공통 설정", "계산 결과"]}
          current={
            form.activeStep === "list"
              ? 0
              : form.activeStep === "settings"
              ? 1
              : 2
          }
        />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step A: 자산 목록 */}
      {form.activeStep === "list" && (
        <Card>
          <CardHeader>
            <CardTitle>양도 자산 목록</CardTitle>
          </CardHeader>
          <CardContent>
            <StepList
              properties={form.properties}
              onAdd={handleAddProperty}
              onEdit={handleEditProperty}
              onDuplicate={(i) => duplicateProperty(i)}
              onRemove={(i) => removeProperty(i)}
              onNext={() => setStep("settings")}
              onReset={() => {
                resetMulti();
                resetWizard();
                setError(null);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Step B: 자산 편집 */}
      {form.activeStep === "edit" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSaveAndBack}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              자산 목록으로
            </Button>
            <span className="text-sm text-muted-foreground">
              편집 중: {form.properties[form.activePropertyIndex]?.propertyLabel}
            </span>
          </div>

          <AssetTabBar
            properties={form.properties}
            activeIndex={form.activePropertyIndex}
            onSelect={handleSelectPropertyInEdit}
            onAdd={handleAddProperty}
            onDuplicate={(i) => duplicateProperty(i)}
            onRemove={(i) => removeProperty(i)}
          />

          <TransferTaxCalculator
            onSaveAndAddNext={handleSaveAndAddNext}
            onSaveAndGoToSettings={handleSaveAndGoToSettings}
          />
        </div>
      )}

      {/* Step C: 공통 설정 */}
      {form.activeStep === "settings" && (
        <Card>
          <CardHeader>
            <CardTitle>공통 설정</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <AggregateSettingsPanel form={form} onChange={setForm} />

            <div className="flex justify-between pt-4 border-t">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep("list")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                자산 목록으로
              </Button>
              <Button
                type="button"
                onClick={handleCalculate}
                disabled={isCalculating}
                className="gap-2"
              >
                <Calculator className="h-4 w-4" />
                {isCalculating ? "계산 중..." : "세액 계산"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step D: 결과 */}
      {form.activeStep === "result" && result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep("settings")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              설정으로 돌아가기
            </Button>
            {savedId && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => router.push(`/result/${savedId}`)}
              >
                이력에서 보기
              </Button>
            )}
          </div>

          <MultiTransferTaxResultView
            result={result}
            properties={form.properties}
            taxYear={form.taxYear}
            isLoggedIn={isLoggedIn}
            savedId={savedId}
          />
        </div>
      )}

      <DisclaimerBanner />
    </div>
  );
}
