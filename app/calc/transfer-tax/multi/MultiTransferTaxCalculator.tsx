"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, ArrowRight, Calculator, Plus, ChevronLeft } from "lucide-react";
import { AssetTabBar } from "@/components/calc/transfer/AssetTabBar";
import { AggregateSettingsPanel } from "@/components/calc/transfer/AggregateSettingsPanel";
import { AmendmentBlock } from "@/components/calc/transfer/AmendmentBlock";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { ResetButton } from "@/components/calc/shared/ResetButton";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { StepIndicator } from "@/components/calc/StepIndicator";
import {
  useMultiTransferStore,
  generatePropertyId,
  type PropertyItem,
  type MultiStep,
} from "@/lib/stores/multi-transfer-tax-store";
import {
  useCalcWizardStore,
  createDefaultTransferFormData,
  type TransferFormData,
} from "@/lib/stores/calc-wizard-store";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { useResetOnNewParam } from "@/lib/hooks/use-reset-on-new-param";
import {
  calcPropertyCompletion,
  validateMultiSettings,
  areAllPropertiesReady,
} from "@/lib/calc/multi-transfer-tax-validate";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import TransferTaxCalculator from "../TransferTaxCalculator";
import { MultiTransferHistoryLoadModal } from "@/components/calc/transfer/MultiTransferHistoryLoadModal";
import {
  buildPropertyFromSingleRecord,
  buildPropertiesFromMultiRecord,
  isBlankProperty,
  backfillPriorPaid,
} from "@/lib/calc/transfer-multi-load-entry";
import type { CalculationRecord } from "@/lib/storage/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STEPS: MultiStep[] = ["list", "edit", "settings", "result"];
const STEP_LABELS = ["자산 목록", "자산 편집", "공통 설정", "계산 결과"];

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  housing: "주택",
  land: "토지",
  building: "건물",
  right_to_move_in: "입주권",
  presale_right: "분양권",
};


// ─── Step A: 자산 목록 ────────────────────────────────────────

interface StepListProps {
  properties: PropertyItem[];
  onAdd: () => void;
  onLoad: () => void;
  onEdit: (index: number) => void;
  onRemove: (index: number) => void;
  onNext: () => void;
  onPrev: () => void;
  onReset: () => void;
}

function StepList({ properties, onAdd, onLoad, onEdit, onRemove, onNext, onPrev, onReset }: StepListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          동일 과세연도에 양도하는 모든 자산을 추가하세요. 최대 20건까지 입력 가능합니다.
        </p>
        <div className="flex items-center gap-2">
          <HomeButton confirmMessage="홈으로 이동하면 현재 입력 중인 값이 유지된 채 페이지를 떠납니다.&#10;계속하시겠습니까?" />
          <ResetButton onReset={onReset} />
        </div>
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 border-2 border-dashed border-border rounded-lg">
          <p className="text-muted-foreground text-sm">아직 추가된 자산이 없습니다.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" onClick={onAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              첫 번째 양도 건 추가
            </Button>
            <Button type="button" variant="outline" onClick={onLoad} data-testid="multi-load-history-btn" className="gap-2">
              📂 이력에서 불러오기
            </Button>
          </div>
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
                      {PROPERTY_TYPE_LABELS[p.form.assets[0]?.assetKind ?? ""] ?? p.form.assets[0]?.assetKind ?? ""}
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 gap-2 border-dashed"
                onClick={onAdd}
              >
                <Plus className="h-4 w-4" />
                양도 건 추가
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={onLoad}
                data-testid="multi-load-history-btn"
              >
                📂 이력에서 불러오기
              </Button>
            </div>
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
        <Button type="button" variant="ghost" onClick={onPrev} className="gap-2">
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
  onRemove: (i: number) => void;
  onSaveAndBack: () => void;
  onAdd: () => void;
}

