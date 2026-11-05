/**
 * anchor — §99 신축주택취득기간 「시작 전」 분기 × 조항 기준일 축 (리뷰 NH-77).
 *
 * 조특법 §99①은 1호(자기가 건설한 주택)를 **사용승인·사용검사일**로, 2호(주택건설사업자로부터 취득)를
 * **최초 매매계약·계약금 납부일**로 신축주택취득기간(1998.5.22.~1999.6.30.)에 넣는다(KoreanLaw 현행 본문 2026-11-05).
 * 종전 테스트(R7·R3·R5)는 기간 「종기 후」와 2호 계약일 필수만 덮어, 「시작 전」 분기가 **어느 날짜를 기준으로**
 * 갈리는지는 고정돼 있지 않았다 — 1호에서 계약일을, 2호에서 사용승인일을 읽어도 초록이었다.
 *
 * 각 시료는 두 날짜를 기간 경계의 **반대편**에 두어, 엉뚱한 축을 읽으면 판정이 뒤집히게 했다.
 */
import { describe, it, expect } from "vitest";
import { evaluateNew99, NEW_99_PERIOD_START, type New99Input } from "@/lib/tax-engine/transfer-reductions/new-99";

const D = (s: string) => new Date(s);

function input(overrides: Partial<New99Input>): New99Input {
  return {
    transferDate: D("2006-01-01"),
    acquisitionDate: D("1999-03-01"),
    transferIncome: 100_000_000,
    standardPriceAtAcquisition: 100_000_000,
    standardPriceAt5Years: 160_000_000,
    standardPriceAtTransfer: 250_000_000,
    wholePropertyTransferPrice: 500_000_000,
    exclusiveAreaSqm: 84,
    ...overrides,
  };
}
const codes = (i: New99Input) => evaluateNew99(i).ineligibleReasons.map((r) => r.code);

describe("NH-77 §99 신축주택취득기간 시작 전 — 1호는 사용승인일 축", () => {
  it("기준: 시작일 상수 = 1998.5.22.", () => {
    expect(NEW_99_PERIOD_START.getTime()).toBe(D("1998-05-22").getTime());
  });
  it("🔴 사용승인 1998.5.21.(시작 전날) · 계약일은 기간 안 → 기간 외 (계약일을 읽으면 통과해 버린다)", () => {
    const i = input({ acquisitionType: "self_built", usageApprovalDate: D("1998-05-21"), contractDate: D("1998-09-01") });
    expect(codes(i)).toEqual(["OUT_OF_ACQUISITION_PERIOD"]);
    expect(evaluateNew99(i).ineligibleReasons[0].message).toContain("사용승인일");
  });
  it("🟢 사용승인 1998.5.22.(시작일) · 계약일은 시작 전 → 적용 (경계 포함 · 계약일을 읽으면 배제된다)", () => {
    const r = evaluateNew99(input({ acquisitionType: "self_built", usageApprovalDate: D("1998-05-22"), contractDate: D("1998-05-01") }));
    expect(r.isEligible).toBe(true);
    expect(r.reducibleTransferIncome).toBe(40_000_000);
  });
});

describe("NH-77 §99 신축주택취득기간 시작 전 — 2호는 매매계약일 축", () => {
  it("🔴 계약 1998.5.21.(시작 전날) · 사용승인은 기간 안 → 기간 외 (사용승인일을 읽으면 통과해 버린다)", () => {
    const i = input({ acquisitionType: "from_builder", contractDate: D("1998-05-21"), usageApprovalDate: D("1998-09-01") });
    expect(codes(i)).toEqual(["OUT_OF_ACQUISITION_PERIOD"]);
    expect(evaluateNew99(i).ineligibleReasons[0].message).toContain("매매계약일");
  });
  it("🟢 계약 1998.5.22.(시작일) · 사용승인은 시작 전 → 적용 (경계 포함 · 사용승인일을 읽으면 배제된다)", () => {
    const r = evaluateNew99(input({ acquisitionType: "from_builder", contractDate: D("1998-05-22"), usageApprovalDate: D("1998-05-01") }));
    expect(r.isEligible).toBe(true);
    expect(r.reducibleTransferIncome).toBe(40_000_000);
  });
});
