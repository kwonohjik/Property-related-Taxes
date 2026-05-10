"use client";

/**
 * 일반건물(토지+건물 일괄) 취득 정보 2카드
 *
 * assetKind === "general_building" 시 기존 단일 취득원인 영역 대신 표시.
 * 토지 카드 (sky): acquisitionCause + acquisitionDate + 원인별 보조 입력
 * 건물 카드 (amber): gbBuildingAcquisitionCause + gbBuildingAcquisitionDate + 가산세 배지
 *
 * 정책 준수:
 *  - useEffect → store 미러링 금지 (onChange 직접 처리)
 *  - useMemo 파생 배지 (penalty badge)
 *  - native radio/checkbox 금지 (RadioCardGroup 사용)
 *  - type="date" 금지 (DateInput 사용)
 *  - placeholder 숫자 예시 금지
 */

import { useMemo } from "react";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { DateInput } from "@/components/ui/date-input";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";
import { CarryoverGiftBlock } from "./CarryoverGiftBlock";
import { InheritedAcquisitionDeemedSection } from "./InheritedAcquisitionDeemedSection";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";

// ── 토지 취득원인 옵션 (이월과세 포함 4종) ──
const LAND_CAUSE_OPTIONS = [
  { value: "purchase",       label: "매매" },
  { value: "inheritance",    label: "상속" },
  { value: "gift",           label: "증여" },
  { value: "carryover_gift", label: "이월과세(증여)" },
] as const;

// ── 건물 취득원인 옵션 (신축 포함 4종, 양도코리아 정렬) ──
const BUILDING_CAUSE_OPTIONS = [
  { value: "purchase",         label: "매매" },
  { value: "inheritance",      label: "상속" },
  { value: "gift",             label: "증여" },
  { value: "newConstruction",  label: "신축(자가건축)" },
] as const;

