"use client";

/**
 * 「토지·건물 소유자 다름」 토글 — 취득원인 라디오 **직하**에 위치한다 (2026-07-30 이동).
 *
 * 계획서: docs/02-design/features/transfer-self-owns-toggle-relocation.plan.md §4
 *
 * 종전에는 `CompanionAcqPurchaseBlock` 안, **축 A(양도가액 결정) 뒤**에 있었다. 그런데 이 토글은
 * 켜지는 순간 「토지·건물 취득일 다름」을 **강제로 켜므로**(아래 `onChange` 배치 patch), 아래 토글을
 * 눌렀는데 화면 **위쪽**이 펼쳐지는 역방향 인과였다. 위로 올려 위→아래 연쇄로 바로잡는다.
 *
 * **전 취득원인 노출**(2026-07-30, 요구 C). 비-매매 경로에는 분리 계산 입력이 하나도 없어서
 * 종전에는 매매 전용이었다 — 토글만 노출하면 `calcSplitGain`이 null을 반환하고 `selfOwns`가
 * 무시되어 **비소유 파트까지 과세**된다(transfer-tax.ts:315 — `splitDetail && selfOwns !== "both"`).
 * 이제 `NonPurchaseSplitInputsBlock`이 그 입력(취득시 기준시가·양도가액 안분)을 제공하고,
 * 토지 취득일은 API 변환이 `acquisitionDate`로 후퇴시킨다(`transfer-tax-api-split.ts`).
 * 계획서: docs/02-design/features/transfer-self-owns-non-purchase.plan.md
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { cn } from "@/lib/utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 토지·건물 분리 계산이 가능한 자산 종류 — 엔진 `calcSplitGain`의 propertyType 게이트와 동일. */
export function isLandBuildingSplitable(assetKind: string | undefined): boolean {
  return assetKind === "housing" || assetKind === "building";
}

export function AssetOwnershipSplitSection(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;

  if (!isLandBuildingSplitable(asset.assetKind)) return null;
  // 겸용주택은 자체 4부분 안분이 축을 지배한다 — 분리 축과 겹치면 이중 안분이 된다.
  if (asset.isMixedUseHouse) return null;

  const selfOwns = asset.selfOwns ?? "both";

  return (
    <div className="space-y-1.5" data-testid="asset-ownership-split">
      <ToggleCard
        variant="chip"
        tone="amber"
        title="토지·건물 소유자 다름"
        description="배우자·공유자 등"
        checked={selfOwns !== "both"}
        onCheckedChange={(checked) => {
          // 다중 키를 **단일 배치 update**로 — 나눠 부르면 stale spread로 한쪽이 덮인다
          // (memory `feedback_multikey_patch_stale_spread_overwrite`).
          if (checked) {
            onChange({
              selfOwns: "building_only",
              // ⚠️ **매매에서만** 켠다(2026-07-30). 이 플래그는 매매 경로의 취득일 2열 UI를
              //    띄우기 위한 것인데, 비-매매에는 그 UI가 없고 잔존하면 토지 취득일이 채워졌을 때
              //    `isSeparateAcquisition`이 true가 되어 **파트별 취득가액 필수** 규칙이 발동한다
              //    — 상속·증여엔 그 입력이 없으므로 입력 칸 없는 차단(dead-end)이 된다.
              //    분리 계산 진입은 `isSplitPayloadActive`가 `selfOwns`만으로 이미 성립시킨다.
              ...(asset.acquisitionCause === "purchase"
                ? { hasSeperateLandAcquisitionDate: true }
                : {}),
            });
          } else {
            // ⚠️ `hasSeperateLandAcquisitionDate`는 되돌리지 않는다 — 사용자가 취득일도 실제로
            //    다르게 입력했을 수 있고, 값 보존이 기존 정책이다(토글 복귀 시 복원).
            onChange({ selfOwns: "both" });
          }
        }}
      />
      {selfOwns !== "both" && (
        <div className="ml-5 flex gap-2 flex-wrap">
          {(["building_only", "land_only"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange({ selfOwns: v })}
              className={cn(
                "rounded-md border-2 px-3 py-1 text-sm transition-all",
                selfOwns === v
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:border-muted-foreground/50",
              )}
            >
              {v === "building_only" ? "건물만 본인 소유 (토지는 타인)" : "토지만 본인 소유 (건물은 타인)"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
