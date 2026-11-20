/**
 * PR-8 anchor (2026-11 리뷰) — 기준-2024-법규재산-0061(§155④⑤ × ⑳ 합가 상대 쪽 임대) 경로와 명부 술어의 정합.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-09 | 문항 게이트가 원시 명부를 읽음 | 양도일 당일·이후 취득 행이 섞여도 「상대 쪽 2년 거주」 문항을 묻는다(④가 엔진에 싣는 명부와 같은 술어) |
 * | I-08 | 비보유 행 불변식 | 비보유 행(당일·이후 취득)을 더해도 구조 게이트 출력이 같다 |
 * | D-10 | 판정 메뉴가 0061 미적용 고지를 내지 않음 | 입력이 없어 이 경로를 못 열었는데 결론을 가르면 확인 사항으로 싣는다(계산기와 같은 leaf) |
 * | D-24 | 명세가 「3채 중 3채」 | 합가 상대 쪽 임대 1채를 뺀 줄을 싣는다 |
 * | D-26 | 서버가 명부 주택 행에 양도일 현재 보유 필터를 적용하지 않음 | 직접 API로 양도일 뒤 취득 행을 보내도 화면과 같은 결론 |
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { mergeRentalState } from "@/lib/calc/merge-rental-carveout-form";
import { observeCase, buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

const E = JSON.parse(fs.readFileSync("__tests__/calc/one-house-rulings/cases/E0061.json", "utf8"));
const E0061 = (Array.isArray(E) ? E[0] : E) as RulingCase; // 동거봉양 2023-06-28 · 양도 2023-09-18 · 명부 a(상대 쪽) · 임대 c(상대 쪽) · 「예」
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 평가셋 폼을 깊이 복제해 칸만 바꾼다
const clone = (): any => JSON.parse(JSON.stringify(E0061));
const unanswered = () => {
  const c = clone();
  delete c.form.asset.rentalHousingException.counterpartHouseResidedTwoYears;
  return c;
};

describe("D-09 · I-08 화면 게이트 — 양도일 현재 보유 명부", () => {
  it("대조 — 미답이면 문항을 묻는다(unanswered)", () => {
    expect(mergeRentalState(buildCaseForm(unanswered()))).toBe("unanswered");
  });
  for (const [label, acq] of [["양도일 당일", "2023-09-18"], ["양도일 뒤", "2024-01-01"]] as const) {
    it(`${label} 취득 행을 더해도 같은 출력(문항을 숨기지 않는다)`, () => {
      const c = unanswered();
      c.form.houses.push({ id: "late", region: "capital", acquisitionDate: acq });
      expect(mergeRentalState(buildCaseForm(c))).toBe("unanswered");
    });
  }
});

describe("D-10 판정 메뉴 — 0061 미적용 확인 사항", () => {
  it("상대 쪽 임대가 있는데 ⑳을 선언하지 않아 과세 → 확인 사항(계산기 고지와 같은 leaf)", async () => {
    const c = clone();
    c.form.asset.rentalHousingException = { applyException: false };
    c.form.houses.push({ id: "r", region: "capital", acquisitionDate: "2019-09-26", mergeOrigin: "counterpart_side", isLongTermRental: true, acquisitionOrigin: "general" });
    const o = await observeCase(c);
    expect(o.validationErrors).toEqual([]);
    expect(o.isExempt).toBe(false);
    expect(o.undetermined).toContain("155-20-merge-rental-carveout-missing");
  });
});

describe("D-24 명세 — 합가 상대 쪽 임대 1채를 뺀 줄", () => {
  it("0061 성립 → 비과세 · 명세에 ⑳ 제외 줄", async () => {
    const o = await observeCase(E0061);
    expect(o.isExempt).toBe(true);
    expect(o.excludedHouses.map((x) => x.legalBasis)).toContain("소득세법 시행령 §155⑳");
  });
});

describe("D-26 서버 — 명부 주택 행 양도일 현재 보유 필터", () => {
  async function post(body: Record<string, unknown>) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-08-20T03:00:00Z"));
    try {
      const res = await POST(
        new NextRequest("http://localhost/api/calc/one-house-exemption", {
          method: "POST",
          headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
          body: JSON.stringify(body),
        }),
      );
      return (await res.json()).data.judgment.isExempt as boolean;
    } finally {
      vi.useRealTimers();
    }
  }
  it("화면 본문(양도 전 행 → 과세)에서 행 날짜만 양도일 뒤로 바꾼 직접 API → 비과세(화면에서 그 행을 넣은 것과 같다)", async () => {
    const c: RulingCase = {
      id: "d26", docNo: "-", docDate: "-", basis: "current", today: "2026-08-20", summary: "-", bucket: "match",
      form: {
        isOneHousehold: true, transferDate: "2024-06-01", contractTotalPrice: "800000000",
        asset: { assetKind: "housing", acquisitionDate: "2015-01-01" },
        houses: [{ id: "h-other", region: "capital", acquisitionDate: "2024-05-01" }], // 경위 미답 — 일시적 2주택 불성립(리뷰 C1과 같은 대조)
      } as never,
    };
    const body = buildOneHouseExemptionApiBody(buildCaseForm(c)) as Record<string, unknown> & { houses: Record<string, unknown>[] };
    expect(await post(body)).toBe(false); // 대조 — 양도 전 행이면 2주택
    const moved = { ...body, houses: body.houses.map((h) => (h.id === "h-other" ? { ...h, acquisitionDate: "2024-07-01" } : h)) };
    expect(await post(moved)).toBe(true);
  });
});
