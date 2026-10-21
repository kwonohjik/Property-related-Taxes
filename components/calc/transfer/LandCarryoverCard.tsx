"use client";

/**
 * P3 A — **토지만 이월과세**(소득세법 §97의2①) + 건물 매매·신축: 토지 파트의 증여 사건·증여자 취득 입력 (`landCarryover` 서브폼).
 * P4 B — **건물만 이월과세** + 토지 매매: `part="building"`이면 같은 구성으로 건물 파트를 받는다(`carryover` 서브폼 — 호스트가 「이월과세(증여)」다).
 *   B의 건물 취득일은 읽는 쪽 파생이다(`normalizeBuildingCauseInputs` — 매매 블록의 건물 날짜 칸은 읽기 전용) — 등기접수일 칸은 `carryover`에만 쓴다.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.3·§4.2·§4.3·§5.2
 * 「토지는 다른 원인으로 취득」에서 원인 「이월과세(증여)」를 고르면 `LandPartCauseBlock`이 이 카드를 연다. 위→아래 = 계산 순서:
 *   ① 증여 등기접수일(= 토지 취득일, write-through) → ② 토지 — 증여자 취득 → ③ 증여세 상당액 → ④ 관계·적용배제
 * 토지 증여 신고가액은 기존 토지 가액 칸(매매: 취득가액 산정 방식의 토지 칸 · 신축: 블록의 토지 칸)이 받는다 — 같은 `data-field`를 두 번 두지 않는다.
 *
 * · P5 §97의2②2호 — B(건물)는 증여자와의 세대 사실을 묻는다(건물이 증여받은 주택 — 자산 단위와 같은 술어·앵커 `carryover.*`). A(토지)는 묻지 않는다(건물은 본인 취득).
 *   배우자 1세대1주택 예외는 A·B 모두 묻지 않는다(해석례의 대상이 주택·주택 지분 — 통째 증여 C만). 고지는 caption(`split-carryover-household-note`).
 * · 증여 등기접수일 한 patch로 `landCarryover.giftRegistryDate`와 `landAcquisitionDate`를 함께 쓴다(Q-8, 다중 키 단일 배치). 읽는 쪽 사본
 *   (`normalizeBuildingCauseInputs`)이 어긋남을 등기접수일로 덮는다.
 */
import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { isFractionalOwnership } from "@/lib/calc/transfer-tax-api-helpers";
import { CarryoverGiftExclusionSection } from "./CarryoverGiftExclusionSection";
import { SHARE_MODE_GIFT_TAX_HINT } from "./CarryoverGiftBlock";
import { SplitPartCarryoverCard } from "./SplitPartCarryoverCard";
import { SplitCarryoverGiftTaxCard } from "./SplitCarryoverParts";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { carryoverHouseholdFactVisible } from "@/lib/calc/transfer-tax-api-carryover";

