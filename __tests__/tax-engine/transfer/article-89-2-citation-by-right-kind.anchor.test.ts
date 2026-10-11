/**
 * S05-8 anchor 초안 — 분양권 경로의 준용 근거는 「소득세법 시행령」 §156의3⑤·⑦·⑧(MST 290841 원문),
 * 분양권 세대의 합가 의제 라벨은 「분양권」(§156의3⑥이 §156의2⑧·⑨에 위임).
 * 표기 형식(공백·항 기호)은 고정하지 않고 조·항만 본다.
 */
import { describe, it, expect } from "vitest";
import { resolveArticle89Clause2 } from "@/lib/tax-engine/transfer-tax-89-2-exclusion";
import { clause2SurchargeDeemed } from "@/lib/tax-engine/transfer-tax-89-2-consequences";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const D = (s: string) => new Date(s);
type R = "presale_right" | "redevelopment_right";
const right = (type: R, acq = "2024-03-01") => ({ id: "r1", type, acquisitionDate: D(acq), region: "capital" as const });
const twoHouse = (type: R, over: Partial<TransferTaxInput> = {}) =>
  baseTransferInput({
    propertyType: "housing", isOneHousehold: true, householdHousingCount: 2,
    transferPrice: 900_000_000, acquisitionPrice: 400_000_000,
    acquisitionDate: D("2015-06-01"), transferDate: D("2026-06-01"), residencePeriodMonths: 60,
    presaleRights: [right(type)] as never, ...over,
  });
const v = (i: TransferTaxInput) => resolveArticle89Clause2(i, D("2021-01-01"));
const norm = (s?: string) => (s ?? "").replace(/\s/g, "");

describe("S05-8 anchor", () => {
  it("분양권+문화유산 → §156의3⑦ 준용", () => {
    expect(norm(v(twoHouse("presale_right", { culturalHeritageHouse: true })).viaArticle)).toContain("§156의3⑦");
  });
  it("분양권+이농주택 → §156의3⑧ 준용", () => {
    const farmExit = { kind: "farm_exit", isOutsideCapitalEupMyeon: true, ownerResidenceYears: 6 };
    expect(norm(v(twoHouse("presale_right", { ruralHouse: farmExit as never })).viaArticle)).toContain("§156의3⑧");
  });
  it("분양권+상속주택 → §156의3⑤ 준용", () => {
    const hs = [
      { id: "sell", acquisitionDate: D("2015-06-01"), isRegulatedArea: false },
      { id: "inh", acquisitionDate: D("2015-06-01"), isRegulatedArea: false, isInherited: true, isCoInherited: true, isLargestCoInheritedShareholder: false, inheritedDate: D("2015-06-01") },
    ];
    // 결정 #8 — 「상속개시 당시 보유」는 날짜로 판정한다(일반주택 2015-06-01 ≤ 상속개시일 2015-06-01).
    expect(norm(v(twoHouse("presale_right", { householdHousingCount: 1, sellingHouseId: "sell", houses: hs as never })).viaArticle)).toContain("§156의3⑤");
  });
  it("대조: 입주권+문화유산 → §156의2⑩ 그대로", () => {
    expect(norm(v(twoHouse("redevelopment_right", { culturalHeritageHouse: true })).viaArticle)).toContain("§156의2⑩");
  });
  it("분양권+혼인 합가 house_only → 분양권 의제(basis house_with_presale_right)", () => {
    const i = baseTransferInput({
      propertyType: "housing", isOneHousehold: true, householdHousingCount: 1,
      transferPrice: 900_000_000, acquisitionPrice: 400_000_000,
      acquisitionDate: D("2015-06-01"), transferDate: D("2024-06-01"), residencePeriodMonths: 60,
      presaleRights: [right("presale_right", "2021-06-01")] as never,
      marriageMerge: { marriageDate: D("2020-03-01") }, isFirstTransferredInMerge: true,
      rightThreeYearException: { kind: "none" } as never,
      mergedHouseholdFirstHouse: { kind: "house_only" } as never,
    });
    expect(clause2SurchargeDeemed(v(i))?.basis).toBe("house_with_presale_right");
  });
});

