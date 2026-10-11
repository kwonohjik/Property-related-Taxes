/**
 * #11 anchor — 공유지분 재개발의 **청산금 수령분(①)·조합원입주권(②)** 12억 비교·안분 기준 = 물건 전체 가액.
 *
 * 사용자 결정 A(2026-10-11, 하위 결정 가): ①② 모두 물건 전체 기준으로 바꾸고, 비교와 안분에 **같은 값**을 쓴다.
 *
 * ## 수정 전 실측 (회귀 판별용)
 *
 * | 시료 | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 입주권 지분 50% · 계약 20억 | 지분가 10억 ≤ 12억 → **전액 비과세(세액 0)** | 과세비율 0.4 · 과세대상 양도차익 300,000,000 |
 * | 입주권 지분 50% · 계약 30억 | 지분가 15억으로 비율 **0.2**(과소) | 0.6 |
 * | 청산금 수령분 지분 50% · 권리가액 20억 | 지분 권리가액 10억 ≤ 12억 → 청산금분 **전액 비과세** | 비율 0.4로 안분 |
 * | 입주권 1인 분할취득(50%+50%) · 20억 | 앞 카드 전액 비과세 · 뒤 카드 전액 과세(합 과세 750,000,000) | 두 카드 모두 비율 0.4(합 = 단건) |
 *
 * 근거: 「소득세법 시행령」 §156①(타인 소유부분을 포함한 물건 전체 가액으로 고가주택 판정)·§160①(양도하는 부분의 비율로 안분) —
 * ①은 종전주택의 분할양도라 직접 적용, ②는 §89①4호 단서에 유추(현행 4호 체계의 공유 입주권 해석례 없음 → 결과 경고).
 * ⚠️ 수치는 mock 세율표 실측값이지 정본 세액이 아니다 — 비율·과세 여부가 의미 있다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import { oneRightHighValueBase } from "@/lib/tax-engine/transfer-tax-redevelopment-transforms";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const HALF: [string, string] = ["50", "100"];
const NOTICE = /공유지분 조합원입주권의 고가/;

/** 원조합원 입주권(1세대1입주권 가목 선언) — 청산금은 지분으로 쪼개지 않는다(지분 해당분을 직접 입력). */
function rightForm(price: string, share?: [string, string], settlement = "50000000", over: Record<string, unknown> = {}) {
  return redevAptForm({
    price,
    share,
    count: "0",
    assetOver: {
      assetKind: "right_to_move_in",
      redevSubject: "right",
      redevApprovalDate: "2022-03-01",
      redevExemptionEligibleAtApproval: "yes",
      redevSettlementAmount: settlement,
      ...over,
    },
    formOver: { householdRightCount: "1" } as never,
  });
}

/** 완공APT 청산금 수령 동시신고(권리가액 = 물건 전체, 청산금분 양도일 현재 1세대1주택 선언). */
function recvForm(price: string, rights: string, share?: [string, string], settlement = "100000000") {
  return redevAptForm({
    price,
    share,
    assetOver: {
      redevSettlementDirection: "receive",
      redevSettlementAmount: settlement,
      redevRightsValue: rights,
      redevSettlementSaleDate: "2024-06-01",
      redevExemptionEligibleAtApproval: "yes",
      redevOneHouseAtSettlementSale: "yes",
    },
  });
}

