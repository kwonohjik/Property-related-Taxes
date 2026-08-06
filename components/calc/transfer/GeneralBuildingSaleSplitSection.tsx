"use client";

/**
 * 일반건물 — 토지·건물 **양도가액 결정 방식**(구분양도 / 일괄양도) 섹션 (Phase 2 ⑤).
 *
 * 계획서: `docs/02-design/features/general-building-sale-split-mode.plan.md` §5 · §6
 *
 * ## 조문
 *
 * 「소득세법」 제100조 제2항 — 토지·건물을 함께 양도하면 **각각 구분하여 기장**하는 것이 원칙이고,
 * 안분은 「구분이 불분명할 때」의 예외다. 같은 조 **제3항**은 구분 기장한 가액이 안분계산한 가액과
 * **100분의 30 이상** 차이나면 「불분명한 때로 본다」고 하므로, 구분값을 넣어도 엔진이 판정을 거친다.
 *
 * ## 차단 조합은 렌더하지 않고 **이유를 말한다**
 *
 * 증축(건물 2장)·부담부증여는 구분 기재가 성립하지 않는다(§5 S-10·S-11). 칸을 띄워 두고
 * validate에서 막으면 「입력했는데 계산이 안 되는」 상태가 되므로, 애초에 칸을 열지 않고
 * 사유를 표시한다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup, type RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { SaleSplitExemptionCard } from "./SaleSplitBasisExemptionCards";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const MODE_OPTIONS: RadioCardOption<"actual" | "apportioned">[] = [
  { value: "apportioned", label: "일괄양도 (양도시 기준시가 비율로 안분)" },
  { value: "actual", label: "구분양도 (계약서에 구분 기재)" },
];

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 구분 기재를 쓸 수 없는 사유 — 있으면 입력 대신 안내만 표시한다 */
  blockedReason?: string;
  sectionNum?: string;
}

export function GeneralBuildingSaleSplitSection({ asset, onChange, blockedReason, sectionNum }: Props) {
  const mode = asset.saleSplitMode ?? "apportioned";

  if (blockedReason) {
    return (
      <ToneCard tone="emerald" sectionNum={sectionNum} title="양도가액 결정 방식">
        <p className="text-xs leading-snug text-muted-foreground" data-testid="gb-sale-split-blocked">
          {blockedReason} 양도시 기준시가 비율로 안분합니다 (소득세법 시행령 §166⑥).
        </p>
      </ToneCard>
    );
  }

  return (
    <ToneCard tone="emerald" sectionNum={sectionNum} title="양도가액 결정 방식">
      <div data-testid="gb-sale-split-mode">
        <RadioCardGroup
          name="gbSaleSplitMode"
          tone="emerald"
          layout="inline"
          options={MODE_OPTIONS}
          value={mode}
          onChange={(v) => onChange({ saleSplitMode: v })}
        />
      </div>

      {mode === "actual" && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="토지 양도가액" hint="소득세법 §100②">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.landTransferPrice}
                onChange={(v) => onChange({ landTransferPrice: v })}
                placeholder="미입력 시 나머지에서 자동 계산"
                data-testid="gb-land-transfer-price"
              />
            </FieldCard>
            <FieldCard label="건물 양도가액">
              <CurrencyInput
                label=""
                hideUnit
                value={asset.buildingTransferPrice}
                onChange={(v) => onChange({ buildingTransferPrice: v })}
                placeholder="미입력 시 나머지에서 자동 계산"
                data-testid="gb-building-transfer-price"
              />
            </FieldCard>
          </div>
          <p className="text-caption leading-snug text-muted-foreground">
            구분 기재한 금액이 <strong>안분가액과 30% 이상 차이</strong>나면 「구분이 불분명한 때」로 보아
            안분가액을 적용합니다 (소득세법 §100③). 한쪽만 입력하면 나머지는 총액에서 자동 계산되며,
            그 금액도 같은 판정을 받습니다.
          </p>
          <SaleSplitExemptionCard asset={asset} onChange={onChange} />
        </div>
      )}
    </ToneCard>
  );
}
