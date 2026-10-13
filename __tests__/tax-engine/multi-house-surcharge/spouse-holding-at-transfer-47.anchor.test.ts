/**
 * 결정 #47 (S14a-5) — §167의3⑨·§167의4⑤ 「양도일 현재 양도자의 배우자가 보유한」 응답(예/아니오/모름)의 엔진 anchor.
 *
 * - 응답이 「예」인 행만 차감한다. 아니오·모름·미응답은 차감하지 않는다. 옛 저장분·직접 호출의 꺼진 `isSpouseOwned`는 「아니오」가 아니라 미응답이다.
 * - 확인 필요 고지는 응답이 **결론을 가를 때만** 낸다(반사실 재계산).
 * - 배우자 쪽이 아닌 행을 「예」로 답하면 차감하되 해석례 미확인을 고지한다.
 */
import { describe, it, expect } from "vitest";
import { determineMultiHouseSurcharge, type PresaleRight } from "@/lib/tax-engine/multi-house-surcharge";
import {
  readSpouseHolding,
  spouseSideOriginOf,
  marriageSubtractionWindowOpen,
} from "@/lib/tax-engine/spouse-holding-at-transfer";
import { MULTI_HOUSE } from "@/lib/tax-engine/legal-codes/transfer-house";
import { defaultRules, mockRegulatedHistory, suspensionActive, suspensionNone, makeHouse, makeInput } from "../_helpers/multi-house-mock";

const REGULATED = { regionCode: "11680" };
const MARRIAGE = { marriageDate: new Date("2022-06-01") };

const run = (input: Parameters<typeof determineMultiHouseSurcharge>[0]) =>
  determineMultiHouseSurcharge(input, defaultRules, mockRegulatedHistory, suspensionNone, true);

const spouseRow = (id: string, over: Parameters<typeof makeHouse>[1] = {}) =>
  makeHouse(id, { mergeOrigin: "counterpart_side", ...over });

const base = (rows: ReturnType<typeof makeHouse>[], extra: Record<string, unknown> = {}) =>
  makeInput([makeHouse("self", REGULATED), ...rows], { sellingHouseId: "self", marriageMerge: MARRIAGE, ...extra });

const NOTICE_A = "확인되지 않은 것(미응답 또는 모름)";
const NOTICE_B = "해석례를 확인하지 못했습니다";
const has = (r: ReturnType<typeof run>, s: string) => r.warnings.some((w) => w.includes(s));

describe("#47 읽기 규칙 / 구간 술어", () => {
  it("[SH-1] 응답이 정본, 레거시 true만 예, false·미제공은 미응답", () => {
    expect(readSpouseHolding({ spouseHeldAtTransfer: "no", isSpouseOwned: true })).toBe("no");
    expect(readSpouseHolding({ spouseHeldAtTransfer: "yes" })).toBe("yes");
    expect(readSpouseHolding({ spouseHeldAtTransfer: "unknown" })).toBe("unknown");
    expect(readSpouseHolding({ isSpouseOwned: true })).toBe("yes");
    expect(readSpouseHolding({ isSpouseOwned: false })).toBeUndefined();
    expect(readSpouseHolding({})).toBeUndefined();
  });

  it("[SH-2] 배우자 쪽 origin — 단일 혼인·혼인이 먼저인 이중 합가는 counterpart, 동거봉양이 먼저면 second_merge / 같은 날은 혼인이 먼저", () => {
    const m = new Date("2022-06-01");
    expect(spouseSideOriginOf(m, undefined)).toBe("counterpart_side");
    expect(spouseSideOriginOf(m, new Date("2023-01-01"))).toBe("counterpart_side");
    expect(spouseSideOriginOf(m, new Date("2022-06-01"))).toBe("counterpart_side");
    expect(spouseSideOriginOf(m, new Date("2021-01-01"))).toBe("second_merge_side");
    expect(spouseSideOriginOf(undefined, new Date("2021-01-01"))).toBeUndefined();
  });

  it("[SH-3] 구간 — 혼인 5년 이내(경계 ±1일) · 혼인 뒤 새 취득이 있으면 닫힘", () => {
    const m = new Date("2022-06-01");
    const w = (t: string, acq: string[] = ["2020-01-01"]) =>
      marriageSubtractionWindowOpen({ marriageDate: m, transferDate: new Date(t), acquisitionDates: acq.map((d) => new Date(d)) });
    expect(w("2027-06-01")).toBe(true); // 5년째 응당일 당일
    expect(w("2027-06-02")).toBe(false);
    expect(w("2022-05-31")).toBe(false); // 혼인 전 양도
    expect(w("2025-01-01", ["2020-01-01", "2023-01-01"])).toBe(false); // 혼인 뒤 취득
    expect(w("2025-01-01", ["2020-01-01", "2023-01-01"].slice(0, 1))).toBe(true);
  });
});

