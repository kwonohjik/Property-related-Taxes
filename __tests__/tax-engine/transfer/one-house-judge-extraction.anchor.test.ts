/**
 * P2 앵커 — 1세대1주택 **공유 판정 엔진 추출**은 세액을 바꾸지 않는다.
 *
 * 계획서 `docs/00-pm/one-house-exemption-automation.plan.md` §5.1 · §6 OH-22 · §8.1-0 · §8.2 P-4.
 *
 * 계산기는 이제 `TransferTaxInput`을 **`OneHouseFacts`로 분해했다가 다시 조립해** 판정한다
 * (`lib/tax-engine/one-house/judge.ts`). 이 왕복이 무손실이라야 「판정 메뉴(P4)가 넘기는 사실만으로
 * 계산기와 같은 세액이 나온다」가 성립한다.
 *
 * 🔴 **이 파일이 지키는 것은 두 층이다.**
 *
 *   ① **왕복 항등** (J-1·J-2) — `toOneHouseJudgeInput(extract…)`가 판정 입력과 **완전히 같은** 값을
 *      낸다. 이것이 참이면 판정이 바뀔 수 없다(표본이 아니라 증명이다).
 *   ② **필드별 구별력** (J-3~) — 항등이 깨졌을 때 **어느 사실이** 사라졌는지 이름으로 알려준다.
 *      각 사실마다 **긍정·음성 짝**을 둔다(`feedback_negative_anchor_needs_positive_twin`) —
 *      음성 짝이 없으면 「원래 과세인 케이스」와 「사실이 사라져 과세가 된 케이스」가 구별되지 않는다.
 *
 * 각 `it`은 그 사실을 어댑터에서 버렸을 때 **실제로 실패하는지** 뮤테이션으로 확인했다(34/34 검출).
 * 구별력 0인 단언은 「가드를 넣었다」는 착각만 준다(`feedback_mutation_zero_discrimination_is_not_proof`).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  extractOneHouseFacts,
  extractOneHouseSale,
  toOneHouseJudgeInput,
} from "@/lib/tax-engine/one-house/judge";
import type { OneHouseJudgeInput } from "@/lib/tax-engine/one-house/types";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const run = (over: Partial<TransferTaxInput>) => calculateTransferTax(baseTransferInput(over), rates);
const exempt = (over: Partial<TransferTaxInput>) => run(over).isExempt;
/** §89② 「판정 불가」 고지가 가리키는 조문 목록 — 배제 예외 축의 유일한 관측 지점이다. */
const openArticles = (over: Partial<TransferTaxInput>) =>
  (run(over).warnings ?? []).filter((w) => w.includes("§89②")).join(" ");

/**
 * 판정 서브트리가 읽는 필드 — **동결 목록**.
 *
 * 아래 두 타입 가드가 이 배열을 `OneHouseJudgeInput`과 양방향으로 묶는다. 누가 판정 입력에
 * 필드를 늘리거나 줄이면 **여기서 컴파일이 깨진다** — 그때 어댑터(`judge.ts`)와 `OneHouseFacts`,
 * 그리고 P4 판정 메뉴의 입력 화면까지 함께 손봐야 한다는 신호다.
 */
const JUDGE_INPUT_KEYS = [
  "propertyType",
  "acquisitionDate",
  "transferDate",
  "transferPrice",
  "totalPropertyTransferPrice",
  "burdenedGiftDenominator",
  "isUnregistered",
  "acquisitionCause",
  "nonHousingToHousingConversion",
  "oneHouseUnitRole",
  "appurtenantHouseVerdict",
  "isOneHousehold",
  "householdHousingCount",
  "marriageMerge",
  "parentalCareMerge",
  "isFirstTransferredInMerge",
  "residencePeriodMonths",
  "residenceTransitionAcquisitionDate",
  "isRegulatedArea",
  "wasRegulatedAtAcquisition",
  "regionCode",
  "decedentSameHouseholdBeforeInheritance",
  "decedentCohabitationResidenceMonths",
  "decedentCohabitationHoldingStartDate",
  "generalHouseHeldAtInheritance",
  "generalHouseGiftedFromDecedentWithin2yr",
  // A3 OH-12c·OH-12 — 증여일(2018-02-13 부칙 게이트) · 상속개시 당시 보유 권리의 신축주택
  "generalHouseGiftDate",
  "generalHouseRightAtInheritance",
  "oneHouseExemptionProviso",
  "temporaryTwoHouse",
  "ruralHouse",
  "unavoidableOutsideCapitalHouse",
  "culturalHeritageHouse",
  "longTermMortgageHouse",
  "winWinRentalHouse",
  "houses",
  "presaleRights",
  "sellingHouseId",
  "replacementHouse",
  "rightThreeYearException",
  "mergedHouseholdFirstHouse",
  "inheritedRightChoiceWhenBothHeld",
] as const;

