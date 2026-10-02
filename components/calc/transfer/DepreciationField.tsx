"use client";

/**
 * ③ 취득정보 — 감가상각비 계상액 (소득세법 §97③ · 시행규칙 별지 제84호서식 부표3 ④ 차감항목).
 *
 * 양도자산 보유기간에 그 자산의 감가상각비로서 각 과세기간의 **사업소득금액** 계산 시 필요경비에
 * 산입했거나 산입할 금액이 있으면 그만큼을 **취득가액에서 공제**한다. 실가·감정·매매사례·환산 모두에
 * 적용되므로 취득가액 칸의 모드와 무관하게 취득 섹션 끝에 둔다(환산 모드는 금액 칸이 없다).
 *
 * 입력 가능 구조는 `depreciation-scope.ts`가 정한다 — ⑧ validate와 **같은 술어**다. 받을 수 없는 구조
 * (파트별 취득가액·이월과세 등)에서는 칸을 숨기고 이유를 알린다(조용히 빠지는 입력을 만들지 않는다).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { depreciationSupport } from "@/lib/calc/depreciation-scope";
import { isFractionalMode } from "./OwnershipRatioInput";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function DepreciationField({ asset, onChange }: Props) {
  const support = depreciationSupport(asset);
  if (support.status === "not_applicable") return null;
  if (support.status === "unsupported") {
    return (
      <ToneCard tone="slate" title="감가상각비 (소득세법 §97③)">
        <p className="text-xs text-muted-foreground" data-testid="depreciation-unsupported">
          {support.reason}
        </p>
      </ToneCard>
    );
  }
  const fractional = isFractionalMode(asset.ownershipNumerator, asset.ownershipDenominator);
  // 일반건물(토지+건물 일괄)은 감가상각비가 건물분에 귀속된다 — 같은 칸이지만 라벨·안내가 다르다.
  const isGb = asset.assetKind === "general_building";
  return (
    <CurrencyInput
      label={isGb ? "감가상각비 계상액 — 건물분 (원) — §97③" : "감가상각비 계상액 (원) — §97③"}
      data-field="depreciationAmount"
      data-testid="depreciation-amount"
      value={asset.depreciationAmount}
      onChange={(v) => onChange({ depreciationAmount: v })}
      hint={
        (fractional
          ? "보유 중 사업소득금액 계산 시 필요경비에 산입한 감가상각비 합계 — 취득가액에서 공제됩니다. 100% 기준 입력 — 시스템이 지분율 자동 적용."
          : "보유 중 사업소득금액(임대·사업) 계산 시 필요경비에 산입한 감가상각비 합계 — 취득가액에서 공제됩니다.") +
        (isGb ? " 건물(원건물) 취득가액에서만 공제하며 토지분·증축분에는 적용하지 않습니다." : "") +
        " 해당 없으면 비워두세요"
      }
    />
  );
}
