/**
 * D-41 anchor — 2주택 + 권리 2개 이상 세대의 §89②가 「판정 보류」로 빠져 본체 비과세(§155① 일시적 2주택)가 유지되던 결함.
 *
 * 2주택 축 여섯 항(「소득세법 시행령」 §156의2⑦·⑩·⑪ · §156의3⑤·⑦·⑧)은 모두 「…각각 1개씩 소유하고 있는 1세대」라 권리가
 * 둘 이상인 세대에는 성립할 수 없다. 결정 Q-17 (a) — **좁게**: 특수주택(문화유산·이농)을 선언하지 않은 2주택에만 닫는다.
 * 선언한 2+2(`article-89-2-two-house-axis.anchor.test.ts`)와 3주택 + 2권리는 종전대로 판정 보류다.
 *
 * 시료 — 해석례 평가셋 E011-era(일시적 2주택 + 승계 입주권 1개 = 과세, 국세청이 §155①과 §156의2③ 중첩을 부인)에 권리를 하나 더 붙인다.
 *
 * 혼인 2+2(리뷰 수정 방향의 남은 anchor · 2026-11-22 실측) — 같은 사실관계를 혼인 합가(2023-01-10)로 바꿔 양도자 쪽 A + 입주권 c,
 * 배우자 쪽 B + 권리 1개로 둔다. 권리가 둘이면 남는 예외는 §156의2⑨(「…2주택과 2조합원입주권 등」)뿐이고 그 판정은 합가 전 보유 구성이 가른다.
 * 수정 전에는 구성을 고르지 않아도(또는 「해당 없음」이어도) 2주택 축 판정 보류로 빠져 비과세였다 — 결정 #7(구성 미선언 = 불성립)을 우회했다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { handoff, withToday } from "./_one-house-pr6a-routes";
import { runCalc } from "./_one-house-pr3a-calc-route";

type Right = { id: string; type: "redevelopment_right" | "presale_right"; acquisitionDate: string };

function e011(rights: Right[], houseOver: Record<string, unknown> = {}, top: Record<string, unknown> = {}): RulingCase {
  return {
    id: "d41", docNo: "-", docDate: "-", basis: "era", today: "2023-10-16", summary: "d41", bucket: "match",
    form: {
      isOneHousehold: true,
      transferDate: "2023-10-15",
      contractTotalPrice: "800000000",
      asset: { assetKind: "housing", acquisitionDate: "2020-05-10" },
      houses: [{ id: "b", region: "non_capital", acquisitionDate: "2021-07-20", acquisitionOrigin: "general", ...houseOver }],
      presaleRights: rights.map((r) => ({
        ...r,
        region: "non_capital",
        ...(r.type === "redevelopment_right" ? { memberOrigin: "successor" } : {}),
      })),
      ...top,
    } as RulingCase["form"],
  };
}

const R1: Right = { id: "c", type: "redevelopment_right", acquisitionDate: "2022-09-25" };
const R2: Right = { id: "d", type: "redevelopment_right", acquisitionDate: "2022-11-01" };
const P1: Right = { id: "e", type: "presale_right", acquisitionDate: "2022-09-25" };
const P2: Right = { id: "f", type: "presale_right", acquisitionDate: "2022-11-01" };
const openIds = (und: string[]) => und.filter((id) => id.startsWith("89-2-open"));

describe("D-41 · Q-17 (a) — 특수주택 미선언 2주택 + 권리 2개 이상은 §89② 배제 확정", () => {
  it("기준 — E011 사실관계(권리 1개)는 과세", async () => {
    const o = await observeCase(e011([R1]));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
  });

  for (const [label, rights] of [
    ["입주권 2개", [R1, R2]],
    ["분양권 2개", [P1, P2]],
    ["입주권 + 분양권", [R1, P2]],
    ["입주권 3개", [R1, R2, { id: "g", type: "redevelopment_right", acquisitionDate: "2023-01-10" } as Right]],
  ] as const) {
    it(`${label} — 과세(수정 전 판정 보류·비과세) · 판정 보류 고지 없음`, async () => {
      const o = await observeCase(e011([...rights]));
      expect(o.validationErrors).toEqual([]);
      expect(o.isExempt).toBe(false);
      expect(openIds(o.undetermined)).toEqual([]);
    });
  }
});

describe("D-41 · 혼인 2주택 + 권리 2개 — 합가 전 구성 미선택은 과세 + §156의2⑨ 확인 필요(결정 #7)", () => {
  const MARRIAGE = { marriageDate: "2023-01-10", isFirstTransferredInMerge: true };
  /** 양도자 쪽 = 양도 주택 A + 첫 권리 · 배우자 쪽 = B + 나머지 권리. 계산기 소재지 칸은 시료 결함이 아니도록 채운다. */
  const married = (rights: Right[], top: Record<string, unknown> = {}): RulingCase => {
    const c = e011(rights, { mergeOrigin: "counterpart_side" }, { ...MARRIAGE, ...top });
    const f = c.form as unknown as { asset: Record<string, unknown>; presaleRights: Record<string, unknown>[] };
    Object.assign(f.asset, { addressJibun: "경상북도 구미시 송정동 1", fixedAcquisitionPrice: "500000000" });
    f.presaleRights = f.presaleRights.map((r, i) => ({ ...r, mergeOrigin: i === 0 ? "seller_side" : "counterpart_side" }));
    return c;
  };
  const calc = async (c: RulingCase) => {
    let r: Awaited<ReturnType<typeof runCalc>> | undefined;
    await withToday(c.today, async () => {
      r = await runCalc(handoff(buildCaseForm(c)));
    });
    expect(r!.issues).toEqual([]);
    return r!;
  };
  const UNDECLARED = "89-2-merged-household-composition-undeclared";

  for (const [label, rights] of [
    ["입주권 2개", [R1, R2]],
    ["입주권 + 분양권", [R1, P2]],
  ] as const) {
    it(`${label} · 구성 미선택 → 판정 메뉴·계산기 과세 + ⑨ 확인 필요 고지(수정 전 판정 보류·비과세)`, async () => {
      const c = married([...rights]);
      const o = await observeCase(c);
      expect(o.validationErrors).toEqual([]);
      expect(o.isExempt).toBe(false);
      expect(o.undetermined).toEqual([UNDECLARED]);
      expect(openIds(o.undetermined)).toEqual([]);
      const r = await calc(c);
      expect(r.isExempt).toBe(false);
      expect(r.totalTax).toBeGreaterThan(0);
      expect((r.warnings ?? []).some((w: string) => w.includes("§156의2 ⑨") && w.includes("확인 필요"))).toBe(true);
    });
  }

  it("구성 「해당 없음」 → 과세 · 미선택 고지 없음(수정 전 판정 보류·비과세)", async () => {
    const o = await observeCase(married([R1, R2], { mergedHouseholdFirstHouseKind: "none" }));
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toEqual([]);
  });

  it.each([
    ["주택만(⑨2호)", { mergedHouseholdFirstHouseKind: "house_only" }],
    ["승계 입주권 취득 전부터 소유(⑨3호 나목)", { mergedHouseholdFirstHouseKind: "succeeded_right", mergedHouseholdOwnedBeforeRight: true }],
  ])("긍정 짝 — 구성 %s → 판정 메뉴·계산기 비과세(§155⑤)", async (_l, top) => {
    const c = married([R1, R2], top);
    const o = await observeCase(c);
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(true);
    expect(o.appliedExceptions).toEqual(["155-5-marriage-merge"]);
    const r = await calc(c);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});
