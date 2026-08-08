"use client";

/**
 * 취득 원인 선택 + 원인별 세부 입력 블록 (CompanionAssetCard 분리).
 * 800줄 정책에 따라 CompanionAssetCard.tsx에서 추출 (2026-05-07).
 */

import { cn } from "@/lib/utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CompanionAcqPurchaseBlock } from "./CompanionAcqPurchaseBlock";
import { CompanionAcqNewConstructionBlock } from "./CompanionAcqNewConstructionBlock";
import { AssetOwnershipSplitSection } from "./AssetOwnershipSplitSection";
import { NonPurchaseSplitInputsBlock } from "./NonPurchaseSplitInputsBlock";
import { NewConstructionLandAcqBlock } from "./NewConstructionLandAcqBlock";
import { computeEarliestDate } from "./NewConstructionDateBlock";
import { CompanionAcqInheritanceBlock } from "./CompanionAcqInheritanceBlock";
import { CompanionAcqGiftBlock } from "./CompanionAcqGiftBlock";
import { GiftHouseStdPriceSection } from "./GiftHouseStdPriceSection";
import { GiftLandStdPriceSection } from "./GiftLandStdPriceSection";
import { PreDeemedEstimatedNotice } from "./PreDeemedEstimatedNotice";
import { CarryoverGiftBlock } from "./CarryoverGiftBlock";
import { NewConstructionDateBlock } from "./NewConstructionDateBlock";
import { GeneralBuildingAcquisitionCards } from "./GeneralBuildingAcquisitionCards";
import { FamilyBusinessInheritanceTransferSection } from "./FamilyBusinessInheritanceTransferSection";
import { deriveLegacyPartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";

const ACQUISITION_CAUSE_OPTIONS = [
  { value: "purchase", label: "매매" },
  { value: "inheritance", label: "상속" },
  { value: "gift", label: "증여" },
  { value: "carryover_gift", label: "이월과세(증여)" },
  { value: "newConstruction", label: "신축(자가건축)" },
] as const;

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  isNewConstruction: boolean;
}

