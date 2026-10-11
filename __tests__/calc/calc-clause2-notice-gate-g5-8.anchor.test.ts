/**
 * G5-8 anchor — 계산기 §89② 3년 경과 예외 미선언 고지는 **결론을 가를 때만** 낸다(판정 메뉴 `coreWouldPass` 게이트와 같은 정책).
 *
 *  A  2024 양도(2023.2.28. 이후 — 구 §167의11①1호 시대 아님) · 본체(§154① 거주요건) 과세 → 선언해도 비과세도 중과 배제도 안 바뀐다 → 고지 없음.
 *  B  본체 통과 · 미선언 때문에만 과세 → 고지 유지(긍정 짝).
 *  C  2022-03-02 양도 · 강남 고가 · 본체 과세 → 구 §167의11①1호(「제156조의2제3항부터 제5항까지 … 따라」, MST 240685)는 본체와 무관하게
 *     의제를 받아 선언이 중과 배제를 바꾼다(미선언 1,141,772,500 대 ④ 선언 701,002,500 — 리뷰 실측) → 고지 유지.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("anchor: fallback")) };
});

import { newForm, runCalc } from "./_one-house-pr3a-calc-route";
import { article89Clause2Notices, surchargeDeclarationMatters } from "@/lib/tax-engine/transfer-tax-89-2-consequences";

function calcForm(opts: { regulated: boolean; transferDate?: string; price?: string; declared?: boolean; rights?: boolean }) {
  const f = newForm();
  f.transferDate = opts.transferDate ?? "2024-06-01";
  f.isOneHousehold = true;
  f.householdHousingCount = "1";
  f.householdNoOtherHousesConfirmed = true;
  f.contractTotalPrice = opts.price ?? "900000000";
  f.residencePeriodMonths = "0";
  f.isRegulatedArea = false;
  f.wasRegulatedAtAcquisition = opts.regulated;
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2019-06-01",
    actualSalePrice: opts.price ?? "900000000", fixedAcquisitionPrice: "500000000", addressJibun: "테스트 주소 1",
    regionCode: opts.regulated ? "1168010100" : "4311000000",
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  });
  if (opts.rights !== false) {
    f.presaleRights = [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2020-07-01", region: "capital", memberOrigin: "successor", managementDisposalApprovalDate: "2019-01-01" } as never];
  } else {
    f.presaleRights = [];
  }
  if (opts.declared) f.rightThreeYearExceptionKind = "none";
  return f;
}
const undeclared = (w: string[] = []) => w.filter((s) => s.includes("3년 경과 예외") || s.includes("해당 여부를 선언하지 않아"));

describe("G5-8 계산기 미선언 고지 게이트", () => {
  it("A 본체도 과세(2023.2.28. 이후) → 고지 없음", async () => {
    const c = await runCalc(calcForm({ regulated: true }));
    expect(c.status).toBe(200);
    expect(c.issues).toEqual([]);
    expect(c.r.isExempt).toBe(false);
    expect(undeclared(c.r.warnings)).toEqual([]);
  });
  it("A의 세액은 선언해도 같다 — 군더더기 암시일 뿐 결론이 아니다", async () => {
    const a = await runCalc(calcForm({ regulated: true }));
    const e = await runCalc(calcForm({ regulated: true, declared: true }));
    const f = await runCalc(calcForm({ regulated: true, rights: false }));
    expect(e.r.totalTax).toBe(a.r.totalTax);
    expect(f.r.totalTax).toBe(a.r.totalTax);
  });
  it("B 본체 통과 · 미선언 때문에만 과세 → 고지 유지 (긍정 짝)", async () => {
    const c = await runCalc(calcForm({ regulated: false }));
    expect(c.status).toBe(200);
    expect(c.r.isExempt).toBe(false);
    expect(undeclared(c.r.warnings)).toHaveLength(1);
  });
});

describe("G5-8 C — 구 §167의11①1호 시대(2023.2.28. 전) 중과: 선언이 세액을 바꾸므로 고지 유지", () => {
  const oldEra = (declare: boolean) => {
    const f = calcForm({ regulated: true, transferDate: "2022-03-02", price: "2000000000" });
    f.presaleRights = [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2019-02-01", region: "capital", memberOrigin: "successor", managementDisposalApprovalDate: "2018-01-01" } as never];
    if (declare) Object.assign(f, { rightThreeYearExceptionKind: "before_completion", rightMovedInWithin3Years: true, rightResidedOneYearOrMore: true });
    return f;
  };
  it("미선언 → 고지 + 선언 시 세액이 달라진다 (게이트가 이 고지를 지우면 안 되는 이유)", async () => {
    const undeclaredRun = await runCalc(oldEra(false));
    const declaredRun = await runCalc(oldEra(true));
    expect(undeclaredRun.status).toBe(200);
    expect(undeclaredRun.issues).toEqual([]);
    expect(undeclared(undeclaredRun.r.warnings)).toHaveLength(1);
    expect(declaredRun.r.totalTax).not.toBe(undeclaredRun.r.totalTax);
  });
});

describe("G5-8 게이트 leaf", () => {
  const clause2 = { status: "excluded", undeclaredArticles: ["소득세법 시행령 §156의2 ④"], confirmNotes: ["원조합원 미입력"] } as never;
  const call = (gate: { coreWouldPass: boolean; surchargeDeclarationMatters: boolean }) =>
    article89Clause2Notices(clause2, false, new Date("2024-06-01"), gate);
  it("본체도 과세이고 중과도 안 바뀌면 미선언·확인 필요 고지를 모두 내지 않는다", () => {
    expect(call({ coreWouldPass: false, surchargeDeclarationMatters: false })).toEqual([]);
  });
  it("본체가 통과하면 미선언·확인 필요 두 갈래 모두 낸다", () => {
    expect(call({ coreWouldPass: true, surchargeDeclarationMatters: false })).toHaveLength(2);
  });
  it("중과 배제가 바뀌면(구 §167의11①1호 시대 + 중과 대상) 본체와 무관하게 낸다 — 정당한 고지를 지우지 않는다", () => {
    expect(call({ coreWouldPass: false, surchargeDeclarationMatters: true })).toHaveLength(2);
  });
  it("surchargeDeclarationMatters: 2023.2.28. 전 양도 × 중과 적용일 때만 참", () => {
    expect(surchargeDeclarationMatters(new Date("2022-03-02"), true)).toBe(true);
    expect(surchargeDeclarationMatters(new Date("2022-03-02"), false)).toBe(false);
    expect(surchargeDeclarationMatters(new Date("2022-03-02"), undefined)).toBe(false);
    expect(surchargeDeclarationMatters(new Date("2023-02-27"), true)).toBe(true);
    expect(surchargeDeclarationMatters(new Date("2023-02-28"), true)).toBe(false);
  });
  it("판정 보류(undetermined)·사후관리 고지는 게이트와 무관하다", () => {
    const und = article89Clause2Notices({ status: "undetermined", openArticles: ["소득세법 시행령 §156의2 ⑥·⑦"] } as never, false, new Date("2024-06-01"), {
      coreWouldPass: false, surchargeDeclarationMatters: false,
    });
    expect(und).toHaveLength(1);
  });
});
