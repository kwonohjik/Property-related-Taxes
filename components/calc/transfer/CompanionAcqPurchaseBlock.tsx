"use client";

/**
 * 동반자산 매매 취득(purchase) 입력 블록
 *
 * 매매 산정방식 두 가지:
 *   - actual:    실거래가 (fixedAcquisitionPrice 직접 입력)
 *   - estimated: 환산취득가 (양도가 × 취득시기준시가/양도시기준시가, 라우트가 안분 후 환산)
 *
 * 취득일 규칙:
 *   - 1985.1.1. 미만 입력 시 1985.1.1.로 강제 클램핑 (소득세법 적용 하한)
 *   - 1990.8.30. 이전이면 공시지가 연도 자동 1990년, Pre1990 섹션 자동 활성화
 */

import { useState, useEffect } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { StandardPriceInput } from "@/components/calc/inputs/StandardPriceInput";
import { DateInput } from "@/components/ui/date-input";
import { cn } from "@/lib/utils";
import { Pre1990LandValuationInput, type Pre1990FormSlice } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { SelfBuiltSection } from "./SelfBuiltSection";
import { LandBuildingSplitSection } from "./LandBuildingSplitSection";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { PreHousingDisclosureSection } from "./PreHousingDisclosureSection";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const MIN_ACQ_DATE = "1985-01-01";

/**
 * assetKind → StandardPriceInput propertyKind 변환
 * "housing" → house_individual, "land" → land, 그 외 → building_non_residential
 */
function toPropertyKind(
  assetKind?: string,
): "land" | "building_non_residential" | "house_individual" | "house_apart" {
  if (assetKind === "housing") return "house_individual";
  if (assetKind === "land") return "land";
  return "building_non_residential";
}

interface BlockProps {
  acquisitionDate: string;
  onAcquisitionDateChange: (v: string) => void;
  useEstimatedAcquisition: boolean;
  onUseEstimatedChange: (v: boolean) => void;
  /** 감정가액 모드 — 자산-수준 (Step1↔Step3 통합 후) */
  isAppraisalAcquisition?: boolean;
  onIsAppraisalAcquisitionChange?: (v: boolean) => void;
  fixedAcquisitionPrice: string;
  onFixedAcquisitionPriceChange: (v: string) => void;
  /** 환산취득가 분자: 취득시 기준시가 총액 (원) */
  standardPriceAtAcq: string;
  onStandardPriceAtAcqChange: (v: string) => void;
  /** 환산취득가 분모: 양도시 기준시가 총액 (원) */
  standardPriceAtTransfer: string;
  onStandardPriceAtTransferChange: (v: string) => void;
  /** 양도일 (양도시 기준시가 조회 연도 계산용) */
  transferDate?: string;
  /** 공시가격 조회용 지번 주소 */
  jibun?: string;
  /** 자산 종류 — 공시가격 API 선택 및 토지 면적 계산용 */
  assetKind?: string;
  /** 취득 당시 면적 (㎡) — 취득시 기준시가 자동계산, Pre1990 환산용 */
  acquisitionArea?: string;
  /** 양도 당시 면적 (㎡) — 양도시 기준시가 자동계산용 */
  transferArea?: string;
  /** 1990 이전 취득 토지 환산 슬라이스 */
  pre1990Form?: Pre1990FormSlice;
  onPre1990Change?: (patch: Partial<Pre1990FormSlice>) => void;
  /** 취득시 기준시가 ㎡당 단가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtAcq?: string;
  onStandardPricePerSqmAtAcqChange?: (v: string) => void;
  /** 양도시 기준시가 ㎡당 단가 (외부 저장 — 없으면 내부 state fallback) */
  standardPricePerSqmAtTransfer?: string;
  onStandardPricePerSqmAtTransferChange?: (v: string) => void;
  /** 신축·증축 자산-수준 4필드 (Step1↔Step3 통합 후) */
  isSelfBuilt?: boolean;
  onIsSelfBuiltChange?: (v: boolean) => void;
  buildingType?: "new" | "extension" | "";
  onBuildingTypeChange?: (v: "new" | "extension" | "") => void;
  constructionDate?: string;
  onConstructionDateChange?: (v: string) => void;
  extensionFloorArea?: string;
  onExtensionFloorAreaChange?: (v: string) => void;
  /** 토지/건물 취득일 분리 (housing·building 공통) */
  hasSeperateLandAcquisitionDate?: boolean;
  onHasSeperateLandAcquisitionDateChange?: (v: boolean) => void;
  landAcquisitionDate?: string;
  onLandAcquisitionDateChange?: (v: string) => void;
  landSplitMode?: "apportioned" | "actual";
  onLandSplitModeChange?: (v: "apportioned" | "actual") => void;
  landTransferPrice?: string;
  onLandTransferPriceChange?: (v: string) => void;
  buildingTransferPrice?: string;
  onBuildingTransferPriceChange?: (v: string) => void;
  landAcquisitionPrice?: string;
  onLandAcquisitionPriceChange?: (v: string) => void;
  buildingAcquisitionPrice?: string;
  onBuildingAcquisitionPriceChange?: (v: string) => void;
  landDirectExpenses?: string;
  onLandDirectExpensesChange?: (v: string) => void;
  buildingDirectExpenses?: string;
  onBuildingDirectExpensesChange?: (v: string) => void;
  landStandardPriceAtTransfer?: string;
  onLandStandardPriceAtTransferChange?: (v: string) => void;
  buildingStandardPriceAtTransfer?: string;
  onBuildingStandardPriceAtTransferChange?: (v: string) => void;
  /**
   * 개별주택가격 미공시 취득 §164⑤ 3-시점 모드.
   * 환산취득가 + hasSeperateLandAcquisitionDate === true 일 때만 표시.
   * asset·onAssetChange와 함께 제공해야 한다.
   */
  asset?: AssetForm;
  onAssetChange?: (patch: Partial<AssetForm>) => void;
  /** 토지·건물 소유자 분리 — 본인 소유 부분 (소령 §166⑥, §168②) */
  selfOwns?: "both" | "building_only" | "land_only";
  onSelfOwnsChange?: (v: "both" | "building_only" | "land_only") => void;
}

