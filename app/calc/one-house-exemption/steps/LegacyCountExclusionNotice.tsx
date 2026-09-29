"use client";

/**
 * ③ 보유 주택 — **어느 주택인지 지정되지 않은** 옛 조특법 주택 수 제외 선언 안내 (계획서 Q-2(a))
 *
 * 종전 화면은 §99의4·§98의9를 `assets[0].reductions`에, 보유 감면주택을 `form.specialHouseExclusions`에
 * 세대 단위로 받았다. 이제 정본은 명부 행(`HouseEntry.countExclusion`)이고, 옛 선언은 ④가 보내지 않으며
 * ⑧이 다시 판정할 때 막는다 — 종전처럼 1채를 빼 주면 명부에 없는 주택을 빼는 과소과세(P6)가 남는다.
 * 카드 본체는 계산기와 공용(`CountExclusionLegacyNotice`).
 */
import { CountExclusionLegacyNotice } from "@/components/calc/transfer/CountExclusionLegacyNotice";
import { isHouseCountExclusionReduction } from "@/lib/calc/one-house-judgment-section-scope";
import { countExclusionDeclarationLine } from "@/lib/calc/house-count-exclusion-rows";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Props = {
  form: OneHouseJudgmentFormData;
  onChange: (patch: Partial<OneHouseJudgmentFormData>) => void;
};

export function LegacyCountExclusionNotice({ form, onChange }: Props) {
  const reductions = (form.assets?.[0]?.reductions ?? []).filter(isHouseCountExclusionReduction);
  const specials = (form.specialHouseExclusions ?? []).filter((e) => e.article);

  const clear = () =>
    onChange({
      assets: form.assets.map((a, i) =>
        i === 0 ? { ...a, reductions: (a.reductions ?? []).filter((r) => !isHouseCountExclusionReduction(r)) } : a,
      ),
      specialHouseExclusions: [],
    });

  return (
    <CountExclusionLegacyNotice
      lines={[...reductions, ...specials].map(countExclusionDeclarationLine)}
      onClear={clear}
      actionLabel="판정"
    />
  );
}
