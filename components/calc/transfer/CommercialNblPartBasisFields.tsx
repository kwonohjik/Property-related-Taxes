"use client";

/**
 * 상업용건물 부수토지 **초과분의 토지·건물 구분 기준시가** 입력 (NBL2611-V5-BX01 · 로드맵 R14).
 *
 * 비사업용 토지는 «토지»뿐이다(법 §104의3①). 초과 면적 비율은 건물분이 아니라 **토지분 양도차익**에만 곱하므로,
 * 호 전체 가액을 토지·건물로 나눠야 한다. 가액 구분이 불분명하면 양도가액은 **양도 당시**, 취득가액은 **취득 당시**
 * 기준시가 비율로 나눈다(「소득세법」 §100② · 같은 법 시행령 §166⑥). 자동 안분하지 않으므로 4칸이 모두 필수다.
 *
 * 초과분(또는 §101① 단서)이 있을 때만 렌더한다 — 판정은 ④·⑧과 같은 함수(`commercialAppurtenantNblAreaOfAsset`)다.
 *
 * scope:
 *  - `all`  — 자산 1(또는 단건): 취득 당시 2칸 + 양도 당시 2칸
 *  - `acq`  — 축 B 둘째 이후 지분 카드: 취득 당시 2칸만(양도 당시 2칸은 같은 물건 · 같은 양도라 자산 1 값을 쓴다 — `commercial-share-object-fields.ts`)
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { commercialAppurtenantNblAreaOfAsset } from "@/lib/calc/transfer-tax-api-commercial";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  scope: "all" | "acq";
}

export function CommercialNblPartBasisFields({ asset, onChange, scope }: Props) {
  if (!(commercialAppurtenantNblAreaOfAsset(asset) > 0)) return null;

  return (
    <ToneCard
      tone="rose"
      title="초과분 — 토지·건물 가액 구분"
      titleExtra={<span className="text-micro text-rose-700 dark:text-rose-400">(소득세법 §100② · 영 §166⑥)</span>}
    >
      <div data-testid="cb-part-basis" className="space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <LawArticleModal legalBasis="소득세법 §100" label="§100 토지·건물 안분" />
          <LawArticleModal legalBasis="소득세법 시행령 §166" label="영 §166⑥ 기준시가 안분" />
        </div>
        <p className="text-caption text-rose-700 dark:text-rose-400">
          비사업용 토지는 <strong>토지</strong>뿐이므로 초과 비율은 건물분이 아니라 <strong>토지분 양도차익</strong>에만 적용합니다.
          토지·건물 가액 구분이 불분명하면 양도가액은 양도 당시, 취득가액은 취득 당시 기준시가 비율로 나눕니다.
        </p>
        <FieldCard
          label="취득 당시 토지 기준시가"
          field="cbPartAcqLandStd"
          hint="해당 호 대지권분 — 취득 당시 개별공시지가 × 대지권 면적"
          unit="원"
        >
          <CurrencyInput label="" value={asset.cbPartAcqLandStd} onChange={(v) => onChange({ cbPartAcqLandStd: v })} hideUnit />
        </FieldCard>
        <FieldCard
          label="취득 당시 건물 기준시가"
          field="cbPartAcqBuildingStd"
          hint="해당 호 건물분 — 취득 당시 국세청 건물 기준시가(총액)"
          unit="원"
        >
          <CurrencyInput label="" value={asset.cbPartAcqBuildingStd} onChange={(v) => onChange({ cbPartAcqBuildingStd: v })} hideUnit />
        </FieldCard>
        {scope === "all" && (
          <>
            <FieldCard
              label="양도 당시 토지 기준시가"
              field="cbPartTransferLandStd"
              hint="해당 호 대지권분 — 양도 당시 개별공시지가 × 대지권 면적"
              unit="원"
            >
              <CurrencyInput label="" value={asset.cbPartTransferLandStd} onChange={(v) => onChange({ cbPartTransferLandStd: v })} hideUnit />
            </FieldCard>
            <FieldCard
              label="양도 당시 건물 기준시가"
              field="cbPartTransferBuildingStd"
              hint="해당 호 건물분 — 양도 당시 국세청 건물 기준시가(총액)"
              unit="원"
            >
              <CurrencyInput label="" value={asset.cbPartTransferBuildingStd} onChange={(v) => onChange({ cbPartTransferBuildingStd: v })} hideUnit />
            </FieldCard>
          </>
        )}
      </div>
    </ToneCard>
  );
}