describe("#47 엔진 차감·고지 — 본인 1(양도) + 배우자 쪽 2 = 3주택, 조정대상지역 양도", () => {
  const rows = (a: "yes" | "no" | "unknown" | undefined, legacy?: boolean) => [
    spouseRow("b", { spouseHeldAtTransfer: a, isSpouseOwned: legacy }),
    spouseRow("c", { spouseHeldAtTransfer: a, isSpouseOwned: legacy }),
  ];

  it("[SH-4] 「예」 → 둘 다 차감 → 1주택 → 중과 없음, 고지 없음", () => {
    const r = run(base(rows("yes")));
    expect(r.effectiveHouseCount).toBe(1);
    expect(r.surchargeApplicable).toBe(false);
    expect(r.excludedHouses.filter((e) => e.reason === "spouse_marriage_subtraction")).toHaveLength(2);
    expect(has(r, NOTICE_A)).toBe(false);
  });

  it("[SH-5] 미응답·모름 → 차감 없이 3주택 중과 + 확인 필요 고지 / 「아니오」 → 같은 중과, 고지 없음", () => {
    for (const a of [undefined, "unknown"] as const) {
      const r = run(base(rows(a)));
      expect(r.effectiveHouseCount).toBe(3);
      expect(r.surchargeApplicable).toBe(true);
      expect(r.surchargeType).toBe("multi_house_3plus");
      expect(has(r, NOTICE_A)).toBe(true);
    }
    const no = run(base(rows("no")));
    expect(no.surchargeApplicable).toBe(true);
    expect(has(no, NOTICE_A)).toBe(false);
  });

  it("[SH-11] 재산세제과-1400 — 상수는 원문 일자·번호이고 미응답 고지가 세대원 보유 포함 근거로 인용한다", () => {
    expect(MULTI_HOUSE.MARRIAGE_SUBTRACT_SPOUSE_HOUSEHOLD_RULING).toBe("기획재정부 재산세제과-1400 (2023.12.18.)");
    const r = run(base(rows(undefined)));
    const notice = r.warnings.find((w) => w.includes(NOTICE_A));
    expect(notice).toContain(`배우자 쪽 세대원 보유 포함 — 주택은 ${MULTI_HOUSE.MARRIAGE_SUBTRACT_SPOUSE_HOUSEHOLD_RULING}`);
  });

  it("[SH-6] 옛 저장분·직접 호출의 꺼진 isSpouseOwned:false는 미응답 → 고지 / 켜진 true는 종전대로 예(차감, 고지 없음)", () => {
    const off = run(base(rows(undefined, false)));
    expect(off.surchargeApplicable).toBe(true);
    expect(has(off, NOTICE_A)).toBe(true);
    const on = run(base(rows(undefined, true)));
    expect(on.surchargeApplicable).toBe(false);
    expect(has(on, NOTICE_A)).toBe(false);
  });

  it("[SH-7] 결론을 가르지 않으면 고지하지 않는다 — 혼인 5년 경과 / 비조정 / 유예 중 유형", () => {
    // 양도 5년 경과: 응답이 무엇이든 ⑨ 미적용
    const late = run(base(rows(undefined), { transferDate: new Date("2028-01-01") }));
    expect(late.surchargeApplicable).toBe(true);
    expect(has(late, NOTICE_A)).toBe(false);
    // 비조정지역 양도: 중과 대상이 아니라 응답이 무엇이든 결과가 같다
    const nonRegulated = determineMultiHouseSurcharge(
      makeInput([makeHouse("self"), ...rows(undefined)], { sellingHouseId: "self", marriageMerge: MARRIAGE }),
      defaultRules, mockRegulatedHistory, suspensionNone, false,
    );
    expect(nonRegulated.surchargeApplicable).toBe(false);
    expect(has(nonRegulated, NOTICE_A)).toBe(false);
    // 한시배제 유예 중이라도 3주택 유형(장기보유특별공제 배제 판정)이 응답에 달려 있으면 고지한다 — 유형이 갈리면 결론이 갈린다
    const suspended = determineMultiHouseSurcharge(
      base(rows(undefined)), defaultRules, mockRegulatedHistory, suspensionActive, true,
    );
    expect(suspended.surchargeApplicable).toBe(false);
    expect(suspended.surchargeType).toBe("multi_house_3plus");
    expect(has(suspended, NOTICE_A)).toBe(true);
  });

  it("[SH-8] 이중 합가 — 동거봉양이 먼저면 「혼인한 배우자 쪽」은 second_merge_side, 그 행만 응답 대상", () => {
    const parental = { parentalCareMerge: { mergeDate: new Date("2021-01-01") } };
    // second_merge_side(배우자) 미응답 → 고지 / counterpart_side(합친 가족) 미응답 → 고지 대상 아님
    const spouseRows = run(
      base([spouseRow("b", { mergeOrigin: "second_merge_side" }), spouseRow("c", { mergeOrigin: "second_merge_side" })], parental),
    );
    expect(has(spouseRows, NOTICE_A)).toBe(true);
    const familyRows = run(
      base([spouseRow("b", { mergeOrigin: "counterpart_side" }), spouseRow("c", { mergeOrigin: "counterpart_side" })], parental),
    );
    expect(has(familyRows, NOTICE_A)).toBe(false);
  });

  it("[SH-9] 배우자 쪽이 아닌 행(양도자 쪽)을 「예」로 답하면 차감하되 해석례 미확인을 고지 / 「아니오」·미응답이면 고지 없음", () => {
    const yes = run(
      base([
        makeHouse("b", { mergeOrigin: "seller_side", spouseHeldAtTransfer: "yes" }),
        makeHouse("c", { mergeOrigin: "seller_side", spouseHeldAtTransfer: "yes" }),
      ]),
    );
    expect(yes.surchargeApplicable).toBe(false);
    expect(has(yes, NOTICE_B)).toBe(true);
    const no = run(
      base([
        makeHouse("b", { mergeOrigin: "seller_side", spouseHeldAtTransfer: "no" }),
        makeHouse("c", { mergeOrigin: "seller_side" }),
      ]),
    );
    expect(no.surchargeApplicable).toBe(true);
    expect(has(no, NOTICE_B)).toBe(false);
  });
});

