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
  type OneHouseFactRow,
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

// ── §155⑦ 농어촌주택 (3b) ──────────────────────────────────────────────

/**
 * ## RU-1~9 — 농어촌주택도 정본이 명부 행이다
 *
 * | # | 주장 |
 * |---|---|
 * | RU-1 | 행 표시 + 유형이 있으면 행에서 도출 |
 * | RU-2 | 유형이 없으면 미해당 — 표시만으로는 성립하지 않는다 |
 * | RU-3 | **유형별로 무의미한 필드를 싣지 않는다**(종전 ④ 규약 불변) |
 * | RU-4 | 귀농 취득일 = **행의 취득일**(§155⑦ 단서의 「그 주택을 취득한 날」) |
 * | RU-5 | 소재 요건 — 행 주소에서 자동 판정 |
 * | RU-6 | 사용자 지정값이 있으면 자동 판정을 덮는다 |
 * | RU-7 | 읍지역은 용도지역 조회 결과로 갈린다 |
 * | RU-8 | 행이 없으면 **레거시 블록**을 그대로 쓴다(OH-21) |
 * | RU-9 | ④ 배선 — 행만으로 payload `ruralHouse`가 실린다 |
 */
const RURAL_ROW = {
  oneHouseRuralHouse: true as const,
  ruralHouseKind: "inherited" as const,
  ruralDecedentResidenceYears: "6",
  // 비수도권(48) 면지역 — 조회 없이 순수 판정된다
  regionCode: "4882025000",
  addressJibun: "경상남도 거창군 가북면 용산리 1",
};

describe("RU-1~3 행 도출 · 유형별 필드", () => {
  it("[RU-1] 행 표시 + 유형 → ruralHouse 도출", () => {
    const r = deriveOneHouseFactsFromHouses([RURAL_ROW], {});
    expect(r.ruralHouse?.kind).toBe("inherited");
    expect(r.ruralHouse?.decedentResidenceYears).toBe(6);
  });

  /** 🔑 RU-1의 긍정 짝 — 「항상 도출한다」와 구별한다. */
  it("[RU-2] 유형이 없으면 미해당", () => {
    const r = deriveOneHouseFactsFromHouses(
      [{ oneHouseRuralHouse: true, addressJibun: "경상남도 거창군 가북면 용산리 1" }],
      {},
    );
    expect(r.ruralHouse).toBeUndefined();
  });

  /**
   * 🔴 **종전 ④ 규약을 그대로 지킨다** — 상속 유형에 귀농 대지면적을 실어 보내면
   *    조용한 오판정이 된다.
   */
  it("[RU-3] 상속 유형에 귀농 필드를 싣지 않는다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [{ ...RURAL_ROW, ruralLandAreaSqm: "500", ruralWholeHouseholdMoved: true }],
      {},
    );
    expect(r.ruralHouse).not.toHaveProperty("landAreaSqm");
    expect(r.ruralHouse).not.toHaveProperty("wholeHouseholdMoved");
    expect(r.ruralHouse).not.toHaveProperty("ownerResidenceYears");
  });
});

describe("RU-4 귀농 취득일 = 행의 취득일", () => {
  /**
   * 🔑 §155⑦ 단서 「제3호의 주택에 대해서는 **그 주택을 취득한 날**부터 5년 이내에
   *    일반주택을 양도하는 경우에 한정」 — 「그 주택」이 이 행이므로 별도 칸이 없다.
   */
  it("[RU-4] 귀농 유형은 행 acquisitionDate를 싣는다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [
        {
          ...RURAL_ROW,
          ruralHouseKind: "return_to_farm",
          acquisitionDate: "2021-05-04",
          ruralLandAreaSqm: "500",
          ruralWholeHouseholdMoved: true,
        },
      ],
      {},
    );
    expect(r.ruralHouse?.acquisitionDate).toBe("2021-05-04");
    expect(r.ruralHouse?.landAreaSqm).toBe(500);
    expect(r.ruralHouse?.wholeHouseholdMoved).toBe(true);
  });
});

