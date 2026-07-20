"use client";

/**
 * ③ 취득정보 — 취득원인 세부·신축 부수토지·세율 오버라이드·다필지·겸용 확장·상업용/일반건물/재개발 블록.
 * CompanionAssetCard L535–640 JSX를 그대로 이동.
 */
import { useState } from "react";
import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { OwnershipRatioInput, isFractionalMode, type AssetSplitMode } from "../OwnershipRatioInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ParcelListInput } from "@/components/calc/inputs/ParcelListInput";
import { EXPR_VALUATION_MIN_TRANSFER_DATE } from "@/lib/tax-engine/expropriation-scope";
import { MixedUseExpandedPanel } from "../MixedUseSection";
import {
  CompanionLandRateOverrideToggle,
  NewConstructionPrimarySection,
} from "../CompanionAssetCardNewConstruction";
import { CompanionAcquisitionCauseSection } from "../CompanionAcquisitionCauseSection";
import { CommercialBuildingBlock } from "../CommercialBuildingBlock";
import { CommercialInheritanceStdPriceSection } from "../CommercialInheritanceStdPriceSection";
import { GeneralBuildingBlock } from "../GeneralBuildingBlock";
import { RedevelopmentBlock } from "../RedevelopmentBlock";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  isNewConstruction: boolean;
  isPrimary: boolean;
  isOneHouseSingle?: boolean;
  /** 자산 분할 모드 (Step1 단일 소스 — 토글 B checked·disabled·지분율 노출 도출) */
  splitMode: AssetSplitMode;
  /** 토글 B(지분분할) on/off — Step1에서 assets 조작·splitMode 전이 처리 */
  onFractionalToggle: (yes: boolean) => void;
  /** 첫 자산(index===0) 여부 — 토글 B 진입점 게이트 (isPrimaryForHouseholdFlags와 별개) */
  isFirst: boolean;
  /** 형제 자산 존재(assets.length>1) — 토글 B OFF Dialog 표시 조건 */
  hasSiblings: boolean;
}

