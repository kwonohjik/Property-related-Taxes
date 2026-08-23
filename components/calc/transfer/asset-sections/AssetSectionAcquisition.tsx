"use client";

/**
 * ③ 취득정보 — 취득원인 세부·신축 부수토지·세율 오버라이드·다필지·겸용 확장·상업용/일반건물/재개발 블록.
 * CompanionAssetCard L535–640 JSX를 그대로 이동.
 */
import { useState } from "react";
import type { AssetForm, ParcelFormItem } from "@/lib/stores/calc-wizard-store";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { OwnershipRatioBlock, type AssetSplitMode } from "../OwnershipRatioInput";
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
import { CommercialAppurtenantLandSection } from "../CommercialAppurtenantLandSection";
import { GeneralBuildingBlock } from "../GeneralBuildingBlock";
import { RedevelopmentBlock } from "../RedevelopmentBlock";
import { NonHousingConversionExpandedPanel } from "../NonHousingConversionSection";

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

  // 토글 B(지분 분할) 진입 차단 사유 — 이미 ON이면 차단 안 함(끄기 허용).
  // 겸용주택·특수 자산종류(상가·재개발)는 지분별 안분 UI 부재로 미지원(validate도 차단).
  //
  // ✅ **일반건물은 2026-08-10부터 지원**한다 — 지분별 토지·건물 카드를 만들어 aggregate 1회로
  //    계산하는 전용 경로가 생겼다(`app/api/calc/transfer/general-building-fractional.ts`).
  //    ⚠️ 이 목록에서 `general_building`을 뺐을 때 **부담부증여·공익수용 차단이 살아난다** —
  //       if-else 체인이라 앞 분기가 빠지면 뒤로 흘러간다(계획서 §2-2 · anchor GBF-14).
  const fractionalEntryBlockedReason =
    splitMode === "fractional"
      ? undefined
      : splitMode === "companion"
        ? "‘함께 양도’ 모드와 동시에 사용할 수 없습니다."
        : asset.assetKind === "housing" && asset.isMixedUseHouse
          ? "겸용주택은 지분 분할 취득과 함께 사용할 수 없습니다."
          : asset.assetKind === "commercial_building" ||
              asset.assetKind === "redevelopment_apt"
            ? "이 자산 종류는 지분 분할 취득을 지원하지 않습니다."
            : asset.transferType === "burdened_gift" ||
                asset.transferCause === "public_expropriation"
              ? "부담부증여·공익수용은 지분 분할 취득과 함께 사용할 수 없습니다."
              : undefined;

  /**
   * 지분율 — **지분 분할 모드 전용**으로 여기 남는다 (2026-08-11 사용자 확정).
   *
   * 「공유 지분율」(비-지분 모드)은 ① 기본정보 끝으로 옮겼다(`AssetSectionBasic`). 그 자리에서는
   * 「산정 방식 → 취득가액 → 기준시가」 흐름 한가운데를 끊었고, 지분은 취득 계산이 아니라
   * **이 물건 중 내 몫**이라는 자산 정체성이기 때문이다. 지분 분할 모드의 「취득 지분율」은
   * 취득시기·원인이 지분마다 다른 최상위 분기라 토글 B 직후(여기)가 맞다.
   */
  const ratioBlock = (
    <OwnershipRatioBlock
      numerator={asset.ownershipNumerator}
      denominator={asset.ownershipDenominator}
      label="취득 지분율"
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
  );

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
            disabled={!!fractionalEntryBlockedReason}
            disabledReason={fractionalEntryBlockedReason}
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

      {/* 지분 모드: 지분율을 최상단(토글 B 직후·취득원인 앞)에 배치 — 취득시기·원인이
          지분마다 다른 최상위 분기이므로 지분율이 그 자산을 규정하는 첫 입력값. */}
      {splitMode === "fractional" && ratioBlock}

      {/* 취득 원인 + 원인별 세부 입력 (별도 파일로 분리 — 800줄 정책) */}
      <CompanionAcquisitionCauseSection
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        isNewConstruction={isNewConstruction}
        /* 아래 `GeneralBuildingBlock`과 **같은 술어**여야 한다 — 지분 카드에서 증축 상세는
           숨기면서 유무 토글만 노출되면 물건-수준 사실이 자산별로 갈린다. */
        shareAcquisitionOnly={splitMode === "fractional" && !isFirst}
        /* §164⑤ PHD는 ④가 primary에만 싣는다 — 첫 자산이 아니면 토글 대신 안내를 띄운다.
           `shareAcquisitionOnly`와 달리 **분할 모드를 가리지 않는다**(함께양도 컴패니언도 대상). */
        isNonPrimaryAsset={!isFirst}
      />

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

      {/* 건물 전체를 주택으로 용도변경 (§95⑤·⑥) — **확장 패널만**. 토글은 ① 기본정보에 있다
          (겸용주택과 배타라 한 자리에서 고르게 하고, ③ 기본 접힘으로 발견되지 않던 문제 해소).
          날짜·미리보기가 여기 남는 이유: 미리보기가 위쪽 취득일을 읽는다 — UI 순서 = 로직 순서.
          첫 자산(index 0) 한정: Step4의 거주기간·조정대상지역이 전부 assets[0] 전용이라
          비-primary 자산은 §95⑤2호 거주분이 항상 0이 된다. */}
      {asset.assetKind === "housing" && isFirst && (
        <NonHousingConversionExpandedPanel
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
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

      {/* 상업용건물 부수토지 초과분 비사업용 판정 (지방세령 §101①2호·§101②).
          위 환산 블록과 달리 **취득방법 무관**(상속 포함) — 환산 게이트 밖에 마운트한다. */}
      {asset.assetKind === "commercial_building" && (
        <CommercialAppurtenantLandSection asset={asset} onChange={onChange} />
      )}

      {/* 일반건물(토지+건물 일괄) — 취득방법 무관 항상 마운트 (2026-05-10 실거래가 모드 지원) */}
      {asset.assetKind === "general_building" && (
        <GeneralBuildingBlock
          asset={asset}
          onChange={onChange}
          transferDate={transferDate}
          /**
           * 지분 분할의 **2번째 이후 지분**은 취득측만 입력받는다.
           * 양도시 기준시가·물건 사건(증축·용도변경)은 **물건-수준**이라 자산 1에서 한 번만 받고,
           * API 변환(`mergeGbPropertyLevel`)이 전 지분에 복사한다 — 여기서 또 받으면
           * 지분마다 다른 값이 들어가 Zod superRefine이 400을 던진다(설계 D1-3).
           */
          shareAcquisitionOnly={splitMode === "fractional" && !isFirst}
        />
      )}

      {/* 재개발/재건축 (시행령 §166) — 재개발APT(완공 신축주택 양도) + 입주권(조합원입주권 양도).
          종전에는 `redevelopment_apt` 하나만 열려 있어 **입주권을 고르면 §166 입력 UI가 아예 없었다**
          (관리처분 인가일·권리가액·청산금을 넣을 곳이 없음, 2026-08-13 제보).
          API 변환(`transfer-tax-api.ts:176`)·validate(`transfer-tax-validate-asset.ts:172`)·
          블록 내부 분기는 이미 두 종류를 모두 §166 경로로 처리하고 있었다 — UI만 빠져 있었다. */}
      {(asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in") && (
        <RedevelopmentBlock asset={asset} onChange={onChange} isOneHouseSingle={isOneHouseSingle} />
      )}
    </>
  );
}
