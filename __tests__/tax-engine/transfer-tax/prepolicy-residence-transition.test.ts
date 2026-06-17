/**
 * §154① 본문 거주요건 경과규정 — 2017.8.3 이전 취득 조정대상지역 주택 거주요건 면제.
 *
 * 근거: 소득세법 시행령 §154① 부칙(대통령령 제28293호) 적용례 — 거주요건은 2017.8.3 이후
 *       취득하는 주택부터 적용. 그 이전 취득분은 (조정대상지역이라도) 거주요건 면제.
 *       데이터: one_house_exemption.prePolicyDate="2017-08-03" · prePolicyExemptResidence=true.
 *
 * 버그(수정 전): meetsResidence의 (isPrePolicy && !wasRegulatedAtAcquisition) 절이 앞 절의
 *   부분집합이라 죽은 코드 + prePolicyExemptResidence config 미사용 → prePolicy 조정취득 +
 *   거주<2년이 과세로 부당 처리. 조정지역은 2016.11.3부터 지정 → 조합 실재.
 *
 * 이월과세 상호작용: §97의2는 필요경비(취득가액) 계산 특례 → 거주요건의 "취득시기"는
 *   수증자 실제 취득일 기준(carryover의 acquisitionDate=증여자 교체와 분리).
 *   → residenceTransitionAcquisitionDate(수증자 실제일)로 isPrePolicy 판정.
 *   이월과세 회귀는 carryover-pdf-case24.test.ts가 가드.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput as baseInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const T = new Date("2024-06-01");

describe("§154① 거주요건 경과규정 (2017.8.3 이전 취득 거주면제)", () => {
  // PR-A: 2017.8.3 이전 조정취득 + 거주0 + 보유충족 → 거주면제로 비과세 (수정 전 RED)
  it("PR-A: 2017.1.1 조정취득 + 거주0 + 보유7년 → 비과세", () => {
    const r = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2017-01-01"), // < 2017-08-03 (prePolicy)
        residencePeriodMonths: 0,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });

  // PR-B: 2017.8.3 이후 조정취득 + 거주0 → 거주요건 적용 → 과세 (대조군)
  it("PR-B: 2018.1.1 조정취득 + 거주0 → 과세 (거주요건 적용)", () => {
    const r = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2018-01-01"), // >= 2017-08-03
        residencePeriodMonths: 0,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
  });

  // PR-C: prePolicy 조정취득 거주면제로 요건 충족 → 고가주택(13억)은 12억 초과분만 부분과세
  it("PR-C: 2017.1.1 조정취득 + 거주0 + 13억 → 고가주택 부분과세(taxableGain 안분)", () => {
    const r = calculateTransferTax(
      baseInput({
        transferPrice: 1_300_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2017-01-01"),
        residencePeriodMonths: 0,
        isRegulatedArea: true,
        wasRegulatedAtAcquisition: true,
        isOneHousehold: true,
        householdHousingCount: 1,
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
    // 거주면제로 1세대1주택 요건 충족 → (13억-3억)×(13억-12억)/13억 = 76,923,076 안분
    expect(r.taxableGain).toBe(76_923_076);
  });

  // PR-D: 비조정 prePolicy는 무관하게 비과세 (회귀 — 절A가 처리)
  it("PR-D: 2017.1.1 비조정취득 + 거주0 → 비과세 (거주요건 무관)", () => {
    const r = calculateTransferTax(
      baseInput({
        transferPrice: 500_000_000,
        acquisitionPrice: 300_000_000,
        transferDate: T,
        acquisitionDate: new Date("2017-01-01"),
        residencePeriodMonths: 0,
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isOneHousehold: true,
        householdHousingCount: 1,
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
  });
});
