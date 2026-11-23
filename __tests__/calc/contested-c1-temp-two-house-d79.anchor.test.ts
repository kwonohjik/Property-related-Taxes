/**
 * D-79 후속 anchor (2026-11 리뷰 · C1 변형) — 양론 C1(상속주택 지분을 동일세대원에게 증여) 반대 입장(A)이 §155① 짝을 그 입장 기준으로 다시 도출한다.
 *
 * 반대 입장(A)은 증여한 행을 §155② 상속주택에서 빼고 일반 주택으로 본다. 그 행이 양도 주택보다 나중에 **별도세대에게서** 상속받은 주택이면
 * 상속개시일을 취득일로 하는 §155① 신규 주택이다 — 서면인터넷방문상담4팀-3513(2007.12.10. · 서면5팀-932가 유사사례로 인용 — KoreanLaw MCP
 * 원문 2026-11-23): 별도세대인 피상속인으로부터 1주택을 상속받아 1세대 2주택이 된 경우의 일반주택 양도에 「그 다른 주택을 취득한 날부터
 * 1년 이내에 종전의 주택을 양도 … §155① … 비과세」로 회신. 동일세대 상속은 새로운 취득이 아니다(사전-2023-법규재산-0464 · D-76).
 *
 * 종전: 반대 입장 입력이 엔진 입장의 「짝 없음」(엔진 입장에서는 그 행이 §155② 상속주택이라 신규 주택 후보가 아니다)을 그대로 실어
 *   §155① 기한 안에 판 사안도 A 「과세」 · 「해석이 갈림」으로 단언했다(2026-11-23 실측).
 *
 * | # | 사안(일반주택 S 2015-03 취득 · 상속 행 B 2022-01-10 · 그 지분을 배우자에게 증여) | 주장 |
 * |---|---|---|
 * | Q-1 | 별도세대 상속 · 2023-06 양도(3년 안) | A 비과세(§155①) · B 비과세 · 결론 같음 · ④ 짝 newHouseRowId=B |
 * | Q-2 | 같은 사실 2025-06 양도(3년 초과) | A 과세 · B 비과세(대조) |
 * | Q-3 | S 2021-06 취득(1년 안에 상속) | A 과세(종전주택 취득 후 1년) |
 * | Q-4 | 동일세대 상속 | A 과세(0464 — 신규 주택 아님) · ④ 짝 null |
 * | Q-5 | 평가셋 E107·E110(상속 뒤 한참 지나 양도) | 종전 결론 그대로(A 과세 · B 비과세) |
 * | Q-6 | ⑧ — Q-1에서 B 행 취득 경위 미답 | 「다른 입장」 문구로 경위를 요구 |
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateStep2 } from "@/lib/calc/one-house-exemption-validate";

const C1 = "155-2-inherited-house-gifted-within-household";
const mk = (today: string, sell: string, transfer: string, row: Record<string, unknown> = {}): RulingCase =>
  ({
    id: "c1", docNo: "-", docDate: "-", basis: "era", today, summary: "-", bucket: "match",
    form: {
      isOneHousehold: true, transferDate: transfer, contractTotalPrice: "700000000",
      asset: { assetKind: "housing", acquisitionDate: sell },
      houses: [
        {
          id: "B", region: "capital", acquisitionDate: "2022-01-10", isInherited: true, inheritedDate: "2022-01-10", isCoInherited: false,
          decedentSameHouseholdAtInheritance: false, decedentHouseholdSeparate: true, inheritedGiftedToHouseholdMember: true,
          acquisitionOrigin: "general", ...row,
        },
      ],
    },
  }) as unknown as RulingCase;
const V1 = mk("2023-06-02", "2015-03-01", "2023-06-01");
const fixture = (id: string) => {
  const c = JSON.parse(readFileSync(`__tests__/calc/one-house-rulings/cases/${id}.json`, "utf8"));
  return (Array.isArray(c) ? c[0] : c) as RulingCase;
};
async function c1(c: RulingCase) {
  const r = await observeCase(c);
  expect(r.validationErrors).toEqual([]);
  expect(r.status).toBe(200);
  return { r, issue: r.contested.find((x) => x.id === C1)! };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ④ 본문 키를 읽는다
const body = (c: RulingCase) => buildOneHouseExemptionApiBody(buildCaseForm(c)) as any;

describe("D-79 C1 변형 — 반대 입장(A)이 증여한 별도세대 상속 행을 §155① 신규 주택으로 다시 도출", () => {
  it("Q-1 별도세대 상속 · 3년 안 양도 → A 비과세 · B 비과세 · 결론 같음 · ④ 짝은 B 행", async () => {
    const { r, issue } = await c1(V1);
    expect(r.isExempt).toBe(true);
    expect(issue).toMatchObject({ A: "exempt", B: "exempt" });
    const pair = body(V1).contestedGiftedInheritedTemporaryTwoHouse;
    expect(pair).toMatchObject({ newHouseRowId: "B", newAcquisitionDate: "2022-01-10", previousAcquisitionDate: "2015-03-01" });
    expect(body(V1).temporaryTwoHouse).toBeUndefined(); // 엔진 입장 짝은 그대로 없다
  });

  it("Q-2 같은 사실 · 3년 초과 양도 → A 과세 · B 비과세(대조)", async () => {
    const { issue } = await c1(mk("2025-06-02", "2015-03-01", "2025-06-01"));
    expect(issue).toMatchObject({ A: "taxable", B: "exempt" });
  });

  it("Q-3 종전주택 취득 후 1년 안에 상속 → A 과세(§155① 1년 요건)", async () => {
    const { issue } = await c1(mk("2023-06-02", "2021-06-01", "2023-06-01"));
    expect(issue).toMatchObject({ A: "taxable", B: "exempt" });
  });

  it("Q-4 동일세대 상속 → A 과세(사전-2023-법규재산-0464) · ④ 짝 null", async () => {
    const c = mk("2023-06-02", "2015-03-01", "2023-06-01", { decedentSameHouseholdAtInheritance: true, decedentHouseholdSeparate: undefined });
    const { issue } = await c1(c);
    expect(issue.A).toBe("taxable");
    expect(body(c).contestedGiftedInheritedTemporaryTwoHouse).toBeNull();
  });

  it.each(["E107", "E110"])("Q-5 평가셋 %s → 종전 결론 그대로(A 과세 · B 비과세)", async (id) => {
    const { issue } = await c1(fixture(id));
    expect(issue).toMatchObject({ A: "taxable", B: "exempt" });
  });

  it("Q-6 ⑧ — 반대 입장 짝의 신규 주택(B 행) 취득 경위를 다른 입장 문구로 요구", () => {
    const c = mk("2023-06-02", "2015-03-01", "2023-06-01", { acquisitionOrigin: undefined });
    const errors = validateStep2(buildCaseForm(c) as never);
    expect(errors.some((e) => e.message.includes("해석이 갈리는 쟁점의 다른 입장"))).toBe(true);
  });
});
