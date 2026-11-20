/**
 * D-41 anchor — 2주택 + 권리 2개 이상 세대의 §89②가 「판정 보류」로 빠져 본체 비과세(§155① 일시적 2주택)가 유지되던 결함.
 *
 * 2주택 축 여섯 항(「소득세법 시행령」 §156의2⑦·⑩·⑪ · §156의3⑤·⑦·⑧)은 모두 「…각각 1개씩 소유하고 있는 1세대」라 권리가
 * 둘 이상인 세대에는 성립할 수 없다. 결정 Q-17 (a) — **좁게**: 특수주택(문화유산·이농)을 선언하지 않은 2주택에만 닫는다.
 * 선언한 2+2(`article-89-2-two-house-axis.anchor.test.ts`)와 3주택 + 2권리는 종전대로 판정 보류다.
 *
 * 시료 — 해석례 평가셋 E011-era(일시적 2주택 + 승계 입주권 1개 = 과세, 국세청이 §155①과 §156의2③ 중첩을 부인)에 권리를 하나 더 붙인다.
 */
import { describe, it, expect } from "vitest";
import { observeCase, type RulingCase } from "./one-house-rulings/harness";

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
