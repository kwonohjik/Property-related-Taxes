"use client";

/**
 * ② 양도정보 — 겸용주택 **양도가액 토지·건물 안분 방식** (계획서 `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.4).
 *
 * 1차로 토지·건물을 나누고(계약서 구분 기재 · 감정평가가액 · 양도시 기준시가), 2차로 각 축 안에서 주택·상가를 양도시 기준시가
 * 비율로 나눈다(국세청 서면4팀-1108 · 재산세과-1701). 선택지·감정 칸·예외 카드는 일반건물·주택 경로와 **공유**한다
 * (`SaleSplitBasisExemptionCards`) — 같은 축을 다르게 부르지 않는다.
 *
 * - 범위는 ④·⑧과 같은 술어(`mixedSaleSplitScope`)다. 범위 밖이면 칸을 열지 않고 **이유를 말한다**.
 * - 계약서 구분 기재는 토지·건물 **둘 다** 입력한다 — 한쪽만 받아 나머지를 자동 계산하지 않는다(자동 안분 fallback 금지).
 * - testid·라디오 name은 `mixed-` 접두로 둔다 — 일반건물(`gb-`)·주택 split 섹션과 같은 화면에 놓일 일은 없지만 E2E 스코프가 섞이지 않게 한다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  SALE_SPLIT_MODE_OPTIONS,
  SALE_SPLIT_SECTION_TITLE,
  SaleAppraisalFields,
  SaleSplitCompareBasisCard,
  SaleSplitExemptionCard,
} from "../SaleSplitBasisExemptionCards";
import { saleSplitModePatch } from "@/lib/calc/transfer-tax-split-acq-mode";
import { saleSplitProvisoApplies } from "@/lib/calc/sale-split-100-3-era";
import { mixedSaleSplitScope } from "@/lib/calc/mixed-use-sale-split-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 일반건물 섹션과 같은 이유로 제목을 선택지 타이포에 맞춘다(`GeneralBuildingSaleSplitSection` SECTION_TITLE 주석). */
const SECTION_TITLE = <span className="text-sm font-normal text-foreground">{SALE_SPLIT_SECTION_TITLE}</span>;

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 신고서 자산이 1건뿐인가 — 겸용의 이 입력은 단건만 받는다(Q-2). */
  isSingleAsset: boolean;
  /** 양도일(`YYYY-MM-DD`) — §166⑧ 예외 칸을 열지(2025.1.1. 이후) 결정한다. */
  transferDate?: string;
}

export function MixedUseSaleSplitSection({ asset, onChange, isSingleAsset, transferDate }: Props) {
  const scope = mixedSaleSplitScope(asset, { isSingleAsset });
  if (scope.status === "not_applicable") return null;

  if (scope.status === "blocked") {
    return (
      <ToneCard tone="emerald" title={SECTION_TITLE}>
        <p className="text-xs leading-snug text-muted-foreground" data-testid="mixed-sale-split-blocked">
          {scope.reason} 양도시 기준시가 비율로 안분합니다 (소득세법 시행령 §166⑥).
        </p>
      </ToneCard>
    );
  }

  const mode = asset.saleSplitMode ?? "apportioned";
  return (
    <ToneCard tone="emerald" title={SECTION_TITLE}>
      <div data-testid="mixed-sale-split-mode">
        <RadioCardGroup
          name={`mixedSaleSplitMode-${asset.assetId ?? "primary"}`}
          data-field="saleSplitMode"
          tone="emerald"
          layout="inline"
          options={SALE_SPLIT_MODE_OPTIONS}
          value={mode}
          onChange={(v) => onChange(saleSplitModePatch(v) as Partial<AssetForm>)}
        />
      </div>

      {mode === "actual" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <FieldCard field="landTransferPrice" label="토지 양도가액">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.landTransferPrice}
                onChange={(v) => onChange({ landTransferPrice: v })}
                data-testid="mixed-land-transfer-price"
              />
            </FieldCard>
            <FieldCard field="buildingTransferPrice" label="건물 양도가액">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.buildingTransferPrice}
                onChange={(v) => onChange({ buildingTransferPrice: v })}
                data-testid="mixed-building-transfer-price"
              />
            </FieldCard>
          </div>
          <p className="text-caption leading-snug text-muted-foreground">
            계약서에 적힌 토지·건물 금액을 <strong>둘 다</strong> 입력하세요(합계는 양도가액과 같아야 합니다). 주택분·상가분은
            토지·건물 각각 양도시 기준시가 비율로 나눕니다. 구분 기재한 금액이 <strong>안분가액과 30% 이상 차이</strong>나면
            「구분이 불분명한 때」로 보아 안분가액을 적용합니다 (소득세법 §100③).
          </p>
          {saleSplitProvisoApplies(transferDate) && <SaleSplitExemptionCard asset={asset} onChange={onChange} />}
          <SaleSplitCompareBasisCard asset={asset} onChange={onChange} />
        </div>
      )}

      {mode === "appraisal" && (
        <div className="space-y-2" data-testid="mixed-sale-appraisal-basis">
          <SaleAppraisalFields asset={asset} onChange={onChange} />
          <p className="text-caption leading-snug text-muted-foreground">
            감정평가가액 비율로 토지·건물을 먼저 나누고, 주택분·상가분은 토지·건물 각각 양도시 기준시가 비율로 나눕니다
            (부가가치세법 시행령 §64①1호 단서 · 소득세법 시행령 §166⑥).
          </p>
        </div>
      )}

      {mode === "apportioned" && (
        <p className="text-caption leading-snug text-muted-foreground" data-testid="mixed-sale-apportioned-note">
          양도시 기준시가 비율로 주택분·상가분, 토지·건물을 나눕니다 (소득세법 시행령 §166⑥). 기준시가는
          <strong> ③ 취득</strong> 탭의 겸용주택 기준시가 카드(양도시 개별주택가격·상가 기준시가)에서 입력합니다.
        </p>
      )}
    </ToneCard>
  );
}
