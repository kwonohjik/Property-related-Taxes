"use client";

/**
 * 의제취득일(1985.1.1.) 전 상속 비주택 건물(상가) × 부담부증여 양도세 — §164⑥ 취득당시 기준시가 8칸 (PR-7b-3b · 사용자 결정 Q-38).
 *
 * 8칸이 다 차면 시가 평가에서는 ②(①②③ 중 큰 금액 비교), 기준시가 평가에서는 의제취득일 기준시가다(Q-27 — 비우면 위 칸 값).
 * 양도세 계산기 `CommercialInheritanceStdPriceSection`과 같은 물리량·같은 산식(엔진 `computeCommercial164_6StdPrice`)이다 — 그 섹션은
 * `AssetForm`에 묶여 있어(호별고시가 조회 모달 등) 이 경로는 입력 칸만 따로 둔다. 술어는 ④·⑧과 같은 `lib/calc/gift-burdened-pre-deemed.ts`.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { Sec164_5ProvisoNotice } from "@/components/calc/transfer/Sec164_5ProvisoNotice";
import { round2 } from "@/lib/tax-engine/area-utils";
import { giftBgCommercial164Applies } from "@/lib/calc/gift-burdened-pre-deemed";
import { giftBgCommercial164Std } from "@/lib/calc/gift-burdened-pre-deemed";
import { giftBgPreDeemedUsesThreeWay } from "@/lib/calc/gift-burdened-pre-deemed";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";

/** 의제취득일 — §164⑥의 「취득당시」(소득세법 부칙 법률 제4803호 §8) */
const DEEMED = "1985-01-01";

interface Props {
  item: EstateItem;
  bgt: BurdenedGiftTransferTaxInput;
  set: (patch: Partial<BurdenedGiftTransferTaxInput>) => void;
  /** 자산 소재지 jibun (LandPriceLookupField 조회용) */
  jibun?: string;
  /** 증여일(= 양도일) — 건물 기준시가 모달 prefill */
  transferDate?: string;
}

