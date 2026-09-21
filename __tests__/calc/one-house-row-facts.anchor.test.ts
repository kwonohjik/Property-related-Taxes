/**
 * anchor — §155⑥1호 국가유산주택 사실의 **정본은 명부 행** (D-6 · P7-3)
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 |
 * |---|---|
 * | RF-1 | 행에 표시가 있으면 행에서 도출한다 |
 * | RF-2 | 행 표시가 없으면 **레거시 스칼라**를 쓴다 — 옛 record 세액 보존(OH-21) |
 * | RF-3 | 둘 다 있으면 행이 이긴다 (그리고 레거시 단독이 아님을 표시) |
 * | RF-4 | 둘 다 없으면 false — 기본값이 특례를 켜지 않는다 |
 * | RF-5 | `fromLegacyOnly` — 「어느 주택인지 지정하세요」를 띄울 신호(OH-30) |
 * | RF-6 | ④ 배선 — 행 표시만으로 엔진 payload에 `culturalHeritageHouse: true`가 실린다 |
 * | RF-7 | ④ 레거시 배선 — 행이 비어도 옛 스칼라가 그대로 실린다 |
 * | RF-8 | false는 **보내지 않는다**(기존 규약 불변 — Zod optional) |
 *
 * ## 🔑 RF-6·7이 배선 축이다
 *
 * 도출 함수가 옳아도 ④가 부르지 않으면 엔진에는 옛 값이 간다
 * ([[feedback_library_anchor_does_not_prove_component_uses_it]]).
 * `buildHouseholdSpecialPayload`의 **실제 산출물**을 본다.
 */
import { describe, it, expect } from "vitest";
import {
  deriveOneHouseFactsFromHouses,
  hasCulturalHeritageRow,
} from "@/lib/calc/one-house-row-facts";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const heritageRow = { oneHouseCulturalHeritage: true };
const plainRow = { oneHouseCulturalHeritage: undefined };

describe("RF-1~4 도출 규칙 — 행 우선, 레거시 폴백", () => {
  it("[RF-1] 행에 표시가 있으면 true", () => {
    const r = deriveOneHouseFactsFromHouses([plainRow, heritageRow], {});
    expect(r.culturalHeritageHouse).toBe(true);
    expect(r.fromLegacyOnly).toBe(false);
  });

  /** 🔴 **옛 record 세액 보존**(OH-21). 이 단언이 깨지면 저장된 계산이 재계산에서 달라진다. */
  it("[RF-2] 행 표시가 없으면 레거시 스칼라를 쓴다", () => {
    const r = deriveOneHouseFactsFromHouses([plainRow], {
      culturalHeritageHouseSpecial: true,
    });
    expect(r.culturalHeritageHouse).toBe(true);
  });

  it("[RF-3] 둘 다 있으면 행이 이긴다", () => {
    const r = deriveOneHouseFactsFromHouses([heritageRow], {
      culturalHeritageHouseSpecial: true,
    });
    expect(r.culturalHeritageHouse).toBe(true);
    expect(r.fromLegacyOnly).toBe(false);
  });

  /** 🔑 RF-1~3의 **긍정 짝**. 없으면 「항상 true를 반환한다」와 구별되지 않는다. */
  it("[RF-4] 둘 다 없으면 false", () => {
    expect(deriveOneHouseFactsFromHouses([plainRow], {}).culturalHeritageHouse).toBe(false);
    expect(deriveOneHouseFactsFromHouses(undefined, {}).culturalHeritageHouse).toBe(false);
    expect(deriveOneHouseFactsFromHouses([], {}).culturalHeritageHouse).toBe(false);
  });
});

describe("RF-5 레거시 단독 신호 — OH-30 카드용", () => {
  it("[RF-5a] 레거시만 → fromLegacyOnly true", () => {
    const r = deriveOneHouseFactsFromHouses([plainRow], {
      culturalHeritageHouseSpecial: true,
    });
    expect(r.fromLegacyOnly).toBe(true);
  });

  it("[RF-5b] 아무것도 없으면 false — 띄울 것이 없다", () => {
    expect(deriveOneHouseFactsFromHouses([], {}).fromLegacyOnly).toBe(false);
  });

  it("[RF-5c] hasCulturalHeritageRow — 행 존재만 본다", () => {
    expect(hasCulturalHeritageRow([heritageRow])).toBe(true);
    expect(hasCulturalHeritageRow([plainRow])).toBe(false);
    expect(hasCulturalHeritageRow(undefined)).toBe(false);
  });
});

// ── ④ 배선 ────────────────────────────────────────────────────────────

const primary = (): AssetForm =>
  ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2014-06-01" }) as AssetForm;

function form(over: Partial<TransferFormData> = {}): TransferFormData {
  return {
    transferDate: "2024-06-01",
    assets: [primary()],
    houses: [],
    presaleRights: [],
    isOneHousehold: true,
    householdHousingCount: "2",
    culturalHeritageHouseSpecial: false,
    temporaryTwoHouseSpecial: false,
    ...over,
  } as unknown as TransferFormData;
}

const heritageOf = (f: TransferFormData) =>
  (buildHouseholdSpecialPayload(f, f.assets[0]) as { culturalHeritageHouse?: boolean })
    .culturalHeritageHouse;

describe("RF-6~8 ④ 배선 — 도출값이 실제로 payload에 실린다", () => {
  /** 🔴 **이 단계의 존재 이유.** 행 표시만으로 엔진까지 가야 한다. */
  it("[RF-6] 행 표시만 → payload에 true", () => {
    const f = form({
      houses: [{ id: "h1", oneHouseCulturalHeritage: true }],
    } as unknown as Partial<TransferFormData>);
    expect(heritageOf(f)).toBe(true);
  });

  /** 🔴 레거시 경로 — 옛 record가 같은 세액을 내야 한다. */
  it("[RF-7] 행 없음 + 레거시 스칼라 → payload에 true", () => {
    expect(heritageOf(form({ culturalHeritageHouseSpecial: true }))).toBe(true);
  });

  /** 🔑 기존 규약 불변 — false는 키 자체를 보내지 않는다. */
  it("[RF-8] 둘 다 없으면 키가 없다", () => {
    expect(heritageOf(form())).toBeUndefined();
  });
});