export function AssetSectionAcquisition({
  asset,
  onChange,
  transferDate,
  isNewConstruction,
  isPrimary,
  isOneHouseSingle,
  splitMode,
  onFractionalToggle,
  isFirst,
  hasSiblings,
}: Props) {
  const [pendingFractionalOff, setPendingFractionalOff] = useState(false);

  return (
    <>
      {/* 토글 B — 같은 물건 지분 분할 취득 (첫 자산 idx===0만 진입점).
          취득시기·취득원인이 지분마다 다른 최상위 분기이므로 취득원인·취득일보다 앞에 배치. */}
      {isFirst && (
        <>
          <ToggleCard
            tone="amber"
            title="같은 물건을 지분(%)별로 나눠 취득했나요?"
            description="한 물건의 소유 지분(%)을 나눠 여러 번 취득해 취득시기·취득원인이 다른 경우 (예: 60% 상속 + 40% 매매). 켜면 각 지분을 별도 자산으로 추가합니다. (※ 필지가 여러 개인 경우는 아래 ‘여러 필지’ 토글)"
            checked={splitMode === "fractional"}
            disabled={splitMode === "companion"}
            disabledReason={
              splitMode === "companion"
                ? "‘함께 양도’ 모드와 동시에 사용할 수 없습니다."
                : undefined
            }
            onCheckedChange={(yes) => {
              if (yes) onFractionalToggle(true);
              else if (hasSiblings) setPendingFractionalOff(true);
              else onFractionalToggle(false);
            }}
          />
          <Dialog open={pendingFractionalOff} onOpenChange={setPendingFractionalOff}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>지분 분할 모드를 끄시겠습니까?</DialogTitle>
                <DialogDescription>
                  추가한 지분 취득분 자산이 모두 삭제됩니다. 되돌릴 수 없습니다.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setPendingFractionalOff(false)}
                  className="rounded-md border border-border px-4 py-2 text-sm"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onFractionalToggle(false);
                    setPendingFractionalOff(false);
                  }}
                  className="rounded-md bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
                >
                  삭제하고 끄기
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* 취득 원인 + 원인별 세부 입력 (별도 파일로 분리 — 800줄 정책) */}
      <CompanionAcquisitionCauseSection
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        isNewConstruction={isNewConstruction}
      />

      {/* 공유 지분율 — 항상 노출 (단독 부분소유·함께양도·지분분할 전부. 구버전 ① 동작 보존).
          토글 B는 "여러 번 나눠 취득(형제 추가)" 진입점, 지분율 입력 자체는 모드 무관. */}
      <OwnershipRatioInput
        numerator={asset.ownershipNumerator}
        denominator={asset.ownershipDenominator}
        onChange={(patch) =>
          onChange({
            ...(patch.numerator !== undefined
              ? { ownershipNumerator: patch.numerator }
              : {}),
            ...(patch.denominator !== undefined
              ? { ownershipDenominator: patch.denominator }
              : {}),
          })
        }
      />
      {isFractionalMode(
        asset.ownershipNumerator,
        asset.ownershipDenominator,
      ) && (
        <div className="rounded-lg border-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-sm">
          <div className="flex items-start gap-2">
            <span
              aria-hidden
              className="text-amber-600 font-bold text-base leading-none mt-0.5"
            >
              ⚠
            </span>
            <div className="space-y-1.5 flex-1">
              <p className="font-semibold text-amber-900">
                지분 모드 — 모든 금액을{" "}
                <span className="underline">100% 기준</span>으로 입력하세요
              </p>
              <ul className="text-xs text-amber-800 space-y-0.5 leading-relaxed list-disc list-inside">
                <li>
                  <strong>양도가액·취득가액·필요경비</strong>는 물건
                  전체(100%) 기준으로 입력합니다. 시스템이 지분율(
                  {asset.ownershipNumerator}/{asset.ownershipDenominator})을
                  자동으로 적용합니다.
                </li>
                <li>
                  예: 60% 지분의 실제 매매가 600,000,000원 → 100% 기준{" "}
                  <strong>1,000,000,000원</strong>으로 입력 (600M ÷ 0.6).
                </li>
                <li>
                  상속 보충적평가는 공동주택가격(100%)을 그대로 입력하면
                  됩니다.
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* 신축주택 — 부수토지 한도 산정 섹션 (영 §154⑦) */}
      {isNewConstruction && asset.assetKind === "housing" && (
        <NewConstructionPrimarySection
          asset={asset}
          onChange={onChange}
        />
      )}

      {/* companion 토지 — 수동 세율 오버라이드 토글 (부수토지 일체과세 §89·영§154⑦) */}
      {asset.assetKind === "land" && !isPrimary && (
        <CompanionLandRateOverrideToggle
          asset={asset}
          onChange={onChange}
        />
      )}

      {/* 다필지 토글 (토지 전용) */}
      {asset.assetKind === "land" && (
        <ToggleCard
          tone="sky"
          title="여러 필지를 각각 다른 시기에 취득했나요? (환지·합병)"
          description="물리적으로 다른 2필지 이상을 취득원인·취득일 다르게 취득한 경우 (소득세법 시행령 §162①6호). ※ 한 필지의 지분(%)을 나눈 경우는 위 ‘지분(%)별 취득’ 토글을 사용하세요."
          checked={asset.parcelMode ?? false}
          onCheckedChange={(checked) => {
            const defaultParcel: ParcelFormItem = {
              id: `parcel-${Date.now()}-0`,
              acquisitionDate: "",
              acquisitionMethod: "estimated",
              acquisitionPrice: "",
              acquisitionArea: "",
              transferArea: "",
              standardPricePerSqmAtAcq: "",
              standardPricePerSqmAtTransfer: "",
              expenses: "0",
              capitalExpenditure: "0",
              transferExpense: "0",
              useDayAfterReplotting: false,
              replottingConfirmDate: "",
              useExchangeLandReduction: false,
              entitlementArea: "",
              allocatedArea: "",
              priorLandArea: "",
              compensationPerSqm: "",
              compensationBasisStdPrice: "",
              areaScenario: "same",
            };
            onChange({
              parcelMode: checked,
              parcels: checked && (!asset.parcels || asset.parcels.length === 0)
                ? [defaultParcel]
                : asset.parcels,
            });
          }}
        >
          <ParcelListInput
            parcels={asset.parcels ?? []}
            totalTransferPrice={parseAmount(asset.actualSalePrice || "0")}
            onChange={(parcels) => onChange({ parcels })}
            // 공익수용 §164⑨ 1호 필지별 min[] 특례 노출 조건 — 수용 + 양도 ≥ 2009.02.04.
            // (필지별 환산 여부는 ParcelListInput이 p.acquisitionMethod로 판정.
            //  다필지는 assetKind === "land" 전용이라 자산종류 축은 자명 — §164⑨ 가목)
            showExpropriationMin={
              asset.transferCause === "public_expropriation" &&
              !!transferDate &&
              transferDate >= EXPR_VALUATION_MIN_TRANSFER_DATE
            }
          />
        </ToggleCard>
      )}

      {/* 겸용주택 확장 패널 — 체크박스 ON 시 직접 귀속 필요경비 위에 노출. */}
      {asset.assetKind === "housing" && (
        <MixedUseExpandedPanel
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          useEstimatedAcquisition={asset.useEstimatedAcquisition}
          jibun={asset.addressJibun || undefined}
        />
      )}

      {/* 상업용건물·오피스텔 환산취득가 입력 (assetKind === "commercial_building" 시만 표시)
          §163⑨: 상속 취득 상가는 상속개시일 평가액 직접(환산 아님) → 환산 토글 미노출.
          상속 평가액은 상단 상속 블록(CompanionAcqInheritanceBlock)의 "상속세 신고가액"으로 입력. */}
      {asset.assetKind === "commercial_building" && asset.acquisitionCause !== "inheritance" && (
        <CommercialBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 상속 상가 §164⑥ 취득당시 기준시가 (2005.1.1 전 상속) — max(상증법 평가액, §164⑥). 소령 §163⑨2호. */}
      <CommercialInheritanceStdPriceSection asset={asset} onChange={onChange} transferDate={transferDate} />

      {/* 일반건물(토지+건물 일괄) — 취득방법 무관 항상 마운트 (2026-05-10 실거래가 모드 지원) */}
      {asset.assetKind === "general_building" && (
        <GeneralBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {/* 재개발/재건축 (시행령 §166) — assetKind === "redevelopment_apt" 시만 표시 (사례 44) */}
      {asset.assetKind === "redevelopment_apt" && (
        <RedevelopmentBlock asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
      )}
    </>
  );
}
