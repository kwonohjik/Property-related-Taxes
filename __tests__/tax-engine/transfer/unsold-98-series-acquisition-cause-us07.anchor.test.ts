// US-07 · US-06 anchor — §98 시리즈 취득 원인 게이트 (사용자 결정 2026-11-06 「전 조문 차단」)
//
// 대상은 사업주체(등)에게서 최초 계약·분양으로 취득한 미분양주택이다. 상속·증여·이월과세 증여로 받은 주택은 아니다
// (부동산거래관리과-337 · 조심 2017중1433 · 대법원 2014두35126 · 서면-2022-부동산-0888).
// 예외: 분양권 상속 후 상속인 잔금 취득(§98의3·§98의5·§98의7 — 조세법령운용과-1103) · §98의6 2호 상속(조특령 §98의5⑤2호).
// 종전에는 엔진·⑧이 취득 원인을 보지 않아 상속받은 §98의3 완공주택이 100% 감면(총부담 0)이었고(US-07),
// 명부의 상속 감면주택이 주택 수에서 빠져 일반주택이 비과세됐다(US-06).
// 근거: docs/reviews/unsold-98-series-review-2026-11.md US-07 · US-06.
import { describe, it, expect } from "vitest";
import { unsold98AcquisitionCauseReason, asksInheritedPresaleQuestion } from "@/lib/tax-engine/transfer-reductions/unsold-98-acquisition-cause";
import { resolveSpecialHouseExclusions } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { specialHouseExclusionsPayload, rowSpecialHouseExclusions } from "@/lib/calc/house-count-exclusion-rows";
import { inheritedPresalePayload } from "@/lib/calc/unsold-98-inherited-presale";
import { resolveMixedReductionSurchargeExclusion } from "@/lib/tax-engine/transfer-tax-mixed-use-reduction-surcharge";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";

const rates = makeMockRates();
type Reductions = TransferTaxInput["reductions"];

/** P3-8 사실관계(§98의5 5년 이내 80%) — 매매 취득이면 감면 67,192,000 · 총부담 18,477,800 */
const UNSOLD_985 = {
  type: "unsold_98_5" as const,
  contractDate985: new Date("2010-06-15"),
  priceReductionRatePct985: 15,
  isNonCapitalUnsoldAtCutoff985: true,
  isFirstContract985: true,
  isNotOccupiedAtContract985: true,
  isNotRecontract985: true,
  standardPriceAtAcquisition985: 200_000_000,
  standardPriceAt5Years985: 300_000_000,
  standardPriceAtTransfer985: 400_000_000,
};

const run985 = (over: Partial<TransferTaxInput>, reductions: Reductions = [UNSOLD_985] as Reductions) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 500_000_000,
      acquisitionDate: new Date("2011-06-15"),
      transferDate: new Date("2016-01-01"),
      householdHousingCount: 2,
      reductions,
      ...over,
    }),
    rates,
  );

describe("US-07 leaf — 조문 × 취득 원인", () => {
  it("L-1: 증여·이월과세 증여는 6조문 모두 불성립, 매매·신축·부담부증여는 게이트 밖", () => {
    for (const id of ["unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7"]) {
      expect(unsold98AcquisitionCauseReason(id, "gift")?.code).toBe("ACQUIRED_BY_GIFT");
      expect(unsold98AcquisitionCauseReason(id, "carryover_gift")?.code).toBe("ACQUIRED_BY_GIFT");
      for (const c of ["purchase", "newConstruction", "burdened_gift", undefined]) {
        expect(unsold98AcquisitionCauseReason(id, c)).toBeUndefined();
      }
    }
    expect(unsold98AcquisitionCauseReason("new_99", "gift")).toBeUndefined(); // §99 계열은 자체 leaf
  });

  it("L-2: 상속 — §98·§98의2는 분양권 답과 무관하게 불성립 · §98의3·§98의5·§98의7은 「예」만 적용", () => {
    for (const id of ["unsold_98", "unsold_98_2"]) {
      expect(unsold98AcquisitionCauseReason(id, "inheritance", { inheritedPresaleCompletedByHeir: "yes" })?.code).toBe("ACQUIRED_BY_INHERITANCE");
      expect(asksInheritedPresaleQuestion(id, "inheritance")).toBe(false);
    }
    for (const id of ["unsold_98_3", "unsold_98_5", "unsold_98_7"]) {
      expect(asksInheritedPresaleQuestion(id, "inheritance")).toBe(true);
      expect(asksInheritedPresaleQuestion(id, "purchase")).toBe(false);
      expect(unsold98AcquisitionCauseReason(id, "inheritance", { inheritedPresaleCompletedByHeir: "yes" })).toBeUndefined();
      expect(unsold98AcquisitionCauseReason(id, "inheritance", { inheritedPresaleCompletedByHeir: "no" })?.code).toBe("ACQUIRED_BY_INHERITANCE");
      const u = unsold98AcquisitionCauseReason(id, "inheritance", { inheritedPresaleCompletedByHeir: "unknown" });
      expect(u?.code).toBe("INHERITED_PRESALE_UNCONFIRMED");
      expect(u?.unconfirmed).toBe(true);
      expect(unsold98AcquisitionCauseReason(id, "inheritance")?.unconfirmed).toBe(true); // 빈 값 = 모름
    }
  });

  it("L-3: §98의6 — 2호(매수자 임대) 상속은 적용, 1호(사업주체 임대)·증여는 불성립", () => {
    expect(unsold98AcquisitionCauseReason("unsold_98_6", "inheritance", { hoType986: "buyer_rented" })).toBeUndefined();
    expect(unsold98AcquisitionCauseReason("unsold_98_6", "inheritance", { hoType986: "seller_rented" })?.code).toBe("ACQUIRED_BY_INHERITANCE");
    expect(unsold98AcquisitionCauseReason("unsold_98_6", "gift", { hoType986: "buyer_rented" })?.code).toBe("ACQUIRED_BY_GIFT");
  });
});

