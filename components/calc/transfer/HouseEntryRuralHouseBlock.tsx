"use client";

/**
 * HouseEntryRuralHouseBlock — 이 행의 주택이 **§155⑦ 농어촌주택**인가 (D-6 3b)
 *
 * ## 법문 (법제처 실독 2026-09-21 · MST 286211)
 *
 * > ⑦ 다음 각 호의 어느 하나에 해당하는 주택으로서 **수도권 밖의 지역 중 읍지역(도시지역안의
 * >   지역을 제외한다) 또는 면지역에 소재하는 주택**(농어촌주택)과 그 밖의 주택(일반주택)을
 * >   국내에 **각각 1개씩** 소유하고 있는 1세대가 일반주택을 양도하는 경우에는 … 제154조제1항을
 * >   적용한다. 다만, **제3호의 주택에 대해서는 그 주택을 취득한 날부터 5년 이내**에 일반주택을
 * >   양도하는 경우에 한정하여 적용한다.
 * >   1. 상속받은 주택(피상속인이 취득후 **5년이상 거주**한 사실이 있는 경우에 한한다)
 * >   2. 이농인이 **취득일후 5년이상 거주**한 사실이 있는 이농주택
 * >   3. 영농 또는 영어의 목적으로 취득한 귀농주택
 *
 * ⇒ 농어촌주택은 **보유 중인 다른 주택**이다. 명부 행의 속성이 정본이다.
 *
 * ## 🔑 행에는 없는 칸이 셋이다 — 이미 있는 것을 쓴다
 *
 * | 종전 세대 단위 필드 | 행에서는 |
 * |---|---|
 * | `ruralHouseJibun` · `ruralHouseRegionCode` | 행의 **주소**(① 기본정보)를 쓴다 |
 * | `ruralHouseAcquisitionDate` | 행의 **취득일**을 쓴다 — 단서의 「**그 주택**을 취득한 날」이 바로 이것 |
 * | `ruralHouseLocationTouched` | `ruralOutsideCapitalEupMyeon`이 **optional**이라 불필요(undefined=자동) |
 *
 * ## 🔴 미러링을 하지 않는다
 *
 * 종전 세대 단위 구현은 `useEffect`로 자동 판정 결과를 store에 써 넣었다
 * (`feedback_useeffect_store_mirror_forbidden` 위반). 여기서는 **조회 결과**(`ruralUrbanZone`)만
 * 저장하고 판정은 `resolveRuralLocationQualified`가 **읽는 시점에** 한다.
 */

import { useEffect, useState } from "react";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { classifyEupMyeon } from "@/lib/geo/rural-house-location";
import { judgeRuralHouseLocation } from "@/lib/geo/rural-house-location";
import { resolveRuralLocationQualified } from "@/lib/calc/one-house-row-facts";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { HouseEntry } from "@/lib/stores/calc-wizard-store";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
}

