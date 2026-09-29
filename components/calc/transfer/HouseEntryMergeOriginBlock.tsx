"use client";

/**
 * 명부 행 — **합가 전 보유 쪽** (§155④⑤ · 판정 메뉴 전용, 2026-09-29)
 *
 * 법문은 「1주택을 보유하는 자가 1주택을 보유하는 자와」 합쳐 2주택이 된 경우다(소득세법 시행령
 * §155⑤, ④도 같은 구조). 그래서 합가일 하나로는 부족하고, **이 주택이 합가 전 누구 것이었나**가
 * 필요하다. 양도하는 주택은 늘 양도자 쪽이라 묻지 않는다.
 *
 * 합가일보다 나중에 취득한 행은 선택지 없이 「합가 후 취득」으로 보여 준다 — 판정도 날짜를 먼저 본다
 * (`classifyMergeHouse`). 저장된 선택과 날짜가 어긋날 수 없게 하려는 것이다.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  mergeHouseSideOf,
  mergeSideLabel,
  type MergeContext,
} from "@/lib/calc/merge-house-origin";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Props = {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
  context: MergeContext;
};

export function HouseEntryMergeOriginBlock({
  house,
  onUpdate,
  context,
}: Props) {
  const side = mergeHouseSideOf(house, context);
  const event = context.kind === "marriage" ? "혼인" : "합가";
  // 받침 유무로 조사가 갈린다 — 「혼인으로」 · 「합가로」.
  const byEvent = context.kind === "marriage" ? "혼인으로" : "합가로";

  // `ToneCard`는 data-testid를 전달하지 않는다 — 바깥 div에 붙인다.
  return (
    <div data-testid="house-merge-origin">
      <ToneCard
        tone="violet"
        bodyClassName="space-y-2"
        title={`${event} 전 이 주택의 보유자`}
        noDark
      >
        {side === "after_merge" ? (
          <p className="text-sm" data-testid="house-merge-origin-after">
            {event}일({context.mergeDate}) 이후에 취득한 주택입니다 — {byEvent}{" "}
            들어온 주택이 아니라 {event} 후 새로 취득한 주택으로 봅니다.
          </p>
        ) : (
          <>
            <p className="text-caption text-muted-foreground">
              {event} 특례는 {event} 전 양쪽이 <b>각각 1주택</b>을 갖고 있다가{" "}
              {byEvent} 2주택이 된 경우에 적용됩니다. 이 주택을 {event} 전에
              누가 보유했는지 고르세요.
            </p>
            <RadioCardGroup
              name={`merge-origin-${house.id}`}
              tone="violet"
              layout="stack"
              columns={2}
              value={house.mergeOrigin ?? ""}
              onChange={(v) => onUpdate({ mergeOrigin: v })}
              options={[
                {
                  value: "counterpart_side",
                  label: mergeSideLabel("counterpart_side", context.kind),
                  description:
                    context.kind === "marriage"
                      ? "배우자가 혼인 전부터 보유하던 주택"
                      : "합친 가족(직계존속 또는 자녀)이 합가 전부터 보유하던 주택",
                  testId: "merge-origin-counterpart",
                },
                {
                  value: "seller_side",
                  label: mergeSideLabel("seller_side", context.kind),
                  description: `양도하는 주택의 소유자가 ${event} 전부터 함께 보유하던 주택`,
                  testId: "merge-origin-seller",
                },
              ]}
            />
            {!house.acquisitionDate && (
              <p className="text-micro text-muted-foreground">
                취득일을 입력하면 {event} 후 취득 여부는 자동으로 판단합니다.
              </p>
            )}
          </>
        )}
      </ToneCard>
    </div>
  );
}