describe("US-07 엔진 — 진입부에서 걷어 내고 고지한다", () => {
  const none = run985({ acquisitionCause: "inheritance" }, []);

  it("E-1: 🔴 상속 + §98의5 + 답 없음 → 감면 없음 = 미선택 세액 · 확인 필요 고지", () => {
    const r = run985({ acquisitionCause: "inheritance" });
    expect(r.unsold985Detail).toBeUndefined();
    expect(r.totalTax).toBe(none.totalTax);
    expect(r.warnings?.some((w) => w.startsWith("확인 필요") && w.includes("§98의5"))).toBe(true);
  });

  it("E-2: 상속 + 「아니오」(완공 주택 상속) → 감면 없음 = 미선택 세액", () => {
    const r = run985({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "no" });
    expect(r.totalTax).toBe(none.totalTax);
    expect(r.warnings?.some((w) => w.includes("부동산거래관리과-337"))).toBe(true);
  });

  it("E-3: 상속 + 「예」(분양권 상속 후 잔금 취득) → 매매 취득과 같은 감면 (P3-8 값)", () => {
    const r = run985({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "yes" });
    expect(r.reductionAmount).toBe(67_192_000);
    expect(r.totalTax).toBe(18_477_800);
  });

  it("E-4: 🔴 증여 · 이월과세 증여 → 감면 없음 = 미선택 세액", () => {
    for (const cause of ["gift", "carryover_gift"] as const) {
      const r = run985({ acquisitionCause: cause });
      expect(r.unsold985Detail).toBeUndefined();
      expect(r.reductionAmount).toBe(0);
      expect(r.warnings?.some((w) => w.includes("증여") && w.includes("§98의5"))).toBe(true);
    }
  });

  it("E-5: 대조군 — 매매 취득은 그대로 (P3-8)", () => {
    const r = run985({ acquisitionCause: "purchase" });
    expect(r.reductionAmount).toBe(67_192_000);
    expect(r.totalTax).toBe(18_477_800);
  });

  it("E-6: 「예」여도 상속 아닌 자산에는 의미가 없다(매매 + 「아니오」 잔재 → 그대로 적용)", () => {
    const r = run985({ acquisitionCause: "purchase", inheritedPresaleCompletedByHeir: "no" });
    expect(r.reductionAmount).toBe(67_192_000);
  });
});

