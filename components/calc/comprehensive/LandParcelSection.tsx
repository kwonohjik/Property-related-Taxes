"use client";

/**
 * LandParcelSection — 토지 필지별 입력 (종합합산·별도합산 공용).
 *
 * 집계 직접입력(summary, 기본) ↔ 필지별 자동계산(parcels) 모드 토글.
 * 필지 모드: 요약 테이블(행 클릭 → Dialog 모달 편집) — 주택 PropertyListInput과 동일 패턴.
 *   추가 직후 자동 모달 오픈(E-1) · 삭제 시 모달 닫힘(E-2) · 빈 필지 자동 제거(E-3).
 * Design: docs/02-design/features/comprehensive-land-payable-calc.ui.design.md §4
 *   · docs/00-pm/comprehensive-land-parcel-table-modal.plan.md
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LandParcelTableView } from "./LandParcelTableView";
import { LandParcelEditor } from "./LandParcelEditor";
import {
  useComprehensiveWizardStore,
  type LandParcelForm,
} from "@/lib/stores/comprehensive-wizard-store";

type Kind = "aggregate" | "separate";

/**
 * 사용자가 의미 있는 입력을 전혀 하지 않은 빈 필지 — 모달 닫기 시 자동 제거 대상.
 * 신규 필지 기본 shareRatio "100"은 의도 입력이 아니므로 판정에서 제외.
 */
function isEmptyParcel(p: LandParcelForm): boolean {
  const blank = (s: string | undefined) => !s || !s.trim();
  return (
    blank(p.jurisdiction) &&
    blank(p.name) &&
    blank(p.jibun) &&
    blank(p.area) &&
    blank(p.officialPricePerSqm) &&
    blank(p.priorOfficialPricePerSqm) &&
    (!p.shareRatio?.trim() || p.shareRatio.trim() === "100")
  );
}