const _frozenKeyGuards: [
  // 목록이 판정 입력을 **덜** 덮으면 실패 — 새 필드가 늘었는데 여기 안 적은 경우.
  Exclude<keyof OneHouseJudgeInput, (typeof JUDGE_INPUT_KEYS)[number]> extends never ? true : never,
  // 목록에 **없는 필드**가 있으면 실패 — 판정 입력에서 빠졌는데 여기 남아 있는 경우.
  Exclude<(typeof JUDGE_INPUT_KEYS)[number], keyof OneHouseJudgeInput> extends never ? true : never,
] = [true, true];
void _frozenKeyGuards;

/** 판정 관련 필드를 **전부 비기본값으로** 채운 입력 — 왕복 항등의 시료. */
const MAXIMAL: Partial<TransferTaxInput> = {
  propertyType: "housing",
  acquisitionDate: D("2016-03-04"),
  transferDate: D("2024-07-08"),
  transferPrice: 1_450_000_000,
  totalPropertyTransferPrice: 1_900_000_000,
  burdenedGiftDenominator: 1_700_000_000,
  isUnregistered: false,
  acquisitionCause: "inheritance",
  nonHousingToHousingConversion: {
    residentialUseStartDate: D("2018-02-01"),
    residenceMonthsTrimmed: 7,
  },
  oneHouseUnitRole: "house",
  appurtenantHouseVerdict: {
    isExempt: true,
    isPartialExempt: false,
    houseAcquisitionDate: D("2015-01-02"),
    carryoverOneHouseExcluded: false,
  },
  isOneHousehold: true,
  householdHousingCount: 2,
  marriageMerge: { marriageDate: D("2020-05-06") },
  parentalCareMerge: { mergeDate: D("2019-09-10") },
  isFirstTransferredInMerge: true,
  residencePeriodMonths: 37,
  residenceTransitionAcquisitionDate: D("2017-01-03"),
  isRegulatedArea: true,
  wasRegulatedAtAcquisition: true,
  regionCode: "1168010100",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationResidenceMonths: 19,
  decedentCohabitationHoldingStartDate: D("2011-08-08"),
  generalHouseHeldAtInheritance: true,
  generalHouseGiftedFromDecedentWithin2yr: true,
  generalHouseGiftDate: D("2019-03-04"),
  generalHouseRightAtInheritance: "redevelopment_right",
  oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: D("2024-01-15") },
  temporaryTwoHouse: {
    previousAcquisitionDate: D("2016-03-04"),
    newAcquisitionDate: D("2022-06-07"),
    publicInstitutionRelocation: true,
  },
  ruralHouse: { kind: "farm_exit", isOutsideCapitalEupMyeon: true, ownerResidenceYears: 7 },
  unavoidableOutsideCapitalHouse: { reason: "illness", resolvedDate: D("2023-04-04") },
  culturalHeritageHouse: true,
  houses: [
    {
      id: "sell",
      acquisitionDate: D("2016-03-04"),
      officialPrice: 800_000_000,
      region: "capital",
      isInherited: false,
      isLongTermRental: false,
      isApartment: true,
      isOfficetel: false,
      isUnsoldHousing: false,
    },
  ],
  presaleRights: [
    { id: "rr", type: "redevelopment_right", acquisitionDate: D("2018-01-01"), region: "capital" },
  ],
  sellingHouseId: "sell",
  replacementHouse: {
    businessApprovalDate: D("2019-02-02"),
    completionDate: D("2023-03-03"),
    replacementResidenceMonths: 15,
    willResideNewHouse: true,
  },
  rightThreeYearException: {
    kind: "new_house",
    completionDate: D("2022-04-04"),
    movedInWithin3Years: true,
    residedOneYearOrMore: true,
  },
  mergedHouseholdFirstHouse: { kind: "succeeded_right", ownedBeforeRight: true },
  inheritedRightChoiceWhenBothHeld: "redevelopment_right",
};

