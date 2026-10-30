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
import { selfOwnsSplitApplicable } from "@/lib/calc/self-owns-scope";
import { asksBuildingOwnerHousehold } from "@/lib/calc/self-owns-scope";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { DateInput } from "@/components/ui/date-input";
import { landCauseMixActive } from "@/lib/calc/transfer-land-part-cause";
import { LAND_ONLY_REPEATED_MERGE_NOTE } from "@/lib/tax-engine/land-only-owner-household";

// 게이트 술어는 ④·⑧·⑥과 공용 leaf다(M2 — `lib/calc/self-owns-scope.ts`). 종전 import 경로 유지용 재export.
export { isLandBuildingSplitable } from "@/lib/calc/self-owns-scope";

export function AssetOwnershipSplitSection(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}) {
  const { asset, onChange } = props;

  // 주택·건물 + 겸용 아님 — 겸용주택은 자체 4부분 안분이 축을 지배한다(분리 축과 겹치면 이중 안분).
  if (!selfOwnsSplitApplicable(asset)) return null;

  const selfOwns = asset.selfOwns ?? "both";
  // Q-5(D1 U-3) — 「토지는 다른 원인으로 취득」과 상호 잠금(엔진은 소유자 분리에서 토지 원인을 읽지 않는다).
  //    켜진 상태는 끌 수 있게 「켜는 방향」만 막는다.
  const landCauseOn = landCauseMixActive(asset); // D1(토지 상속·증여) 또는 D2(건물 상속·증여 + 토지 매매)

  return (
    // data-field — ⑧ 「신축 · 토지만 본인」 차단(`newConstructionLandOnly`)이 이 칸으로 이동한다.
    <div className="space-y-1.5" data-testid="asset-ownership-split" data-field="selfOwns">
      <ToggleCard
        variant="chip"
        tone="amber"
        title="토지·건물 소유자 다름"
        description="배우자·공유자 등"
        disabled={landCauseOn && selfOwns === "both"}
        disabledReason="「토지는 다른 원인으로 취득」을 켠 자산에는 쓸 수 없습니다 — 그 토글을 끄면 켤 수 있습니다"
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
      {/* V-3′ — 다른 세대면 이 토지는 본인 세대의 1주택에 딸린 토지가 아니다(엔진 `land-only-owner-household.ts` · ⑧·⑫ 필수 · 예·아니오 2택). */}
      {asksBuildingOwnerHousehold(asset) && (
        <ToneCard tone="amber" title="건물(주택) 소유자와 같은 세대 여부 (§154①)">
          <p className="text-caption text-muted-foreground">
            양도일 현재 건물(주택) 소유자가 본인과 <strong>같은 세대</strong>입니까? 다른 세대라면 이 토지는 본인 세대가 보유한 주택에
            딸린 토지가 아니어서 1세대1주택 비과세와 장기보유특별공제 표2를 적용하지 않습니다(조심 2008중3554).
          </p>
          <RadioCardGroup
            name={`building-owner-same-household-${asset.assetId}`}
            data-testid="building-owner-same-household"
            data-field="buildingOwnerSameHousehold"
            tone="amber"
            layout="inline"
            options={[
              { value: "yes", label: "예 — 같은 세대", testId: "building-owner-same-household-yes" },
              { value: "no", label: "아니오 — 다른 세대", testId: "building-owner-same-household-no" },
            ]}
            value={asset.buildingOwnerSameHousehold === undefined ? "" : asset.buildingOwnerSameHousehold ? "yes" : "no"}
            // 같은 세대가 아니게 되면 합가 답은 의미가 없다 — 한 번에 지운다(stale 방지 · 다중 키 단일 배치 patch).
            onChange={(v) =>
              onChange({
                buildingOwnerSameHousehold: v === "yes",
                ...(v === "yes" ? {} : { buildingOwnerHouseholdMerged: undefined, buildingOwnerHouseholdMergeDate: undefined }),
              })
            }
          />
        </ToneCard>
      )}
      {/* 같은 세대 — 합가일 이후만 이 토지를 주택부수토지로서 보유한 기간으로 본다(재산46014-610 · 계획서 land-only-household-merge-date Q-1 b · ⑧·⑫ 필수). */}
      {asksBuildingOwnerHousehold(asset) && asset.buildingOwnerSameHousehold === true && (
        <ToneCard tone="amber" title="건물(주택) 소유자와 세대를 합친 적이 있는지">
          <p className="text-caption text-muted-foreground">
            건물(주택) 소유자와 <strong>처음부터 같은 세대</strong>였는지, 중간에 세대를 <strong>합쳤는지</strong> 선택하세요. 합친 경우 합친 날 이후의 기간만 이 토지를
            주택부수토지로서 보유한 기간으로 봅니다(재산46014-610 — 1세대1주택 비과세 보유요건·장기보유특별공제 표2 보유연수·단기세율 보유기간).
          </p>
          <RadioCardGroup
            name={`building-owner-household-merged-${asset.assetId}`}
            data-testid="building-owner-household-merged"
            data-field="buildingOwnerHouseholdMerged"
            tone="amber"
            layout="inline"
            options={[
              { value: "no", label: "처음부터 같은 세대", testId: "building-owner-household-merged-no" },
              { value: "yes", label: "중간에 합침 — 합가일 입력", testId: "building-owner-household-merged-yes" },
            ]}
            value={asset.buildingOwnerHouseholdMerged === undefined ? "" : asset.buildingOwnerHouseholdMerged ? "yes" : "no"}
            onChange={(v) =>
              onChange({
                buildingOwnerHouseholdMerged: v === "yes",
                ...(v === "yes" ? {} : { buildingOwnerHouseholdMergeDate: undefined }),
              })
            }
          />
          {asset.buildingOwnerHouseholdMerged === true && (
            <div className="space-y-1" data-field="buildingOwnerHouseholdMergeDate">
              <label className="block text-caption text-muted-foreground font-medium">세대를 합친 날</label>
              <DateInput
                data-testid="building-owner-household-merge-date"
                value={asset.buildingOwnerHouseholdMergeDate ?? ""}
                onChange={(s) => onChange({ buildingOwnerHouseholdMergeDate: s || undefined })}
              />
              <p className="text-caption text-muted-foreground">{LAND_ONLY_REPEATED_MERGE_NOTE}</p>
            </div>
          )}
        </ToneCard>
      )}
    </div>
  );
}