describe("US-06 명부 행 — 상속 감면주택은 주택 수에서 빠지지 않는다", () => {
  const T = new Date("2018-07-22");
  const decl = (article: "unsold_98_3" | "unsold_98_2" | "unsold_98_6" | "new_99", extra: Record<string, unknown> = {}) => ({
    article,
    houseId: "h2",
    // §98의6은 「2011.3.29. 현재 준공후미분양」이라 취득일 ≥ 2011-03-29여야 한다(US-22) — 상속·증여 판정이 이 테스트의 의도다
    houseAcquisitionDate: article === "new_99" ? new Date("1999-03-01") : article === "unsold_98_6" ? new Date("2011-06-01") : new Date("2009-06-01"),
    // #2951(NH-24) 이후 §99·§99의3 행은 유형 필수 — 자기건설(사용승인일=취득일 축)
    ...(article === "new_99" ? { housingKind: "self_built" as const } : {}),
    requirementsConfirmed: true,
    ...extra,
  });

  it("H-1: 🔴 상속 행 §98의3·§98의2·§99 → 불성립 (조심 2017중1433)", () => {
    for (const a of ["unsold_98_3", "unsold_98_2", "new_99"] as const) {
      const r = resolveSpecialHouseExclusions([decl(a, { isInherited: true, inheritedPresaleCompletedByHeir: "no" })], T);
      expect(r.excludedCount).toBe(0);
      expect(r.entries[0].eligible).toBe(false);
    }
  });

  it("H-2: 대조군 — 같은 선언이 상속이 아니면 제외된다", () => {
    expect(resolveSpecialHouseExclusions([decl("unsold_98_3")], T).excludedCount).toBe(1);
  });

  it("H-3: 상속 행 §98의3 + 분양권 상속 「예」 → 제외 · 「모름」 → 불성립 + 확인 필요", () => {
    expect(resolveSpecialHouseExclusions([decl("unsold_98_3", { isInherited: true, inheritedPresaleCompletedByHeir: "yes" })], T).excludedCount).toBe(1);
    const u = resolveSpecialHouseExclusions([decl("unsold_98_3", { isInherited: true, inheritedPresaleCompletedByHeir: "unknown" })], T);
    expect(u.excludedCount).toBe(0);
    expect(u.entries[0].unconfirmed).toBe(true);
  });

  it("H-6: 🔴 증여 취득 행(토글) §98의3·§98의6·§99·§99의3 → 불성립 · 토글 꺼짐이면 제외 (사용자 결정 — 행에 증여 칸)", () => {
    for (const a of ["unsold_98_3", "unsold_98_6"] as const) {
      expect(resolveSpecialHouseExclusions([decl(a, { acquiredByGift: true })], T).excludedCount).toBe(0);
      expect(resolveSpecialHouseExclusions([decl(a, { acquiredByGift: false })], T).excludedCount).toBe(1);
    }
    // §99②는 다른 주택을 2007.12.31까지 양도할 때만 — 그 안의 양도일로 본다
    const T99 = new Date("2007-06-01");
    expect(resolveSpecialHouseExclusions([decl("new_99", { acquiredByGift: true })], T99).excludedCount).toBe(0);
    expect(resolveSpecialHouseExclusions([decl("new_99", { acquiredByGift: false })], T99).excludedCount).toBe(1);
    const r993 = resolveSpecialHouseExclusions(
      [{ article: "new_99_3", houseId: "h2", houseAcquisitionDate: new Date("2002-06-01"), housingKind: "self_built" as const, requirementsConfirmed: true, acquiredByGift: true }],
      new Date("2007-06-01"),
    );
    expect(r993.entries[0].eligible).toBe(false);
    expect(r993.entries[0].reason).toContain("증여");
  });

  it("H-7: 증여 토글 — §98 시리즈 6조문 전부(조문별 취득기간 안의 날짜) · 5호 중과 연결도 같은 결론", async () => {
    const { SPECIAL_HOUSE_EXCLUSION_WINDOWS, meetsSpecialHouseReductionRequirements } = await import(
      "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5"
    );
    for (const a of ["unsold_98", "unsold_98_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_7"] as const) {
      const w = SPECIAL_HOUSE_EXCLUSION_WINDOWS[a].windows[0];
      const inWindow = w ? w[0] : new Date("2012-01-01"); // §98의6은 취득기간 창이 없다(D5-01)
      const e = { article: a, houseId: "h2", houseAcquisitionDate: inWindow, houseContractDate: inWindow, requirementsConfirmed: true };
      expect(resolveSpecialHouseExclusions([e], T).excludedCount, a).toBe(1);
      expect(resolveSpecialHouseExclusions([{ ...e, acquiredByGift: true }], T).excludedCount, a).toBe(0);
      expect(meetsSpecialHouseReductionRequirements(e, T), a).toBe(true);
      expect(meetsSpecialHouseReductionRequirements({ ...e, acquiredByGift: true }, T), a).toBe(false);
    }
  });

  it("H-4: §98의6 행은 1호/2호 구분이 없어 상속 여부로 판정하지 않는다", () => {
    expect(resolveSpecialHouseExclusions([decl("unsold_98_6", { isInherited: true })], T).excludedCount).toBe(1);
  });

  it("H-5: ⑬ — 행의 상속 사실이 본문에 실리고, 분양권 답은 묻는 조문일 때만 실린다", () => {
    const houses = [
      {
        id: "h2",
        acquisitionDate: "2014-03-19",
        isInherited: true,
        countExclusion: {
          kind: "special",
          special: {
            article: "unsold_98_3",
            houseAcquisitionDate: "",
            houseContractDate: "2009-02-12",
            isNationalHousing: false,
            requirementsConfirmed: true,
            inheritedPresaleCompletedByHeir: "no",
          },
        },
      },
    ] as never;
    expect(rowSpecialHouseExclusions(houses, "2018-07-22", "housing")[0].isInherited).toBe(true);
    const body = specialHouseExclusionsPayload({ houses, transferDate: "2018-07-22", assets: [{ assetKind: "housing", reductions: [] }] } as never);
    expect(body[0]).toMatchObject({ article: "unsold_98_3", isInherited: true, inheritedPresaleCompletedByHeir: "no" });
    // 조문을 §98의2로 바꾸면 남은 분양권 답은 싣지 않는다(묻지 않는 조문)
    const houses982 = [
      {
        id: "h2",
        acquisitionDate: "2014-03-19",
        isInherited: true,
        countExclusion: {
          kind: "special",
          special: {
            article: "unsold_98_2",
            houseAcquisitionDate: "",
            houseContractDate: "2009-02-12",
            isNationalHousing: false,
            requirementsConfirmed: true,
            inheritedPresaleCompletedByHeir: "no",
          },
        },
      },
    ] as never;
    const changed = specialHouseExclusionsPayload({ houses: houses982, transferDate: "2018-07-22", assets: [{ assetKind: "housing", reductions: [] }] } as never);
    expect(changed[0].isInherited).toBe(true);
    // 증여 토글 — 상속 행이 아니고 묻는 조문일 때만 싣는다
    const giftRow = (article: string, isInherited = false) =>
      specialHouseExclusionsPayload({
        houses: [{ id: "h3", acquisitionDate: "2014-03-19", isInherited, countExclusion: { kind: "special", special: { article, houseAcquisitionDate: "", houseContractDate: "2009-02-12", isNationalHousing: false, requirementsConfirmed: true, acquiredByGift: true } } }],
        transferDate: "2018-07-22",
        assets: [{ assetKind: "housing", reductions: [] }],
      } as never)[0] as Record<string, unknown>;
    expect(giftRow("unsold_98_3").acquiredByGift).toBe(true);
    expect("acquiredByGift" in giftRow("unsold_98_8")).toBe(false);
    expect("acquiredByGift" in giftRow("unsold_98_3", true)).toBe(false);
    expect("inheritedPresaleCompletedByHeir" in changed[0]).toBe(false);
  });
});

