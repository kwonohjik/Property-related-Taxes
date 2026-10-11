/**
 * 판정 메뉴 입주권 양도 §89①4호 **나목** — 두 결함의 anchor (판정 메뉴 전 구간: 폼 → ④ → ⑫ → route → 엔진, ⑧).
 *
 * ## S05-4 — 괄호 「대통령령으로 정하는 사유」(시행령 §155⑱) 입력 경로가 없어 조용히 불성립
 * 「소득세법」 제89조제1항제4호나목(현행 MST 280405): 「…해당 1주택을 취득한 날부터 3년 이내에 해당 조합원입주권을
 * 양도할 것(3년 이내에 양도하지 못하는 경우로서 대통령령으로 정하는 사유에 해당하는 경우를 포함한다)」.
 * 「소득세법 시행령」 제155조제18항(현행 MST 290841): 「…"대통령령으로 정하는 사유"란 다른 주택을 취득한 날부터
 * 3년이 되는 날 현재 다음 각 호의 어느 하나에 해당하는 경우」 — 1 자산관리공사 매각 의뢰 · 2 법원 경매 신청 ·
 * 3 공매 진행 중 · 4 현금청산금 소송 · 5 수용재결·매도청구소송.
 * 수정 전: 칸이 ⑤·④·⑫·타입 어느 층에도 없어 사유가 있어도 3년을 넘기면 「3년을 넘겼습니다」로 과세됐다.
 * ⚠️ 시행령 연혁(2017.2.3.·2020.2.11. 시행본의 「매각 등의 방법으로 양도」 요건 · 호 범위)은 가르지 않는다 —
 *    §155① 처분기한 예외와 같은 취급이다(확인 필요).
 *
 * ## S10-4 — 「그 1주택 취득일」 이중 진실(칸 ↔ 명부)
 * 다른 주택 수는 명부에서, 기산일은 별도 칸에서 읽어 둘이 어긋나면 결론이 조용히 바뀌었다(양방향). ⑧이 막는다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { validateAllSteps } from "@/lib/calc/one-house-exemption-validate";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

type CaseOpts = { transferDate: string; na?: string; rosterAcq?: string; reason?: string; rosterExtra?: Record<string, unknown>[] };

const mk = (o: CaseOpts): RulingCase => ({
  id: "na", docNo: "-", docDate: "-", basis: "current", today: "2026-10-11", summary: "-", bucket: "match",
  form: {
    isOneHousehold: true, transferDate: o.transferDate, contractTotalPrice: "800000000",
    asset: {
      assetKind: "right_to_move_in", redevSubject: "right", redevExemptionEligibleAtApproval: "yes",
      acquisitionDate: "2015-03-01", redevApprovalDate: "2021-05-01",
      redevOtherHouseAcquisitionDate: o.na ?? "2022-06-01",
      ...(o.reason ? { redevOtherHouseDisposalDelayReason: o.reason } : {}),
    },
    houses: [{ id: "other", region: "capital", acquisitionDate: o.rosterAcq ?? "2022-06-01" }, ...(o.rosterExtra ?? [])],
  } as never,
});

async function observe(c: RulingCase, opts: { dropReasonFromBody?: boolean } = {}) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${c.today}T03:00:00Z`));
  try {
    const form = buildCaseForm(c);
    const ve = validateAllSteps(form).filter((e) => e.severity === "error").map((e) => `${e.field}: ${e.message}`);
    const body = buildOneHouseExemptionApiBody(form) as Record<string, unknown>;
    if (opts.dropReasonFromBody) delete (body.oneRightExemptionFacts as Record<string, unknown>).otherHouseDisposalDelayReason;
    const res = await POST(
      new NextRequest("http://localhost/api/calc/one-house-exemption", {
        method: "POST",
        headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
        body: JSON.stringify(body),
      }),
    );
    expect(res.status).toBe(200);
    const j = (await res.json()).data;
    return {
      ve,
      body,
      isExempt: j.judgment.isExempt as boolean,
      applied: (j.judgment.appliedExceptions ?? []).map((x: { id: string }) => x.id) as string[],
      reasons: (j.oneRightExemption?.reasons ?? []) as string[],
    };
  } finally {
    vi.useRealTimers();
  }
}

// 다른 주택 취득 2022-06-01 → 3년 만료 2025-06-01(일요일 → 익일 2025-06-02)
describe("S05-4 — 나목 × 시행령 §155⑱ 사유", () => {
  it("대조군 — 3년 이내(2025-05-30) 양도: 사유 없이도 나목 비과세", async () => {
    const o = await observe(mk({ transferDate: "2025-05-30" }));
    expect(o.applied).toContain("one_right_89_1_4_na");
  });

  it("3년 경과(2025-09-01) + 사유 없음 → 과세(「3년을 넘겼습니다」) — 사유 없는 대조", async () => {
    const o = await observe(mk({ transferDate: "2025-09-01" }));
    expect(o.isExempt).toBe(false);
    expect(o.reasons.join(" ")).toContain("3년을 넘겼습니다");
  });

  for (const reason of ["kamco", "auction", "public_sale", "cash_settlement_suit", "expropriation_suit"] as const) {
    it(`🔑 3년 경과 + 3년이 되는 날 현재 §155⑱ 사유(${reason}) → 나목 성립 (수정 전: 조용히 불성립)`, async () => {
      const o = await observe(mk({ transferDate: "2025-09-01", reason }));
      expect(o.ve).toEqual([]);
      expect((o.body.oneRightExemptionFacts as Record<string, unknown>).otherHouseDisposalDelayReason).toBe(reason);
      expect(o.isExempt).toBe(true);
      expect(o.applied).toContain("one_right_89_1_4_na");
    });
  }

  it("배선 mutation 짝 — ④가 사유를 싣지 않으면(본문에서 제거) 같은 사실이 불성립으로 돌아간다(5단 중 한 층만 빠져도 침묵)", async () => {
    const o = await observe(mk({ transferDate: "2025-09-01", reason: "auction" }), { dropReasonFromBody: true });
    expect(o.isExempt).toBe(false);
  });

  it("사유가 있어도 기산일(취득일)이 없으면 판정하지 않는다(모름 = 혜택 불성립)", async () => {
    const c = mk({ transferDate: "2025-09-01", reason: "auction", na: "" });
    const o = await observe(c);
    expect(o.isExempt).toBe(false);
  });
});

describe("S10-4 — 나목 기산일 칸 ↔ 보유 주택 명부", () => {
  it("대조 — 칸과 명부가 같으면(2024-01-01) ⑧ 오류 없음 · 나목 비과세", async () => {
    const o = await observe(mk({ transferDate: "2025-06-01", na: "2024-01-01", rosterAcq: "2024-01-01" }));
    expect(o.ve).toEqual([]);
    expect(o.applied).toContain("one_right_89_1_4_na");
  });

  it("🔴 B: 명부 2021-01-01(3년 초과)인데 칸 2024-01-01 → ⑧이 막는다(수정 전: 조용히 나목 비과세)", async () => {
    const o = await observe(mk({ transferDate: "2025-06-01", na: "2024-01-01", rosterAcq: "2021-01-01" }));
    expect(o.ve.some((m) => m.startsWith("redevOtherHouseAcquisitionDate:") && m.includes("명부"))).toBe(true);
  });

  it("🔴 F(역방향): 명부 2024-01-01(3년 이내)인데 칸 2021-01-01 → ⑧이 막는다(수정 전: 조용히 과세)", async () => {
    const o = await observe(mk({ transferDate: "2025-06-01", na: "2021-01-01", rosterAcq: "2024-01-01" }));
    expect(o.ve.some((m) => m.startsWith("redevOtherHouseAcquisitionDate:") && m.includes("명부"))).toBe(true);
  });

  it("🔴 G: 칸이 양도일 이후(2026-01-01) → ⑧이 막는다(수정 전: 나목 비과세)", async () => {
    const o = await observe(mk({ transferDate: "2025-06-01", na: "2026-01-01", rosterAcq: "2021-01-01" }));
    expect(o.ve.some((m) => m.startsWith("redevOtherHouseAcquisitionDate:") && m.includes("양도 예정일"))).toBe(true);
  });

  it("칸 빈칸 — 종전대로(⑧ 차단 없음 · 엔진이 「나목 판정에는 취득일이 필요합니다」 안내)", async () => {
    const o = await observe(mk({ transferDate: "2025-06-01", na: "", rosterAcq: "2021-01-01" }));
    expect(o.ve.filter((m) => m.startsWith("redevOtherHouseAcquisitionDate:"))).toEqual([]);
  });

  it("명부가 2행 이상이면 어느 행인지 ⑧이 알 수 없어 비교하지 않는다(합가 제외 등 — 엔진 몫)", async () => {
    const o = await observe(
      mk({ transferDate: "2025-06-01", na: "2024-01-01", rosterAcq: "2021-01-01", rosterExtra: [{ id: "x", region: "capital", acquisitionDate: "2024-01-01" }] }),
    );
    expect(o.ve.filter((m) => m.startsWith("redevOtherHouseAcquisitionDate:") && m.includes("명부"))).toEqual([]);
  });

  it("상속 행은 비교하지 않는다(기산일이 상속개시일인지 확인 필요 — 시행령 §162①5호)", async () => {
    const c = mk({ transferDate: "2025-06-01", na: "2024-01-01", rosterAcq: "2021-01-01" });
    (c.form as { houses: Record<string, unknown>[] }).houses[0].isInherited = true;
    (c.form as { houses: Record<string, unknown>[] }).houses[0].inheritedDate = "2021-01-01";
    const o = await observe(c);
    expect(o.ve.filter((m) => m.startsWith("redevOtherHouseAcquisitionDate:") && m.includes("명부"))).toEqual([]);
  });
});

// ── 계산기 상자(`redevelopment`)도 같은 사유를 받는다 — 규칙은 `resolveOneRightExemptionClause` 한 벌 ──

describe("S05-4 — 계산기 redevelopment 상자", () => {
  const D = (s: string) => new Date(s);
  const calc = (reason?: "auction") =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "right_to_move_in",
        transferPrice: 900_000_000,
        transferDate: D("2025-09-01"), // 다른 주택 취득(2022-06-01) 후 3년 경과
        acquisitionDate: D("2010-04-09"),
        acquisitionPrice: 300_000_000,
        isOneHousehold: true,
        householdHousingCount: 1,
        householdRightCount: 1,
        residencePeriodMonths: 0,
        householdNoPresaleRightsConfirmed: true,
        redevelopment: {
          subject: "right",
          approvalLawBasis: "urban_renovation_art_74",
          approvalDate: D("2018-10-23"),
          rightsValue: 500_000_000,
          settlementDirection: "pay",
          settlementAmount: 50_000_000,
          preApprovalExpenses: 0,
          postApprovalExpenses: 0,
          originalAssetType: "housing",
          exemptionEligibleAtApproval: true,
          otherHouseAcquisitionDate: D("2022-06-01"),
          ...(reason ? { otherHouseDisposalDelayReason: reason } : {}),
        },
      }),
      makeMockRates(),
    );

  it("3년 경과 + 사유 없음 → 나목 불성립(과세)", () => {
    expect(calc().redevelopmentDetail?.oneRightExemptionClause).toBeUndefined();
  });
  it("🔑 3년 경과 + 시행령 §155⑱ 2호(경매 신청) → 나목 성립 · 전액 비과세", () => {
    const r = calc("auction");
    expect(r.redevelopmentDetail?.oneRightExemptionClause).toBe("na");
    expect(r.totalTax).toBe(0);
  });
  it("④ 계산기 payload가 사유를 싣는다(빈 값은 보내지 않는다)", () => {
    const a = (over: Partial<AssetForm>) =>
      ({ ...makeDefaultAsset(1), assetKind: "right_to_move_in", redevSubject: "right", ...over }) as AssetForm;
    expect(buildRedevelopmentPayload(a({ redevOtherHouseDisposalDelayReason: "auction" })).otherHouseDisposalDelayReason).toBe("auction");
    expect(buildRedevelopmentPayload(a({ redevOtherHouseDisposalDelayReason: "" })).otherHouseDisposalDelayReason).toBeUndefined();
  });
});
