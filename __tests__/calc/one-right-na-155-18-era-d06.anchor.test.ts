/**
 * PR-6 anchor (2026-11 리뷰) — §89①4호 나목 괄호의 시행령 §155⑱ 사유 연혁 · 사유 문장 · 숨은 칸 검증.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-06 | 나목 ⑱ 사유가 양도일 연혁 없이 3년 초과를 치유 | 2022.2.15. 전 양도분은 「그 방법으로 양도」가 있어야 · 호 신설 전 사유는 적용 안 함 · 2016.3.16. 전은 현행 + 확인 필요(Q-2 (b)) |
 * | D-22 | ⑱ 사유가 치유했는데 다른 게이트에 걸리면 「3년을 넘겼습니다」 | 그 문장을 내지 않는다 |
 * | D-65 | 토글을 끄면 칸이 사라지는데 ⑧이 남은 나목 기산일로 막음 | 토글이 꺼지면 검증하지 않는다 |
 *
 * 법령: 「소득세법 시행령」 §155⑱(2021.6.1. 시행본 MST 229391) 「…해당하는 경우로서 해당 각 호의 매각 등의 방법으로 양도하는 경우」 ·
 * 대통령령 제32420호(2022.2.15.)가 방법 문구 삭제 · 「소득세법 시행규칙」 §72①(2016.3.16. 시행본 MST 181793) 「영 제155조제1항 및 같은 조 제17항제2호」.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

type Opts = {
  transferDate: string;
  approval: string;
  other: string;
  reason?: string;
  method?: boolean;
  household?: boolean;
  eligible?: "yes" | "";
  na?: string;
};
const mk = (o: Opts): RulingCase => ({
  id: "na18", docNo: "-", docDate: "-", basis: "era", today: o.transferDate, summary: "-", bucket: "match",
  form: {
    isOneHousehold: o.household ?? true, transferDate: o.transferDate, contractTotalPrice: "500000000",
    asset: {
      assetKind: "right_to_move_in", redevSubject: "right", redevExemptionEligibleAtApproval: o.eligible ?? "yes",
      acquisitionDate: "2010-03-01", redevApprovalDate: o.approval,
      redevOtherHouseAcquisitionDate: o.na ?? o.other,
      ...(o.reason ? { redevOtherHouseDisposalDelayReason: o.reason } : {}),
      ...(o.method ? { redevOtherHouseDisposalDelayDisposedByThatMethod: true } : {}),
    },
    houses: [{ id: "other", region: "non_capital", acquisitionDate: o.other }],
  } as never,
});

async function observe(c: RulingCase) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const ve = validateAllSteps(form).filter((e) => e.severity === "error").map((e) => `${e.field}: ${e.message}`);
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(buildOneHouseExemptionApiBody(form)),
      }),
    );
    const j = (await res.json()).data;
    return {
      status: res.status,
      ve,
      isExempt: j?.judgment?.isExempt as boolean,
      clause: j?.oneRightExemption?.clause as string | null,
      reasons: ((j?.oneRightExemption?.reasons ?? []) as string[]).join("\n"),
      notices: ((j?.oneRightExemption?.requirementNotices ?? []) as string[]).join("\n"),
    };
  } finally {
    vi.useRealTimers();
  }
}

describe("D-06 나목 ⑱ 사유의 양도일 연혁", () => {
  // 인가 2016-04-22 · 명부 주택 2017-01-10 · 양도 2021-06-01(3년 초과 · 2022.2.15. 전)
  const base = { transferDate: "2021-06-01", approval: "2016-04-22", other: "2017-01-10" };
  it("사유(경매 신청)만 고르고 「그 방법으로 양도」 미선언 → 나목 불성립 · 사유 문장에 그 이유", async () => {
    const o = await observe(mk({ ...base, reason: "auction" }));
    expect(o.ve).toEqual([]);
    expect(o.clause).toBeNull();
    expect(o.isExempt).toBe(false);
    expect(o.reasons).toContain("그 방법으로 양도했는지 확인되지 않아");
  });
  it("「그 방법으로 양도」까지 선언 → 나목 성립", async () => {
    const o = await observe(mk({ ...base, reason: "auction", method: true }));
    expect(o.clause).toBe("na");
  });
  it("5호(매도청구·수용재결)는 2020.2.11. 이후 양도분부터 — 2019-06-01 양도는 사유가 없어 불성립", async () => {
    const o = await observe(mk({ transferDate: "2019-06-01", approval: "2015-04-22", other: "2016-01-10", reason: "expropriation_suit", method: true }));
    expect(o.clause).toBeNull();
    expect(o.reasons).toContain("이후 양도분부터 있는 호입니다");
  });
  it("Q-2 (b) — 2016.3.16. 전 양도분은 사유만으로 성립(현행) + 확인 필요 고지", async () => {
    const o = await observe(mk({ transferDate: "2015-12-01", approval: "2010-06-01", other: "2012-06-01", reason: "auction" }));
    expect(o.clause).toBe("na");
    expect(o.notices).toContain("확인 필요");
  });
  it("2022.2.15. 이후 양도분은 사유 해당만으로 성립(방법 요건 없음 — 불변)", async () => {
    const o = await observe(mk({ transferDate: "2025-09-01", approval: "2021-05-01", other: "2022-06-01", reason: "auction" }));
    expect(o.clause).toBe("na");
  });
});

describe("D-22 ⑱ 사유가 기한을 치유했는데 다른 게이트에 걸린 경우", () => {
  it("1세대가 아니면 그 사유만 — 「3년을 넘겼습니다」를 쓰지 않는다", async () => {
    const o = await observe(mk({ transferDate: "2025-09-01", approval: "2021-05-01", other: "2022-06-01", reason: "auction", household: false }));
    expect(o.clause).toBeNull();
    expect(o.reasons).toContain("1세대에 해당하지 않습니다");
    expect(o.reasons).not.toContain("넘겼습니다");
  });
});

describe("D-65 토글을 끄면 숨은 나목 기산일로 막지 않는다", () => {
  it("토글 OFF + 명부와 다른 나목 기산일 → ⑧ 오류 없음 · 토글 ON이면 막는다(대조)", async () => {
    const off = buildCaseForm(mk({ transferDate: "2025-06-01", approval: "2021-05-01", other: "2021-01-01", na: "2024-01-01", eligible: "" }));
    expect(validateAllSteps(off).filter((e) => e.field === "redevOtherHouseAcquisitionDate" && e.severity === "error")).toEqual([]);
    const on = buildCaseForm(mk({ transferDate: "2025-06-01", approval: "2021-05-01", other: "2021-01-01", na: "2024-01-01" }));
    expect(validateAllSteps(on).some((e) => e.field === "redevOtherHouseAcquisitionDate" && e.severity === "error")).toBe(true);
  });
});
