/**
 * 결정 #16 공백 — 명부 행 ⑥ 「주택 수 제외(조특법 감면주택)」의 확인된 영 §167의3①5호 조문을 중과 「일반주택」 판정
 * (2주택 영 §167의10①10호 · 3주택 이상 §167의3①10호)의 5호 주택으로 잇는다(엔진 단위 — `surcharge-tax-incentive-house-link.ts`).
 * route 관측은 `__tests__/api/transfer.route.dec16-overlap-deemed.anchor.test.ts` L1~L9 · 겸용은
 * `__tests__/api/transfer.route.mixed-use-tax-incentive-house-link.anchor.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge } from "@/lib/tax-engine/multi-house-surcharge";
import {
  linkTaxIncentiveHouse5ho,
  withTaxIncentiveRental3hoNotice,
  withTaxIncentiveHouse5hoUnconfirmedNotice,
  withTaxIncentiveHouseNotices,
  TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE,
} from "@/lib/tax-engine/surcharge-tax-incentive-house-link";
import type { SpecialHouseExclusionInput } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { defaultRules, mockRegulatedHistory, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";
import type { HouseInfo } from "@/lib/tax-engine/types/multi-house-surcharge.types";

const TD = new Date("2021-09-18");
const SELLING = makeHouse("h1", { regionCode: "11680", acquisitionDate: new Date("2015-01-01") });
const decl = (over: Partial<SpecialHouseExclusionInput>): SpecialHouseExclusionInput => ({
  article: "unsold_99_2",
  houseId: "h2",
  houseContractDate: new Date("2013-06-01"),
  requirementsConfirmed: true,
  ...over,
});

const judge = (houses: HouseInfo[]) =>
  determineMultiHouseSurcharge(
    makeInput(houses, { sellingHouseId: "h1", transferDate: TD }),
    defaultRules,
    mockRegulatedHistory,
    suspensionNone,
    true,
  );
const linkedJudge = (houses: HouseInfo[], decls: SpecialHouseExclusionInput[]) =>
  judge(linkTaxIncentiveHouse5ho(houses, decls, TD, "h1"));
const reasons = (r: ReturnType<typeof judge>) => r.exclusionReasons.map((e) => e.type);

describe("⑥ → 5호 연결 leaf", () => {
  it("2주택 · 확인된 §99의2 ⑥ → 10호(only_general_two_house)", () => {
    const r = linkedJudge([SELLING, makeHouse("h2")], [decl({})]);
    expect(reasons(r)).toEqual(["only_general_two_house"]);
    expect(r.surchargeApplicable).toBe(false);
  });
  it("대조 — 같은 세대 ⑥ 없음 → 2주택 중과", () => {
    expect(judge([SELLING, makeHouse("h2")]).surchargeApplicable).toBe(true);
  });
  it("3주택 · 다른 두 주택 모두 확인된 5호 ⑥(§98의3·§99의3) → §167의3①10호 「일반주택」 배제", () => {
    const houses = [SELLING, makeHouse("h2"), makeHouse("h3")];
    const decls = [
      decl({ article: "unsold_98_3", houseId: "h2", houseAcquisitionDate: new Date("2009-06-01"), houseContractDate: undefined }),
      decl({ article: "new_99_3", houseId: "h3", housingKind: "self_built" as const, houseAcquisitionDate: new Date("2002-06-01"), houseContractDate: undefined }),
    ];
    const r = linkedJudge(houses, decls);
    expect(r.surchargeApplicable).toBe(false);
    expect(judge(houses).surchargeApplicable, "대조 — 연결 없으면 3주택 중과").toBe(true);
  });
  it("3주택 · 한 주택만 ⑥ → 일반주택이 2개라 배제 없음", () => {
    const r = linkedJudge([SELLING, makeHouse("h2"), makeHouse("h3")], [decl({})]);
    expect(r.surchargeApplicable).toBe(true);
  });

  it("3호 조문(§98·§97·§97의2)은 잇지 않는다 — 명부 그대로(같은 배열)", () => {
    const houses = [SELLING, makeHouse("h2")];
    for (const article of ["unsold_98", "rental_97", "rental_97_2"] as const) {
      const out = linkTaxIncentiveHouse5ho(
        houses,
        [decl({ article, houseAcquisitionDate: new Date("1997-06-01"), houseRentalStartDate: new Date("1999-06-01") })],
        TD,
        "h1",
      );
      expect(out, article).toBe(houses);
    }
  });
  it("요건 미확인 · 행 id 없음 · 양도 주택을 가리킴 → 잇지 않는다", () => {
    const houses = [SELLING, makeHouse("h2")];
    expect(linkTaxIncentiveHouse5ho(houses, [decl({ requirementsConfirmed: false })], TD, "h1")).toBe(houses);
    expect(linkTaxIncentiveHouse5ho(houses, [decl({ houseId: undefined })], TD, "h1")).toBe(houses);
    expect(linkTaxIncentiveHouse5ho([{ ...SELLING }, makeHouse("h2")], [decl({ houseId: "h1" })], TD, "h1")[0].isUnsoldHousing).toBe(false);
  });
  it("§99 신축주택 — §99②의 2007.12.31. 양도시한은 5호 판정에 쓰지 않는다(감면 요건만)", () => {
    const out = linkTaxIncentiveHouse5ho(
      [SELLING, makeHouse("h2")],
      [decl({ article: "new_99", housingKind: "self_built" as const, houseAcquisitionDate: new Date("1999-03-01"), houseContractDate: new Date("1999-03-01"), isNationalHousing: true })],
      TD,
      "h1",
    );
    expect(out[1].isUnsoldHousing).toBe(true);
  });
  it("칩이 이미 켜진 행 + ⑥ → 바꿀 것이 없어 같은 배열(한 번)", () => {
    const houses = [SELLING, makeHouse("h2", { isUnsoldHousing: true })];
    expect(linkTaxIncentiveHouse5ho(houses, [decl({})], TD, "h1")).toBe(houses);
  });
});

describe("3호 ⑥ 확인 필요 고지 — 결론을 가를 때만", () => {
  const rentalDecl = decl({ article: "rental_97", houseContractDate: undefined, houseRentalStartDate: new Date("1999-06-01") });
  const houses = [SELLING, makeHouse("h2")];
  it("§97 ⑥ · 중과 적용 · 3호로 보면 10호 배제 → 고지", () => {
    const r = withTaxIncentiveRental3hoNotice(judge(houses), houses, [rentalDecl], TD, "h1", judge);
    expect(r.surchargeApplicable).toBe(true);
    expect(r.warnings).toContain(TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE);
  });
  it("3주택(다른 일반주택 1채 더) → 3호로 봐도 중과 → 고지 없음", () => {
    const three = [...houses, makeHouse("h3")];
    const r = withTaxIncentiveRental3hoNotice(judge(three), three, [rentalDecl], TD, "h1", judge);
    expect(r.warnings).not.toContain(TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE);
  });
  it("임대개시일 공란(⑥ 불성립) → 고지 없음", () => {
    const r = withTaxIncentiveRental3hoNotice(judge(houses), houses, [{ ...rentalDecl, houseRentalStartDate: undefined }], TD, "h1", judge);
    expect(r.warnings).not.toContain(TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE);
  });
});

describe("5호 ⑥ 「모름」 확인 필요 고지 — 결론을 가를 때만 (L15 C-4)", () => {
  const houses = [SELLING, makeHouse("h2")];
  const notice = (r: ReturnType<typeof judge>) => r.warnings.filter((w) => w.startsWith("확인 필요: 주택 수 제외로 선언한 감면주택이"));
  /** 상속 당시 분양권이었는지 모름 — 5호 조문 §98의3 · 상속 행 (`INHERITED_PRESALE_UNCONFIRMED`) */
  const inheritedUnknown = decl({
    article: "unsold_98_3",
    houseAcquisitionDate: new Date("2009-06-01"),
    houseContractDate: undefined,
    isInherited: true,
    inheritedPresaleCompletedByHeir: "unknown",
  });
  it("상속 분양권 「모름」 → 고지(사유 = leaf 사유) · 세대 판정은 그대로 중과", () => {
    const r = withTaxIncentiveHouse5hoUnconfirmedNotice(judge(houses), houses, [inheritedUnknown], TD, "h1", judge);
    expect(r.surchargeApplicable).toBe(true);
    expect(notice(r)).toHaveLength(1);
    expect(notice(r)[0]).toContain("상속 당시 분양권이었고 상속인이 잔금을 내고 취득했는지 확인되지 않아");
  });
  it("「아니오」(완공된 주택 상속) → 모르는 것이 아니라 아닌 것 — 고지 없음", () => {
    const r = withTaxIncentiveHouse5hoUnconfirmedNotice(judge(houses), houses, [{ ...inheritedUnknown, inheritedPresaleCompletedByHeir: "no" }], TD, "h1", judge);
    expect(notice(r)).toEqual([]);
  });
  it("3주택 → 5호로 봐도 중과 → 고지 없음", () => {
    const three = [...houses, makeHouse("h3")];
    const r = withTaxIncentiveHouse5hoUnconfirmedNotice(judge(three), three, [inheritedUnknown], TD, "h1", judge);
    expect(notice(r)).toEqual([]);
  });
  it("행 id 없음 · 양도 주택을 가리킴 · 3호 조문 → 고지 없음", () => {
    for (const d of [{ ...inheritedUnknown, houseId: undefined }, { ...inheritedUnknown, houseId: "h1" }, decl({ article: "rental_97", houseRentalStartDate: new Date("1999-06-01") })]) {
      expect(notice(withTaxIncentiveHouse5hoUnconfirmedNotice(judge(houses), houses, [d], TD, "h1", judge))).toEqual([]);
    }
  });
  it("이미 중과가 꺼진 판정 · 5호 표시가 이미 켜진 행 → 같은 결과 객체(바꿀 것 없음)", () => {
    const excluded = judge([SELLING, makeHouse("h2", { isUnsoldHousing: true })]);
    expect(withTaxIncentiveHouse5hoUnconfirmedNotice(excluded, houses, [inheritedUnknown], TD, "h1", judge)).toBe(excluded);
    const chipped = [SELLING, makeHouse("h2", { isUnsoldHousing: true })];
    const surcharged = judge(houses);
    expect(withTaxIncentiveHouse5hoUnconfirmedNotice(surcharged, chipped, [inheritedUnknown], TD, "h1", judge)).toBe(surcharged);
  });
  it("3주택 · 다른 두 주택이 모두 「모름」 → 함께 5호로 보면 배제되므로 고지 한 번(사유 둘)", () => {
    const three = [SELLING, makeHouse("h2"), makeHouse("h3")];
    const r = withTaxIncentiveHouse5hoUnconfirmedNotice(
      judge(three),
      three,
      [inheritedUnknown, { ...inheritedUnknown, houseId: "h3" }],
      TD,
      "h1",
      judge,
    );
    expect(notice(r)).toHaveLength(1);
  });
  it("합성 `withTaxIncentiveHouseNotices` — 3호 임대 ⑥만 있으면 3호 고지 한 번 · 5호 고지 없음, 5호 「모름」만 있으면 반대", () => {
    const rental = decl({ article: "rental_97", houseContractDate: undefined, houseRentalStartDate: new Date("1999-06-01") });
    const a = withTaxIncentiveHouseNotices(judge(houses), houses, [rental], TD, "h1", judge);
    expect(a.warnings.filter((w) => w === TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE)).toHaveLength(1);
    expect(notice(a)).toEqual([]);
    const b = withTaxIncentiveHouseNotices(judge(houses), houses, [inheritedUnknown], TD, "h1", judge);
    expect(b.warnings).not.toContain(TAX_INCENTIVE_RENTAL_3HO_UNCONFIRMED_NOTICE);
    expect(notice(b)).toHaveLength(1);
  });
});
