"use client";

/**
 * 파트 이월과세 C(증여자가 토지·건물을 다른 날 취득)의 **입력 섹션 ②③④** — `CarryoverGiftBlock`이 토글 ON일 때 ① 다음에 렌더한다.
 *
 *   ② 토지 — 증여자 취득   (`landCarryover` 서브폼 + 파트 취득가액 `landAcquisitionPrice`)
 *   ③ 건물 — 증여자 취득   (`carryover` 서브폼 + 파트 취득가액 `buildingAcquisitionPrice`)
 *   ④ 증여세·필요경비      (증여 사건 1벌: 산출세액·과세가액 — 영 §163의2②, `carryover`)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §3.2
 * 증여 사건의 나머지(등기접수일·관계·사망·적용배제)는 `CarryoverGiftBlock`의 ①·⑤가 받는다 — 사건은 한 벌이고 건물 서브폼(`carryover`)이 정본이다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { SplitPartCarryoverCard } from "./SplitPartCarryoverCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 ≥ 2024.1.1. */
  isAfter2024: boolean;
  /** 지분 모드의 증여세 칸 예외 안내(기존 블록과 같은 문구) */
  giftTaxShareHint: string;
}

export function SplitCarryoverParts({ asset, onChange, isAfter2024, giftTaxShareHint }: Props) {
  const building = asset.carryover ?? CARRYOVER_DEFAULTS;
  const land = asset.landCarryover ?? CARRYOVER_DEFAULTS;
  const patchBuilding = (patch: Partial<CarryoverTaxationForm>) => onChange({ carryover: { ...building, ...patch } });
  const patchLand = (patch: Partial<CarryoverTaxationForm>) => onChange({ landCarryover: { ...land, ...patch } });

  return (
    <>
      <SplitPartCarryoverCard
        part="land"
        sectionNum={2}
        value={land}
        onPatch={patchLand}
        valuation={asset.landAcquisitionPrice ?? ""}
        onValuationChange={(v) => onChange({ landAcquisitionPrice: v })}
        anchorPrefix="landCarryover"
        valuationField="landAcquisitionPrice"
        isAfter2024={isAfter2024}
      />
      <SplitPartCarryoverCard
        part="building"
        sectionNum={3}
        value={building}
        onPatch={patchBuilding}
        valuation={asset.buildingAcquisitionPrice ?? ""}
        onValuationChange={(v) => onChange({ buildingAcquisitionPrice: v })}
        anchorPrefix="carryover"
        valuationField="buildingAcquisitionPrice"
        isAfter2024={isAfter2024}
        inheritedNotice
      />

      <ToneCard tone="amber" sectionNum={4} title="증여세 상당액 (필요경비 가산)" bodyClassName="space-y-3">
        <FieldCard
          label="증여세 산출세액"
          field="carryover.giftTaxCalculated"
          hint={
            "「소득세법 시행령」 제163조의2 제2항 제1호 — 증여받은 자산 전체에 대한 증여세 산출세액. 토지·건물 몫은 아래 과세가액과 위 증여 신고가액으로 자동 안분됩니다." +
            giftTaxShareHint
          }
          trailing={<LawArticleModal legalBasis="소득세법 시행령 §163의2" label="시행령 §163의2" />}
        >
          <CurrencyInput
            label=""
            value={building.giftTaxCalculated}
            onChange={(v) => patchBuilding({ giftTaxCalculated: v })}
            placeholder="없으면 0"
            data-testid="split-carryover-gift-tax-calculated"
          />
        </FieldCard>
        <FieldCard
          label="증여세 과세가액"
          field="carryover.giftTaxBase"
          hint={"「상속세 및 증여세법」 제47조 과세가액 — 안분 분모입니다. 증여받은 재산 전체 기준이며, 토지·건물 증여 신고가액의 합은 이 금액을 넘을 수 없습니다." + giftTaxShareHint}
        >
          <CurrencyInput
            label=""
            value={building.giftTaxBase}
            onChange={(v) => patchBuilding({ giftTaxBase: v })}
            data-testid="split-carryover-gift-tax-base"
          />
        </FieldCard>
      </ToneCard>
    </>
  );
}
