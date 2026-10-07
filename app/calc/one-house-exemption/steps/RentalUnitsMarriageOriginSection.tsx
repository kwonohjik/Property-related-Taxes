"use client";

/**
 * 혼인합가(§155⑤) — **명부 밖 장기임대주택의 혼인 전 보유자** (판정 메뉴 · 2026-10-07)
 *
 * 기획재정부 조세정책과-1199(2024.6.25.)는 「각각 2주택 이상 소유한 배우자간 혼인하여 1세대가 소유하게 된 주택수가
 * 4주택 이상인 경우」 혼인합가 특례를 적용하지 않는다고 했다(서면-2022-법규재산-4283도 같은 뜻 — 장기임대주택 포함).
 * ② 화면에서 §155⑳으로 선언한 임대주택은 명부(③)에 다시 넣지 않으므로, 그 임대주택이 혼인 전 누구 것이었는지를
 * 여기서 따로 묻는다. 게이트는 ⑧과 같은 `judgmentMarriageRentalOriginVisible`.
 */
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Origin = "seller_side" | "counterpart_side" | "after_merge";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function RentalUnitsMarriageOriginSection({ form, onChange }: Props) {
  const rh = form.assets[0]?.rentalHousingException;
  if (!rh) return null;
  const setOrigin = (index: number, mergeOrigin: Origin) =>
    onChange({
      assets: form.assets.map((a, i) =>
        i === 0 && a.rentalHousingException
          ? {
              ...a,
              rentalHousingException: {
                ...a.rentalHousingException,
                rentalUnits: a.rentalHousingException.rentalUnits.map((u, j) => (j === index ? { ...u, mergeOrigin } : u)),
              },
            }
          : a,
      ),
    });

  // `ToneCard`는 data-testid를 전달하지 않는다 — 바깥 div에 붙인다.
  return (
    <div data-testid="rental-units-marriage-origin">
      <ToneCard tone="violet" bodyClassName="space-y-3" title="장기임대주택의 혼인 전 보유자" noDark>
        <p className="text-caption text-muted-foreground">
          각각 2주택 이상을 보유한 사람끼리 혼인해 1세대가 4주택 이상이 되면 혼인합가 특례가 적용되지 않습니다
          (기획재정부 조세정책과-1199). 장기임대주택도 이 주택 수에 들어가므로, 앞에서 입력한 장기임대주택마다 혼인 전에
          누가 보유했는지 고르세요.
        </p>
        {rh.rentalUnits.map((u, i) => (
          <div key={u.unitId ?? i} className="space-y-1" data-field={`rentalUnits.${i}.mergeOrigin`}>
            <p className="text-sm font-medium">장기임대주택 {i + 1}</p>
            <RadioCardGroup
              name={`rental-merge-origin-${i}`}
              tone="violet"
              layout="stack"
              columns={3}
              value={u.mergeOrigin ?? ""}
              onChange={(v) => setOrigin(i, v as Origin)}
              options={[
                {
                  value: "seller_side",
                  label: "양도자 쪽",
                  description: "양도하는 주택의 소유자가 혼인 전부터 보유",
                  testId: `rental-merge-origin-${i}-seller`,
                },
                {
                  value: "counterpart_side",
                  label: "배우자 쪽",
                  description: "배우자가 혼인 전부터 보유",
                  testId: `rental-merge-origin-${i}-counterpart`,
                },
                {
                  value: "after_merge",
                  label: "혼인 후 취득",
                  description: "혼인한 뒤에 취득",
                  testId: `rental-merge-origin-${i}-after`,
                },
              ]}
            />
          </div>
        ))}
      </ToneCard>
    </div>
  );
}