describe("#47 분양권·입주권 행 (§167의4⑤)", () => {
  const right = (id: string, over: Partial<PresaleRight> = {}): PresaleRight => ({
    id, type: "presale_right", acquisitionDate: new Date("2022-01-01"), region: "capital", ...over,
  });
  const input = (a?: "yes" | "no" | "unknown") =>
    makeInput([makeHouse("self", REGULATED), spouseRow("b")], {
      sellingHouseId: "self",
      marriageMerge: MARRIAGE,
      presaleRights: [right("r1", { spouseHeldAtTransfer: a })],
    });

  it("[SH-10] 권리 미응답·모름 → 차감 없이 3 중과 + 고지 / 「예」 → 차감 / 「아니오」 → 중과, 고지 없음", () => {
    // 배우자 쪽 주택 b는 아니오로 고정해 권리 응답만 가른다
    const withB = (a?: "yes" | "no" | "unknown", b: "no" = "no") =>
      makeInput([makeHouse("self", REGULATED), spouseRow("b", { spouseHeldAtTransfer: b })], {
        sellingHouseId: "self", marriageMerge: MARRIAGE, presaleRights: [right("r1", { spouseHeldAtTransfer: a })],
      });
    for (const a of [undefined, "unknown"] as const) {
      const r = run(withB(a));
      expect(r.surchargeApplicable).toBe(true);
      expect(has(r, NOTICE_A)).toBe(true);
    }
    expect(run(withB("yes")).effectiveHouseCount).toBe(2);
    const no = run(withB("no"));
    expect(no.surchargeApplicable).toBe(true);
    expect(has(no, NOTICE_A)).toBe(false);
    expect(input("yes").presaleRights[0].spouseHeldAtTransfer).toBe("yes");
  });
});
