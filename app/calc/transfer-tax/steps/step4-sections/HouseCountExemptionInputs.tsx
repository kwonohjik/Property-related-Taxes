"use client";

/**
 * HouseCountExemptionInputs — **비과세(§89①3호) 판정 주택수**를 바꾸는 입력 3종 (Step 4 공용).
 *
 *  - `HousesListSection`        — 세대 보유 주택 목록 + 분양권·입주권
 *  - `SpecialHouseExclusionSection` — 조특법 감면주택 주택수 제외
 *  - §155② 2년내 피상속인 증여분 게이트 (목록에 상속주택이 있을 때만)
 *
 * ## 왜 별도 컴포넌트인가
 *
 * Step4는 다주택 중과 한시배제(§167의3①12의2 · 양도일 ∈ 2022-05-10~2026-05-09 + 보유 2년↑)
 * 여부로 ④를 **두 분기**로 그린다. 이 3종은 **어느 쪽에서도 있어야 한다** — 셋 다
 * §104⑦ 중과가 아니라 **§89①3호 비과세** 판정을 바꾸기 때문이다:
 *
 *  - 「소득세법 시행령」 §155②·③ — 「제154조제1항을 적용할 때 … 1개의 주택을 소유하고 있는
 *    것으로 본다」 (상속·공동상속주택). 입력은 `houses[].isInherited` 계열.
 *  - 「소득세법」 §89② — 「주택과 조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는
 *    경우에는 … 같은 항 제3호를 적용하지 아니한다」. 입력은 `presaleRights`.
 *  - 조특법 §98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99②·§99의2② —
 *    「소득세법 제89조제1항제3호를 적용할 때 … 소유주택으로 보지 아니한다」.
 *
 * 종전에는 세 위젯이 ④ **중과 트랙 안에만** 있어 한시배제 창에서 통째로 사라졌다.
 * D4-03이 감면주택 축만 먼저 꺼냈고, 남은 두 축(상속주택·분양권)을 2026-09-02에 함께
 * 꺼내면서 **두 분기가 같은 JSX를 복제하지 않도록** 여기로 모았다 — 한쪽만 고쳐 갈라지는
 * 것이 이 결함의 원래 원인이었다.
 *
 * ⚠️ 호출측은 두 분기가 `surchargeSuspended`로 **배타**임을 보장해야 한다. 두 벌이 동시에
 *    뜨면 같은 배열(`houses`·`presaleRights`·`specialHouseExclusions`)을 두 컴포넌트가 각각
 *    patch해 마지막 것이 이긴다.
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { SpecialHouseExclusionSection } from "@/components/calc/transfer/SpecialHouseExclusionSection";
import { HousesListSection } from "./HousesListSection";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function HouseCountExemptionInputs({
  form,
  onChange,
  hideGracePeriod = false,
}: {
  form: TransferFormData;
  onChange: (d: Partial<TransferFormData>) => void;
  /** 중과 경과조치 하위 섹션 숨김 — 한시배제 창에서 true (가목 우선 게이트로 no-op). */
  hideGracePeriod?: boolean;
}) {
  return (
    <>
      {/* 세대 보유 주택 목록 + 분양권 (§155②③ 상속주택 · §89② 권리 · 시행령 §167의3 주택 수) */}
      <HousesListSection form={form} onChange={onChange} hideGracePeriod={hideGracePeriod} />

      {/* 조특법 감면주택 주택수 제외 (§89①3호 의제) */}
      <SpecialHouseExclusionSection
        items={form.specialHouseExclusions ?? []}
        onChange={(items) => onChange({ specialHouseExclusions: items })}
      />

      {/* §155② 상속주택 특례 — 상속주택 존재 시 일반주택 양도 비과세(주택수 자동 제외). 2년내 증여분 게이트 */}
      {form.houses?.some((h) => h.isInherited) && (
        <ToggleCard
          variant="card"
          tone="rose"
          title="양도주택이 상속개시 2년내 피상속인 증여분"
          description="§155② 상속주택 특례에서 일반주택(양도 대상)이 상속개시일부터 2년 내 피상속인으로부터 증여받은 주택이면 특례가 배제됩니다. 해당 시 체크하세요."
          checked={form.generalHouseGiftedFromDecedentWithin2yr}
          onCheckedChange={(v) => onChange({ generalHouseGiftedFromDecedentWithin2yr: v })}
        />
      )}
    </>
  );
}
