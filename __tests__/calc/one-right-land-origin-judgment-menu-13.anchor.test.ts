/**
 * #13 후속 — 판정 메뉴 §89①4호 결론에도 토지 출자 규칙을 반영한다 (사용자 결정 2026-10-12: 출자 자산 입력을 판정 메뉴에 추가).
 *
 * 「소득세법」 §89①4호 본문 「…현재 제3호가목에 해당하는 기존주택을 소유하는 세대」 — 토지만 출자했으면 같은 세대가 철거 대상 건물을
 * 인가일·양도일 두 시점 모두 소유한 경우에만 성립한다(재산세과-1748). 종전에는 판정 메뉴 상자(`oneRightExemptionFacts`)가 출자 자산과
 * 선언을 싣지 않아 토지 출자 게이트가 늘 꺼졌다 — 메뉴에서 「아니오」를 골라도 메뉴 결론은 가목 비과세였고 계산기는 과세였다.
 *
 * 판정 메뉴 전 구간: 폼 → ④ → ⑫ → route(⑭) → 엔진.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

const mk = (asset: Record<string, unknown>): RulingCase => ({
  id: "land13", docNo: "-", docDate: "-", basis: "current", today: "2026-10-12", summary: "-", bucket: "match",
  form: {
    isOneHousehold: true, transferDate: "2026-09-01", contractTotalPrice: "1000000000",
    asset: {
      assetKind: "right_to_move_in", redevSubject: "right", redevExemptionEligibleAtApproval: "yes",
      acquisitionDate: "2015-03-01", redevApprovalDate: "2021-05-01", ...asset,
    },
    houses: [],
  } as never,
});

async function judge(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const body = buildOneHouseExemptionApiBody(buildCaseForm(c)) as Record<string, unknown>;
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    const j = json.data;
    return {
      facts: body.oneRightExemptionFacts as Record<string, unknown>,
      isExempt: j.judgment.isExempt as boolean,
      applied: (j.judgment.appliedExceptions ?? []).map((x: { id: string }) => x.id) as string[],
      reasons: ((j.oneRightExemption?.reasons ?? []) as string[]).join(" "),
    };
  } finally {
    vi.useRealTimers();
  }
}

const LAND_REASON = /토지만 출자한 입주권은 인가일·양도일 현재 같은 세대가 철거 대상 건물/;

describe("판정 메뉴 — 토지 출자 입주권의 §89①4호 결론", () => {
  it("대조군 — 주택 출자(기본값) → 가목 비과세", async () => {
    const o = await judge(mk({ redevOriginalAssetType: "housing" }));
    expect(o.facts.originalAssetType).toBe("housing");
    expect(o.applied).toContain("one_right_89_1_4_ga");
    expect(o.reasons).not.toMatch(LAND_REASON);
  });

  it("★ 토지 출자 + 「아니오」 → 불성립 + 토지 출자 사유 (수정 전: 가목 비과세)", async () => {
    const o = await judge(mk({ redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "no" }));
    expect(o.facts).toMatchObject({ originalAssetType: "land", landHouseholdOwnedBuilding: false });
    expect(o.isExempt).toBe(false);
    expect(o.applied).not.toContain("one_right_89_1_4_ga");
    expect(o.reasons).toMatch(LAND_REASON);
    expect(o.reasons).not.toMatch(/확인 필요/); // 사실이 확정된 불성립
  });

  it("★ 토지 출자 + 선언 없음 → 불성립 (모름 = 혜택 불성립)", async () => {
    const o = await judge(mk({ redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "" }));
    expect(o.facts.landHouseholdOwnedBuilding).toBeUndefined();
    expect(o.isExempt).toBe(false);
    expect(o.reasons).toMatch(LAND_REASON);
    expect(o.reasons).toMatch(/선언하지 않았습니다\. 확인 필요/); // 「아니오」와 구별된다
  });

  it("긍정 짝 — 토지 출자 + 「예」 → 가목 비과세", async () => {
    const o = await judge(mk({ redevOriginalAssetType: "land", redevLandHouseholdOwnedBuilding: "yes" }));
    expect(o.facts.landHouseholdOwnedBuilding).toBe(true);
    expect(o.applied).toContain("one_right_89_1_4_ga");
    expect(o.reasons).not.toMatch(LAND_REASON);
  });

  it("stale 가드 — 주택 출자로 되돌린 뒤 남은 「아니오」는 싣지 않는다 → 가목 비과세", async () => {
    const o = await judge(mk({ redevOriginalAssetType: "housing", redevLandHouseholdOwnedBuilding: "no" }));
    expect(o.facts.landHouseholdOwnedBuilding).toBeUndefined();
    expect(o.applied).toContain("one_right_89_1_4_ga");
  });
});
