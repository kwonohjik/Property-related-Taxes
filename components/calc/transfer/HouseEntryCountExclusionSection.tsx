"use client";

/**
 * HouseEntryCountExclusionSection — 이 주택의 **조특법 주택 수 제외 사유** (판정 메뉴 전용)
 *
 * 계획서 `docs/00-pm/one-house-judgment-count-exclusion-row-link.plan.md`.
 *
 * §99의4(농어촌·고향)·§98의9(준공후미분양)·보유 감면주택(§98 등)은 「그 주택을 해당 1세대의
 * 소유주택이 아닌 것으로 보아 「소득세법」 제89조제1항제3호를 적용한다」(또는 「거주자의 소유주택으로
 * 보지 아니한다」)는 효과라, 대상은 **보유 중인 다른 주택**이다. 종전에는 ③ 화면의 세대 단위
 * 선언이라 어느 주택인지 몰랐다 — 신규 주택 후보에 섞여 일시적 2주택이 깨지고(P2), 명부에 없는
 * 주택을 빼 주었다(P3·P6).
 *
 * ## ⑤(§155)와 카드를 가르는 이유
 *
 * ⑤는 소득세법 시행령 §155의 「각각 1개씩 소유」 특례이고, 이것은 조세특례제한법의 소유주택 의제다.
 * 근거 법률·요건이 다르다([[feedback_one_field_serving_two_legal_axes]]).
 *
 * 🔑 취득일·주소·취득가액·전용면적은 **①의 행 값**을 쓴다 — 여기서 다시 묻지 않는다(`rowFacts`).
 * 🔑 한 주택에 사유는 하나 — 라디오로 받는다. 「해당 없음」은 값을 지운다(useEffect 미러링 금지).
 */

import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { New994InputForm } from "@/components/calc/transfer/New994InputForm";
import { Unsold989InputForm } from "@/components/calc/transfer/Unsold989InputForm";
import { SpecialHouseExclusionItemFields } from "@/components/calc/transfer/SpecialHouseExclusionSection";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { isCapitalAreaByRegionCode } from "@/lib/geo/rural-house-location";
import type {
  HouseEntry,
  HouseCountExclusionRowFact,
  RowCountExclusionReduction,
} from "@/lib/stores/calc-wizard-asset-nbl";

type Choice =
  "none" | "new_99_4_rural" | "new_99_4_hometown" | "unsold_98_9" | "special";

interface Props {
  house: HouseEntry;
  onUpdate: (patch: Partial<HouseEntry>) => void;
  /** §99의4 보유기간 미리보기(3년) — 폼이 읽는다. */
  transferDate?: string;
}

function choiceOf(x: HouseCountExclusionRowFact | undefined): Choice {
  if (!x) return "none";
  return x.kind === "special" ? "special" : x.reduction.type;
}