describe("#11 ② 입주권 — 지분 모드 12억 비교·안분은 물건 전체 양도가액", () => {
  it("지분 50% · 계약 20억 — 과세비율 0.4 · 안분 과세 (수정 전: 지분가 10억 ≤ 12억 전액 비과세 · 세액 0)", async () => {
    const r = await runCalc(rightForm("2000000000", HALF, "25000000"));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    const d = r.result.redevelopmentDetail;
    expect(d.oneRightHighValueApplied).toBe(true);
    expect(d.oneRightExemptionApplied).toBeUndefined();
    expect(d.highValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBeGreaterThan(0);
  });

  it("지분 50% · 계약 30억 — 과세비율 0.6 (수정 전: 지분가 15억 기준 0.2 과소)", async () => {
    const r = await runCalc(rightForm("3000000000", HALF, "25000000"));
    expect(r.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.6, 10);
  });

  it("지분 50%의 과세대상 양도차익 = 단독의 절반(±2원 — 분기별 floor)", async () => {
    const half = await runCalc(rightForm("2000000000", HALF, "25000000"));
    const sole = await runCalc(rightForm("2000000000", undefined, "50000000"));
    const h = half.result.redevelopmentDetail.highValueAllocation;
    const s = sole.result.redevelopmentDetail.highValueAllocation;
    expect(h.taxableRatio).toBeCloseTo(s.taxableRatio, 10);
    expect(Math.abs(h.taxableGain * 2 - s.taxableGain)).toBeLessThanOrEqual(2);
  });

  it("긍정 짝 — 물건 전체 10억(지분 5억)은 12억 이하라 전액 비과세 (안분 없음)", async () => {
    const r = await runCalc(rightForm("1000000000", HALF, "25000000"));
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    expect(r.result.redevelopmentDetail.oneRightHighValueApplied).toBeUndefined();
    expect(r.result.totalTax).toBe(0);
    expect(r.result.warnings.join("\n")).not.toMatch(NOTICE);
  });

  it("경계 — 물건 전체 정확히 12억은 전액 비과세, 12억+1원은 안분 과세", async () => {
    const at = await runCalc(rightForm("1200000000", HALF, "25000000"));
    expect(at.result.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
    const over = await runCalc(rightForm("1200000001", HALF, "25000000"));
    expect(over.result.redevelopmentDetail.oneRightHighValueApplied).toBe(true);
    expect(over.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBeGreaterThan(0);
  });

  it("지분이 12억을 넘고 물건 전체도 넘는 40% 지분 — 물건 전체 15억 → 비율 0.2 (지분 6억은 12억 미달인데도 안분)", async () => {
    const r = await runCalc(rightForm("1500000000", ["40", "100"], "20000000"));
    expect(r.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.2, 10);
  });

  it("확인 필요 고지 — 공유 지분 양도(고가 안분 성립)에만 결과 경고로 실린다", async () => {
    const r = await runCalc(rightForm("2000000000", HALF, "25000000"));
    const notice = r.result.warnings.find((w: string) => NOTICE.test(w)) as string;
    expect(notice).toBeDefined();
    expect(notice).toContain("서면인터넷방문상담5팀-1034");
    expect(notice).toContain("본인 지분만 양도한 경우");
    expect(notice).toContain("확인 필요");
  });

  it("고지 부정 짝 — 단독 소유 · 12억 이하 공유에는 없다", async () => {
    const sole = await runCalc(rightForm("2000000000", undefined, "50000000"));
    expect(sole.result.warnings.join("\n")).not.toMatch(NOTICE);
    expect(sole.result.redevelopmentDetail.oneRightHighValueApplied).toBe(true);
  });

  it("1세대1입주권 요건 불성립(선언 없음)이면 지분이어도 안분·비과세 모두 없다 — 고지도 없다", async () => {
    const r = await runCalc(rightForm("2000000000", HALF, "25000000", { redevExemptionEligibleAtApproval: "no" }));
    expect(r.result.redevelopmentDetail.oneRightHighValueApplied).toBeUndefined();
    expect(r.result.redevelopmentDetail.oneRightExemptionApplied).toBeUndefined();
    expect(r.result.warnings.join("\n")).not.toMatch(NOTICE);
  });
});

describe("#11 별건 — 1인 분할취득(축 B) 입주권: 모든 카드가 §89①4호 판정을 받는다 (② 수정과 같은 변경)", () => {
  function axisB(price: string, p1: string, p2: string, settlementEach: string, settlement2 = settlementEach) {
    const f = rightForm(price, [p1, "100"], settlementEach);
    const a0 = f.assets[0] as AssetForm;
    a0.ownershipRemainderThirdParty = "";
    const a1 = { ...a0, id: "asset-axisb-2", ownershipNumerator: p2, ownershipDenominator: "100", ownershipRemainderThirdParty: "", redevSettlementAmount: settlement2 } as AssetForm;
    (f as { assets: AssetForm[] }).assets = [a0, a1];
    return f;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props = (r: any) => r.json.data.aggregated.properties as any[];

  it("50%+50% · 20억 — 두 카드 모두 과세비율 0.4 · 카드별 과세대상 양도차익이 같다 (수정 전: 앞 카드 전액 비과세 · 뒤 카드 전액 과세)", async () => {
    const r = await runCalc(axisB("2000000000", "50", "50", "25000000"));
    expect(r.issues).toEqual([]);
    const [a, b] = props(r);
    expect(a.redevelopmentDetail.oneRightHighValueApplied).toBe(true);
    expect(b.redevelopmentDetail.oneRightHighValueApplied).toBe(true);
    expect(a.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
    expect(b.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
    expect(a.transferGain).toBe(b.transferGain);
  });

  it("합계 = 단건 100% (±2원) — 50%+50% · 20억, 청산금은 카드마다 지분 해당분", async () => {
    const split = await runCalc(axisB("2000000000", "50", "50", "25000000"));
    const sole = await runCalc(rightForm("2000000000", undefined, "50000000"));
    const sum = props(split).reduce((s, p) => s + p.transferGain, 0);
    expect(Math.abs(sum - sole.result.transferGain)).toBeLessThanOrEqual(2);
  });

  it("60%+40% · 30억 — 비율 0.6 · 합계 = 단건", async () => {
    const split = await runCalc(axisB("3000000000", "60", "40", "30000000", "20000000"));
    const sole = await runCalc(rightForm("3000000000", undefined, "50000000"));
    const ps = props(split);
    expect(ps[0].redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.6, 10);
    expect(ps[1].redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.6, 10);
    const sum = ps.reduce((s, p) => s + p.transferGain, 0);
    expect(Math.abs(sum - sole.result.transferGain)).toBeLessThanOrEqual(2);
  });

  it("긍정 짝 — 10억 물건은 두 카드 모두 전액 비과세", async () => {
    const r = await runCalc(axisB("1000000000", "50", "50", "25000000"));
    for (const p of props(r)) {
      expect(p.redevelopmentDetail.oneRightExemptionApplied).toBe(true);
      expect(p.determinedTax).toBe(0);
    }
  });

  it("고지 부정 짝 — 1인 분할취득에는 공유 지분 확인 필요 고지가 없다", async () => {
    const r = await runCalc(axisB("2000000000", "50", "50", "25000000"));
    const w = (r.json.data.aggregated.warnings as string[]).join("\n");
    expect(w).not.toMatch(NOTICE);
  });
});

describe("#11 ① 청산금 수령분 — 지분 모드 12억 비교·안분은 물건 전체 권리가액", () => {
  it("지분 50% · 권리가액 20억(물건 전체) — 청산금분 비율 0.4 안분 (수정 전: 지분 권리가액 10억 ≤ 12억 전액 비과세)", async () => {
    const r = await runCalc(recvForm("3000000000", "2000000000", HALF, "50000000"));
    expect(r.issues).toEqual([]);
    const d = r.result.redevelopmentDetail;
    expect(d.settlementExemptionApplied).toBeUndefined();
    expect(d.settlementHighValueAllocation.rightsValue).toBe(2_000_000_000);
    expect(d.settlementHighValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
    expect(d.settlementHighValueAllocation.taxableGain).toBeGreaterThan(0);
  });

  it("지분 청산금분 과세대상 = 단독의 절반(±1원)", async () => {
    const half = await runCalc(recvForm("3000000000", "2000000000", HALF, "50000000"));
    const sole = await runCalc(recvForm("3000000000", "2000000000", undefined, "100000000"));
    const h = half.result.redevelopmentDetail.settlementHighValueAllocation;
    const s = sole.result.redevelopmentDetail.settlementHighValueAllocation;
    expect(h.taxableRatio).toBeCloseTo(s.taxableRatio, 10);
    expect(Math.abs(h.taxableGain * 2 - s.taxableGain)).toBeLessThanOrEqual(2);
  });

  it("긍정 짝 — 물건 전체 권리가액 10억(지분 5억)은 12억 이하라 청산금분 전액 비과세", async () => {
    const r = await runCalc(recvForm("3000000000", "1000000000", HALF, "50000000"));
    expect(r.result.redevelopmentDetail.settlementExemptionApplied).toBe(true);
    expect(r.result.redevelopmentDetail.settlementHighValueAllocation).toBeUndefined();
  });

  it("경계 — 물건 전체 권리가액 정확히 12억은 비과세, 12억+1원은 안분", async () => {
    const at = await runCalc(recvForm("3000000000", "1200000000", HALF, "50000000"));
    expect(at.result.redevelopmentDetail.settlementExemptionApplied).toBe(true);
    const over = await runCalc(recvForm("3000000000", "1200000001", HALF, "50000000"));
    expect(over.result.redevelopmentDetail.settlementHighValueAllocation).toBeDefined();
  });

  it("청산금분에는 공유 입주권 고지가 붙지 않는다 (결정 조건: ② 공유 지분 양도에만)", async () => {
    const r = await runCalc(recvForm("3000000000", "2000000000", HALF, "50000000"));
    expect(r.result.warnings.join("\n")).not.toMatch(NOTICE);
  });
});

describe("#11 ④⑫⑭ — 물건 전체 권리가액 운반", () => {
  const mk = (over: Record<string, unknown>) =>
    redevAptForm({ assetOver: { redevRightsValue: "2000000000", ...over } }).assets[0] as AssetForm;

  it("④: 지분 모드에서만 rightsValueWhole(100% 값)을 싣고 rightsValue는 지분 스케일", () => {
    const p = buildRedevelopmentPayload(mk({}), 0.5);
    expect(p.rightsValue).toBe(1_000_000_000);
    expect(p.rightsValueWhole).toBe(2_000_000_000);
  });
  it("④: 단독 소유는 싣지 않는다", () => {
    const p = buildRedevelopmentPayload(mk({}), undefined);
    expect(p.rightsValue).toBe(2_000_000_000);
    expect("rightsValueWhole" in p).toBe(false);
  });
  it("⑫: Zod가 값을 제거하지 않는다 — 엔진 결과가 물건 전체 값을 읽는다(위 ① 시험이 route 경유로 확인)", async () => {
    const r = await runCalc(recvForm("3000000000", "2000000000", HALF, "50000000"));
    expect((r.body.redevelopment as Record<string, unknown>).rightsValueWhole).toBe(2_000_000_000);
  });
});

describe("#11 leaf — oneRightHighValueBase 우선순위", () => {
  const base = { transferPrice: 1_000_000_000 } as TransferTaxInput;
  it("부담부증여 증여가액 > 물건 전체 > 양도가액", () => {
    expect(oneRightHighValueBase({ ...base, burdenedGiftDenominator: 3_000_000_000, totalPropertyTransferPrice: 2_000_000_000 })).toBe(3_000_000_000);
    expect(oneRightHighValueBase({ ...base, totalPropertyTransferPrice: 2_000_000_000 })).toBe(2_000_000_000);
    expect(oneRightHighValueBase(base)).toBe(1_000_000_000);
  });
  it("0 값은 걸러낸다(??가 아니라 > 0 판정)", () => {
    expect(oneRightHighValueBase({ ...base, burdenedGiftDenominator: 0, totalPropertyTransferPrice: 0 })).toBe(1_000_000_000);
  });
});