export function LandParcelSection({ kind }: { kind: Kind }) {
  const { formData, updateFormData, addLandParcel, removeLandParcel, updateLandParcel } =
    useComprehensiveWizardStore();

  // 편집 모달 대상 (UI ephemeral — zustand store 금지). aggregate·separate 인스턴스별 독립.
  const [selectedParcelId, setSelectedParcelId] = useState<string | null>(null);

  const mode = kind === "aggregate" ? formData.landAggregateMode : formData.landSeparateMode;
  const modeKey = kind === "aggregate" ? "landAggregateMode" : "landSeparateMode";
  const parcels = kind === "aggregate" ? formData.landAggregateParcels : formData.landSeparateParcels;
  const priorMode =
    kind === "aggregate" ? formData.landAggregatePriorMode : formData.landSeparatePriorMode;
  const priorModeKey =
    kind === "aggregate" ? "landAggregatePriorMode" : "landSeparatePriorMode";
  const refDate = `${formData.assessmentYear}-06-01`;
  const priorYear = String((parseInt(formData.assessmentYear) || new Date().getFullYear()) - 1);
  const autoSupported = (parseInt(formData.assessmentYear) || 0) >= 2022;

  const selectedIndex = parcels.findIndex((p) => p.id === selectedParcelId);
  const selectedParcel = selectedIndex >= 0 ? parcels[selectedIndex] : null;

  // 추가 직후 자동 모달 오픈 (E-1)
  const handleAdd = () => {
    const newId = addLandParcel(kind);
    setSelectedParcelId(newId);
  };

  // 삭제 후 모달 자동 닫힘 (E-2)
  const handleRemove = () => {
    if (!selectedParcelId) return;
    removeLandParcel(kind, selectedParcelId);
    setSelectedParcelId(null);
  };

  // 모달 닫기 (E-3) — 추가만 하고 아무것도 입력하지 않은 빈 필지는 자동 제거 (0필지 허용)
  const closeModal = () => {
    const id = selectedParcelId;
    setSelectedParcelId(null);
    if (!id) return;
    const target = parcels.find((p) => p.id === id);
    if (target && isEmptyParcel(target)) removeLandParcel(kind, id);
  };

  return (
    <div className="space-y-3">
      {/* 입력 방식 토글 */}
      <RadioCardGroup
        name={`land-mode-${kind}`}
        tone="sky"
        layout="inline"
        value={mode}
        onChange={(v) => updateFormData({ [modeKey]: v as "summary" | "parcels" })}
        options={[
          { value: "summary", label: "집계 직접 입력", description: "재산세 과표·부과세액을 합산액으로 입력" },
          { value: "parcels", label: "필지별 자동 계산", description: "필지 입력 → 재산세·세부담상한 자동" },
        ]}
      />

      {mode === "parcels" && (
        <div className="space-y-3">
          {/* 요약 테이블 (행 클릭 → 편집 모달) — 0필지면 빈 상태 안내 */}
          {parcels.length === 0 ? (
            <div
              className="rounded-lg border border-sky-200 bg-sky-50/40 px-4 py-5 text-center text-sm text-sky-800"
              data-testid={`land-${kind}-parcel-empty-state`}
            >
              필지가 없습니다. 아래 &lsquo;필지 추가&rsquo;를 눌러 입력하세요.
            </div>
          ) : (
            <LandParcelTableView
              parcels={parcels}
              kind={kind}
              selectedParcelId={selectedParcelId}
              onSelect={setSelectedParcelId}
            />
          )}

          {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈 */}
          <Dialog
            open={selectedParcelId !== null}
            onOpenChange={(open) => {
              if (!open) closeModal();
            }}
          >
            <DialogContent
              className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0"
              showCloseButton={false}
            >
              <DialogHeader className="px-4 pt-4 pb-0">
                <DialogTitle>필지 {selectedIndex >= 0 ? selectedIndex + 1 : ""} 편집</DialogTitle>
              </DialogHeader>
              <div
                className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
                data-testid={`land-${kind}-parcel-dialog`}
              >
                {selectedParcel && (
                  <LandParcelEditor
                    key={selectedParcel.id}
                    parcel={selectedParcel}
                    kind={kind}
                    refDate={refDate}
                    priorYear={priorYear}
                    priorMode={priorMode}
                    onUpdate={(data) => updateLandParcel(kind, selectedParcel.id, data)}
                  />
                )}
              </div>
              <div className="border-t px-4 py-3 flex justify-between items-center">
                <button
                  type="button"
                  onClick={handleRemove}
                  data-testid={`land-${kind}-parcel-remove-${selectedParcelId}`}
                  className="px-4 py-2 rounded-md text-sm border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors"
                >
                  삭제
                </button>
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  닫기
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* 필지 추가 */}
          <button
            type="button"
            onClick={handleAdd}
            className="w-full rounded-md border border-dashed border-muted-foreground/50 px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            + 필지 추가
          </button>

          {/* 직전연도(세부담상한) 서브모드 */}
          <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3 space-y-2">
            <p className="text-xs font-semibold text-violet-700">직전연도 세부담 상한 (§15)</p>
            <RadioCardGroup
              name={`land-prior-${kind}`}
              tone="violet"
              layout="stack"
              value={priorMode}
              onChange={(v) => updateFormData({ [priorModeKey]: v as "none" | "auto" | "direct" })}
              options={[
                { value: "none", label: "미적용", description: "세부담 상한 계산 생략" },
                {
                  value: "auto",
                  label: "직전 공시지가로 자동 계산",
                  description: autoSupported
                    ? "각 필지 직전연도 공시지가 입력 (전 필지 필수)"
                    : "2022년 이후 귀속만 지원 — 직접 입력을 사용하세요",
                },
                { value: "direct", label: "직전연도 총세액 직접 입력", description: "재산세+종부세 합계액" },
              ]}
            />
            {priorMode === "direct" && (
              <CurrencyInput
                label="직전연도 총세액 (원)"
                value={
                  kind === "aggregate"
                    ? formData.landAggregate.previousYearTotalTax
                    : formData.landSeparatePreviousYearTotalTax
                }
                onChange={(v) =>
                  kind === "aggregate"
                    ? updateFormData({
                        landAggregate: { ...formData.landAggregate, previousYearTotalTax: v },
                      })
                    : updateFormData({ landSeparatePreviousYearTotalTax: v })
                }
                placeholder="0"
                hint="직전연도 재산세 + 종합부동산세 합계 (농특세 제외)"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