describe("RU-5~7 소재 요건 — 행 주소에서 판정", () => {
  it("[RU-5] 비수도권 면지역 → 자동으로 충족", () => {
    expect(deriveOneHouseFactsFromHouses([RURAL_ROW], {}).ruralHouse?.isOutsideCapitalEupMyeon)
      .toBe(true);
  });

  /** 🔑 RU-5의 짝 — 수도권이면 자동으로 불충족이어야 한다. */
  it("[RU-5b] 수도권이면 자동으로 불충족", () => {
    const r = deriveOneHouseFactsFromHouses(
      [{ ...RURAL_ROW, regionCode: "1168010100", addressJibun: "서울특별시 강남구 역삼동 1" }],
      {},
    );
    expect(r.ruralHouse?.isOutsideCapitalEupMyeon).toBe(false);
  });

  /** 🔴 사용자 지정이 자동 판정을 이긴다 — `undefined`가 「자동을 쓴다」는 뜻이다. */
  it("[RU-6] 사용자 지정값이 자동 판정을 덮는다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [{ ...RURAL_ROW, regionCode: "1168010100", ruralOutsideCapitalEupMyeon: true }],
      {},
    );
    expect(r.ruralHouse?.isOutsideCapitalEupMyeon).toBe(true);
  });

  it("[RU-7] 읍지역 — 용도지역 조회 결과로 갈린다", () => {
    const eup = { ...RURAL_ROW, addressJibun: "강원특별자치도 홍천군 홍천읍 희망리 1", regionCode: "5172025000" };
    expect(
      deriveOneHouseFactsFromHouses([{ ...eup, ruralUrbanZone: "non_urban" }], {}).ruralHouse
        ?.isOutsideCapitalEupMyeon,
    ).toBe(true);
    expect(
      deriveOneHouseFactsFromHouses([{ ...eup, ruralUrbanZone: "urban" }], {}).ruralHouse
        ?.isOutsideCapitalEupMyeon,
    ).toBe(false);
  });
});

describe("RU-8 레거시 폴백 — 옛 record 세액 보존", () => {
  const LEGACY = {
    kind: "farm_exit" as const,
    isOutsideCapitalEupMyeon: true,
    ownerResidenceYears: 7,
  };

  it("[RU-8a] 행이 없으면 레거시를 그대로 쓴다", () => {
    const r = deriveOneHouseFactsFromHouses([], { ruralHouse: LEGACY });
    expect(r.ruralHouse).toEqual(LEGACY);
    expect(r.fromLegacyOnly).toBe(true);
  });

  it("[RU-8b] 행이 있으면 행이 이긴다", () => {
    const r = deriveOneHouseFactsFromHouses([RURAL_ROW], { ruralHouse: LEGACY });
    expect(r.ruralHouse?.kind).toBe("inherited");
    expect(r.fromLegacyOnly).toBe(false);
  });
});

describe("RU-9 ④ 배선", () => {
  /** 🔴 도출이 옳아도 ④가 부르지 않으면 엔진에는 옛 값이 간다. */
  it("[RU-9] 행만으로 payload에 ruralHouse가 실린다", () => {
    const f = form({ houses: [{ id: "h1", ...RURAL_ROW }] } as unknown as Partial<TransferFormData>);
    const payload = buildHouseholdSpecialPayload(f, f.assets[0]) as {
      ruralHouse?: { kind: string; decedentResidenceYears?: number };
    };
    expect(payload.ruralHouse?.kind).toBe("inherited");
    expect(payload.ruralHouse?.decedentResidenceYears).toBe(6);
  });

  /** 🔑 미해당이면 키 자체가 없다(Zod optional 계약 불변). */
  it("[RU-9b] 행도 레거시도 없으면 키가 없다", () => {
    const f = form();
    expect(buildHouseholdSpecialPayload(f, f.assets[0])).not.toHaveProperty("ruralHouse");
  });
});

// ── §155⑧ 수도권 밖 부득이 (4) ────────────────────────────────────────