export function LandCarryoverCard(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 함께 양도하는 다른 자산이 있다(assets.length>1) — 엔진 S2′ 400과 같은 사실(N8). */
  hasCompanions?: boolean;
  /** 이월과세 파트 — 기본 토지(A). 건물(B)은 `carryover` 서브폼에 묶는다. */
  part?: "land" | "building";
}) {
  const { asset, onChange } = props;
  const isBuilding = props.part === "building";
  const name = isBuilding ? "건물" : "토지";
  const c = (isBuilding ? asset.carryover : asset.landCarryover) ?? CARRYOVER_DEFAULTS;
  const patch = (p: Partial<CarryoverTaxationForm>) => onChange(isBuilding ? { carryover: { ...c, ...p } } : { landCarryover: { ...c, ...p } });
  const isAfter2024 = (props.transferDate ?? "") >= "2024-01-01";
  const giftTaxShareHint = isFractionalOwnership(asset) ? SHARE_MODE_GIFT_TAX_HINT : "";

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:bg-amber-950/40" data-testid={isBuilding ? "building-carryover-card" : "land-carryover-card"}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">{name} 이월과세(증여) 정보</p>
        <LawArticleModal legalBasis="소득세법 §97의2" label="§97의2" />
      </div>
      <p className="text-caption text-amber-800 dark:text-amber-200">
        {name}을(를) <strong>배우자 또는 직계존비속</strong>으로부터 증여받고, 증여일부터 <strong>10년</strong>(2023.1.1. 전 증여는 5년) 이내에 양도하는 경우입니다.
        그 밖의 관계로부터 증여받았다면 {isBuilding ? "취득 원인" : "토지 취득 원인"}을 <strong>「증여」</strong>로 선택하세요.
      </p>

      {props.hasCompanions && (
        <div className="space-y-2" data-testid="split-carryover-notices">
          <ToneCard tone="rose" bodyClassName="space-y-1">
            <p className="text-caption text-rose-800 dark:text-rose-200" data-testid="split-carryover-companion-exists-note">
              함께 양도하는 다른 자산이 있으면 토지·건물 파트 이월과세를 아직 계산하지 못합니다 — 파트별 비교과세(§97의2②3호)가 신고 전체의 결정세액을 보지 못하기 때문입니다.
              이 입력은 이 자산 한 건만 양도할 때 쓸 수 있습니다.
            </p>
          </ToneCard>
        </div>
      )}

      <ToneCard tone="amber" sectionNum={1} title="증여 기본 정보" bodyClassName="space-y-3">
        <FieldCard
          label="증여 등기접수일"
          field={isBuilding ? "carryover.giftRegistryDate" : "landCarryover.giftRegistryDate"}
          hint={`${name} 취득일입니다 — 이월과세 적용기간(소득세법 §97의2①) 기산일 (등기부 기재일). 아래 ${name} 취득일 칸에 그대로 ${isBuilding ? "표시됩니다" : "들어갑니다"}.`}
          trailing={<LawArticleModal legalBasis="소득세법 §97의2 ③" label="§97의2③" />}
        >
          <DateInput
            value={c.giftRegistryDate}
            // Q-8 — A: 등기접수일 = 토지 취득일. 두 키를 한 patch로 쓴다(useEffect 미러링 금지). B: 건물 취득일은 읽는 쪽 파생이라 등기접수일만 쓴다.
            onChange={(v) => onChange(isBuilding ? { carryover: { ...c, giftRegistryDate: v } } : { landCarryover: { ...c, giftRegistryDate: v }, landAcquisitionDate: v })}
            data-testid={isBuilding ? "building-carryover-gift-date" : "land-carryover-gift-date"}
          />
        </FieldCard>
      </ToneCard>

      <SplitPartCarryoverCard
        part={isBuilding ? "building" : "land"}
        sectionNum={2}
        value={c}
        onPatch={patch}
        anchorPrefix={isBuilding ? "carryover" : "landCarryover"}
        isAfter2024={isAfter2024}
      />

      <SplitCarryoverGiftTaxCard
        sectionNum={3}
        value={c}
        onPatch={patch}
        anchorPrefix={isBuilding ? "carryover" : "landCarryover"}
        partsLabel={name}
        giftTaxShareHint={giftTaxShareHint}
      />

      <div className="rounded-md border border-rose-200/70 bg-rose-50/40 p-3 dark:bg-rose-950/40">
        <CarryoverGiftExclusionSection
          exclusionDeclared={c.exclusionDeclared}
          onChange={(p) => patch({ exclusionDeclared: { ...c.exclusionDeclared, ...p } })}
          donorRelation={c.donorRelation}
          donorDeceased={c.donorDeceased}
          spouseGiftOneHouseAtGiftDate={c.spouseGiftOneHouseAtGiftDate}
          donorSameHousehold={c.donorSameHousehold}
          donorHouseholdHoldingStartDate={c.donorHouseholdHoldingStartDate}
          donorPriorHouseholdResidenceMonths={c.donorPriorHouseholdResidenceMonths}
          donorAcquisitionDate={c.donorAcquisitionDate}
          // P5 — B(건물)는 세대 사실을 묻는다(④가 사건에 싣는다 · 같은 술어). A(토지)는 묻지 않는다. 배우자 예외는 A·B 모두 묻지 않는다(P5-Q3·Q4).
          showHouseholdFact={isBuilding && carryoverHouseholdFactVisible(asset)}
          showSpouseOneHouseFact={false}
          giftRegistryDate={c.giftRegistryDate}
          assetId={asset.assetId}
          onRelationChange={patch}
          anchorPrefix={isBuilding ? "carryover" : "landCarryover"}
        />
      </div>

      <p className="text-caption text-muted-foreground" data-testid="split-carryover-household-note">
        {isBuilding ? (
          <>
            건물만 증여받은 경우에는 배우자 예외(증여일 현재 1세대1주택을 배우자로부터 증여받으면 소득세법 §97의2②2호를 적용하지 않음)를 묻지 않고 적용하지 않습니다 —
            해석례가 주택(또는 주택 지분)을 증여받은 경우만 다룹니다. 해당하는 양도라면 <strong>확인 필요</strong>입니다.
          </>
        ) : (
          <>
            토지만 증여받은 경우에는 증여자와의 세대 사실과 배우자 예외(소득세법 §97의2②2호)를 묻지 않습니다 — 건물은 본인이 취득했고, 1세대1주택 판정에서 토지는 증여일부터
            보유한 것으로 봅니다(이월과세를 적용하면 증여자 취득일부터). 토지만 증여받은 경우를 정면으로 다룬 해석례가 없어 해당하는 양도라면 <strong>확인 필요</strong>입니다.
          </>
        )}
      </p>
    </div>
  );
}
