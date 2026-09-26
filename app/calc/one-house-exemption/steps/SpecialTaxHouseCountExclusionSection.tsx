"use client";

/**
 * ③ 보유 주택 — **조특법 §99의4·§98의9 주택 수 제외** 선언 (OH-28)
 *
 *  - 「조세특례제한법」 §99의4① — 농어촌주택등을 「해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」
 *    제89조제1항제3호를 적용한다」 · ④ 3년 보유 전 양도에도 적용.
 *  - 「조세특례제한법」 §98의9① — 준공후미분양주택을 「해당 1세대의 소유주택이 아닌 것으로 보아 같은 법
 *    제89조제1항제3호를 적용한다」.
 *
 * 🔴 종전에는 판정 메뉴 ④가 `reductions: []`를 고정해, 계산기에서는 비과세인 세대가 판정 메뉴에서는
 *    주택 수 2채로 과세였다(입력 위젯도 없었다).
 *
 * 🔑 값은 계산기와 **같은 자리**(`assets[0].reductions`)·같은 입력 폼(`New994InputForm`·
 *    `Unsold989InputForm`)을 쓴다 — 판정 → 계산기 전달이 자산을 그대로 넘기므로 계산기의 감면 패널에
 *    같은 선언이 그대로 보인다. 이 섹션은 그 배열에서 **자기 3유형만** 고치고 나머지는 보존한다.
 * 🔑 게이트는 ④·⑧과 같은 `judgmentSaleIsHousing` — 호출부가 양도 대상이 주택일 때만 렌더한다.
 */
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { Unsold989InputForm } from "@/components/calc/transfer/Unsold989InputForm";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset";

type Kind994 = "new_99_4_rural" | "new_99_4_hometown";
type Form994 = Extract<AssetReductionForm, { type: Kind994 }>;
type Form989 = Extract<AssetReductionForm, { type: "unsold_98_9" }>;

type Props = {
  reductions: AssetReductionForm[];
  onChange: (reductions: AssetReductionForm[]) => void;
  /** 보유기간 미리보기(§99의4 3년) — 입력 폼이 읽는다. */
  transferDate?: string;
};

const is994 = (r: AssetReductionForm): r is Form994 =>
  r.type === "new_99_4_rural" || r.type === "new_99_4_hometown";
const is989 = (r: AssetReductionForm): r is Form989 => r.type === "unsold_98_9";

export function SpecialTaxHouseCountExclusionSection({ reductions, onChange, transferDate }: Props) {
  const r994 = reductions.find(is994);
  const r989 = reductions.find(is989);

  /** 한 유형만 갈아 끼운다 — 나머지 선언(다른 감면)은 그대로 둔다. */
  const replace = (pred: (r: AssetReductionForm) => boolean, next: AssetReductionForm | undefined) =>
    onChange([...reductions.filter((r) => !pred(r)), ...(next ? [next] : [])]);

  /**
   * 농어촌 ↔ 고향 전환 — **주택 자체의 사실**(취득일·지번·기준시가·등록 한옥)만 옮긴다.
   * 🔴 연접(③)·소재 확인은 옮기지 않는다 — 농어촌주택은 읍·면·동, 고향주택은 시 단위라 같은
   *    토글이 **다른 요건**을 뜻한다(조특법 §99의4①1호가목·2호나목·③). 새 유형 기본값에서 다시 묻는다.
   */
  const switch994 = (kind: Kind994) => {
    if (!r994 || r994.type === kind) return;
    replace(is994, {
      ...getReductionDefault(kind),
      ruralHouseAcquisitionDate: r994.ruralHouseAcquisitionDate,
      ruralHouseJibun: r994.ruralHouseJibun,
      ruralHouseStdPrice: r994.ruralHouseStdPrice,
      isRegisteredHanok: r994.isRegisteredHanok,
    } as AssetReductionForm);
  };

  return (
    <div className="space-y-3" data-testid="one-house-special-tax-exclusion">
      <ToneCard tone="sky" bodyClassName="">
        <p className="text-sm leading-relaxed">
          아래 특례를 선언한 주택도 <b>위 보유 주택 목록에 넣으세요</b>. 요건을 갖추면 판정에서 그
          주택을 주택 수에서 뺍니다(다주택 중과의 주택 수는 바뀌지 않습니다).
        </p>
      </ToneCard>

      <ToggleCard
        data-testid="one-house-new-99-4"
        checked={!!r994}
        onCheckedChange={(on) =>
          replace(is994, on ? getReductionDefault("new_99_4_rural") : undefined)
        }
        title="농어촌주택·고향주택 — 조특법 §99의4"
        description="일반주택을 먼저 보유한 세대가 취득한 농어촌주택·고향주택을 소유주택이 아닌 것으로 봅니다"
        tone="violet"
        lawRefs={[{ legalBasis: "조세특례제한법 §99의4", label: "조특법 §99의4" }]}
      >
        {r994 && (
          <div className="space-y-3">
            <RadioCardGroup<Kind994>
              name="one-house-new-99-4-kind"
              tone="violet"
              options={[
                { value: "new_99_4_rural", label: "농어촌주택", description: "조특법 §99의4①1호" },
                { value: "new_99_4_hometown", label: "고향주택", description: "조특법 §99의4①2호" },
              ]}
              value={r994.type}
              onChange={switch994}
            />
            <New994InputForm
              value={r994}
              transferDate={transferDate}
              onChange={(patch) => replace(is994, { ...r994, ...patch } as AssetReductionForm)}
            />
          </div>
        )}
      </ToggleCard>

      <ToggleCard
        data-testid="one-house-unsold-98-9"
        checked={!!r989}
        onCheckedChange={(on) => replace(is989, on ? getReductionDefault("unsold_98_9") : undefined)}
        title="수도권 밖 준공후미분양주택 — 조특법 §98의9"
        description="1주택 세대가 2024.1.10~2026.12.31에 취득한 준공후미분양주택을 소유주택이 아닌 것으로 봅니다"
        tone="violet"
        lawRefs={[{ legalBasis: "조세특례제한법 §98의9", label: "조특법 §98의9" }]}
      >
        {r989 && (
          <Unsold989InputForm
            value={r989}
            onChange={(patch) => replace(is989, { ...r989, ...patch } as AssetReductionForm)}
          />
        )}
      </ToggleCard>
    </div>
  );
}