describe("US-06 엔진 통합 — 일반주택 양도 + 상속받은 §98의3 감면주택 (리뷰 실패 시나리오)", () => {
  // 일반주택 2005.9.13 취득·거주, 2018.7.22 양도. 명부 h2 = 상속(2014.3.19)받은 §98의3 주택(피상속인 계약 2009.2.12).
  const run = (she: unknown[]) =>
    calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2005-09-13"),
        transferDate: new Date("2018-07-22"),
        householdHousingCount: 2,
        isOneHousehold: true,
        residencePeriodMonths: 150,
        specialHouseExclusions: she as never,
      }),
      rates,
    );
  const d = { article: "unsold_98_3", houseId: "h2", houseAcquisitionDate: new Date("2014-03-19"), houseContractDate: new Date("2009-02-12"), requirementsConfirmed: true };

  it("I-1: 🔴 상속 행이면 선언이 없을 때와 같다 — 2주택 과세 (종전: 비과세 0원)", () => {
    const none = run([]);
    const inherited = run([{ ...d, isInherited: true }]);
    expect(none.isExempt).toBe(false);
    expect(inherited.isExempt).toBe(false);
    expect(inherited.totalTax).toBe(none.totalTax);
  });

  it("I-2: 대조군 — 상속이 아닌 선언 · 분양권 상속 「예」는 주택 수에서 빠져 비과세", () => {
    expect(run([d]).isExempt).toBe(true);
    expect(run([{ ...d, isInherited: true, inheritedPresaleCompletedByHeir: "yes" }]).isExempt).toBe(true);
  });
});