function StepEdit({
  properties,
  activeIndex,
  onSelectProperty,
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

  // 홈 카드(?new=1) 진입 = 새 계산 → multi(properties)·단건(작업영역) store 둘 다 초기화.
  // 다른 mount useEffect보다 앞에 둬 잔존 properties 1틱 노출 방지 (계획서 §5-3).
  useResetOnNewParam(
    useCallback(() => {
      resetMulti();
      resetWizard();
    }, [resetMulti, resetWizard]),
  );

  const [error, setError] = useState<string | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [pendingMultiRecord, setPendingMultiRecord] = useState<CalculationRecord | null>(null);

  const { activeClientId } = useProfessionalStore();

  // 이력 불러오기 (Phase 2) — 이미 로드한 record id 집합(중복 경고)
  const existingSourceIds = useMemo(
    () => new Set(form.properties.map((p) => p.sourceCalculationId).filter(Boolean) as string[]),
    [form.properties],
  );

  // 단건 이력 → 자산 1건 append. 빈(미입력) 자산은 정리.
  // 기납부세액은 신고일 필터(§111③, computeAutoPriorPaid)로 미편집 시 자동 파생 — 여기서 누적하지 않음.
  const handleLoadSingle = useCallback(
    (record: CalculationRecord) => {
      const kept = form.properties.filter((p) => !isBlankProperty(p));
      const newProp = buildPropertyFromSingleRecord(record, `양도 ${kept.length + 1}번`);
      setForm({ properties: [...kept, newProp], activeStep: "list" });
    },
    [form.properties, setForm],
  );

  // 다건 이력 → 세션 전체 replace. 다건 record는 aggregate 결과만이라 자산별 예정세액 부재
  // → 기납부세액 auto-fill 없음(0, 사용자 수동확정). 계획서 §7-2.
  const doLoadMulti = useCallback(
    (record: CalculationRecord) => {
      setForm({
        properties: buildPropertiesFromMultiRecord(record),
        activeStep: "settings",
        activePropertyIndex: 0,
      });
    },
    [setForm],
  );

  // 다건 replace는 기존 입력·편집값 있으면 폐기 확인(Dialog, native confirm 금지)
  const handleLoadMulti = useCallback(
    (record: CalculationRecord) => {
      const hasRealData =
        form.properties.some((p) => !isBlankProperty(p)) || form.priorPaidTaxEdited;
      if (hasRealData) setPendingMultiRecord(record);
      else doLoadMulti(record);
    },
    [form.properties, form.priorPaidTaxEdited, doLoadMulti],
  );

  // 로컬 IndexedDB 자동저장 — 다건 양도세 결과를 transfer로 통합 저장(계획서 §4-0).
  // Supabase 저장(아래 handleCalculate)과 병행 — 트랙 B에서 Supabase만 제거 예정.
  // [B0] 전체 MultiTransferFormData를 저장 — 이력에서 다건 수정신고·경정청구 재진입 시
  // 모든 자산 폼(properties[].form)을 hydrate하려면 stub이 아닌 전체 폼이 필요(계획서 §Track B).
  const autoSaveInput = useMemo(
    () => ({ __multiTransfer: true, ...form }),
    [form],
  );
  useAutoSaveCalculation({
    taxType: "transfer",
    inputData: autoSaveInput,
    resultData: result ? (result as unknown as Record<string, unknown>) : null,
    taxLawVersion: String(form.taxYear),
    clientId: activeClientId,
  });

  const activeStepIndex = STEPS.indexOf(form.activeStep);

  // 자산 추가 및 편집 모드 진입
  const handleAddProperty = useCallback(() => {
    const newId = generatePropertyId();
    const newItem: PropertyItem = {
      propertyId: newId,
      propertyLabel: `양도 ${form.properties.length + 1}번`,
      form: createDefaultTransferFormData(),
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
  // result는 partialize 제외 → 재진입 시 null. activeStep="result"+result=null 이면 settings로 복구
  // 단건 계산기 → 다건 진입 흐름은 호출자(TransferTaxCalculator.handleContinueToMulti)가 properties 채우고
  // activeStep="edit", activePropertyIndex=1 으로 세팅한 채 라우팅하므로 여기서 별도 분기 불필요.
  // 단, activeStep="edit"으로 진입했는데 wizard store가 아직 해당 자산 form과 동기화되지 않았을 수 있어
  // 활성 자산의 form을 wizard로 한 번 끌어온다.
  useEffect(() => {
    if (form.activeStep === "result" && !result) {
      setStep(form.properties.length > 0 ? "settings" : "list");
      return;
    }
    if (form.activeStep === "edit" && form.properties[form.activePropertyIndex]) {
      const wizardForm = useCalcWizardStore.getState().formData;
      const targetForm = form.properties[form.activePropertyIndex].form;
      if (wizardForm !== targetForm) {
        syncToWizardStore(targetForm);
      }
      return;
    }
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
      // 기납부세액(§111③) self-heal — 예정세액 미포착 자산(구세션·구 저장분)을 이력에서 backfill
      const properties = form.priorPaidTaxEdited
        ? form.properties
        : await backfillPriorPaid(form.properties);
      if (properties !== form.properties && properties.some((p, i) => p !== form.properties[i])) {
        setForm({ properties });
      }
      const res = await callMultiTransferTaxAPI(form, properties);
      setResult(res);
      setStep("result");
      // 이력 저장은 로컬 IndexedDB(useAutoSaveCalculation)에서 처리 — 서버 저장 제거(로컬 일원화)
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
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-6">
      {/* 헤더 */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => router.push("/")} className="hover:text-foreground flex items-center gap-1">
            <ChevronLeft className="h-3.5 w-3.5" />
            홈으로
          </button>
          <span>/</span>
          <button onClick={() => router.push("/calc/transfer-tax")} className="hover:text-foreground">
            양도소득세
          </button>
          <span>/</span>
          <span className="text-foreground">연간 합산 과세</span>
        </div>
        <h1 className="text-2xl font-bold">양도소득세 연간 합산 과세 계산</h1>
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
          onStepClick={(i) => {
            const target: MultiStep = i === 0 ? "list" : i === 1 ? "settings" : "result";
            setStep(target);
          }}
        />
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="whitespace-pre-wrap break-words">
            {error}
          </AlertDescription>
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
              onLoad={() => setLoadModalOpen(true)}
              onEdit={handleEditProperty}
              onRemove={(i) => removeProperty(i)}
              onNext={() => setStep("settings")}
              onPrev={() => router.push("/")}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLoadModalOpen(true)}
              data-testid="multi-load-history-btn"
              className="ml-auto gap-1"
            >
              📂 이력에서 불러오기
            </Button>
          </div>

          <AssetTabBar
            properties={form.properties}
            activeIndex={form.activePropertyIndex}
            onSelect={handleSelectPropertyInEdit}
            onAdd={handleAddProperty}
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

            {/* [B2] 신고서 단위 수정신고·경정청구 — 이력에서 진입 시(amendmentMode) 노출.
                AmendmentBlock은 단건 TransferFormData 컨트롤드 → 동일 필드명 캐스팅 재사용(UI설계 B2). */}
            {form.amendmentMode && (
              <div className="space-y-3">
                <div
                  className={
                    form.correctionKind === "refund_claim"
                      ? "rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-800 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-200"
                      : "rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                  }
                >
                  {form.correctionKind === "refund_claim"
                    ? "📄 경정청구 작성 중 — 당초 신고 기준을 불러왔습니다. 과다신고 항목(양도가액·취득가액·필요경비)을 정정하세요."
                    : "📄 수정신고 작성 중 — 당초 신고 기준을 불러왔습니다. 정정할 항목을 수정하세요."}
                </div>
                <AmendmentBlock
                  form={form as unknown as TransferFormData}
                  onChange={(d) => setForm(d as unknown as Parameters<typeof setForm>[0])}
                />
              </div>
            )}

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
          </div>

          <MultiTransferTaxResultView
            result={result}
            properties={form.properties}
            taxYear={form.taxYear}
          />

          {/* 결과 화면 하단 네비게이션 — 다른 양도건 추가, 자산 목록, 홈 */}
          <Card className="print:hidden">
            <CardContent className="pt-6 flex flex-wrap gap-3 justify-center">
              <Button
                type="button"
                onClick={handleAddProperty}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                동일연도 다른 양도건 추가 계산하기
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("list")}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                자산 목록으로
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push("/")}
                className="gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                홈으로
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <MultiTransferHistoryLoadModal
        open={loadModalOpen}
        onOpenChange={setLoadModalOpen}
        taxYear={form.taxYear}
        activeClientId={activeClientId}
        existingSourceIds={existingSourceIds}
        onSelectSingle={handleLoadSingle}
        onSelectMulti={handleLoadMulti}
      />

      <Dialog
        open={!!pendingMultiRecord}
        onOpenChange={(o) => { if (!o) setPendingMultiRecord(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>현재 입력을 대체할까요?</DialogTitle>
            <DialogDescription>
              다건 이력을 불러오면 현재 입력한 자산·기납부세액이 모두 대체됩니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingMultiRecord(null)}>
              취소
            </Button>
            <Button
              onClick={() => {
                if (pendingMultiRecord) doLoadMulti(pendingMultiRecord);
                setPendingMultiRecord(null);
              }}
            >
              대체하고 불러오기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DisclaimerBanner />
    </div>
  );
}
