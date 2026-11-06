/**
 * anchor — 조특법 §99의4 리뷰 후속 L2b (평가기 단위)
 *
 * | # | 무엇을 고정하나 |
 * |---|---|
 * | SZ-1~6 | 종전 면적 요건 범위 — 대지 660㎡(2021.1.1. 전 양도) · 주택 150㎡/공동 116㎡(2017.1.1. 전 양도 × 2009.1.1. 이후 취득) · 경계 |
 * | SZ-7 | 2009.1.1. 전 취득분(R1·R2)의 주택 면적은 묻지 않는다(계획서 Q-4 (c) 현행 판정) — 대신 「확인 필요」 고지 |
 * | AD-1~4 | ③ 연접 3상태 — 예 = ADJACENT_AREA · 아니오 = 적격 · 모름/미입력 = ADJACENT_UNCONFIRMED(확인 필요) (NH-30 · Q-13) |
 * | MH-1·2 | 「1채」 판정에서 가액 초과(확정 불성립) 선언을 뺀다 (NH-50 · Q-10) — 소재지 미확인 선언은 그대로 센다(짝) |
 * | MH-6 | 종전 면적 초과(대지·연면적)도 같이 뺀다 · 면적 미입력(모름)은 센다(짝) — 사용자 결정 확장 a |
 * | EC-1 | 적격 결과에 적용 한도 echo (계획서 Q-9 (a)) |
 * | NT-1·2 | 한옥 Q-5 고지 — 일반 한도를 넘을 때만(짝) |
 * | L4 | ③·⑥ 사유의 근거가 legal-codes 상수 값 |
 */
import { describe, it, expect } from "vitest";
import { evaluateNew994, evaluateNew994Declarations } from "@/lib/tax-engine/transfer-reductions/new-99-4";
import { resolveNew994SizeScope } from "@/lib/tax-engine/transfer-reductions/new-99-4-size";
import { NEW_HOUSING_SUB_ARTICLE } from "@/lib/tax-engine/legal-codes/transfer";
import type { New994EvaluationInput } from "@/lib/tax-engine/transfer-reductions/types";

const D = (s: string) => new Date(s);

const base = (over: Partial<New994EvaluationInput> = {}): New994EvaluationInput => ({
  id: "new_99_4_rural",
  generalHouseAcquisitionDate: D("2012-01-01"),
  transferDate: D("2024-06-01"),
  ruralHouseAcquisitionDate: D("2015-03-01"),
  ruralHouseStdPrice: 150_000_000,
  isRegisteredHanok: false,
  adjacentArea994: "no",
  meetsLocationRequirement: true,
  ...over,
});
const codes = (r: ReturnType<typeof evaluateNew994>) => (r.isEligible ? [] : r.ineligibleReasons.map((x) => x.code));