describe("P2 — 판정 입력 왕복 (세액 불변의 근거)", () => {
  it("J-1 사실로 분해했다 조립하면 판정 입력과 **완전히 같다** (전 필드 비기본값)", () => {
    const input = baseTransferInput(MAXIMAL);
    const round = toOneHouseJudgeInput(extractOneHouseFacts(input), extractOneHouseSale(input));
    const projected = Object.fromEntries(JUDGE_INPUT_KEYS.map((k) => [k, input[k]]));
    expect(round).toEqual(projected);
  });

  it("J-2 왕복 결과의 키 집합 = 동결 목록 (조립부가 조용히 필드를 빠뜨리지 않는다)", () => {
    const input = baseTransferInput(MAXIMAL);
    const round = toOneHouseJudgeInput(extractOneHouseFacts(input), extractOneHouseSale(input));
    expect(Object.keys(round).sort()).toEqual([...JUDGE_INPUT_KEYS].sort());
  });

  it("J-3 값이 없는 입력도 왕복에서 **키가 사라지지 않는다** (undefined ≠ 미존재)", () => {
    const input = baseTransferInput();
    const round = toOneHouseJudgeInput(extractOneHouseFacts(input), extractOneHouseSale(input));
    expect(Object.keys(round).sort()).toEqual([...JUDGE_INPUT_KEYS].sort());
  });

  it("J-4 `household` 묶음이 혼인·동거봉양을 뒤섞지 않는다", () => {
    const only = (over: Partial<TransferTaxInput>) =>
      extractOneHouseFacts(baseTransferInput(over)).household;
    expect(only({ marriageMerge: { marriageDate: D("2020-01-01") } })).toMatchObject({
      marriageDate: D("2020-01-01"),
      parentalCareMergeDate: undefined,
    });
    expect(only({ parentalCareMerge: { mergeDate: D("2021-02-02") } })).toMatchObject({
      marriageDate: undefined,
      parentalCareMergeDate: D("2021-02-02"),
    });
  });
});

/**
 * 아래는 **필드별 구별력**이다. 각 짝의 두 값이 갈리지 않으면 그 사실은 안전망 밖이다.
 * 짝의 차이는 한 축뿐이어야 한다 — 두 축을 동시에 바꾸면 무엇이 판정을 갈랐는지 알 수 없다.
 */