/** 양도일 − 건물취득일 < 5년 여부 판정 (소득세법 §114조의2 ① "5년 이내") */
function isWithin5Years(buildingAcqDate: string, transferDateStr: string): boolean {
  if (!buildingAcqDate || !transferDateStr) return false;
  const acq = new Date(buildingAcqDate).getTime();
  const trans = new Date(transferDateStr).getTime();
  if (isNaN(acq) || isNaN(trans)) return false;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (trans - acq) / msPerYear < 5;
}

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function GeneralBuildingAcquisitionCards({ asset, onChange, transferDate }: Props) {
  // §114조의2 가산세 5년 이내 여부 (useMemo — useEffect 미러링 금지 정책)
  const showPenaltyBadge = useMemo(() => {
    if (
      asset.gbBuildingAcquisitionCause !== "newConstruction" ||
      !asset.gbBuildingAcquisitionDate ||
      !transferDate
    ) return false;
    return isWithin5Years(asset.gbBuildingAcquisitionDate, transferDate);
  }, [asset.gbBuildingAcquisitionCause, asset.gbBuildingAcquisitionDate, transferDate]);

  return (
    <div className="space-y-3">

      {/* ── 📌 토지 취득 카드 (sky) ── */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📌</span>
          <p className="text-xs font-semibold text-sky-700">토지 취득</p>
        </div>

        <FieldCard label="취득원인">
          <RadioCardGroup
            name="gbLandAcquisitionCause"
            layout="inline"
            value={asset.acquisitionCause ?? ""}
            onChange={(v) =>
              onChange({
                acquisitionCause: v as AssetForm["acquisitionCause"],
              })
            }
            options={LAND_CAUSE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </FieldCard>

        {/* 매매: 취득일 + 환산취득가·감정가 선택 */}
        {asset.acquisitionCause === "purchase" && (
          <CompanionAcqPurchaseBlock
            acquisitionDate={asset.acquisitionDate}
            onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
            useEstimatedAcquisition={asset.useEstimatedAcquisition}
            onUseEstimatedChange={(v) => onChange({ useEstimatedAcquisition: v })}
            isAppraisalAcquisition={asset.isAppraisalAcquisition}
            onIsAppraisalAcquisitionChange={(v) => onChange({ isAppraisalAcquisition: v })}
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
            standardPriceAtAcq={asset.standardPriceAtAcq}
            onStandardPriceAtAcqChange={(v) => onChange({ standardPriceAtAcq: v })}
            standardPriceAtTransfer={asset.standardPriceAtTransfer}
            onStandardPriceAtTransferChange={(v) => onChange({ standardPriceAtTransfer: v })}
            transferDate={transferDate}
            jibun={asset.addressJibun || undefined}
            assetKind={asset.assetKind}
            acquisitionArea={asset.acquisitionArea || undefined}
            transferArea={asset.transferArea || undefined}
            standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq}
            onStandardPricePerSqmAtAcqChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
            standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
            onStandardPricePerSqmAtTransferChange={(v) =>
              onChange({ standardPricePerSqmAtTransfer: v })
            }
            pre1990Form={{
              pre1990Enabled: asset.pre1990Enabled,
              pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
              pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
              pre1990Grade_current: asset.pre1990Grade_current,
              pre1990Grade_prev: asset.pre1990Grade_prev,
              pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
              pre1990GradeMode: asset.pre1990GradeMode,
            }}
            onPre1990Change={(patch) => onChange(patch)}
            buildingType={asset.buildingType}
            onBuildingTypeChange={(v) => onChange({ buildingType: v })}
            constructionDate={asset.constructionDate}
            onConstructionDateChange={(v) => onChange({ constructionDate: v })}
            extensionFloorArea={asset.extensionFloorArea}
            onExtensionFloorAreaChange={(v) => onChange({ extensionFloorArea: v })}
            selfOwns={asset.selfOwns ?? "both"}
            onSelfOwnsChange={(v) => onChange({ selfOwns: v })}
            hasSeperateLandAcquisitionDate={false}
            onHasSeperateLandAcquisitionDateChange={() => {}}
            landAcquisitionDate={asset.landAcquisitionDate}
            onLandAcquisitionDateChange={(v) => onChange({ landAcquisitionDate: v })}
            landSplitMode={asset.landSplitMode}
            onLandSplitModeChange={(v) => onChange({ landSplitMode: v })}
            landTransferPrice={asset.landTransferPrice}
            onLandTransferPriceChange={(v) => onChange({ landTransferPrice: v })}
            buildingTransferPrice={asset.buildingTransferPrice}
            onBuildingTransferPriceChange={(v) => onChange({ buildingTransferPrice: v })}
            landAcquisitionPrice={asset.landAcquisitionPrice}
            onLandAcquisitionPriceChange={(v) => onChange({ landAcquisitionPrice: v })}
            buildingAcquisitionPrice={asset.buildingAcquisitionPrice}
            onBuildingAcquisitionPriceChange={(v) => onChange({ buildingAcquisitionPrice: v })}
            landDirectExpenses={asset.landDirectExpenses}
            onLandDirectExpensesChange={(v) => onChange({ landDirectExpenses: v })}
            buildingDirectExpenses={asset.buildingDirectExpenses}
            onBuildingDirectExpensesChange={(v) => onChange({ buildingDirectExpenses: v })}
            landStandardPriceAtTransfer={asset.landStandardPriceAtTransfer}
            onLandStandardPriceAtTransferChange={(v) =>
              onChange({ landStandardPriceAtTransfer: v })
            }
            buildingStandardPriceAtTransfer={asset.buildingStandardPriceAtTransfer}
            onBuildingStandardPriceAtTransferChange={(v) =>
              onChange({ buildingStandardPriceAtTransfer: v })
            }
            asset={asset}
            onAssetChange={onChange}
          />
        )}

        {/* 상속: 취득일 + 피상속인 취득일 + 보충적평가 */}
        {asset.acquisitionCause === "inheritance" && (
          <>
            <CompanionAcqInheritanceBlock
              assetId={asset.assetId}
              acquisitionDate={asset.acquisitionDate}
              onAcquisitionDateChange={(v) =>
                onChange({
                  acquisitionDate: v,
                  inheritanceStartDate: v,
                  ...(asset.inheritanceValuationMode === "auto"
                    ? { inheritanceDate: v }
                    : {}),
                })
              }
              decedentAcquisitionDate={asset.decedentAcquisitionDate}
              onDecedentAcquisitionDateChange={(v) =>
                onChange({ decedentAcquisitionDate: v })
              }
              valuationMode={asset.inheritanceValuationMode}
              onValuationModeChange={(mode) =>
                onChange({ inheritanceValuationMode: mode })
              }
              inheritanceAssetKind={asset.inheritanceAssetKind}
              onInheritanceAssetKindChange={(v) =>
                onChange({ inheritanceAssetKind: v })
              }
              inheritanceDate={asset.inheritanceDate}
              onInheritanceDateChange={(v) => onChange({ inheritanceDate: v })}
              landAreaM2={asset.acquisitionArea}
              publishedValueAtInheritance={asset.publishedValueAtInheritance}
              onPublishedValueAtInheritanceChange={(v) =>
                onChange({ publishedValueAtInheritance: v })
              }
              fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
              onFixedAcquisitionPriceChange={(v) =>
                onChange({ fixedAcquisitionPrice: v })
              }
              jibun={asset.addressJibun || undefined}
            />
            <InheritedAcquisitionDeemedSection
              asset={asset}
              onChange={onChange}
              transferDate={transferDate}
            />
          </>
        )}

        {/* 증여: 취득일 + 증여자 취득일 + 취득가액 */}
        {asset.acquisitionCause === "gift" && (
          <CompanionAcqGiftBlock
            acquisitionDate={asset.acquisitionDate}
            onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
            donorAcquisitionDate={asset.donorAcquisitionDate}
            onDonorAcquisitionDateChange={(v) =>
              onChange({ donorAcquisitionDate: v })
            }
            fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
            onFixedAcquisitionPriceChange={(v) =>
              onChange({ fixedAcquisitionPrice: v })
            }
          />
        )}

        {/* 이월과세(증여): CarryoverGiftBlock */}
        {asset.acquisitionCause === "carryover_gift" && (
          <CarryoverGiftBlock
            asset={asset}
            transferDate={transferDate ?? ""}
            onChange={onChange}
          />
        )}
      </div>

      {/* ── 🏗 건물 취득 카드 (amber) ── */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🏗</span>
          <p className="text-xs font-semibold text-amber-700">건물 취득</p>
        </div>

        <FieldCard label="취득원인">
          <RadioCardGroup
            name="gbBuildingAcquisitionCause"
            layout="inline"
            value={asset.gbBuildingAcquisitionCause ?? ""}
            onChange={(v) => {
              const cause = v as NonNullable<AssetForm["gbBuildingAcquisitionCause"]>;
              onChange({
                gbBuildingAcquisitionCause: cause,
                // 신축 아닌 원인으로 변경 시 건물 취득일 클리어
                // (useEffect 미러링 금지 정책 — onChange에서 직접 처리)
                ...(cause !== "newConstruction"
                  ? { gbBuildingAcquisitionDate: "" }
                  : {}),
              });
            }}
            options={BUILDING_CAUSE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </FieldCard>

        {/* 건물 취득일 — 신축 시 힌트 문구 변경 */}
        <FieldCard
          label="건물 취득일"
          hint={
            asset.gbBuildingAcquisitionCause === "newConstruction"
              ? "사용승인서 교부일·사실상 사용일·임시사용승인일 중 빠른 날 (소득세법 시행령 §162①4호)"
              : "건물 매매·상속·증여 등기접수일 또는 잔금청산일"
          }
        >
          <DateInput
            value={asset.gbBuildingAcquisitionDate ?? ""}
            onChange={(value) => onChange({ gbBuildingAcquisitionDate: value })}
          />
        </FieldCard>

        {/* §114조의2 가산세 5년 이내 안내 배지 (useMemo 파생) */}
        {showPenaltyBadge && (
          <div className="rounded bg-amber-100/80 border border-amber-300 px-3 py-2 space-y-1">
            <p className="text-xs text-amber-800 font-semibold">
              환산취득가액 가산세 적용 대상 — 건물 환산취득가액의 5% (소득세법 §114조의2 ①)
            </p>
            <p className="text-[11px] text-amber-700">
              ※ 잠정 안내 — 정확한 가산세 발동 여부는 계산 결과에서 확인
            </p>
          </div>
        )}

        {/* 건물 상속·증여 보조 입력은 후속 PR에서 구현 (본 PR 스코프 미포함) */}
      </div>

    </div>
  );
}
