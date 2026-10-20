"use client";

/**
 * P3 A — **토지만 이월과세**(소득세법 §97의2①) + 건물 매매·신축: 토지 파트의 증여 사건·증여자 취득 입력 (`landCarryover` 서브폼).
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.3·§4.2·§4.3
 * 「토지는 다른 원인으로 취득」에서 원인 「이월과세(증여)」를 고르면 `LandPartCauseBlock`이 이 카드를 연다. 위→아래 = 계산 순서:
 *   ① 증여 등기접수일(= 토지 취득일, write-through) → ② 토지 — 증여자 취득 → ③ 증여세 상당액 → ④ 관계·적용배제
 * 토지 증여 신고가액은 기존 토지 가액 칸(매매: 취득가액 산정 방식의 토지 칸 · 신축: 블록의 토지 칸)이 받는다 — 같은 `data-field`를 두 번 두지 않는다.
 *
 * · 세대 사실·배우자 1세대1주택 예외 사실은 묻지 않는다(Q-9 · P5) — N5 caption.
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

export function LandCarryoverCard(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 함께 양도하는 다른 자산이 있다(assets.length>1) — 엔진 S2′ 400과 같은 사실(N8). */
  hasCompanions?: boolean;
}) {
  const { asset, onChange } = props;
  const c = asset.landCarryover ?? CARRYOVER_DEFAULTS;
  const patch = (p: Partial<CarryoverTaxationForm>) => onChange({ landCarryover: { ...c, ...p } });
  const isAfter2024 = (props.transferDate ?? "") >= "2024-01-01";
  const giftTaxShareHint = isFractionalOwnership(asset) ? SHARE_MODE_GIFT_TAX_HINT : "";

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/40 p-4 dark:bg-amber-950/40" data-testid="land-carryover-card">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">토지 이월과세(증여) 정보</p>
        <LawArticleModal legalBasis="소득세법 §97의2" label="§97의2" />
      </div>
      <p className="text-caption text-amber-800 dark:text-amber-200">
        토지를 <strong>배우자 또는 직계존비속</strong>으로부터 증여받고, 증여일부터 <strong>10년</strong>(2023.1.1. 전 증여는 5년) 이내에 양도하는 경우입니다.
        그 밖의 관계로부터 증여받았다면 토지 취득 원인을 <strong>「증여」</strong>로 선택하세요.
      </p>

      <div className="space-y-2" data-testid="split-carryover-notices">
        <ToneCard tone="amber" bodyClassName="space-y-1">
          <p className="text-caption text-amber-900 dark:text-amber-200" data-testid="split-carryover-onehouse-notice">
            토지·건물 중 한 부분이라도 이월과세(소득세법 §97의2) 대상으로 입력하면 <strong>1세대1주택 비과세(§89①3호) 판정 대상인 양도는 아직 계산하지 못합니다</strong> —
            이월과세 적용 여부(§97의2②2호)가 비과세 판정에 따라 달라지기 때문입니다. 비과세 판정 대상이 아닌 양도에서만 이 입력을 쓸 수 있습니다.
          </p>
        </ToneCard>
        {props.hasCompanions && (
          <ToneCard tone="rose" bodyClassName="space-y-1">
            <p className="text-caption text-rose-800 dark:text-rose-200" data-testid="split-carryover-companion-exists-note">
              함께 양도하는 다른 자산이 있으면 토지·건물 파트 이월과세를 아직 계산하지 못합니다 — 파트별 비교과세(§97의2②3호)가 신고 전체의 결정세액을 보지 못하기 때문입니다.
              이 입력은 이 자산 한 건만 양도할 때 쓸 수 있습니다.
            </p>
          </ToneCard>
        )}
      </div>

      <ToneCard tone="amber" sectionNum={1} title="증여 기본 정보" bodyClassName="space-y-3">
        <FieldCard
          label="증여 등기접수일"
          field="landCarryover.giftRegistryDate"
          hint="토지 취득일입니다 — 이월과세 적용기간(소득세법 §97의2①) 기산일 (등기부 기재일). 아래 토지 취득일 칸에 그대로 들어갑니다."
          trailing={<LawArticleModal legalBasis="소득세법 §97의2 ③" label="§97의2③" />}
        >
          <DateInput
            value={c.giftRegistryDate}
            // Q-8 — 등기접수일 = 토지 취득일. 두 키를 한 patch로 쓴다(useEffect 미러링 금지).
            onChange={(v) => onChange({ landCarryover: { ...c, giftRegistryDate: v }, landAcquisitionDate: v })}
            data-testid="land-carryover-gift-date"
          />
        </FieldCard>
      </ToneCard>

      <SplitPartCarryoverCard part="land" sectionNum={2} value={c} onPatch={patch} anchorPrefix="landCarryover" isAfter2024={isAfter2024} />

      <SplitCarryoverGiftTaxCard
        sectionNum={3}
        value={c}
        onPatch={patch}
        anchorPrefix="landCarryover"
        partsLabel="토지"
        giftTaxShareHint={giftTaxShareHint}
      />

      <div className="rounded-md border border-rose-200/70 bg-rose-50/40 p-3 dark:bg-rose-950/40">
        <CarryoverGiftExclusionSection
          exclusionDeclared={c.exclusionDeclared}
          onChange={(p) => onChange({ landCarryover: { ...c, exclusionDeclared: { ...c.exclusionDeclared, ...p } } })}
          donorRelation={c.donorRelation}
          donorDeceased={c.donorDeceased}
          spouseGiftOneHouseAtGiftDate={c.spouseGiftOneHouseAtGiftDate}
          donorSameHousehold={c.donorSameHousehold}
          donorHouseholdHoldingStartDate={c.donorHouseholdHoldingStartDate}
          donorPriorHouseholdResidenceMonths={c.donorPriorHouseholdResidenceMonths}
          donorAcquisitionDate={c.donorAcquisitionDate}
          // 파트 이월과세는 세대 사실(Q-9)·배우자 1세대1주택 예외(§97의2②2호, P5)를 묻지 않는다 — ④가 싣지 않는다.
          showHouseholdFact={false}
          showSpouseOneHouseFact={false}
          giftRegistryDate={c.giftRegistryDate}
          assetId={asset.assetId}
          onRelationChange={patch}
          anchorPrefix="landCarryover"
        />
      </div>

      <p className="text-caption text-muted-foreground" data-testid="split-carryover-household-note">
        증여자와 증여일부터 양도일까지 계속 같은 세대였는지는 묻지 않습니다. 이 사실은 1세대1주택 비과세 판정의 보유기간 통산·거주요건에 쓰이는데 이 입력은 그 판정과 함께
        계산하지 않으므로 세액에 반영되지 않습니다 — 해당하는 양도라면 <strong>확인 필요</strong>입니다.
      </p>
    </div>
  );
}