describe("S05-8 — 판정 불가 안내는 세대가 가진 권리 종류의 조문만 싣는다", () => {
  const inh = (type: R, id: string) => ({ ...right(type), id, isInherited: true });
  const open2 = (types: R[]) =>
    v(twoHouse(types[0], { householdHousingCount: 1, presaleRights: types.map((t, i) => inh(t, `r${i}`)) as never })).openArticles;

  it("상속 분양권 2개 → §156의3 ④·⑤만 (§156의2 ⑥·⑦ 없음)", () => {
    expect(open2(["presale_right", "presale_right"])).toEqual(["소득세법 시행령 §156의3 ④·⑤"]);
  });
  it("긍정 짝: 상속 입주권 2개 → §156의2 ⑥·⑦만", () => {
    expect(open2(["redevelopment_right", "redevelopment_right"])).toEqual(["소득세법 시행령 §156의2 ⑥·⑦"]);
  });
  it("입주권·분양권이 섞이면 둘 다", () => {
    expect(open2(["redevelopment_right", "presale_right"])).toEqual([
      "소득세법 시행령 §156의2 ⑥·⑦",
      "소득세법 시행령 §156의3 ④·⑤",
    ]);
  });

  // 결정 #8 — 상속개시일을 모르면 ⑦1호·⑤1호 후단을 판정하지 못해 **불성립 + 확인 필요**(종전: 판정 불가·비과세 유지).
  //   확인 필요 문구가 세대가 가진 권리 종류의 조문만 가리킨다(S05-8 규약 유지).
  const undatedInheritedHouse = (type: R) => {
    const hs = [
      { id: "sell", acquisitionDate: D("2015-06-01"), isRegulatedArea: false },
      { id: "inh", acquisitionDate: D("2015-06-01"), isRegulatedArea: false, isInherited: true, isCoInherited: true, isLargestCoInheritedShareholder: false },
    ];
    const r = v(twoHouse(type, { householdHousingCount: 1, sellingHouseId: "sell", houses: hs as never }));
    expect(r.status).toBe("excluded");
    return (r.confirmNotes ?? []).join(" ");
  };
  it("상속 주택 후단 미판정 + 분양권 → §156의3 ⑤1호만 가리킨다", () => {
    const note = undatedInheritedHouse("presale_right");
    expect(note).toContain("§156의3 ⑤1호");
    expect(note).not.toContain("§156의2 ⑦1호");
  });
  it("긍정 짝: 상속 주택 후단 미판정 + 입주권 → §156의2 ⑦1호만 가리킨다", () => {
    const note = undatedInheritedHouse("redevelopment_right");
    expect(note).toContain("§156의2 ⑦1호");
    expect(note).not.toContain("§156의3 ⑤1호");
  });
});

describe("S05-8 — 상속 외 권리의 종류가 ⑦/§156의3⑤를 가른다", () => {
  // 상속 입주권(피상속인 취득) + 상속 외 분양권 ⇒ §156의3⑤2호. 반대로 상속 분양권 + 상속 외 입주권 ⇒ §156의2⑦4호.
  const mix = (inheritedType: R, otherType: R) =>
    v(
      twoHouse(otherType, {
        householdHousingCount: 1,
        transferDate: D("2024-06-01"),
        presaleRights: [
          { ...right(inheritedType, "2021-02-01"), id: "inh", isInherited: true, inheritedDate: D("2021-02-01") },
          { ...right(otherType, "2022-01-01"), id: "oth" },
        ] as never,
      }),
    ).viaArticle;
  it("상속 입주권 + 상속 외 분양권 → §156의3 ⑤", () => {
    expect(mix("redevelopment_right", "presale_right")).toBe("소득세법 시행령 §156의3 ⑤");
  });
  it("긍정 짝: 상속 분양권 + 상속 외 입주권 → §156의2 ⑦", () => {
    expect(mix("presale_right", "redevelopment_right")).toBe("소득세법 시행령 §156의2 ⑦");
  });
});

describe("S05-8 — 합가 의제의 권리 종류 표기", () => {
  const merged = (type: R) =>
    baseTransferInput({
      propertyType: "housing", isOneHousehold: true, householdHousingCount: 1,
      transferPrice: 900_000_000, acquisitionPrice: 400_000_000,
      acquisitionDate: D("2015-06-01"), transferDate: D("2024-06-01"), residencePeriodMonths: 60,
      presaleRights: [right(type, "2021-06-01")] as never,
      marriageMerge: { marriageDate: D("2020-03-01") }, isFirstTransferredInMerge: true,
      rightThreeYearException: { kind: "none" } as never,
      mergedHouseholdFirstHouse: { kind: "house_only" } as never,
    });
  it("분양권 세대: §156의3⑥ 경유를 밝히고 중과 배제 사유 source에도 남는다", () => {
    const r = v(merged("presale_right"));
    expect(r.viaArticle).toBe("소득세법 시행령 §156의3 ⑥");
    expect(clause2SurchargeDeemed(r)?.source).toContain("§156의3 ⑥");
  });
  it("긍정 짝: 입주권 세대는 경유 표기 없이 조합원입주권 의제", () => {
    const r = v(merged("redevelopment_right"));
    expect(r.viaArticle).toBeUndefined();
    expect(clause2SurchargeDeemed(r)?.basis).toBe("house_with_redevelopment_right");
  });
});