// ─── 메인 블록 ────────────────────────────────────────────────────

export function CompanionAcqPurchaseBlock(props: BlockProps) {
  const [dateClampMsg, setDateClampMsg] = useState(false);

  // 내부 fallback state (외부 props 없을 때 사용)
  const [internalPricePerSqmAtAcq, setInternalPricePerSqmAtAcq] = useState("");
  const [internalPricePerSqmAtTransfer, setInternalPricePerSqmAtTransfer] = useState("");

  const acqPricePerSqm = props.standardPricePerSqmAtAcq ?? internalPricePerSqmAtAcq;
  const onAcqPricePerSqmChange = props.onStandardPricePerSqmAtAcqChange ?? setInternalPricePerSqmAtAcq;
  const transferPricePerSqm = props.standardPricePerSqmAtTransfer ?? internalPricePerSqmAtTransfer;
  const onTransferPricePerSqmChange = props.onStandardPricePerSqmAtTransferChange ?? setInternalPricePerSqmAtTransfer;

  const isLand = props.assetKind === "land";
  // acqDatePre1990에서 파생된 derived value — useEffect + setState 불필요
  const acqDatePre1990 = !!(props.acquisitionDate && props.acquisitionDate < "1990-08-30");
  const pre1990ForceYear = acqDatePre1990 ? "1990" : undefined;
  const showPre1990 =
    isLand &&
    !!props.pre1990Form &&
    !!props.onPre1990Change &&
    acqDatePre1990;

  const propertyKind = toPropertyKind(props.assetKind);

  // 취득일 1985.1.1. 미만 클램핑 — 입력 완료(포커스 이탈) 시에만 적용
  function handleAcquisitionDateChange(v: string) {
    props.onAcquisitionDateChange(v);
    setDateClampMsg(false);
  }

  function handleAcquisitionDateBlur() {
    const v = props.acquisitionDate;
    if (v && v < MIN_ACQ_DATE) {
      props.onAcquisitionDateChange(MIN_ACQ_DATE);
      setDateClampMsg(true);
    }
  }

  // 환산취득가 + 1990.8.30. 이전 취득 토지 → pre1990Enabled 자동 체크
  useEffect(() => {
    if (
      props.useEstimatedAcquisition &&
      isLand &&
      acqDatePre1990 &&
      props.onPre1990Change &&
      !props.pre1990Form?.pre1990Enabled
    ) {
      props.onPre1990Change({ pre1990Enabled: true });
    }
  }, [props.useEstimatedAcquisition, isLand, acqDatePre1990]);

  // 취득시 기준시가 조회 단가 → pre1990PricePerSqm_1990 자동 입력
  function handleAcqPricePerSqmChange(v: string) {
    onAcqPricePerSqmChange(v);
    if (showPre1990) {
      props.onPre1990Change?.({ pre1990PricePerSqm_1990: v.replace(/,/g, "") });
    }
  }

  const isSplitable =
    props.assetKind === "housing" || props.assetKind === "building";
  const isSplit = isSplitable && !!props.hasSeperateLandAcquisitionDate;
  const acqDateLabel = isSplit ? "건물 취득일 (사용승인일·매매 등기접수일)" : "취득일";

  // 검용주택 모드: 기준시가 입력은 MixedUseStandardPriceInputs에서 받으므로
  // 일반 자산용 환산 입력(취득시/양도시 기준시가, PHD 토글)을 숨긴다.
  const isMixedUse = !!props.asset?.isMixedUseHouse;

  return (
    <div className="space-y-3 rounded-md border border-border bg-background p-3">
      <div className="space-y-1.5">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium">{acqDateLabel}</span>
          {isSplitable && props.onHasSeperateLandAcquisitionDateChange && (
            <label
              className={cn(
                "flex items-center gap-1.5 text-sm font-normal text-muted-foreground",
                isMixedUse ? "cursor-not-allowed opacity-70" : "cursor-pointer",
              )}
              title={isMixedUse ? "검용주택 분리계산은 항상 토지/건물 분리로 처리됩니다" : undefined}
            >
              <input
                type="checkbox"
                checked={!!props.hasSeperateLandAcquisitionDate}
                disabled={isMixedUse}
                onChange={(e) =>
                  props.onHasSeperateLandAcquisitionDateChange!(e.target.checked)
                }
                className="rounded border-border"
              />
              <span>토지와 건물의 취득일이 다른가요?</span>
              <span className="text-xs">
                {isMixedUse ? "(검용주택은 항상 분리)" : "(원시취득·신축 등)"}
              </span>
            </label>
          )}
        </div>
        <DateInput
          value={props.acquisitionDate}
          onChange={handleAcquisitionDateChange}
          onBlur={handleAcquisitionDateBlur}
        />
        {dateClampMsg && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            1985.1.1. 의제 취득일로 취득일 변경했습니다.
          </p>
        )}
      </div>

      {/* 토지/건물 소유자 분리 (housing·building 전용) */}
      {isSplitable && props.onSelfOwnsChange && (
        <div className="space-y-1.5">
          <label className="flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={(props.selfOwns ?? "both") !== "both"}
              onChange={(e) => {
                if (e.target.checked) {
                  props.onSelfOwnsChange!("building_only");
                  props.onHasSeperateLandAcquisitionDateChange?.(true);
                } else {
                  props.onSelfOwnsChange!("both");
                }
              }}
              className="rounded border-border"
            />
            <span>토지와 건물의 소유자가 다른가요?</span>
            <span className="text-xs">(배우자·공유자 등)</span>
          </label>
          {(props.selfOwns ?? "both") !== "both" && (
            <div className="ml-5 flex gap-2 flex-wrap">
              {(["building_only", "land_only"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => props.onSelfOwnsChange!(v)}
                  className={cn(
                    "rounded-md border-2 px-3 py-1 text-sm transition-all",
                    props.selfOwns === v
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-border hover:border-muted-foreground/50",
                  )}
                >
                  {v === "building_only" ? "건물만 본인 소유 (토지는 타인)" : "토지만 본인 소유 (건물은 타인)"}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 토지/건물 취득일 분리 상세 (housing·building 전용) */}
      {isSplitable && props.onHasSeperateLandAcquisitionDateChange && (
        <div className="space-y-2">

          {isSplit && (
            <div className="space-y-2 pl-1">
              <FieldCard
                label="토지 취득일"
                hint="등기부등본상 등기접수일 (소득령 §162①1호)"
              >
                <DateInput
                  value={props.landAcquisitionDate ?? ""}
                  onChange={props.onLandAcquisitionDateChange ?? (() => {})}
                />
              </FieldCard>

              <FieldCard label="취득·양도가액 분리 방식" hint="토지/건물 각각의 취득가액·양도가액 구분 방법 (소득령 §166⑥)">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => props.onLandSplitModeChange?.("apportioned")}
                    className={cn(
                      "flex-1 rounded-md border-2 px-3 py-1.5 text-sm transition-all",
                      (props.landSplitMode ?? "apportioned") === "apportioned"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-muted-foreground/50",
                    )}
                  >
                    기준시가 비율 안분
                  </button>
                  <button
                    type="button"
                    onClick={() => props.onLandSplitModeChange?.("actual")}
                    className={cn(
                      "flex-1 rounded-md border-2 px-3 py-1.5 text-sm transition-all",
                      props.landSplitMode === "actual"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-muted-foreground/50",
                    )}
                  >
                    직접 입력
                  </button>
                </div>
              </FieldCard>


              {props.landSplitMode === "actual" && (
                <LandBuildingSplitSection
                  useEstimatedAcquisition={props.useEstimatedAcquisition}
                  landTransferPrice={props.landTransferPrice ?? ""}
                  onLandTransferPriceChange={props.onLandTransferPriceChange ?? (() => {})}
                  buildingTransferPrice={props.buildingTransferPrice ?? ""}
                  onBuildingTransferPriceChange={props.onBuildingTransferPriceChange ?? (() => {})}
                  landAcquisitionPrice={props.landAcquisitionPrice ?? ""}
                  onLandAcquisitionPriceChange={props.onLandAcquisitionPriceChange ?? (() => {})}
                  buildingAcquisitionPrice={props.buildingAcquisitionPrice ?? ""}
                  onBuildingAcquisitionPriceChange={props.onBuildingAcquisitionPriceChange ?? (() => {})}
                  landStandardPriceAtTransfer={props.landStandardPriceAtTransfer ?? ""}
                  onLandStandardPriceAtTransferChange={props.onLandStandardPriceAtTransferChange ?? (() => {})}
                  buildingStandardPriceAtTransfer={props.buildingStandardPriceAtTransfer ?? ""}
                  onBuildingStandardPriceAtTransferChange={props.onBuildingStandardPriceAtTransferChange ?? (() => {})}
                  landDirectExpenses={props.landDirectExpenses ?? ""}
                  onLandDirectExpensesChange={props.onLandDirectExpensesChange ?? (() => {})}
                  buildingDirectExpenses={props.buildingDirectExpenses ?? ""}
                  onBuildingDirectExpensesChange={props.onBuildingDirectExpensesChange ?? (() => {})}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-sm font-medium">취득가액 산정 방식</label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => {
              props.onUseEstimatedChange(false);
              props.onIsAppraisalAcquisitionChange?.(false);
            }}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              !props.useEstimatedAcquisition && !props.isAppraisalAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">실거래가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              계약서상 실거래가
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              props.onUseEstimatedChange(true);
              props.onIsAppraisalAcquisitionChange?.(false);
            }}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              props.useEstimatedAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">환산취득가</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              양도가 × 기준시가 비율
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              props.onUseEstimatedChange(false);
              props.onIsAppraisalAcquisitionChange?.(true);
            }}
            className={cn(
              "rounded-md border-2 p-2 text-left transition-all",
              props.isAppraisalAcquisition
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold">감정가액</div>
            <div className="text-[11px] text-muted-foreground leading-tight">
              개산공제 자동 적용
            </div>
          </button>
        </div>
      </div>

      {/* 개별주택가격 미공시 취득 토글 — 환산취득가 + 취득일 분리 모드 + housing·building 전용
         검용주택 모드에서는 MixedUseStandardPriceInputs 내부의 PHD 토글을 사용하므로 여기서는 숨긴다. */}
      {!isMixedUse && isSplit && props.useEstimatedAcquisition && props.asset && props.onAssetChange && (
        <div className="space-y-2">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!props.asset.usePreHousingDisclosure}
              onChange={(e) =>
                props.onAssetChange!({ usePreHousingDisclosure: e.target.checked })
              }
              className="rounded border-border"
            />
            <span>취득 당시 개별주택가격 미공시 (§164⑤ 3-시점 계산)</span>
          </label>

          {props.asset.usePreHousingDisclosure && (
            <PreHousingDisclosureSection
              asset={props.asset}
              transferDate={props.transferDate ?? ""}
              onChange={props.onAssetChange}
            />
          )}
        </div>
      )}

      {!props.useEstimatedAcquisition ? (
        <>
          <CurrencyInput
            label={props.isAppraisalAcquisition ? "감정가액 (원)" : "취득가액 (원)"}
            value={props.fixedAcquisitionPrice}
            onChange={props.onFixedAcquisitionPriceChange}
            required
            hint={
              props.isAppraisalAcquisition
                ? "공인감정기관의 감정가액. 소득세법 시행령 §163⑥에 따라 필요경비 개산공제(취득시 기준시가 × 3%)가 자동 적용됩니다."
                : undefined
            }
          />
          {props.isAppraisalAcquisition && (
            <CurrencyInput
              label="취득시 기준시가 (원) — 개산공제 base"
              value={props.standardPriceAtAcq}
              onChange={props.onStandardPriceAtAcqChange}
              hint="필요경비 개산공제 = 이 금액의 3%. 미입력 시 0% 적용."
            />
          )}
        </>
      ) : isMixedUse ? (
        // 검용주택 모드: 양도시·취득시 기준시가는 위 "검용주택 분리계산" 영역에서 입력.
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 위 검용주택 분리계산 영역에서 입력합니다 (개별주택가격·상가건물·공시지가).
        </p>
      ) : props.asset?.usePreHousingDisclosure ? (
        // §164⑤ PHD 모드: 위쪽 PreHousingDisclosureSection의 3-시점 입력으로 자동 도출.
        // 기존 "취득시/양도시 기준시가" 입력은 중복되므로 표시하지 않음.
        <p className="text-xs text-muted-foreground italic">
          취득시/양도시 기준시가는 위 §164⑤ 3-시점 입력으로부터 자동 도출됩니다.
        </p>
      ) : (
        <>
          {/* 취득시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              취득시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            {isLand && acqDatePre1990 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                1990년 이전 취득은 개별공시지가가 없어 아래 토지등급 환산 기능으로 자동 산정됩니다.
              </p>
            )}
            <StandardPriceInput
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtAcq}
              onTotalPriceChange={props.onStandardPriceAtAcqChange}
              pricePerSqm={acqPricePerSqm}
              onPricePerSqmChange={handleAcqPricePerSqmChange}
              area={props.acquisitionArea}
              jibun={props.jibun}
              referenceDate={props.acquisitionDate}
              hint="환산 분자 — 안분 후 양도가액에 (취득시/양도시) 비율 적용"
              forceYear={pre1990ForceYear}
              enableLookup={!(isLand && acqDatePre1990)}
            />
          </div>

          {/* 1990.8.30. 이전 취득 토지 환산 */}
          {showPre1990 && (
            <Pre1990LandValuationInput
              form={props.pre1990Form!}
              onChange={props.onPre1990Change!}
              acquisitionArea={props.acquisitionArea}
              jibun={props.jibun}
              acquisitionDate={props.acquisitionDate}
              transferDate={props.transferDate}
              onCalculatedPrice={(price) => props.onStandardPriceAtAcqChange(String(price))}
            />
          )}

          {/* 양도시 기준시가 */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              양도시 기준시가 (원) <span className="text-destructive">*</span>
            </label>
            <StandardPriceInput
              propertyKind={propertyKind}
              totalPrice={props.standardPriceAtTransfer}
              onTotalPriceChange={props.onStandardPriceAtTransferChange}
              pricePerSqm={transferPricePerSqm}
              onPricePerSqmChange={onTransferPricePerSqmChange}
              area={props.transferArea}
              jibun={props.jibun}
              referenceDate={props.transferDate}
              hint="환산 분모 — 취득시/양도시 기준시가 비율의 분모"
            />
          </div>
        </>
      )}

      {/* 신축·증축 특례 (자산 카드 마지막 부분, 매매 + housing/building 자산만) */}
      {(props.assetKind === "housing" || props.assetKind === "building") &&
        props.onIsSelfBuiltChange &&
        props.onBuildingTypeChange &&
        props.onConstructionDateChange &&
        props.onExtensionFloorAreaChange && (
          <SelfBuiltSection
            isSelfBuilt={props.isSelfBuilt ?? false}
            onIsSelfBuiltChange={props.onIsSelfBuiltChange}
            buildingType={props.buildingType ?? ""}
            onBuildingTypeChange={props.onBuildingTypeChange}
            constructionDate={props.constructionDate ?? ""}
            onConstructionDateChange={props.onConstructionDateChange}
            extensionFloorArea={props.extensionFloorArea ?? ""}
            onExtensionFloorAreaChange={props.onExtensionFloorAreaChange}
          />
        )}
    </div>
  );
}