/**
 * ## UO-1~8 — §155⑧도 정본이 명부 행이다
 *
 * | # | 주장 |
 * |---|---|
 * | UO-1 | 행 표시가 있으면 행에서 도출 |
 * | UO-2 | 해소일 미입력 = **미해소** ⇒ 키를 만들지 않는다(W-1) |
 * | UO-3 | ⛔ **3호와 4호는 별개다** — 3호 필드만으로는 §155⑧이 서지 않는다 |
 * | UO-4 | ⛔ **역방향** — 4호 표시가 3호 필드를 만들지 않는다 |
 * | UO-5 | 🔑 **두 호가 갈리는 시료** — 기준시가 3억 초과 + 수도권 밖 |
 * | UO-6 | 레거시 폴백(OH-21) |
 * | UO-7 | ④ 배선 |
 * | UO-8 | OH-30 신호 — 세 축 중 하나라도 행이 있으면 `fromLegacyOnly`는 false |
 *
 * ## 🔑 UO-5가 이 단계의 핵심이다
 *
 * 두 호가 **항상 함께 참인 시료**만 쓰면 구별력이 0이라 한 호를 지워도 초록이다
 * ([[feedback_mutation_zero_discrimination_is_not_proof]]). 3호는 취득 당시 기준시가
 * **3억 이하**를 요구하고 4호는 그 요건이 **없으므로**, 3억 초과 + 수도권 밖이면
 * **3호는 불성립, 4호는 성립**이다 — 그 시료를 반드시 둔다.
 */
const UOC_ROW = {
  oneHouseUnavoidableOutsideCapital: true as const,
  unavoidableOutsideCapitalReason: "work" as const,
  unavoidableOutsideCapitalResolvedDate: "2024-03-02",
  regionCode: "4882025000", // 비수도권
};

describe("UO-1·2 행 도출 · 해소일 규약", () => {
  it("[UO-1] 행 표시 → unavoidableOutsideCapitalHouse 도출", () => {
    const r = deriveOneHouseFactsFromHouses([UOC_ROW], {});
    expect(r.unavoidableOutsideCapitalHouse).toEqual({
      reason: "work",
      resolvedDate: "2024-03-02",
    });
  });

  /** 🔴 빈 문자열을 그대로 보내면 엔진이 기한을 기산해 버린다(계획서 W-1). */
  it("[UO-2] 해소일 미입력 → resolvedDate 키 자체가 없다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [{ ...UOC_ROW, unavoidableOutsideCapitalResolvedDate: "" }],
      {},
    );
    expect(r.unavoidableOutsideCapitalHouse).toEqual({ reason: "work" });
    expect(r.unavoidableOutsideCapitalHouse).not.toHaveProperty("resolvedDate");
  });
});