export function CompanionAcquisitionCauseSection({
  asset,
  onChange,
  transferDate,
  isNewConstruction,
}: Props) {
  // 일반건물(토지+건물 일괄) — 토지/건물 2카드로 분리 표시
  if (asset.assetKind === "general_building") {
    return (
      <GeneralBuildingAcquisitionCards
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
      />
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">취득 원인</label>
      <div className="grid grid-cols-5 gap-1.5">
        {ACQUISITION_CAUSE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() =>
              onChange({
                acquisitionCause: opt.value,
                // 매매 → 비-매매 전환 시 `hasSeperateLandAcquisitionDate` stale 정리(2026-07-30).
                // 그 플래그는 매매 경로의 취득일 2열 UI 표시 상태이지 사용자 데이터가 아니다.
                // 남겨두면 토지 취득일이 채워진 채 상속으로 넘어갔을 때 `isSeparateAcquisition`이
                // true가 되어 파트별 취득가액 필수 → 입력 칸 없는 차단이 된다.
                ...(opt.value !== "purchase" ? { hasSeperateLandAcquisitionDate: false } : {}),
              })
            }
            className={cn(
              "rounded-md border-2 px-1 py-2 text-center transition-all",
              asset.acquisitionCause === opt.value
                ? "border-primary bg-primary/5 text-primary"
                : "border-border hover:border-muted-foreground/50 hover:bg-muted/40",
            )}
          >
            <div className="text-sm font-semibold whitespace-nowrap">{opt.label}</div>
          </button>
        ))}
      </div>

      {/* 신축(자가건축) — 사용승인일 4-시점 입력 블록 (영 §162①4호, G-5) */}
      {isNewConstruction && (
        <NewConstructionDateBlock
          occupancyApprovalDate={asset.occupancyApprovalDate ?? ""}
          onOccupancyApprovalDateChange={(v) =>
            onChange({
              occupancyApprovalDate: v,
              acquisitionDate:
                computeEarliestDate(v, asset.approvalCertificateDate ?? "", asset.temporaryApprovalDate ?? "", asset.actualUseDate ?? "") ?? "",
            })
          }
          approvalCertificateDate={asset.approvalCertificateDate ?? ""}
          onApprovalCertificateDateChange={(v) =>
            onChange({
              approvalCertificateDate: v,
              acquisitionDate:
                computeEarliestDate(asset.occupancyApprovalDate ?? "", v, asset.temporaryApprovalDate ?? "", asset.actualUseDate ?? "") ?? "",
            })
          }
          temporaryApprovalDate={asset.temporaryApprovalDate ?? ""}
          onTemporaryApprovalDateChange={(v) =>
            onChange({
              temporaryApprovalDate: v,
              acquisitionDate:
                computeEarliestDate(asset.occupancyApprovalDate ?? "", asset.approvalCertificateDate ?? "", v, asset.actualUseDate ?? "") ?? "",
            })
          }
          actualUseDate={asset.actualUseDate ?? ""}
          onActualUseDateChange={(v) =>
            onChange({
              actualUseDate: v,
              acquisitionDate:
                computeEarliestDate(asset.occupancyApprovalDate ?? "", asset.approvalCertificateDate ?? "", asset.temporaryApprovalDate ?? "", v) ?? "",
            })
          }
        />
      )}

      {/* 「토지·건물 소유자 다름」 — 취득원인 라디오 직하(2026-07-30 이동).
          이 토글이 「취득일 다름」을 강제로 켜므로 그보다 **앞**에 와야 위→아래 연쇄가 된다.
          현재 노출은 매매 전용(컴포넌트 내부 게이트) — 상속·증여 확대는 별도 PR. */}
      <AssetOwnershipSplitSection asset={asset} onChange={onChange} />

      {/* 토지를 상속·증여로 취득하고 그 위에 건물을 신축한 경우 — 토지 파트 입력.
          취득원인이 자산 단위 단일값이라 종전엔 토지 취득일·취득가액 칸이 아예 없었다. */}
      <NewConstructionLandAcqBlock asset={asset} onChange={onChange} transferDate={transferDate} />

      {/* 신축(자가건축) — 신축비용(취득가액) 입력 블록 */}
      {isNewConstruction && (
        <CompanionAcqNewConstructionBlock
          fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
          onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
        />
      )}

      {asset.acquisitionCause === "purchase" && (
        <CompanionAcqPurchaseBlock
          acquisitionDate={asset.acquisitionDate}
          onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
          isSalesCaseAcquisition={asset.isSalesCaseAcquisition}
          onIsSalesCaseAcquisitionChange={(v) => onChange({ isSalesCaseAcquisition: v })}
          similarSalesValue={asset.similarSalesValue}
          onSimilarSalesValueChange={(v) => onChange({ similarSalesValue: v })}
          similarSalesSource={asset.similarSalesSource}
          onSimilarSalesSourceChange={(v) => onChange({ similarSalesSource: v })}
          acquisitionSigunguCode={asset.acquisitionSigunguCode}
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
          dong={asset.addressDong || undefined}
          ho={asset.addressHo || undefined}
          assetKind={asset.assetKind}
          acquisitionArea={asset.acquisitionArea || undefined}
          onAcquisitionAreaChange={(v) => onChange({ acquisitionArea: v })}
          acqAreaLabel={asset.areaScenario === "increase" ? "종전토지 면적 (㎡)" : undefined}
          transferArea={asset.transferArea || undefined}
          onTransferAreaChange={(v) => onChange({ transferArea: v })}
          transferAreaLabel={asset.areaScenario === "increase" ? "권리면적 (㎡)" : undefined}
          standardPricePerSqmAtAcq={asset.standardPricePerSqmAtAcq}
          onStandardPricePerSqmAtAcqChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
          standardPricePerSqmAtTransfer={asset.standardPricePerSqmAtTransfer}
          onStandardPricePerSqmAtTransferChange={(v) => onChange({ standardPricePerSqmAtTransfer: v })}
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
          isSelfBuilt={asset.isSelfBuilt}
          onIsSelfBuiltChange={(v) => onChange({ isSelfBuilt: v })}
          buildingType={asset.buildingType}
          onBuildingTypeChange={(v) => onChange({ buildingType: v })}
          constructionDate={asset.constructionDate}
          onConstructionDateChange={(v) => onChange({ constructionDate: v })}
          extensionFloorArea={asset.extensionFloorArea}
          onExtensionFloorAreaChange={(v) => onChange({ extensionFloorArea: v })}
          extensionStdPriceAtAcquisition={asset.extensionStdPriceAtAcquisition}
          onExtensionStdPriceAtAcquisitionChange={(v) => onChange({ extensionStdPriceAtAcquisition: v })}
          selfOwns={asset.selfOwns ?? "both"}
          onSelfOwnsChange={(v) => {
            onChange({
              selfOwns: v,
              hasSeperateLandAcquisitionDate: v !== "both" ? true : asset.hasSeperateLandAcquisitionDate,
            });
          }}
          hasSeperateLandAcquisitionDate={asset.hasSeperateLandAcquisitionDate}
          onHasSeperateLandAcquisitionDateChange={(v) =>
            // 분리 진입 시 파트 모드를 자산 전체 레거시 플래그에서 파생해 기록한다.
            // "actual" 하드코딩 금지 — 상단에서 이미 환산·감정을 고른 사용자의 선택이
            // 조용히 실거래가로 바뀐다. 상단 라디오는 별개 취득에서 숨겨지므로 복구도 불가능하다.
            // 다중 키를 한 번에 바꾸므로 **단일 배치 onChange**로 처리
            // (feedback_multikey_patch_stale_spread_overwrite — 분리 호출 시 stale spread 덮어쓰기).
            onChange({
              hasSeperateLandAcquisitionDate: v,
              ...(v
                ? {
                    landAcqMode: asset.landAcqMode || deriveLegacyPartAcqMode(asset),
                    buildingAcqMode: asset.buildingAcqMode || deriveLegacyPartAcqMode(asset),
                  }
                : {}),
            })
          }
          landAcquisitionDate={asset.landAcquisitionDate}
          onLandAcquisitionDateChange={(v) => onChange({ landAcquisitionDate: v })}
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

      {asset.acquisitionCause === "inheritance" && (
        <CompanionAcqInheritanceBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {asset.acquisitionCause === "gift" && (
        <CompanionAcqGiftBlock
          acquisitionDate={asset.acquisitionDate}
          onAcquisitionDateChange={(v) => onChange({ acquisitionDate: v })}
          donorAcquisitionDate={asset.donorAcquisitionDate}
          onDonorAcquisitionDateChange={(v) => onChange({ donorAcquisitionDate: v })}
          fixedAcquisitionPrice={asset.fixedAcquisitionPrice}
          onFixedAcquisitionPriceChange={(v) => onChange({ fixedAcquisitionPrice: v })}
          isBurdenedGift={asset.transferType === "burdened_gift"}
        />
      )}

      {/* 증여 주택 §164⑤~⑦ 취득당시 기준시가 — max(증여일 상증법 평가액, §164⑤~⑦). 소령 §163⑨2호.
          자체 게이트(증여 + 주택 + 최초공시 前)를 가지므로 상가 섹션과 같이 무조건 마운트한다.
          상속은 CompanionAcqInheritanceBlock 경로가 같은 위젯을 이미 렌더한다(중복 없음). */}
      <GiftHouseStdPriceSection asset={asset} onChange={onChange} transferDate={transferDate} />

      {/* 증여 토지 §164④ 취득당시 기준시가 — max(증여일 상증법 평가액, §164④). 소령 §163⑨1호.
          환산(나목)과 무관한 가목 입력이라 환산 모드 토글 밖에 둔다. */}
      <GiftLandStdPriceSection asset={asset} onChange={onChange} transferDate={transferDate} />

      {/* 의제취득일 前 상속·증여 + ①·② 미충족 → §163⑨ 평가액 미반영 안내 + 「가목 확인 불가」 선언.
          E-1(U2-E)로 **차단이 붙었다** — 선언이 없으면 `clauseADeclarationError`가 계산을 막는다.
          자체 게이트(⑧ validate와 같은 술어)를 가지므로 취득원인 분기 없이 마운트한다.

          ⚠️ **위치가 의미를 만든다** — 「①도 ②도 없다」는 판정이므로 ①·② 입력칸을 **모두 보여준 뒤**에
             와야 한다. 상속은 위 `CompanionAcqInheritanceBlock`이, 증여는 바로 위 두 §164 섹션이
             그 칸을 낸다. 그래서 가업상속공제(§97의2④)는 이 아래로 미뤘다 — 종전에는 그것이 ①과
             선언 토글 사이에 끼어 "못 구하겠다"는 사용자가 무관한 카드를 지나쳐야 했다. */}
      <PreDeemedEstimatedNotice asset={asset} onChange={onChange} />

      {/* 가업상속공제 §97의2④ 의제 취득가액 — 상속 취득원인 시만 표시.
          §163⑨의 ①②③ 결정이 끝난 **뒤에 얹히는 특례**라 순서상으로도 여기가 맞다. */}
      {asset.acquisitionCause === "inheritance" && (
        <FamilyBusinessInheritanceTransferSection
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
        />
      )}

      {asset.acquisitionCause === "carryover_gift" && (
        <CarryoverGiftBlock
          asset={asset}
          transferDate={transferDate ?? ""}
          onChange={onChange}
        />
      )}

      {/* 비-매매 취득원인의 소유자 분리 입력 — 취득시 기준시가(§166⑥ 안분 비율) + 축 A.
          매매는 `CompanionAcqPurchaseBlock`이 이미 제공하므로 내부 게이트로 비노출된다.
          이 입력이 없으면 `calcSplitGain`이 null → `selfOwns` 무시 → 비소유 파트까지 과세. */}
      <NonPurchaseSplitInputsBlock asset={asset} onChange={onChange} transferDate={transferDate} />
    </div>
  );
}