export function HouseEntryCountExclusionSection({
  house,
  onUpdate,
  transferDate,
}: Props) {
  const current = house.countExclusion;
  const choice = choiceOf(current);

  const select = (next: Choice) => {
    if (next === choice) return;
    if (next === "none") return onUpdate({ countExclusion: undefined });
    if (next === "special") {
      return onUpdate({
        countExclusion: {
          kind: "special",
          special: {
            article: "",
            houseAcquisitionDate: "",
            houseContractDate: "",
            isNationalHousing: false,
            requirementsConfirmed: false,
          },
        },
      });
    }
    const fresh = getReductionDefault(next) as RowCountExclusionReduction;
    // 농어촌 ↔ 고향 전환 — 주택 자체의 사실(취득 당시 기준시가·등록 한옥)만 옮긴다. 소재·연접 확인은
    // 두 유형의 요건 단위(읍·면·동 ↔ 시)가 달라 새로 묻는다(조특법 §99의4①1호가목·2호나목·③).
    const carried =
      current?.kind === "reduction" &&
      current.reduction.type !== "unsold_98_9" &&
      fresh.type !== "unsold_98_9"
        ? {
            ruralHouseStdPrice: current.reduction.ruralHouseStdPrice,
            isRegisteredHanok: current.reduction.isRegisteredHanok,
          }
        : {};
    onUpdate({
      countExclusion: {
        kind: "reduction",
        reduction: { ...fresh, ...carried } as RowCountExclusionReduction,
      },
    });
  };

  const patchReduction = (patch: Partial<RowCountExclusionReduction>) => {
    if (current?.kind !== "reduction") return;
    onUpdate({
      countExclusion: {
        kind: "reduction",
        reduction: {
          ...current.reduction,
          ...patch,
        } as RowCountExclusionReduction,
      },
    });
  };

  const capital = isCapitalAreaByRegionCode(house.regionCode);

  // 🔑 testid는 바깥 div에 — `ToneCard`는 `data-testid`를 전달하지 않는다(조용히 버려진다).
  return (
    <div data-testid="house-row-count-exclusion">
      <ToneCard
        tone="emerald"
        sectionNum="⑥"
        bodyClassName="space-y-2.5"
        title="주택 수 제외 (조특법)"
        noDark
      >
        <p className="text-xs text-muted-foreground leading-relaxed">
          조세특례제한법에 따라 이 주택을 <b>소유주택이 아닌 것으로 보는</b>{" "}
          경우를 지정합니다. 요건을 갖추면 1세대1주택 비과세 판정의 주택
          수에서만 빠지고, 다주택 중과의 주택 수는 그대로입니다.
        </p>

        <RadioCardGroup<Choice>
          name={`house-row-count-exclusion-${house.id}`}
          tone="emerald"
          value={choice}
          onChange={select}
          options={[
            {
              value: "none",
              label: "해당 없음",
              testId: "house-row-count-exclusion-none",
            },
            {
              value: "new_99_4_rural",
              label: "농어촌주택",
              description:
                "조특법 §99의4①1호 — 일반주택을 먼저 보유한 세대가 취득",
              testId: "house-row-count-exclusion-new_99_4_rural",
            },
            {
              value: "new_99_4_hometown",
              label: "고향주택",
              description:
                "조특법 §99의4①2호 — 일반주택을 먼저 보유한 세대가 취득",
              testId: "house-row-count-exclusion-new_99_4_hometown",
            },
            {
              value: "unsold_98_9",
              label: "수도권 밖 준공후미분양주택",
              description:
                "조특법 §98의9 — 1주택 세대가 2024.1.10~2026.12.31에 취득",
              testId: "house-row-count-exclusion-unsold_98_9",
            },
            {
              value: "special",
              label: "조특법 감면주택(미분양·신축)",
              description: "조특법 §98·§98의2~§98의8·§99·§99의2·§99의3",
              testId: "house-row-count-exclusion-special",
            },
          ]}
        />

        {current?.kind === "reduction" &&
          current.reduction.type !== "unsold_98_9" && (
            <New994InputForm
              value={current.reduction}
              transferDate={transferDate}
              onChange={patchReduction}
              rowFacts={{
                acquisitionDate: house.acquisitionDate,
                jibun: house.addressJibun ?? "",
              }}
            />
          )}
        {current?.kind === "reduction" &&
          current.reduction.type === "unsold_98_9" && (
            <Unsold989InputForm
              value={current.reduction}
              onChange={patchReduction}
              rowFacts={{
                acquisitionDate: house.acquisitionDate,
                acquisitionPrice: house.acquisitionPrice ?? "",
                exclusiveArea: house.exclusiveArea ?? "",
                nonCapital: capital === null ? null : !capital,
              }}
            />
          )}
        {current?.kind === "special" && (
          <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
            <SpecialHouseExclusionItemFields
              item={current.special}
              hideAcquisitionDate
              onChange={(patch) =>
                onUpdate({
                  countExclusion: {
                    kind: "special",
                    special: { ...current.special, ...patch },
                  },
                })
              }
            />
          </div>
        )}
      </ToneCard>
    </div>
  );
}
