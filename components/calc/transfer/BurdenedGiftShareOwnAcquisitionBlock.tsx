"use client";
/**
 * 축 B(지분 분할) × 부담부증여 — 지분 카드(자산 2~N)의 「이 지분 취득가액을 자산 1과 따로 입력」 토글 + 산정방식 · 실지취득가액 칸.
 *
 * 「소득세법 시행령」 §159①1호 취득가액 A는 양도인이 **그 지분을** 취득할 때의 가액(법 §97①1호)이다 — 지분마다 취득이 따로면 다를 수 있다.
 * 꺼짐(기본)은 자산 1의 산정방식 · 실지취득가액을 그대로 쓴다(종전 동작). 켜면 이 카드의 값을 쓴다(④ `mergePrimaryBasic` · ⑧ 같은 병합 자산).
 * 노출 · ④ · ⑧이 같은 leaf(`bgShareOwnAcquisitionApplies`)로 판정한다. 계획서 `companion-inherit-valuation-share-vp2c.plan.md` §14 D-2 (Q-6 a).
 *
 * 매매사례가액 · 감정가액(K-6/K-7) 금액 칸은 종전부터 지분 카드가 받는다(`BurdenedGiftTrancheBasisBlock`) — 여기서는 산정방식과 실지취득가액만 연다.
 * 재개발 APT · 조합원입주권(원조합원)은 실지취득가액 한 칸만 연다 — 산정방식은 자산 1을 따른다(`bgShareOwnAcquisitionFields` · vp2c §25 D-3g).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { BurdenedGiftAcquisitionMethodField } from "./BurdenedGiftPresumedAcquisitionSection";
import { bgShareOwnAcquisitionApplies } from "@/lib/calc/bg-share-own-acquisition";
import { bgShareOwnAcquisitionFields } from "@/lib/calc/bg-share-own-acquisition";
import { bgCollateralForcesStdAcq } from "@/lib/calc/burdened-gift-collateral-win";
import { bgHouseSplitActive } from "@/lib/calc/bg-house-split";

interface Props {
  /** 지분 카드 원본 — 토글 상태를 읽는다. */
  asset: AssetForm;
  /** 자산 1 값을 병합한 지분 카드(`mergePrimaryBasic`) — 토글이 켜져 있으면 네 칸은 이 카드의 값이다. */
  merged: AssetForm;
  primaryAsset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function BurdenedGiftShareOwnAcquisitionBlock({ asset, merged, primaryAsset, onChange, transferDate }: Props) {
  if (!bgShareOwnAcquisitionApplies(merged)) return null;
  const on = asset.bgShareOwnAcquisition === true;
  const fields = bgShareOwnAcquisitionFields(merged);
  // 재개발 · 입주권 — 산정방식은 자산 1이고, 실지가 쓰일 때만 이 블록이 뜬다(leaf가 판정)
  const actualOnly = fields.length === 1;
  const showActual = on && (actualOnly || (merged.bgAcquisitionMethod === "actual" && !bgCollateralForcesStdAcq(merged, true)));
  const twoParts = merged.assetKind === "general_building" || bgHouseSplitActive(merged, { isNonPrimary: true });
  const actualField = (key: "bgActualAcquisitionLand" | "bgActualAcquisitionBuilding" | "bgActualAcquisitionTotal", label: string) => (
    <FieldCard label={label} hint="물건 전체(100%) 기준 — 이 지분 취득 당시 가액을 물건 전체로 환산해 입력하세요(지분율은 시스템이 곱합니다).">
      <CurrencyInput label="" hideUnit value={asset[key]} data-field={key} onChange={(v) => onChange({ [key]: v })} />
    </FieldCard>
  );

  return (
    <div data-testid="bg-share-own-acquisition">
      <ToggleCard
        tone="violet"
        title="이 지분의 취득가액을 자산 1과 따로 입력"
        description={
          actualOnly
            ? "부담부증여 취득가액은 양도인이 그 지분을 취득할 때의 가액에 채무비율을 곱합니다(소득세법 시행령 §159①1호). 이 지분을 자산 1과 다른 가액으로 취득했으면 켜고 이 지분의 실지취득가액을 입력하세요. 산정방식은 자산 1을 따릅니다. 끄면 자산 1의 값을 씁니다."
            : "부담부증여 취득가액은 양도인이 그 지분을 취득할 때의 가액에 채무비율을 곱합니다(소득세법 시행령 §159①1호). 이 지분을 자산 1과 다른 때·다른 가액으로 취득했으면 켜고 이 지분의 산정방식·실지취득가액을 입력하세요. 끄면 자산 1의 값을 씁니다."
        }
        checked={on}
        onCheckedChange={(v) =>
          onChange(
            v
              ? {
                  bgShareOwnAcquisition: true,
                  // 처음 켤 때만 자산 1 값으로 시작한다 — 이미 이 카드에 넣어 둔 값은 덮지 않는다.
                  ...((actualOnly ? asset.bgActualAcquisitionTotal : asset.bgAcquisitionMethod) ? {} : Object.fromEntries(fields.map((k) => [k, primaryAsset[k]]))),
                }
              : { bgShareOwnAcquisition: false },
          )
        }
      >
        <div className="space-y-2">
          {!actualOnly && <BurdenedGiftAcquisitionMethodField asset={merged} onChange={onChange} transferDate={transferDate} fractionalSplit />}
          {showActual &&
            (actualOnly ? (
              actualField("bgActualAcquisitionTotal", merged.assetKind === "right_to_move_in" ? "이 지분 종전 부동산 실지취득가액" : "이 지분 실지취득가액")
            ) : twoParts ? (
              <>
                {actualField("bgActualAcquisitionLand", "이 지분 토지 실지취득가액")}
                {actualField("bgActualAcquisitionBuilding", "이 지분 건물 실지취득가액")}
              </>
            ) : merged.assetKind === "land" ? (
              actualField("bgActualAcquisitionLand", "이 지분 토지 실지취득가액")
            ) : (
              actualField("bgActualAcquisitionTotal", "이 지분 실지취득가액")
            ))}
        </div>
      </ToggleCard>
    </div>
  );
}
