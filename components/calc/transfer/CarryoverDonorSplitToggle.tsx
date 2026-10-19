"use client";

/**
 * 「증여자가 토지·건물을 다른 날 취득」 토글 — 파트 이월과세 C 진입점 (소득세법 §97의2①).
 *
 * 위치: 이월과세 블록 ① 증여 기본 정보 — **증여 등기접수일 직하·증여자 취득일 직전**(모드 토글은 영향받는 필드 직전).
 * 유효 여부는 저장 토글 단독이 아니라 `effectiveCarryoverDonorSplit`가 정한다 — 이 컴포넌트는 그 술어를 쓰지 않고 «켤 수 있는가»만 판정한다.
 *
 * · 소유자 분리·부담부증여면 켤 수 없다(끄는 방향은 허용). 겸용주택·일반건물·토지 등은 이 토글이 없다.
 * · 함께 양도하는 두 번째 이후 자산(`isNonPrimaryAsset`)에는 토글 대신 한 줄 안내(N6) — 파트 이월과세는 첫 자산에서만 계산된다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { isLandBuildingSplitable } from "@/lib/calc/self-owns-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 토글이 놓일 수 있는 자산 — 주택·건물(겸용 아님). ⑤ 표시 게이트이자 안내 노출 게이트(술어 `effectiveCarryoverDonorSplit`의 자산 종류 축과 같다). */
export function carryoverDonorSplitApplicable(asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse">): boolean {
  return isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
}

export function CarryoverDonorSplitToggle({
  asset,
  onChange,
  isNonPrimaryAsset,
}: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  isNonPrimaryAsset?: boolean;
}) {
  if (!carryoverDonorSplitApplicable(asset)) return null;

  if (isNonPrimaryAsset) {
    return (
      <ToneCard tone="amber" bodyClassName="space-y-1">
        <p className="text-caption text-amber-900" data-testid="split-carryover-companion-note">
          함께 양도하는 두 번째 이후 자산에는 토지·건물 파트 이월과세를 쓸 수 없습니다 — 이 입력은 첫 번째 자산에서만 계산됩니다.
          자산 전체를 하나의 증여자 취득으로 보는 이월과세는 그대로 입력할 수 있습니다.
        </p>
      </ToneCard>
    );
  }

  const checked = asset.carryoverDonorSplit === true;
  const ownerSplit = (asset.selfOwns ?? "both") !== "both";
  const burdened = asset.transferType === "burdened_gift";
  const blocked = ownerSplit || burdened;
  return (
    <ToggleCard
      tone="amber"
      title="증여자가 토지·건물을 다른 날 취득"
      description="증여자가 토지와 건물을 서로 다른 날 취득했다면 켜세요 — 토지·건물을 각각 증여자 취득일·취득가액으로 계산하고, 파트별로 이월과세 적용 여부를 비교합니다 (소득세법 §97의2②3호)."
      checked={checked}
      disabled={!checked && blocked}
      disabledReason={
        ownerSplit
          ? "토지·건물 소유자가 다른 자산에는 쓸 수 없습니다 — «토지·건물 소유자 다름»을 끄면 켤 수 있습니다."
          : "부담부증여 양도에는 쓸 수 없습니다."
      }
      onCheckedChange={(v) => onChange({ carryoverDonorSplit: v })}
      data-testid="carryover-donor-split-toggle"
      data-field="carryoverDonorSplit"
    />
  );
}
