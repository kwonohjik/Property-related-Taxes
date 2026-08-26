/**
 * anchor — E1-04 : ⑧ validate 통과 ↔ ⑫ Zod 400 **dead-end**.
 *
 * ## 결함
 *
 * 사례 39(단독주택 출자 §166③ 2-point 환산) 전용 refine의 활성 조건이 **청산금 방향을 보지
 * 않았다**. 같은 분기를 판정하는 네 지점 중 ⑫만 축이 하나 적었다:
 *
 * | 지점 | 술어 |
 * |---|---|
 * | 엔진 dispatch (`redevelopment.ts`) | housing + right + **receive** + estimated + PHD 2필드>0 |
 * | ⑤ UI (`isHousingContribEstimatedBranch`) | housing + right + **receive** + estimated |
 * | ⑧ validate (`isHousingRightReceiveEstimated`) | housing + right + **receive** + estimated |
 * | ⑫ Zod refine | housing + right + estimated ← **receive 없음** |
 *
 * 그래서 청산금 **납부** 조합에서 ⑤는 일반 환산 카드를 렌더하고 ⑧은 통과시키는데,
 * ⑫가 `housingStdPriceAtAcq`·`housingStdPriceAtApproval`을 요구하며 400을 낸다.
 * 그 두 필드의 입력 UI(`HousingContribEstimatedSection`)는 `receive`에서만 렌더되므로
 * 사용자는 **요구받은 값을 입력할 화면 자체가 없다** — 완전한 dead-end다.
 *
 * 세액 오류가 아니라 **계산 자체가 차단**된다. 사례 37(토지 출자 + 납부 + 환산)의 주택 출자
 * 대응 케이스가 통째로 사용 불가였다.
 */
import { describe, it, expect } from "vitest";
import { propertySchema } from "@/lib/api/transfer-tax-schema";

/** propertySchema의 필수 필드 — 하나라도 빠지면 parse가 통째로 실패한다. */
function parseWith(redevelopment: Record<string, unknown>) {
  return propertySchema.safeParse({
    propertyType: "right_to_move_in",
    transferPrice: 900_000_000,
    acquisitionPrice: 0,
    transferDate: "2024-06-01",
    acquisitionDate: "2010-04-09",
    expenses: 0,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isOneHousehold: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    redevelopment,
  });
}

const baseRedev = {
  subject: "right" as const,
  approvalLawBasis: "urban_renovation_art_74" as const,
  approvalDate: "2018-10-23",
  rightsValue: 500_000_000,
  settlementAmount: 100_000_000,
  preApprovalExpenses: 0,
  postApprovalExpenses: 0,
  originalAssetType: "housing" as const,
  // 일반 환산 카드가 렌더하는 값들 (§166③ 분모 D + 취득당시 라목값)
  managementDisposalHousingPrice: 200_000_000,
  acquisitionHousingPrice: 120_000_000,
};

function issuePaths(r: ReturnType<typeof parseWith>): string[] {
  return r.success ? [] : r.error.issues.map((i) => i.path.join("."));
}

describe("E1-04 anchor — §166③ 2-point refine은 청산금 수령에서만 요구한다", () => {
  it("🔑 청산금 **납부** + 환산 → §164⑤ 2필드를 요구하지 않는다 (dead-end 해소)", () => {
    const r = parseWith({ ...baseRedev, settlementDirection: "pay" });
    expect(issuePaths(r)).not.toContain("redevelopment.housingStdPriceAtAcq");
    expect(issuePaths(r)).not.toContain("redevelopment.housingStdPriceAtApproval");
  });

  it("청산금 **수령** + 환산 → 종전대로 2필드 필수 (회귀 가드)", () => {
    const r = parseWith({ ...baseRedev, settlementDirection: "receive" });
    expect(issuePaths(r)).toContain("redevelopment.housingStdPriceAtAcq");
    expect(issuePaths(r)).toContain("redevelopment.housingStdPriceAtApproval");
  });

  it("청산금 수령 + 환산 + 2필드 입력 → 통과", () => {
    const r = parseWith({
      ...baseRedev,
      settlementDirection: "receive",
      housingStdPriceAtAcq: 120_000_000,
      housingStdPriceAtApproval: 200_000_000,
    });
    expect(r.success).toBe(true);
  });

  it("실가 모드는 방향과 무관하게 요구하지 않는다", () => {
    for (const settlementDirection of ["pay", "receive"] as const) {
      const r = propertySchema.safeParse({
        propertyType: "right_to_move_in",
        transferPrice: 900_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: "2024-06-01",
        acquisitionDate: "2010-04-09",
        expenses: 0,
        householdHousingCount: 1,
        residencePeriodMonths: 0,
        useEstimatedAcquisition: false,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isOneHousehold: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        redevelopment: { ...baseRedev, settlementDirection },
      });
      expect(issuePaths(r)).not.toContain("redevelopment.housingStdPriceAtAcq");
    }
  });

  it("토지 출자는 §166③ 분기가 아니다 (originalAssetType 축 회귀 가드)", () => {
    const r = parseWith({
      ...baseRedev,
      originalAssetType: "land",
      settlementDirection: "receive",
      landStdPriceAtAcq: 100_000_000,
      landStdPriceAtApproval: 150_000_000,
    });
    expect(issuePaths(r)).not.toContain("redevelopment.housingStdPriceAtAcq");
  });
});
