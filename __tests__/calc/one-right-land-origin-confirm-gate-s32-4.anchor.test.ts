/**
 * #32-4 anchor — 판정 메뉴 §89①4호 「세대원 건물 소유를 선언하지 않았습니다. 확인 필요.」는 **선언이 결론을 가를 때만** 붙인다.
 *
 * 토지만 출자한 입주권(원조합원)은 같은 세대가 철거 대상 건물을 소유한 경우에만 4호가 성립한다(재산세과-1748). 선언이 없으면 불성립이지만,
 * 인가일 요건(`exemptionEligibleAtApproval`)처럼 **다른 사유가 따로 막고 있으면** 선언해도 결론이 안 바뀐다 — 그때는 사실(선언하지 않았다)만 적고
 * 「확인 필요」를 붙이지 않는다. 계산기 `oneRightLandContributionNotices`의 `wouldHold`와 같은 반사실(같은 판정 leaf에 「예」를 넣어 본다).
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
  id: "land32-4", docNo: "-", docDate: "-", basis: "current", today: "2026-10-12", summary: "-", bucket: "match",
  form: {
    isOneHousehold: true, transferDate: "2026-09-01", contractTotalPrice: "1000000000",
    asset: {
      assetKind: "right_to_move_in", redevSubject: "right", redevExemptionEligibleAtApproval: "yes",
      acquisitionDate: "2015-03-01", redevApprovalDate: "2021-05-01", redevOriginalAssetType: "land", ...asset,
    },
    houses: [],
  } as never,
});

async function reasons(c: RulingCase): Promise<string> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(buildCaseForm(c))),
      }),
    );
    const json = await res.json();
    expect(res.status, JSON.stringify(json)).toBe(200);
    return ((json.data.oneRightExemption?.reasons ?? []) as string[]).join(" ");
  } finally {
    vi.useRealTimers();
  }
}

const LAND_REASON = /토지만 출자한 입주권은 인가일·양도일 현재 같은 세대가 철거 대상 건물/;

describe("#32-4 판정 메뉴 — 토지 출자 입주권 「확인 필요」는 선언이 결론을 가를 때만", () => {
  it("긍정 — 선언이 유일한 장애물이면 「확인 필요」 (선언하면 가목이 성립한다)", async () => {
    const r = await reasons(mk({ redevLandHouseholdOwnedBuilding: "" }));
    expect(r).toMatch(LAND_REASON);
    expect(r).toMatch(/선언하지 않았습니다\. 확인 필요/);
  });

  it("★ 인가일 요건이 따로 막으면(「아니오」) 선언해도 같은 불성립 — 사실만 적고 「확인 필요」를 붙이지 않는다", async () => {
    const r = await reasons(mk({ redevLandHouseholdOwnedBuilding: "", redevExemptionEligibleAtApproval: "no" }));
    expect(r).toMatch(LAND_REASON);
    expect(r).toMatch(/세대원 건물 소유를 선언하지 않았습니다\./);
    expect(r).not.toMatch(/확인 필요/);
  });

  it("「아니오」 선언은 종전대로 — 사실이 확정된 불성립이라 확인 필요 없음", async () => {
    const r = await reasons(mk({ redevLandHouseholdOwnedBuilding: "no" }));
    expect(r).toMatch(/다른 세대 소유로 선언했습니다/);
    expect(r).not.toMatch(/확인 필요/);
  });
});