describe("P2 — 판정 사실이 계산기까지 도달한다 (긍정·음성 짝)", () => {
  const REGULATED_SHORT = { wasRegulatedAtAcquisition: true, residencePeriodMonths: 0 } as const;

  it("J-5 §154① 단서 — 해외이주 출국(2호 나목)", () => {
    expect(
      exempt({
        ...REGULATED_SHORT,
        oneHouseExemptionProviso: { reason: "overseas_migration", departureDate: D("2023-09-01") },
      }),
    ).toBe(true);
    expect(exempt(REGULATED_SHORT)).toBe(false);
  });

  it("J-6 §154① 경과규정은 **수증자 실제 취득일**로 본다 (이월과세)", () => {
    // 2017-08-03 이전 취득이면 조정지역이라도 거주요건 면제.
    expect(exempt({ ...REGULATED_SHORT, residenceTransitionAcquisitionDate: D("2016-01-01") })).toBe(
      true,
    );
    expect(exempt({ ...REGULATED_SHORT, residenceTransitionAcquisitionDate: D("2019-01-01") })).toBe(
      false,
    );
  });

  it("J-7 §154⑧3호 — 동일세대 상속은 상속개시 전 거주를 통산한다", () => {
    const base = {
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 6,
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationResidenceMonths: 30,
    } as const;
    expect(exempt({ ...base, acquisitionCause: "inheritance" })).toBe(true);
    expect(exempt(base)).toBe(false); // 취득원인이 없으면 통산하지 않는다
    expect(exempt({ ...base, acquisitionCause: "inheritance", decedentCohabitationResidenceMonths: 3 })).toBe(
      false,
    );
    expect(
      exempt({ ...base, acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: false }),
    ).toBe(false);
  });

  it("J-8 보유 기산 — 동일세대 상속은 피상속인 보유기간을 통산한다", () => {
    const base = {
      acquisitionDate: D("2023-06-01"), // 단독으로는 보유 2년 미달
      acquisitionCause: "inheritance",
      decedentSameHouseholdBeforeInheritance: true,
    } as const;
    expect(exempt({ ...base, decedentCohabitationHoldingStartDate: D("2012-01-01") })).toBe(true);
    expect(exempt(base)).toBe(false);
  });

  it("J-9 §155① 일시적 2주택", () => {
    const temp = {
      householdHousingCount: 2,
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2018-01-01"),
        newAcquisitionDate: D("2022-06-01"),
      },
    } as const;
    expect(exempt(temp)).toBe(true);
    expect(exempt({ householdHousingCount: 2 })).toBe(false);
  });

  it("J-10 §155① 처분기한은 **조정지역 + 양도일**로 갈린다 (완화 2022-05-10 이전)", () => {
    const pre = {
      householdHousingCount: 2,
      acquisitionDate: D("2016-01-01"),
      transferDate: D("2021-06-01"),
      temporaryTwoHouse: {
        previousAcquisitionDate: D("2016-01-01"),
        newAcquisitionDate: D("2019-01-01"), // 양도까지 2.4년
      },
    } as const;
    expect(exempt({ ...pre, isRegulatedArea: false })).toBe(true); // 3년 이내
    expect(exempt({ ...pre, isRegulatedArea: true })).toBe(false); // 2년 초과
  });

  it("J-11 §155④⑤ 합가 — 합가일·선양도가 모두 있어야 의제", () => {
    const merge = {
      householdHousingCount: 2,
      isFirstTransferredInMerge: true,
      acquisitionDate: D("2018-01-01"),
      transferDate: D("2025-06-01"),
    } as const;
    expect(exempt({ ...merge, marriageMerge: { marriageDate: D("2020-01-01") } })).toBe(true);
    expect(exempt({ ...merge, parentalCareMerge: { mergeDate: D("2020-01-01") } })).toBe(true);
    expect(exempt(merge)).toBe(false); // 합가 사실 없음
    expect(
      exempt({
        ...merge,
        isFirstTransferredInMerge: false,
        marriageMerge: { marriageDate: D("2020-01-01") },
      }),
    ).toBe(false); // 선양도 아님
  });

  it("J-12 §155⑥ 문화유산 · §155⑦ 농어촌 · §155⑧ 부득이", () => {
    const two = { householdHousingCount: 2 } as const;
    expect(exempt({ ...two, culturalHeritageHouse: true })).toBe(true);
    expect(
      exempt({
        ...two,
        ruralHouse: { kind: "inherited", isOutsideCapitalEupMyeon: true, decedentResidenceYears: 6 },
      }),
    ).toBe(true);
    expect(exempt({ ...two, unavoidableOutsideCapitalHouse: { reason: "work" } })).toBe(true);
    expect(exempt(two)).toBe(false);
  });

  it("J-13 §156의2⑤ 대체주택", () => {
    const two = { householdHousingCount: 2 } as const;
    expect(
      exempt({
        ...two,
        replacementHouse: {
          businessApprovalDate: D("2019-01-01"),
          completionDate: D("2023-01-01"),
          replacementResidenceMonths: 14,
          willResideNewHouse: true,
        },
      }),
    ).toBe(true);
    expect(exempt(two)).toBe(false);
  });

  it("J-14 §91① 미등기는 비과세를 배제한다", () => {
    expect(exempt({})).toBe(true);
    expect(exempt({ isUnregistered: true })).toBe(false);
  });

  it("J-15 주택 수 스칼라 · 1세대 선언 · 자산 종류 게이트", () => {
    expect(exempt({})).toBe(true);
    expect(exempt({ householdHousingCount: 2 })).toBe(false);
    expect(exempt({ isOneHousehold: false })).toBe(false);
    expect(exempt({ propertyType: "land" })).toBe(false);
  });

  it("J-16 고가주택 판정은 **양도일 기준 금액**을 쓴다 (G-5)", () => {
    // 10억 양도: 2021-12-08 이후는 12억 이하라 전액 비과세, 그 전날은 9억 초과라 일부 과세.
    expect(run({ transferPrice: 1_000_000_000, transferDate: D("2021-12-08") }).isExempt).toBe(true);
    expect(run({ transferPrice: 1_000_000_000, transferDate: D("2021-12-07") }).isExempt).toBe(false);
  });

  it("J-17 12억 안분 분모는 **합계액**이다 (지분·일괄양도)", () => {
    const a = run({ transferPrice: 1_000_000_000 });
    const b = run({ transferPrice: 1_000_000_000, totalPropertyTransferPrice: 2_000_000_000 });
    expect(a.isExempt).toBe(true);
    expect(b.isExempt).toBe(false); // 합계 20억 → 고가주택
  });

  it("J-18 F-13 부수토지 카드는 **짝 주택의 판정**을 따른다", () => {
    const land = {
      oneHouseUnitRole: "appurtenant_land",
      appurtenantHouseVerdict: {
        isExempt: true,
        isPartialExempt: false,
        houseAcquisitionDate: D("2015-01-01"),
        carryoverOneHouseExcluded: false,
      },
    } as const;
    expect(exempt(land)).toBe(true);
    expect(exempt({ ...land, appurtenantHouseVerdict: undefined })).toBe(false);
  });

  it("J-19 §154⑤ 단서 — 용도변경 주택은 거주기간 통산 규칙이 다르다", () => {
    const base = {
      wasRegulatedAtAcquisition: true,
      residencePeriodMonths: 30,
      acquisitionCause: "inheritance",
      decedentSameHouseholdBeforeInheritance: true,
      decedentCohabitationResidenceMonths: 30,
    } as const;
    expect(exempt(base)).toBe(true);
    expect(
      exempt({
        ...base,
        residencePeriodMonths: 6,
        nonHousingToHousingConversion: {
          residentialUseStartDate: D("2022-01-01"),
          residenceMonthsTrimmed: 4,
        },
      }),
    ).toBe(false); // 용도변경이면 통산하지 않고 실거주 6개월만 본다
  });

  it("J-20 취득 당시 조정지역은 `regionCode`로 정밀 판정한다", () => {
    const short = { residencePeriodMonths: 0, wasRegulatedAtAcquisition: true } as const;
    // 비조정 지역 코드가 붙으면 boolean 선언보다 코드가 우선한다.
    expect(exempt({ ...short, regionCode: "4813010100" })).toBe(true);
    expect(exempt(short)).toBe(false);
  });
});

