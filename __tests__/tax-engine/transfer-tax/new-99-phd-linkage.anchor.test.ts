// Phase 1 Pre-Do anchor — §99 신축주택 감면 PHD 환산 → 5년 안분 연동
//
// 목적: 감면소득금액 차감 조문의 기준시가 조회형 + PHD 통일(계획서
//   docs/02-design/features/reduction-stdprice-lookup-phd-unification.plan.md) Do 진입 전,
//   §99 엔진(evaluateNew99)이 PHD 환산 취득기준시가(calcReductionAcquisitionStdPrice)를
//   standardPriceAtAcquisition으로 받아 올바른 5년 후 안분을 산출함을 입증한다.
//
// 핵심 결론: §99 엔진은 이미 취득기준시가를 받아 안분한다(무변경). PHD 환산값을
//   그 필드에 투입하면 자동으로 반영된다 → 남은 작업은 UI/API 배선(환산값→취득기준시가 전달)뿐.
//   (실패 시 = 엔진이 PHD 환산값을 안분에 반영하지 못함 → 계획서 "엔진 무변경" 전제 재검토 신호)
//
// 값 근거: 이미지53 §99의3 PHD 예시값 재사용 (§164⑤ 환산, phd-helper.ts).
import { describe, it, expect } from "vitest";
import { evaluateNew99, type New99Input } from "@/lib/tax-engine/transfer-reductions/new-99";
import { calcReductionAcquisitionStdPrice } from "@/lib/tax-engine/transfer-reductions/phd-helper";

describe("Phase 1 anchor — §99 PHD 환산 → 5년 안분 연동", () => {
  // 이미지53 §99의3 PHD 예시값 (취득 < 최초공시 — 최초공시 전 취득 환산)
  const phd = calcReductionAcquisitionStdPrice({
    firstDisclosurePrice: 540_000_000,
    landAreaSqm: 16.36,
    landPricePerSqmAtAcquisition: 1_640_000,
    landPricePerSqmAtFirstDisclosure: 1_640_000,
    buildingStdPriceAtAcquisition: 119_246_400,
    buildingStdPriceAtFirstDisclosure: 117_374_400,
  });

  it("A-1: PHD 환산 취득시 추정 공동주택가격 = 547,010,030 (§164⑤ · 이미지53 일치)", () => {
    // Sum_A = floor(1,640,000×16.36)+119,246,400 = 146,076,800
    // Sum_F = floor(1,640,000×16.36)+117,374,400 = 144,204,800
    // P_A_est = floor(540,000,000 × 146,076,800 / 144,204,800)
    expect(phd.estimatedAcquisitionStdPrice).toBe(547_010_030);
  });

  it("A-2: 환산 취득기준시가를 §99 5년 후 안분에 투입 → reducibleTransferIncome = 130,023,498", () => {
    const input: New99Input = {
      transferDate: new Date("2006-01-01"), // 취득 1999.3 + 5년 초과 → 안분(§99①2호)
      acquisitionDate: new Date("1999-03-01"),
      contractDate: new Date("1998-09-01"), // 신축주택취득기간(1998.5.22~1999.6.30) 내
      transferIncome: 300_000_000,
      standardPriceAtAcquisition: phd.estimatedAcquisitionStdPrice, // ← PHD 환산값 투입
      standardPriceAt5Years: 700_000_000,
      standardPriceAtTransfer: 900_000_000,
      transferPrice: 500_000_000, // 고가주택 배제 회피(6억 이하)
      exclusiveAreaSqm: 84,
      acquisitionType: "from_builder",
    };
    const r = evaluateNew99(input);
    expect(r.isEligible).toBe(true);
    expect(r.isWithin5Years).toBe(false);
    expect(r.signCase).toBe("all_positive");
    // 안분 = floor(300,000,000 × (700,000,000−547,010,030) ÷ (900,000,000−547,010,030))
    //      = floor(300,000,000 × 152,989,970 ÷ 352,989,970) = 130,023,498
    expect(r.fiveYearRatio).toBeCloseTo(152_989_970 / 352_989_970, 10);
    expect(r.reducibleTransferIncome).toBe(130_023_498);
  });

  it("A-3: PHD 환산 미적용(수동 취득기준시가) 대비 — 환산값이 취득기준시가에 반영됨을 확인", () => {
    // 동일 조건에서 취득기준시가만 다르게(수동 500,000,000) 넣으면 안분 결과가 달라져야 함
    // → 취득기준시가가 안분 산식의 실질 인자임을 입증(PHD 환산값 전달의 정당성)
    const base: New99Input = {
      transferDate: new Date("2006-01-01"),
      acquisitionDate: new Date("1999-03-01"),
      contractDate: new Date("1998-09-01"),
      transferIncome: 300_000_000,
      standardPriceAt5Years: 700_000_000,
      standardPriceAtTransfer: 900_000_000,
      transferPrice: 500_000_000,
      exclusiveAreaSqm: 84,
      acquisitionType: "from_builder",
      standardPriceAtAcquisition: 500_000_000, // 수동
    };
    const manual = evaluateNew99(base);
    const phdApplied = evaluateNew99({ ...base, standardPriceAtAcquisition: phd.estimatedAcquisitionStdPrice });
    // 취득기준시가 500M(수동) vs 547.01M(PHD) → 안분 결과 상이
    expect(manual.reducibleTransferIncome).not.toBe(phdApplied.reducibleTransferIncome);
    expect(phdApplied.reducibleTransferIncome).toBe(130_023_498);
  });
});