describe("SZ — 종전 면적 요건", () => {
  it("[SZ-1] 범위: 대지는 2021.1.1. 전 양도, 주택은 2017.1.1. 전 양도 × 2009.1.1. 이후 취득", () => {
    expect(resolveNew994SizeScope({ transferDate: D("2020-12-31"), ruralHouseAcquisitionDate: D("2015-03-01") })).toEqual({ land: true, house: false });
    expect(resolveNew994SizeScope({ transferDate: D("2021-01-01"), ruralHouseAcquisitionDate: D("2015-03-01") })).toEqual({ land: false, house: false });
    expect(resolveNew994SizeScope({ transferDate: D("2016-12-31"), ruralHouseAcquisitionDate: D("2014-03-01") })).toEqual({ land: true, house: true });
    expect(resolveNew994SizeScope({ transferDate: D("2017-01-01"), ruralHouseAcquisitionDate: D("2014-03-01") })).toEqual({ land: true, house: false });
    expect(resolveNew994SizeScope({ transferDate: D("2016-06-01"), ruralHouseAcquisitionDate: D("2008-12-31") })).toEqual({ land: true, house: false });
    expect(resolveNew994SizeScope({ transferDate: D("2016-06-01"), ruralHouseAcquisitionDate: D("2009-01-01") })).toEqual({ land: true, house: true });
  });

  it("[SZ-2] R4×C2(2019 양도): 대지 660㎡ 적격 · 661㎡ LAND_AREA_EXCEEDED · 미입력 AREA_UNCONFIRMED(확인 필요)", () => {
    const c2 = { transferDate: D("2019-06-01") };
    expect(evaluateNew994(base({ ...c2, ruralLandAreaSqm994: 660 })).isEligible).toBe(true);
    expect(codes(evaluateNew994(base({ ...c2, ruralLandAreaSqm994: 661 })))).toEqual(["LAND_AREA_EXCEEDED"]);
    const missing = evaluateNew994(base(c2));
    expect(codes(missing)).toEqual(["AREA_UNCONFIRMED"]);
    if (!missing.isEligible) expect(missing.ineligibleReasons[0].message).toContain("확인 필요");
  });

  it("[SZ-3] 2021.1.1. 이후 양도는 대지면적을 묻지 않는다(짝 — 같은 661㎡가 적격)", () => {
    expect(evaluateNew994(base({ transferDate: D("2021-01-01"), ruralLandAreaSqm994: 661 })).isEligible).toBe(true);
  });

  it("[SZ-4] R4×C1(2016 양도) 그 밖의 주택: 연면적 150㎡ 적격 · 151㎡ HOUSE_AREA_EXCEEDED", () => {
    const c1 = { transferDate: D("2016-06-01"), ruralHouseAcquisitionDate: D("2014-03-01"), ruralLandAreaSqm994: 330, ruralHouseType994: "other" as const };
    expect(evaluateNew994(base({ ...c1, ruralHouseAreaSqm994: 150 })).isEligible).toBe(true);
    expect(codes(evaluateNew994(base({ ...c1, ruralHouseAreaSqm994: 151 })))).toEqual(["HOUSE_AREA_EXCEEDED"]);
  });

  it("[SZ-5] R4×C1 공동주택: 전용 116㎡ 적격 · 117㎡ HOUSE_AREA_EXCEEDED (같은 117㎡가 그 밖의 주택이면 적격 — 짝)", () => {
    const c1 = { transferDate: D("2016-06-01"), ruralHouseAcquisitionDate: D("2014-03-01"), ruralLandAreaSqm994: 330 };
    expect(evaluateNew994(base({ ...c1, ruralHouseType994: "multi_unit", ruralHouseAreaSqm994: 116 })).isEligible).toBe(true);
    expect(codes(evaluateNew994(base({ ...c1, ruralHouseType994: "multi_unit", ruralHouseAreaSqm994: 117 })))).toEqual(["HOUSE_AREA_EXCEEDED"]);
    expect(evaluateNew994(base({ ...c1, ruralHouseType994: "other", ruralHouseAreaSqm994: 117 })).isEligible).toBe(true);
  });

  it("[SZ-6] R4×C1 주택 유형·면적 미입력 → AREA_UNCONFIRMED", () => {
    expect(codes(evaluateNew994(base({ transferDate: D("2016-06-01"), ruralHouseAcquisitionDate: D("2014-03-01"), ruralLandAreaSqm994: 330 })))).toEqual([
      "AREA_UNCONFIRMED",
    ]);
  });

  it("[SZ-7] R1×C1(2005 취득·2012 양도): 주택 면적을 묻지 않고 적격 + 「확인 필요」 고지 · R3(2010 취득)는 고지 없음(짝)", () => {
    const r1 = evaluateNew994(
      base({ generalHouseAcquisitionDate: D("2003-01-01"), ruralHouseAcquisitionDate: D("2005-06-01"), transferDate: D("2012-06-01"), ruralHouseStdPrice: 60_000_000, ruralLandAreaSqm994: 330 }),
    );
    expect(r1.isEligible).toBe(true);
    if (r1.isEligible) expect(r1.notices?.[0]).toContain("주택 연면적 150㎡");
    const r3 = evaluateNew994(
      base({ generalHouseAcquisitionDate: D("2003-01-01"), ruralHouseAcquisitionDate: D("2010-06-01"), transferDate: D("2018-06-01"), ruralLandAreaSqm994: 330 }),
    );
    expect(r3.isEligible).toBe(true);
    if (r3.isEligible) expect(r3.notices).toBeUndefined();
  });
});