describe("US-07 겸용 경로 — 중과 배제 선판정도 같은 게이트 (calculateTransferTax를 거치지 않는 경로)", () => {
  const R983 = {
    type: "unsold_98_3", residencyType983: "resident", houseType983: "purchased", contractDate983: new Date("2009-06-01"),
    isOutsideSeoulNotDesignated983: true, isOverconcentration983: false, isUnsoldConfirmed983: true, isFirstContract983: true,
    isNotOccupiedAtContract983: true, isNotRecontract983: true, isNotExcludedSelfBuilt983: true,
    standardPriceAtAcquisition983: 100_000_000, standardPriceAt5Years983: 200_000_000, standardPriceAtTransfer983: 300_000_000,
  };
  const excl = (acquisitionCause: string, inheritedPresaleCompletedByHeir?: string) =>
    resolveMixedReductionSurchargeExclusion(
      { ...mixedUseCase14(), buildingAcquisitionDate: new Date("2009-07-01"), acquisitionCause, inheritedPresaleCompletedByHeir, reductions: [R983] } as never,
      new Date("2022-02-16"),
      2_300_000_000,
      { wholeHousingTransferPrice: 500_000_000, housingTransferPrice: 500_000_000 } as never,
    ).excluded;

  it("M-1: 🔴 증여·상속(답 없음) 겸용 + §98의3 → 중과 배제 없음 (종전: 배제)", () => {
    expect(excl("gift")).toBe(false);
    expect(excl("inheritance")).toBe(false);
  });

  it("M-2: 대조군 — 매매 · 분양권 상속 「예」는 배제", () => {
    expect(excl("purchase")).toBe(true);
    expect(excl("inheritance", "yes")).toBe(true);
  });
});

describe("US-07 ④ — 분양권 답은 묻는 조문이 선택됐을 때만 싣는다", () => {
  it("A-1", () => {
    const red = (type: string) => [{ type }] as never;
    expect(inheritedPresalePayload({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "yes", reductions: red("unsold_98_3") })).toBe("yes");
    expect(inheritedPresalePayload({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "yes", reductions: red("unsold_98_2") })).toBeUndefined();
    expect(inheritedPresalePayload({ acquisitionCause: "purchase", inheritedPresaleCompletedByHeir: "yes", reductions: red("unsold_98_3") })).toBeUndefined();
    expect(inheritedPresalePayload({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "", reductions: red("unsold_98_3") })).toBeUndefined();
  });
});

describe("US-07 ⑧ validate", () => {
  async function issueFor(over: Record<string, unknown>, type: string) {
    const { validateStep2Reductions } = await import("@/lib/calc/transfer-tax-validate-reductions");
    const { getReductionDefault } = await import("@/components/calc/transfer/UnifiedReductionPanel-defaults");
    const { makeDefaultAsset } = await import("@/lib/stores/calc-wizard-store");
    const form = {
      assets: [{ ...makeDefaultAsset(1), assetKind: "housing" as const, acquisitionDate: "2011-06-15", reductions: [getReductionDefault(type as never)], ...over }],
      transferDate: "2016-01-01",
    } as never;
    return validateStep2Reductions(2, form);
  }

  it("V-1: 🔴 상속 + §98의5 + 답 없음 → 분양권 상속 여부를 묻는다", async () => {
    expect((await issueFor({ acquisitionCause: "inheritance" }, "unsold_98_5"))?.message).toContain("상속 당시 분양권");
  });

  it("V-2: 🔴 증여 + §98의3 → 증여 사유로 막는다", async () => {
    const m = (await issueFor({ acquisitionCause: "gift" }, "unsold_98_3"))?.message ?? "";
    expect(m).toContain("증여로 취득한 주택");
    expect(m).toContain("감면 선택을 해제하세요");
  });

  it("V-3: 상속 + §98의5 + 「모름」 → 취득 원인 사유로는 막지 않는다(엔진이 확인 필요 고지)", async () => {
    const m = (await issueFor({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "unknown" }, "unsold_98_5"))?.message ?? "";
    expect(m).not.toContain("상속 당시 분양권");
    expect(m).not.toContain("상속받은 주택은 적용되지 않습니다");
  });

  it("V-5: 상속 + §98의6 1호 → 막고, 2호는 취득 원인 사유로 막지 않는다 (엔진과 같은 결론)", async () => {
    const m1 = (await issueFor({ acquisitionCause: "inheritance", reductions: [{ type: "unsold_98_6", hoType986: "seller_rented" }] }, "unsold_98_6"))?.message ?? "";
    expect(m1).toContain("§98의6①1호");
    const m2 = (await issueFor({ acquisitionCause: "inheritance", reductions: [{ type: "unsold_98_6", hoType986: "buyer_rented" }] }, "unsold_98_6"))?.message ?? "";
    expect(m2).not.toContain("상속받은 주택은 적용되지 않습니다");
  });

  it("V-4: 상속 + §98의2 → 상속 사유로 막는다(분양권 상속도 불적용 — 재산세과-1442)", async () => {
    expect((await issueFor({ acquisitionCause: "inheritance", inheritedPresaleCompletedByHeir: "yes" }, "unsold_98_2"))?.message).toContain("재산세과-1442");
  });
});