/**
 * §89②(주택 + 조합원입주권·분양권) 축.
 *
 * 🔴 이 축의 예외 사실은 **버려도 세액이 그대로**다 — 판정이 「배제 확정」이 아니라 `undetermined`
 *    (종전 동작 유지 + 고지)로 가기 때문이다. 그래서 세액이 아니라 **고지가 가리키는 조문**을 본다.
 *    세액만 단언하면 이 축 전체가 구별력 0이 된다(실측).
 */
describe("P2 — §89② 배제 예외 사실 (고지 조문으로 관측)", () => {
  const S892 = {
    householdHousingCount: 1,
    acquisitionDate: D("2016-01-01"),
    presaleRights: [
      { id: "rr", type: "redevelopment_right" as const, acquisitionDate: D("2018-01-01"), region: "capital" as const },
    ],
  };

  it("J-21 §156의2④ 3년 초과 예외 — 선언하면 인정, 없으면 판정 불가", () => {
    expect(
      exempt({
        ...S892,
        rightThreeYearException: {
          kind: "new_house",
          completionDate: D("2022-01-01"),
          movedInWithin3Years: true,
          residedOneYearOrMore: true,
        },
      }),
    ).toBe(true);
    expect(openArticles(S892)).toContain("§156의2 ④");
  });

  it("J-22 §156의2⑧⑨ 합가 — 선언하면 고지가 사라진다", () => {
    const merged = {
      ...S892,
      marriageMerge: { marriageDate: D("2020-01-01") },
      isFirstTransferredInMerge: true,
    };
    expect(openArticles({ ...merged, mergedHouseholdFirstHouse: { kind: "house_only" } })).toBe("");
    expect(openArticles(merged)).toContain("§156의2 ⑨");
  });

  it("J-23 §156의2⑥⑦ 상속 권리 — 일반주택 증여 단서가 갈래를 바꾼다", () => {
    const inherited = {
      ...S892,
      presaleRights: [{ ...S892.presaleRights[0], isInherited: true }],
    };
    expect(openArticles(inherited)).toContain("§156의2 ⑥·⑦");
    // 상속개시일 소급 2년 내 피상속인 증여분이면 그 갈래에서 탈락해 ④ 축으로 넘어간다.
    expect(openArticles({ ...inherited, generalHouseGiftedFromDecedentWithin2yr: true })).toContain(
      "§156의2 ④",
    );
  });

  it("J-24 §156의2⑮ 선택 — 피상속인이 다른 종류 권리를 보유한 경우", () => {
    const both = {
      ...S892,
      presaleRights: [
        { ...S892.presaleRights[0], isInherited: true, decedentOwnedOtherRightTypeAtDeath: true },
      ],
    };
    expect(openArticles({ ...both, inheritedRightChoiceWhenBothHeld: "redevelopment_right" })).toContain(
      "§156의2 ⑥·⑦",
    );
    expect(openArticles(both)).toContain("§156의2 ④");
  });

  it("J-25 §156의2⑦ 후단 — 상속주택 보유 세대의 일반주택 한정", () => {
    const withInheritedHouse = {
      ...S892,
      householdHousingCount: 2,
      houses: [
        { id: "sell", acquisitionDate: D("2016-01-01"), officialPrice: 500_000_000, region: "capital" as const, isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false },
        { id: "inh", acquisitionDate: D("2021-01-01"), officialPrice: 300_000_000, region: "capital" as const, isInherited: true, inheritedDate: D("2021-01-01"), isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false },
      ],
      sellingHouseId: "sell",
    };
    // 🔴 이 축도 세액으로는 안 보인다 — §155②③ 주택수 제외가 count를 1로 줄여 두어
    //    양쪽 모두 비과세이고, 갈리는 것은 「어느 조문을 확인하라」는 고지뿐이다(실측).
    expect(exempt(withInheritedHouse)).toBe(true);
    // A3 OH-12b(2026-09-26) — 일반주택 2016 취득 · 상속 2021이면 「상속개시 당시 보유」가 **날짜로 확인**된다
    //   (§155② 경로와 같은 leaf `qualifiesAsInheritanceGeneralHouse`) ⇒ 선언 없이도 ⑦ 후단이 닫힌다.
    expect(openArticles(withInheritedHouse)).not.toContain("§156의2 ⑦");
    // 선언이 여전히 의미를 갖는 갈래 — 상속개시일을 모르면(API 직접) 날짜로 확인할 수 없어 판정 불가로 남고,
    //   선언하면 닫힌다(종전 J-25의 구별력을 이 갈래로 옮긴다).
    const undated = {
      ...withInheritedHouse,
      houses: [withInheritedHouse.houses[0], { ...withInheritedHouse.houses[1], inheritedDate: undefined }],
    };
    expect(exempt(undated)).toBe(true);
    expect(openArticles(undated)).toContain("§156의2 ⑦");
    expect(openArticles({ ...undated, generalHouseHeldAtInheritance: true })).not.toContain("§156의2 ⑦");
  });

  it("J-26 권리 자체가 없으면 이 축은 발동하지 않는다 (긍정 짝)", () => {
    expect(openArticles({ householdHousingCount: 1, acquisitionDate: D("2016-01-01") })).toBe("");
  });
});