describe("AD — ③ 연접 3상태 (NH-30)", () => {
  it("[AD-1] 아니오 → 적격", () => expect(evaluateNew994(base()).isEligible).toBe(true));
  it("[AD-2] 예 → ADJACENT_AREA", () => expect(codes(evaluateNew994(base({ adjacentArea994: "yes" })))).toEqual(["ADJACENT_AREA"]));
  it("[AD-3] 모름 → ADJACENT_UNCONFIRMED · 「확인 필요」", () => {
    const r = evaluateNew994(base({ adjacentArea994: "unknown" }));
    expect(codes(r)).toEqual(["ADJACENT_UNCONFIRMED"]);
    if (!r.isEligible) expect(r.ineligibleReasons[0].message).toMatch(/^확인 필요/);
  });
  it("[AD-4] 미입력(직접 API·옛 이력) → 모름과 같다", () =>
    expect(codes(evaluateNew994(base({ adjacentArea994: undefined })))).toEqual(["ADJACENT_UNCONFIRMED"]));
});

describe("MH — 「1채」 판정 (NH-50)", () => {
  const ctx = { generalHouseAcquisitionDate: D("2010-01-01"), transferDate: D("2024-06-01"), mergeOrder: undefined };
  const r1 = { type: "new_99_4_rural", houseId: "r1", ruralHouseAcquisitionDate: D("2015-03-01"), ruralHouseStdPrice: 150_000_000, isRegisteredHanok: false, adjacentArea994: "no", meetsLocationRequirement: true };
  it("[MH-1] r2가 3.5억(한도 3억 초과 — 농어촌주택등 아님) → r1만 1채로 적격, r2는 가액 초과 사유만", () => {
    const r2 = { ...r1, houseId: "r2", ruralHouseAcquisitionDate: D("2022-03-01"), ruralHouseStdPrice: 350_000_000 };
    const [d1, d2] = evaluateNew994Declarations([r1, r2], ctx);
    expect(d1.isEligible).toBe(true);
    expect(d2.isEligible).toBe(false);
    if (!d2.isEligible) expect(d2.ineligibleReasons.map((x) => x.code)).toEqual(["STD_PRICE_EXCEEDED"]);
  });
  it("[MH-2] 짝 — r2가 소재지 미확인이면 종전대로 2채로 세어 둘 다 MULTIPLE_HOUSES", () => {
    const r2 = { ...r1, houseId: "r2", ruralHouseAcquisitionDate: D("2022-03-01"), meetsLocationRequirement: false };
    const [d1, d2] = evaluateNew994Declarations([r1, r2], ctx);
    expect(d1.isEligible).toBe(false);
    if (!d1.isEligible) expect(d1.ineligibleReasons.map((x) => x.code)).toEqual(["MULTIPLE_HOUSES"]);
    if (!d2.isEligible) expect(d2.ineligibleReasons.map((x) => x.code)).toEqual(["LOCATION_UNCONFIRMED", "MULTIPLE_HOUSES"]);
  });
});

