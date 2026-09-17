"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NavButton, CtaButton } from "@/components/calc/shared/WizardNav";
import { AssetTabBar } from "@/components/calc/transfer/AssetTabBar";
import { StaleSourceBanner } from "@/components/calc/transfer/StaleSourceBanner";
import { AggregateSettingsPanel } from "@/components/calc/transfer/AggregateSettingsPanel";
import { AmendmentBlock } from "@/components/calc/transfer/AmendmentBlock";
import { MultiTransferTaxResultView } from "@/components/calc/results/MultiTransferTaxResultView";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { StepIndicator } from "@/components/calc/StepIndicator";
import {
  useMultiTransferStore,
  generatePropertyId,
  type PropertyItem,
  type MultiStep,
} from "@/lib/stores/multi-transfer-tax-store";
import { decideMultiMountAction } from "@/lib/calc/multi-mount-decision";
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
} from "@/lib/calc/multi-transfer-tax-validate";
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";
import TransferTaxCalculator from "../TransferTaxCalculator";
import { StepList } from "./MultiTransferSteps";
import { MultiTransferHistoryLoadModal } from "@/components/calc/transfer/MultiTransferHistoryLoadModal";
import {
  buildPropertyFromSingleRecord,
  buildPropertiesFromMultiRecord,
  buildExistingSourceIds,
  isBlankProperty,
  backfillPriorPaid,
  reloadPropertyFromSource,
  adoptSourceBaseline,
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

  // 이력 불러오기 (Phase 2) — 이미 로드한 record id 집합(중복 경고).
  // 자산 출처(sourceCalculationId) ∪ **세션 출처**(loadedFromRecordId). 후자가 없으면
  // 다건을 replace 로드한 뒤 그 record에 배지가 안 붙는다 — 종전에는 자산 수준 폴백이
  // 그 일을 대신했고, 그 부작용이 수동 추가 자산의 가짜 provenance였다.
  const existingSourceIds = useMemo(
    () => buildExistingSourceIds(form),
    [form],
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
        // 세션 출처 — 「이미 로드함」 배지가 이 값을 본다(자산 수준에 실으면 범주 오류다).
        loadedFromRecordId: record.id,
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
  /**
   * ⚠️ 라벨·인덱스를 `useMultiTransferStore.getState()`로 바꾸려다 **되돌렸다**(2026-09-16).
   *    「live가 더 옳다」고 보였지만, 이 함수가 마운트 경로에서 불리는 것은
   *    `add-first`(= `properties.length === 0`)일 때뿐이라 **closure와 live가 항상 같다**.
   *    뮤테이션으로 실측했다 — 두 구현의 E2E 결과가 동일(구별력 0)하다. 아무것도 바꾸지 않는
   *    변경은 넣지 않는다.
   */
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
    /**
     * 🔴 **closure(`form`·`result`)를 쓰지 말 것.** 첫 렌더는 zustand persist 리하이드레이션
     *    **전**이라 새로고침 시 항상 기본값이다. 실측(2026-09-16):
     *      최초 진입 `closure {0,"list"}` · `live {0,"list"}`
     *      새로고침   `closure {0,"list"}` · `live {1,"edit"}`  ← 어긋난다
     *    그래서 「자산이 없다」로 오판해 **새로고침마다 빈 자산이 1건씩 늘었고**(1→2→3),
     *    나머지 두 분기는 closure의 `activeStep`이 `"result"`·`"edit"`가 될 수 없어
     *    **영영 실행되지 않았다**(편집 중 새로고침 시 활성 자산 폼 대신 빈 폼이 실렸다).
     */
    const store = useMultiTransferStore.getState();
    const live = store.form;
    const action = decideMultiMountAction(live, store.result !== null);
    if (action.kind === "restore-step") {
      setStep(action.step);
      return;
    }
    if (action.kind === "sync-edit") {
      const wizardForm = useCalcWizardStore.getState().formData;
      const targetForm = live.properties[action.propertyIndex].form;
      if (wizardForm !== targetForm) {
        syncToWizardStore(targetForm);
      }
      return;
    }
    if (action.kind === "add-first") {
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

  /**
   * 「다시 불러오기」 — 편입 자산을 원본 record의 **현재 입력**으로 되불러온다.
   *
   * ⚠️ 합산 화면의 로컬 편집을 덮는다. 배너가 그 사실을 미리 알린다(⛔ 자동 갱신 금지 —
   *    조용히 덮으면 사용자가 여기서 고친 값이 사라진다).
   */
  const handleReloadSource = useCallback(
    async (propertyId: string) => {
      const idx = form.properties.findIndex((p) => p.propertyId === propertyId);
      if (idx < 0) return;
      updateProperty(idx, await reloadPropertyFromSource(form.properties[idx]));
    },
    [form.properties, updateProperty],
  );

  /** 「그대로 두기」 — 폼은 건드리지 않고 기준선만 확정해 배너를 닫는다. */
  const handleAdoptSource = useCallback(
    async (propertyId: string) => {
      const idx = form.properties.findIndex((p) => p.propertyId === propertyId);
      if (idx < 0) return;
      updateProperty(idx, await adoptSourceBaseline(form.properties[idx]));
    },
    [form.properties, updateProperty],
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
            // 🔴 결과가 없는데 「계산 결과」로 넘어가면 `:636`의 `&& result` 게이트가
            //    아무것도 렌더하지 않아 **빈 화면**이 된다. 마운트 시 리다이렉트(`:418`)는
            //    deps가 `[]`라 이 클릭에는 도달하지 않는다 — 여기서 막는다.
            if (target === "result" && !result) return;
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
          <CardContent className="space-y-4">
            <StaleSourceBanner
              properties={form.properties}
              taxYear={form.taxYear}
              onReload={handleReloadSource}
              onAdopt={handleAdoptSource}
            />
            <StepList
              properties={form.properties}
              onAdd={handleAddProperty}
              onLoad={() => setLoadModalOpen(true)}
              onEdit={handleEditProperty}
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
            <NavButton direction="prev" label="자산 목록으로" onClick={handleSaveAndBack} />
            <span className="text-sm text-muted-foreground">
              편집 중: {form.properties[form.activePropertyIndex]?.propertyLabel}
            </span>
            <Button
              type="button"
              variant="modalLauncher"
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
            onBackToList={() => setStep("list")}
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
            {/* 「세액 계산」 버튼이 있는 화면이라 여기에도 둔다 — 목록 단계에서 지나쳤어도 보인다 */}
            <StaleSourceBanner
              properties={form.properties}
              taxYear={form.taxYear}
              onReload={handleReloadSource}
              onAdopt={handleAdoptSource}
            />
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

            <div className="flex items-center justify-between gap-2 pt-4 border-t">
              <NavButton direction="prev" label="자산 목록으로" onClick={() => setStep("list")} />
              <CtaButton onClick={handleCalculate} disabled={isCalculating}>
                {isCalculating ? "계산 중..." : "세액 계산"}
              </CtaButton>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step D: 결과 */}
      {form.activeStep === "result" && result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <NavButton direction="prev" label="설정으로 돌아가기" onClick={() => setStep("settings")} />
          </div>

          <MultiTransferTaxResultView
            result={result}
            properties={form.properties}
            taxYear={form.taxYear}
          />

          {/* 결과 화면 하단 네비게이션 — 다른 양도건 추가, 자산 목록, 홈 */}
          <Card className="print:hidden">
            <CardContent className="pt-6 flex flex-wrap items-center gap-2 justify-center">
              <CtaButton onClick={handleAddProperty}>
                동일연도 다른 양도건 추가 계산하기
              </CtaButton>
              <NavButton direction="prev" label="자산 목록으로" onClick={() => setStep("list")} />
              <HomeButton />
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
