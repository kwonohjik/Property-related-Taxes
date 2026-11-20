"use client";

/**
 * 판정 메뉴 ② 「공동명의(지분)」 — 결정 Q-24 · PR-20b. 판정에는 쓰지 않고(예상 양도가액은 주택 전체) 계산기로 넘길 지분을 받는다.
 * 지분율 칸은 계산기와 같은 위젯(`OwnershipRatioInput` — 백분율 · 분모 100)이다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { OwnershipRatioInput } from "@/components/calc/transfer/OwnershipRatioInput";
import { judgmentOwnershipShareOn, judgmentOwnershipSharePatch } from "@/lib/calc/judgment-ownership-share";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

export function JudgmentOwnershipShareField({ asset, onChange }: Props) {
  const on = judgmentOwnershipShareOn(asset);
  return (
    <div className="space-y-2" data-testid="judgment-ownership-share">
      <ToggleCard
        variant="card"
        size="sm"
        tone="violet"
        checked={on}
        onCheckedChange={(v) => onChange(judgmentOwnershipSharePatch(v))}
        title="공동명의(지분)로 소유합니다"
        description="나머지 지분은 다른 사람(배우자 등) 소유인 경우 켜세요. 판정은 주택 전체 가액으로 하고, 세액 계산으로 넘길 때 본인 지분율을 함께 넘깁니다."
      />
      {on && (
        <OwnershipRatioInput
          numerator={asset.ownershipNumerator}
          denominator={asset.ownershipDenominator}
          label="본인 지분율"
          onChange={(p) =>
            onChange({
              ...(p.numerator !== undefined ? { ownershipNumerator: p.numerator } : {}),
              ...(p.denominator !== undefined ? { ownershipDenominator: p.denominator } : {}),
            })
          }
        />
      )}
    </div>
  );
}