describe("UO-3·4·5 ⛔ 3호와 4호는 별개 조문이다", () => {
  /**
   * 🔴 행에는 **이미** 3호 필드가 있다(`isUnavoidableReason` — 영 §167의10①3호).
   *    그것만으로 §155⑧(4호)이 서면 기준시가 3억·1년 거주 요건이 조용히 사라진다.
   */
  it("[UO-3] 3호 필드만 있으면 §155⑧은 서지 않는다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [
        {
          isUnavoidableReason: true,
          unavoidableResidenceYears: "2",
          unavoidableReasonResolvedDate: "2024-03-02",
          regionCode: "4882025000",
        } as unknown as OneHouseFactRow,
      ],
      {},
    );
    expect(r.unavoidableOutsideCapitalHouse).toBeUndefined();
  });

  /**
   * 🔑 역방향 짝 — 4호 표시가 3호 요건을 만들어 내지 않는다.
   *
   * 🔴 **타입이 이미 막고 있다**: `OneHouseFactRow`의 `Pick`에 3호 필드
   *    (`unavoidableResidenceYears`·`unavoidableReasonResolvedDate`)가 **없다**.
   *    그래서 도출 함수는 그것들을 **읽을 수조차 없다**. 아래 캐스트는 그 사실을
   *    드러내려고 일부러 우회한 것이다 — 값이 들어와도 결과가 안 바뀐다.
   */
  it("[UO-4] 4호 표시는 3호 필드를 읽지 않는다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [
        {
          ...UOC_ROW,
          unavoidableResidenceYears: "0",
          unavoidableReasonResolvedDate: "1999-01-01",
        } as unknown as OneHouseFactRow,
      ],
      {},
    );
    // 3호의 해소일(1999)이 아니라 **4호의 해소일**(2024)을 쓴다.
    expect(r.unavoidableOutsideCapitalHouse?.resolvedDate).toBe("2024-03-02");
  });

  /**
   * 🔑 **구별력 시료** — 취득 당시 기준시가 3억 **초과** + 수도권 밖.
   *    3호는 `acquisitionOfficialPrice > 3억`이면 불성립이고, 4호는 그 요건이 없어 성립한다.
   *    두 호를 한 필드로 합치면 이 조합에서 4호가 조용히 죽는다.
   */
  it("[UO-5] 기준시가 3억 초과 + 수도권 밖 → 4호는 성립한다", () => {
    const r = deriveOneHouseFactsFromHouses(
      [
        {
          ...UOC_ROW,
          // 3호라면 불성립시킬 값 — 4호 도출은 이것을 보지 않는다.
          isUnavoidableReason: true,
          acquisitionOfficialPrice: "500000000",
          unavoidableResidenceYears: "0",
        } as unknown as OneHouseFactRow,
      ],
      {},
    );
    expect(r.unavoidableOutsideCapitalHouse?.reason).toBe("work");
  });
});

describe("UO-6·7 레거시 폴백 · ④ 배선", () => {
  const LEGACY = { reason: "illness" as const, resolvedDate: "2023-01-01" };

  it("[UO-6a] 행이 없으면 레거시를 쓴다", () => {
    const r = deriveOneHouseFactsFromHouses([], { unavoidableOutsideCapitalHouse: LEGACY });
    expect(r.unavoidableOutsideCapitalHouse).toEqual(LEGACY);
    expect(r.fromLegacyOnly).toBe(true);
  });

  it("[UO-6b] 행이 있으면 행이 이긴다", () => {
    const r = deriveOneHouseFactsFromHouses([UOC_ROW], { unavoidableOutsideCapitalHouse: LEGACY });
    expect(r.unavoidableOutsideCapitalHouse?.reason).toBe("work");
    expect(r.fromLegacyOnly).toBe(false);
  });

  it("[UO-7] ④ 배선 — 행만으로 payload에 실린다", () => {
    const f = form({ houses: [{ id: "h1", ...UOC_ROW }] } as unknown as Partial<TransferFormData>);
    const payload = buildHouseholdSpecialPayload(f, f.assets[0]) as {
      unavoidableOutsideCapitalHouse?: { reason: string };
    };
    expect(payload.unavoidableOutsideCapitalHouse?.reason).toBe("work");
  });
});

describe("UO-8 OH-30 신호 — 세 축 공통", () => {
  it("[UO-8a] 레거시만 있으면 true", () => {
    expect(
      deriveOneHouseFactsFromHouses([], { culturalHeritageHouseSpecial: true }).fromLegacyOnly,
    ).toBe(true);
    expect(
      deriveOneHouseFactsFromHouses([], {
        unavoidableOutsideCapitalHouse: { reason: "study" },
      }).fromLegacyOnly,
    ).toBe(true);
  });

  /** 🔑 한 축이라도 행에 지정돼 있으면 「미지정」이 아니다. */
  it("[UO-8b] 행이 하나라도 있으면 false", () => {
    expect(
      deriveOneHouseFactsFromHouses([{ oneHouseCulturalHeritage: true }], {
        unavoidableOutsideCapitalHouse: { reason: "study" },
      }).fromLegacyOnly,
    ).toBe(false);
  });

  it("[UO-8c] 둘 다 없으면 false — 띄울 것이 없다", () => {
    expect(deriveOneHouseFactsFromHouses([], {}).fromLegacyOnly).toBe(false);
  });
});