export function BurdenedGiftCommercial164Fields({ item, bgt, set, jibun, transferDate }: Props) {
  if (!giftBgCommercial164Applies(item)) return null;
  const threeWay = giftBgPreDeemedUsesThreeWay(item);
  const std = giftBgCommercial164Std(item);
  const exclusive = parseFloat(bgt.c164ExclusiveArea || "0") || 0;
  const shared = parseFloat(bgt.c164SharedArea || "0") || 0;
  const totalFloorArea = exclusive + shared > 0 ? round2(exclusive + shared) : null;
  const landArea = parseFloat(bgt.c164LandArea || "0") || undefined;

  return (
    <div data-testid="bg-c164">
    <ToneCard tone="amber" title="§164⑥ 취득당시 기준시가 (선택)">
      <div className="flex flex-wrap items-center gap-1.5">
        <LawArticleModal legalBasis="소득세법 시행령 §163 ⑨ 2호" label="§163⑨2호" />
        <LawArticleModal legalBasis="소득세법 시행령 §164 ⑥" label="§164⑥" />
      </div>
      <p data-testid="bg-c164-note" className="text-xs text-amber-700 dark:text-amber-300">
        {threeWay ? (
          <>
            상가 기준시가 최초고시(2005.1.1.) 전에 상속받은 상가는 이 값이 <b>② 후보</b>이자 <b>③ 환산취득가액의 의제취득일 기준시가</b>입니다
            — ① 상속개시일 상증법 평가액·② 이 값·③ 환산취득가액 중 큰 금액에 채무비율을 곱합니다.
          </>
        ) : (
          <>
            부담부증여를 기준시가로 평가하면 이 값을 <b>의제취득일(1985.1.1.) 기준시가</b>로 씁니다 — 그 기준시가에 채무비율을 곱한 금액이
            취득가액입니다. 전부 비워두면 위 의제취득일 기준시가 칸 값을 씁니다.
          </>
        )}{" "}
        §164⑥은 국세청장이 토지와 건물을 일괄하여 기준시가를 산정·고시하는 오피스텔·상업용 건물(소득세법 §99①1호 다목)의 규정입니다 — 해당하지 않는 건물이면 비워두세요.
        취득당시 기준시가는 최초고시(2005) 역환산으로 산정합니다. <b>8개 항목을 모두</b> 입력한 경우에만 쓰고,{" "}
        <b>일부만 입력하면 계산할 때 오류로 안내</b>합니다.
      </p>

      <ToneCard tone="emerald" sectionNum="1" title="면적 (㎡)">
        <FieldCard label="전용면적" unit="㎡">
          <DecimalInput value={bgt.c164ExclusiveArea ?? ""} onChange={(v) => set({ c164ExclusiveArea: v })} data-testid="bg-c164-exclusive" />
        </FieldCard>
        <FieldCard label="공유면적" unit="㎡">
          <DecimalInput value={bgt.c164SharedArea ?? ""} onChange={(v) => set({ c164SharedArea: v })} data-testid="bg-c164-shared" />
        </FieldCard>
        <FieldCard label="대지면적(대지권)" unit="㎡">
          <DecimalInput value={bgt.c164LandArea ?? ""} onChange={(v) => set({ c164LandArea: v })} data-testid="bg-c164-land-area" />
        </FieldCard>
      </ToneCard>

      <ToneCard tone="emerald" sectionNum="2" title="최초고시(2005) 호별 ㎡당 고시가 (원/㎡)">
        <FieldCard label="최초고시(2005) ㎡당 호별고시가" unit="원/㎡" hint="국세청 고시 이력에서 확인.">
          <CurrencyInput label="" value={bgt.c164UnitPriceAtFirst ?? ""} onChange={(v) => set({ c164UnitPriceAtFirst: v })} hideUnit data-testid="bg-c164-unit-first" />
        </FieldCard>
      </ToneCard>

      <ToneCard tone="amber" sectionNum="3" title="건물 기준시가 — 취득시·최초고시 (원, 총액)">
        <Sec164_5ProvisoNotice
          acquisitionDate={DEEMED}
          checked={bgt.c164AcqBuildingStdBy164_5 === true}
          onCheckedChange={(v) => set({ c164AcqBuildingStdBy164_5: v || undefined })}
          timePointLabel="취득당시 의제취득일"
        />
        <FieldCard label="취득시(의제취득일 1985.1.1.) 건물 기준시가" unit="원" hint="㎡당 단가 × 연면적(보정계수 반영) = 건물 기준시가 총액">
          <CurrencyInput label="" value={bgt.c164BuildingStdPriceAtAcq ?? ""} onChange={(v) => set({ c164BuildingStdPriceAtAcq: v })} hideUnit data-testid="bg-c164-bld-acq" />
        </FieldCard>
        <div className="flex justify-end">
          <BuildingStdPriceModalButton
            lockedTaxType="transfer"
            snapshotKey={`bsp-estate-${item.id}-c164-acq`}
            applyTimePoint="acquisition"
            hideFloorAreaInput
            prefill={{ floorArea: totalFloorArea != null ? String(totalFloorArea) : undefined, landAreaM2: bgt.c164LandArea, acquisitionDate: DEEMED, transferDate }}
            onApply={(v) => set({ c164BuildingStdPriceAtAcq: String(v), c164AcqBuildingStdBy164_5: true })}
          />
        </div>
        <FieldCard label="최초고시시(2005) 건물 기준시가" unit="원">
          <CurrencyInput label="" value={bgt.c164BuildingStdPriceAtFirst ?? ""} onChange={(v) => set({ c164BuildingStdPriceAtFirst: v })} hideUnit data-testid="bg-c164-bld-first" />
        </FieldCard>
      </ToneCard>

      <ToneCard tone="amber" sectionNum="4" title="개별공시지가 — 취득시·최초고시 (원/㎡)" bodyClassName="space-y-3">
        <LandPriceLookupField
          label="취득시(의제취득일 1985.1.1.) 개별공시지가"
          hint="1985.1.1. 현재 개별공시지가는 고시되지 않았습니다(최초 고시 1990.8.30.) — 토지등급으로 환산한 ㎡당 가액(소득세법 시행령 §164④)을 입력하세요."
          pricePerSqm={bgt.c164LandPricePerSqmAtAcq ?? ""}
          onPricePerSqmChange={(v) => set({ c164LandPricePerSqmAtAcq: v })}
          area={landArea}
          referenceDate={DEEMED}
          jibun={jibun}
          pricePerSqmTestId="bg-c164-land-acq"
        />
        <LandPriceLookupField
          label="최초고시시(2005) 개별공시지가"
          pricePerSqm={bgt.c164LandPricePerSqmAtFirst ?? ""}
          onPricePerSqmChange={(v) => set({ c164LandPricePerSqmAtFirst: v })}
          area={landArea}
          referenceDate="2005-01-01"
          jibun={jibun}
          pricePerSqmTestId="bg-c164-land-first"
        />
      </ToneCard>

      {std !== null && (
        <FieldCard label="§164⑥ 취득당시 기준시가">
          <p data-testid="bg-c164-std" className="font-mono tabular-nums text-sm">
            {std.toLocaleString()}
          </p>
        </FieldCard>
      )}
    </ToneCard>
    </div>
  );
}