export function HouseEntryRuralHouseBlock({ house, onUpdate }: Props) {
  const on = house.oneHouseRuralHouse === true;
  const jibun = house.addressJibun ?? "";
  const eupMyeon = classifyEupMyeon(jibun);

  /**
   * 읍지역 용도지역 조회 — 「도시지역안의 지역을 제외한다」 판정에만 필요하다.
   * 면·수도권·동은 주소만으로 순수 판정되므로 조회하지 않는다.
   *
   * ⚠️ 응답을 **행에 저장**한다(`ruralUrbanZone`). 파생 boolean을 미러링하는 것이 아니라
   *    조회 결과라는 **데이터**를 남기는 것이다 — 공시가격 조회가 값을 남기는 것과 같은 층위.
   */
  const [fetching, setFetching] = useState(false);
  useEffect(() => {
    if (!on || eupMyeon !== "eup" || !jibun) return;
    if (house.ruralUrbanZone !== undefined) return; // 이미 조회했다
    let cancelled = false;
    setFetching(true);
    fetch(`/api/address/land-use-zone?jibun=${encodeURIComponent(jibun)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { verdict?: "urban" | "non_urban" | "unknown" } | null) => {
        if (!cancelled) onUpdate({ ruralUrbanZone: d?.verdict ?? "unknown" });
      })
      .catch(() => {
        if (!cancelled) onUpdate({ ruralUrbanZone: "unknown" });
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, jibun, eupMyeon, house.ruralUrbanZone]);

  const location = judgeRuralHouseLocation({
    regionCode: house.regionCode || undefined,
    jibun,
    urbanVerdict: house.ruralUrbanZone,
  });
  /** 실제로 ④가 보낼 값 — 사용자가 손댔으면 그 값, 아니면 자동 판정. */
  const effective = resolveRuralLocationQualified(house);
  const overridden = house.ruralOutsideCapitalEupMyeon !== undefined;

  return (
    <ToggleCard
      variant="card"
      tone="emerald"
      data-testid="house-row-rural"
      checked={on}
      onCheckedChange={(v) =>
        onUpdate(
          v
            ? { oneHouseRuralHouse: true, ruralHouseKind: house.ruralHouseKind ?? "inherited" }
            : {
                oneHouseRuralHouse: undefined,
                ruralHouseKind: undefined,
                ruralOutsideCapitalEupMyeon: undefined,
                ruralUrbanZone: undefined,
                ruralDecedentResidenceYears: undefined,
                ruralOwnerResidenceYears: undefined,
                ruralLandAreaSqm: undefined,
                ruralWholeHouseholdMoved: undefined,
                ruralHighPriceAtAcquisition: undefined,
              },
        )
      }
      title="농어촌주택 (§155⑦)"
      description="수도권 밖 읍·면 소재 상속·이농·귀농 주택입니다. 이 주택을 보유한 채 일반주택을 양도하면 1세대1주택으로 봅니다."
    >
      <div className="space-y-4">
        <div className="pt-1">
          <LawArticleModal legalBasis={TRANSFER.RURAL_HOUSE} label="소득세법 시행령 §155⑦" />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">농어촌주택 유형</label>
          <RadioCardGroup
            name={`ruralHouseKind-${house.id}`}
            value={house.ruralHouseKind ?? "inherited"}
            onChange={(v) =>
              onUpdate({ ruralHouseKind: v as HouseEntry["ruralHouseKind"] })
            }
            options={[
              { value: "inherited", label: "1호 상속", description: "피상속인이 취득 후 5년 이상 거주" },
              { value: "farm_exit", label: "2호 이농", description: "이농인이 취득일 후 5년 이상 거주" },
              {
                value: "return_to_farm",
                label: "3호 귀농",
                description: "영농·영어 목적 취득 — 취득일부터 5년 이내 일반주택 양도 한정",
              },
            ]}
          />
        </div>

        {/* 소재 요건 — **행 주소**로 판정한다(별도 주소 칸 없음) */}
        <div className="space-y-1.5">
          <ToneCard
            tone={location.verdict === "qualified" ? "emerald" : location.verdict === "not_qualified" ? "amber" : "sky"}
            bodyClassName=""
            className="px-3 py-2"
          >
            <p data-testid="house-row-rural-location" className="text-xs leading-relaxed">
              {jibun ? location.reason : "① 기본정보에 주소를 입력하면 수도권 여부·읍면을 자동 판정합니다."}
              {fetching && " (용도지역 조회 중…)"}
            </p>
          </ToneCard>
          <ToggleCard
            variant="card"
            size="sm"
            tone="emerald"
            data-testid="house-row-rural-location-override"
            checked={effective}
            onCheckedChange={(v) => onUpdate({ ruralOutsideCapitalEupMyeon: v })}
            title="수도권 밖 읍·면 소재 (도시지역 읍 제외)"
            description={
              overridden
                ? "직접 지정한 값입니다. 자동 판정으로 되돌리려면 주소를 다시 입력하세요."
                : "행 주소에서 자동 판정된 값입니다. 판정 결과와 다르면 직접 조정하세요."
            }
          />
        </div>

        {house.ruralHouseKind === "inherited" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">피상속인 거주 연수 (§155⑦1호)</label>
            <DecimalInput
              value={house.ruralDecedentResidenceYears ?? ""}
              onChange={(v) => onUpdate({ ruralDecedentResidenceYears: v })}
              unit="년"
            />
            <p className="text-xs text-muted-foreground">취득 후 5년 이상이어야 합니다.</p>
          </div>
        )}

        {house.ruralHouseKind === "farm_exit" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">이농인 거주 연수 (§155⑦2호)</label>
            <DecimalInput
              value={house.ruralOwnerResidenceYears ?? ""}
              onChange={(v) => onUpdate({ ruralOwnerResidenceYears: v })}
              unit="년"
            />
            <p className="text-xs text-muted-foreground">취득일 후 5년 이상이어야 합니다.</p>
          </div>
        )}

        {house.ruralHouseKind === "return_to_farm" && (
          <div className="space-y-3">
            {/* 🔑 귀농주택 취득일 칸이 없다 — 단서의 「그 주택을 취득한 날」이 ① 기본정보의 취득일이다. */}
            <ToneCard tone="sky" bodyClassName="" className="px-3 py-2">
              <p className="text-xs leading-relaxed">
                §155⑦ 단서 — <b>이 주택의 취득일</b>
                {house.acquisitionDate ? ` (${house.acquisitionDate})` : "(① 기본정보에서 입력)"}
                부터 <b>5년 이내</b>에 일반주택을 양도해야 적용됩니다.
              </p>
            </ToneCard>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">귀농주택 대지면적</label>
              <DecimalInput
                value={house.ruralLandAreaSqm ?? ""}
                onChange={(v) => onUpdate({ ruralLandAreaSqm: v })}
                unit="㎡"
              />
              <p className="text-xs text-muted-foreground">660㎡ 이내여야 합니다 (§155⑩3호).</p>
            </div>
            <ToggleCard
              variant="card"
              size="sm"
              tone="emerald"
              checked={house.ruralWholeHouseholdMoved === true}
              onCheckedChange={(v) => onUpdate({ ruralWholeHouseholdMoved: v || undefined })}
              title="세대전원 이사·거주 (§155⑩5호)"
              description="취학·근무·질병 등으로 세대원 일부가 이사하지 못한 경우도 포함합니다"
            />
            <ToggleCard
              variant="card"
              size="sm"
              tone="amber"
              checked={house.ruralHighPriceAtAcquisition === true}
              onCheckedChange={(v) => onUpdate({ ruralHighPriceAtAcquisition: v || undefined })}
              title="취득 당시 고가주택에 해당 (§155⑩2호)"
              description="해당하면 귀농주택 요건을 충족하지 못합니다"
            />
          </div>
        )}
      </div>
    </ToggleCard>
  );
}
