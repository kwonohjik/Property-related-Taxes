/**
 * S01-2 anchor — 상속주택 제외 ②(단독)·③(공동 소수지분)가 **동시에** 적용되면, 그 위에 2주택 전제 §155 특례를 더한
 * 세 특례는 성립하지 않는다(사용자 결정 2026-10-06 「세 특례 불허 + 확인 필요」 이행).
 *
 * 근거: 사전-2023-법규재산-0209(법규과-1092, 2023.4.27.) — 일시적 2주택 상태에서 상속주택·공동상속주택 소수지분을 취득한 뒤
 *   종전주택을 양도하는 경우 「…제155조제1항, 제2항, 및 제3항을 중첩 적용하여 …제154조제1항을 적용할 수 없는 것」
 *   (본문은 taxlaw.nts.go.kr — 법제처 MCP는 국세청 해석 본문을 제공하지 않아 리뷰의 본문 확인에 의존, 이 PR에서 직접 대조하지 못함: 확인 필요).
 * 현행 「소득세법 시행령」 §155①(일시적 2주택)·②(상속주택)·③(공동상속주택) 본문은 MST 290841(시행 2026-10-01)로 확인했다 —
 *   특례끼리 겹칠 때를 정한 규정은 없다.
 *
 * 2중첩(①+② · ①+③ · ②+③)은 비과세가 유지된다 — 3주택 술어가 종전부터 지키던 「두 개까지」와 같은 선이다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

const base = { region: "non_capital" as const, acquisitionOrigin: "general" as const };
const C = { ...base, id: "C", acquisitionDate: "2000-01-01", isInherited: true, inheritedDate: "2021-06-01", isCoInherited: false, decedentSameHouseholdAtInheritance: false };
const D = { ...base, id: "D", acquisitionDate: "2000-01-01", isInherited: true, inheritedDate: "2022-04-18", isCoInherited: true, isLargestCoInheritedShareholder: false, decedentSameHouseholdAtInheritance: false };
/** ① 신규 주택(양도 주택보다 나중 취득 — 명부에서 일시적 2주택으로 도출된다) */
const B = { ...base, id: "B", acquisitionDate: "2020-12-01" };
/** ⑥ 국가유산주택 · ⑦ 이농주택 · ⑧ 부득이한 사유 주택 — 양도 주택(2001-09-01)보다 먼저 취득 */
const HERITAGE = { ...base, id: "H", acquisitionDate: "1998-01-01", oneHouseCulturalHeritage: true };
const RURAL = { ...base, id: "R", acquisitionDate: "1998-01-01", oneHouseRuralHouse: true, ruralHouseKind: "farm_exit", ruralOwnerResidenceYears: 6, ruralOutsideCapitalEupMyeon: true, ruralReturnedToFarmExitHouse: false };
const UNAVOIDABLE = { ...base, id: "U", acquisitionDate: "1998-01-01", oneHouseUnavoidableOutsideCapital: true, unavoidableOutsideCapitalReason: "work", unavoidableOutsideCapitalUnresolved: true };
/** ⑤ 혼인 합가 — 배우자 쪽 주택(양도 주택은 혼인 전 취득) */
const SPOUSE = { ...base, id: "S", acquisitionDate: "1999-01-01", mergeOrigin: "counterpart_side" };
const Cm = { ...C, mergeOrigin: "seller_side" };
const Dm = { ...D, mergeOrigin: "seller_side" };

const mk = (houses: Record<string, unknown>[], top: Record<string, unknown> = {}): RulingCase =>
  ({
    id: "S01-2", docNo: "", docDate: "", basis: "current", today: "2023-03-10", summary: "", bucket: "match",
    form: {
      isOneHousehold: true, transferDate: "2023-02-28", contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "2001-09-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "24" },
      houses, ...top,
    },
  }) as unknown as RulingCase;

describe("S01-2 — ②③ 동시 제외 위에 2주택 전제 §155 특례를 더한 세 특례는 불허", () => {
  it("① 일시적 2주택 + ② + ③ (0209 사실관계) → 과세 · 155-1 미적용 · 불성립 사유(확인 필요)", async () => {
    const o = await observeCase(mk([B, C, D]));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.appliedExceptions).not.toContain("155-1-temporary-two-house");
    expect(o.excludedHouses.map((h) => h.houseId).sort()).toEqual(["C", "D"]);
    expect(o.unmetExceptions).toContain("155-1-temporary-two-house");
    expect(o.unmetReasons?.["155-1-temporary-two-house"]?.join("\n")).toContain("확인 필요");
  });

  it.each([
    ["① + ②", [B, C]],
    ["① + ③", [B, D]],
    ["② + ③ (일반주택 1채만 남음)", [C, D]],
  ])("긍정 짝 — 2중첩 %s 는 비과세가 유지된다", async (_l, hs) => {
    const o = await observeCase(mk(hs as Record<string, unknown>[]));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.unmetExceptions).toEqual([]);
  });

  it.each([
    ["⑥ 국가유산주택", HERITAGE, "155-6-1ho-cultural-heritage", [HERITAGE, C]],
    ["⑦ 이농주택", RURAL, "155-7-rural:farm_exit", [RURAL, C]],
    ["⑧ 부득이한 사유 주택", UNAVOIDABLE, "155-8-unavoidable:work", [UNAVOIDABLE, C]],
  ])("%s + ② + ③ → 과세 · 불성립 사유 / 대조 %s + ②만 → 비과세", async (_l, row, id, pair) => {
    const three = await observeCase(mk([row, C, D]));
    expect(three.validationErrors).toEqual([]);
    expect(three.isExempt).toBe(false);
    expect(three.appliedExceptions).toEqual([]);
    expect(three.unmetExceptions).toContain(id);
    const two = await observeCase(mk(pair as Record<string, unknown>[]));
    expect(two.validationErrors).toEqual([]);
    expect(two.isExempt).toBe(true);
    expect(two.appliedExceptions).toContain(id);
  });

  it("⑤ 혼인 합가 + ② + ③ → 과세 · 합가 불성립 사유 / 대조 ⑤ + ②만 → 비과세", async () => {
    const top = { marriageDate: "2020-01-01", isFirstTransferredInMerge: true };
    const three = await observeCase(mk([SPOUSE, Cm, Dm], top));
    expect(three.validationErrors).toEqual([]);
    expect(three.isExempt).toBe(false);
    expect(three.unmetExceptions).toContain("155-5-marriage-merge");
    expect(three.unmetReasons?.["155-5-marriage-merge"]?.join("\n")).toContain("확인 필요");
    const two = await observeCase(mk([SPOUSE, Cm], top));
    expect(two.validationErrors).toEqual([]);
    expect(two.isExempt).toBe(true);
    expect(two.appliedExceptions).toContain("155-5-marriage-merge");
  });
});
