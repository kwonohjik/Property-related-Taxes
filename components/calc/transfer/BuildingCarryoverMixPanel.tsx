"use client";

/**
 * P4 B — **건물만 이월과세**(소득세법 §97의2①) + 토지 매매: 이월과세 호스트의 「토지는 다른 원인으로 취득」 토글과 건물 파트의 증여 입력.
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §5.2·§5.3
 * D2 토글(`BuildingCauseMixBlock`)의 이월과세판이다 — 토지 = 매매 고정(원인 라디오 없음), 켜면 자산 전체 이월과세 블록(`CarryoverGiftBlock`) 대신
 *   ① 이 패널(증여 등기접수일 → 건물 — 증여자 취득 → 증여세 상당액 → 관계·적용배제) → ② 매매 블록 건물 원인 모드(날짜 2열 [토지 취득일 | 건물 증여 등기접수일(읽기 전용)],
 *   토지 매매 4방식, 건물 고정 칩 + 증여 신고가액)가 나온다(`CompanionAcquisitionCauseSection`이 마운트를 바꾼다).
 * 유효 여부는 저장값이 아니라 `effectiveBuildingCarryoverMix`가 정한다 — ④ 전송·⑥ 합계·⑧ 검증이 같은 술어를 읽는다.
 *
 * ## 노출하지 않는 경우(끄는 방향은 막지 않는다 — 켜진 채 조건이 생기면 토글을 남겨 끌 수 있게 한다)
 * 부담부증여(④가 분리 입력을 보내지 않는다) · 함께 양도하는 두 번째 이후 자산(엔진 S0 — 안내는 C 토글 자리의 N6이 한다).
 * 소유자 분리·C(«증여자가 토지·건물을 다른 날 취득»)가 켜져 있으면 켤 수 없다(상호 잠금).
 *
 * ## 전환 patch
 * 호스트 전환은 원인 라디오가 태그(`landCauseHost`)를 비워 읽는 쪽에서 무효가 된다. OFF만 단일 배치로 분리 입력을 되돌린다(D2와 같은 키) — `carryover`는 보존해
 * 자산 전체 이월과세 1벌로 다시 읽힌다(건물 파트의 증여자 입력이 그대로 자산 전체 입력이 된다).
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { effectiveSelfOwns } from "@/lib/calc/self-owns-scope";
import { effectiveBuildingCarryoverMix, effectiveCarryoverDonorSplit } from "@/lib/calc/transfer-land-part-cause";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { LandCarryoverCard } from "./LandCarryoverCard";

export function BuildingCarryoverMixPanel(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  isNonPrimaryAsset?: boolean;
  hasCompanions?: boolean;
}) {
  const { asset, onChange } = props;
  const active = effectiveBuildingCarryoverMix(asset);
  if (!active && (asset.transferType === "burdened_gift" || props.isNonPrimaryAsset)) return null;
  const ownerSplit = (effectiveSelfOwns(asset) ?? "both") !== "both";
  const donorSplitOn = effectiveCarryoverDonorSplit(asset, { isNonPrimary: props.isNonPrimaryAsset });

  return (
    <div className="space-y-2" data-testid="land-part-cause-building-cause">
      <ToggleCard
        data-field="landAcquisitionCause"
        variant="chip"
        tone="amber"
        title="토지는 다른 원인으로 취득"
        description="건물은 이월과세(증여), 토지는 매수"
        disabled={!active && (ownerSplit || donorSplitOn)}
        disabledReason={
          ownerSplit
            ? "토지·건물 소유자가 다르면 쓸 수 없습니다 — 「토지·건물 소유자 다름」을 끄면 켤 수 있습니다"
            : "«증여자가 토지·건물을 다른 날 취득»을 켠 자산은 토지도 증여받은 자산입니다 — 그 선택을 끄면 켤 수 있습니다"
        }
        checked={active}
        onCheckedChange={(checked) => {
          // 다중 키 단일 배치(feedback_multikey_patch_stale_spread_overwrite) — D2 토글과 같은 키. 건물은 증여 신고가액(실가) 고정, 토지 방식은 고른 값 보존·없으면 실거래가.
          onChange(
            checked
              ? {
                  landAcquisitionCause: "purchase",
                  landCauseHost: "carryover_gift",
                  hasSeperateLandAcquisitionDate: true,
                  landAcqMode: asset.landAcqMode || "actual",
                  buildingAcqMode: "actual",
                }
              : {
                  landAcquisitionCause: "",
                  landCauseHost: "",
                  hasSeperateLandAcquisitionDate: false,
                  landAcqMode: "",
                  buildingAcqMode: "",
                },
          );
        }}
      />

      {active && (
        <div className="space-y-3 rounded-md border border-dashed border-border bg-muted/20 p-3">
          <ToneCard tone="amber">
            <p className="text-xs text-amber-900 dark:text-amber-200" data-testid="building-carryover-guide">
              건물은 <strong>이월과세(증여)</strong>, 토지는 <strong>매매</strong>로 취득한 자산입니다. 취득가액·보유기간을 토지·건물 <strong>각각</strong> 산정하고,
              건물에만 이월과세 적용 여부를 비교합니다 (소득세법 §97의2①·②3호). 건물의 증여 정보는 아래에, 토지 취득일·토지 취득가액과 건물 증여 신고가액은 그 아래
              <strong> 취득가액 산정 방식</strong>에 입력합니다.
            </p>
          </ToneCard>
          <LandCarryoverCard part="building" asset={asset} onChange={onChange} transferDate={props.transferDate} hasCompanions={props.hasCompanions} />
        </div>
      )}
    </div>
  );
}