describe("MH 확장 (a) — 종전 면적 초과 선언도 「1채」에서 뺀다 (NH-50 · 사용자 결정)", () => {
  // 2016 양도(R4×C1 — 대지 660㎡ + 주택 150㎡/116㎡ 요건)
  const ctx = { generalHouseAcquisitionDate: D("2008-01-01"), transferDate: D("2016-06-01"), mergeOrder: undefined };
  const ok = { type: "new_99_4_rural", houseId: "r1", ruralHouseAcquisitionDate: D("2014-03-01"), ruralHouseStdPrice: 70_000_000, isRegisteredHanok: false, adjacentArea994: "no", meetsLocationRequirement: true, ruralLandAreaSqm994: 330, ruralHouseType994: "other", ruralHouseAreaSqm994: 100 };
  const second = (over: object) => ({ ...ok, houseId: "r2", ruralHouseAcquisitionDate: D("2014-09-01"), ...over });
  const resultCodes = (rs: ReturnType<typeof evaluateNew994Declarations>) =>
    rs.map((d) => (d.isEligible ? "eligible" : d.ineligibleReasons.map((x) => x.code).join(",")));

  it("[MH-6] 연면적 151㎡(HOUSE_AREA_EXCEEDED) · 대지 661㎡(LAND_AREA_EXCEEDED) → r1 적격, r2는 면적 초과 사유만", () => {
    expect(resultCodes(evaluateNew994Declarations([ok, second({ ruralHouseAreaSqm994: 151 })], ctx))).toEqual(["eligible", "HOUSE_AREA_EXCEEDED"]);
    expect(resultCodes(evaluateNew994Declarations([ok, second({ ruralLandAreaSqm994: 661 })], ctx))).toEqual(["eligible", "LAND_AREA_EXCEEDED"]);
  });
  it("[MH-6+] 짝 — 경계(660㎡·150㎡)는 적격이라 2채 → MULTIPLE_HOUSES · 면적 미입력(AREA_UNCONFIRMED)도 센다", () => {
    expect(resultCodes(evaluateNew994Declarations([ok, second({ ruralLandAreaSqm994: 660, ruralHouseAreaSqm994: 150 })], ctx))).toEqual(["MULTIPLE_HOUSES", "MULTIPLE_HOUSES"]);
    expect(resultCodes(evaluateNew994Declarations([ok, second({ ruralHouseAreaSqm994: undefined })], ctx))).toEqual(["MULTIPLE_HOUSES", "AREA_UNCONFIRMED,MULTIPLE_HOUSES"]);
  });
});

describe("EC·NT — 적용 한도 echo · 한옥 고지", () => {
  it("[EC-1] 적격 결과에 적용 한도(2023 이후 양도 3억, 근거)", () => {
    const r = evaluateNew994(base());
    expect(r.isEligible && r.appliedLimit).toMatchObject({ limit: 300_000_000, label: "3억" });
    const pre = evaluateNew994(base({ transferDate: D("2022-06-01") }));
    expect(pre.isEligible && pre.appliedLimit?.label).toBe("2억");
  });
  it("[NT-1] 2014 전 구입 등록 한옥 3.5억 · 2024 양도 → 4억으로 적격 + 「확인 필요」(Q-5 (c))", () => {
    const r = evaluateNew994(base({ ruralHouseAcquisitionDate: D("2012-05-01"), ruralHouseStdPrice: 350_000_000, isRegisteredHanok: true }));
    expect(r.isEligible).toBe(true);
    if (r.isEligible) expect(r.notices?.join(" ")).toContain("2014.1.1. 전 구입한 등록 한옥");
  });
  it("[NT-2] 짝 — 같은 한옥이 2.5억(일반 한도 3억 이내)이면 고지 없음", () => {
    const r = evaluateNew994(base({ ruralHouseAcquisitionDate: D("2012-05-01"), ruralHouseStdPrice: 250_000_000, isRegisteredHanok: true }));
    expect(r.isEligible && r.notices).toBeUndefined();
  });
});

describe("L4 — 조문 리터럴 → legal-codes 상수", () => {
  it("ADJACENT_AREA·HOMETOWN_UNCONFIRMED 근거가 NEW_HOUSING_SUB_ARTICLE 값", () => {
    const adj = evaluateNew994(base({ adjacentArea994: "yes" }));
    if (!adj.isEligible) expect(adj.ineligibleReasons[0].legalBasis).toBe(NEW_HOUSING_SUB_ARTICLE.NEW_99_4_ADJACENT);
    const home = evaluateNew994(base({ id: "new_99_4_hometown", meetsHometownRequirement: false }));
    if (!home.isEligible)
      expect(home.ineligibleReasons.find((x) => x.code === "HOMETOWN_UNCONFIRMED")?.legalBasis).toBe(NEW_HOUSING_SUB_ARTICLE.NEW_99_4_HOMETOWN_DECREE);
  });
});
