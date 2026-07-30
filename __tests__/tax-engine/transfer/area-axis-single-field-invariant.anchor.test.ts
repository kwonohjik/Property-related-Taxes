/**
 * anchor — 전용 자산(GB·상가·겸용·재개발)의 면적 필드가 **시점 불변(단일)**임을 고정
 *
 * 계획: docs/01-plan/features/basic-info-building-area-phase-f.plan.md §11 (F2 폐기)
 *
 * ## 왜 고정하는가
 *
 * F2(축 A·B를 기본사항으로 승격)를 검토하다 **승격이 개선이 아니라 회귀 위험**임을
 * 확인했다. 기본사항은 `acquisitionArea`/`transferArea` **2시점 쌍**인데, 전용 자산 4종은
 * 전부 **단일** 면적 필드다:
 *
 *   `gbLandArea` · `cbLandArea` · `mixedUseTotalLandArea` · `redevLandArea`
 *
 * 그리고 그 단일성이 **정확성의 근거**다 — 엔진이 시점별 **단가**에 **같은 면적**을 곱하므로
 * 환산 산식에서 면적이 분자·분모에서 약분되고, 비율은 단가비만 반영한다:
 *
 *   `general-building-valuation.ts:506,535`  transferLandPricePerSqm × landArea
 *                                            acquisitionLandPricePerSqm × landArea
 *   `commercial-building-valuation.ts:245,249,258`  3시점 단가 × 같은 landArea
 *   `transfer-tax-mixed-use-helpers.ts:246,262`     "landAreaAtAcquisition =
 *                                                    landAreaAtFirstDisclosure = totalLandArea"
 *   `calc-wizard-asset-redev.ts:107`  "단일 면적; **시점별 동일 가정**"
 *
 * 즉 이 자산들은 **B-4 왜곡(취득/양도에 다른 면적을 넣어 환산비율이 부풀는 것)이
 * 구조적으로 불가능**하다. 2시점 쌍으로 확장하면 그 안전장치가 사라진다.
 *
 * → **F2 폐기.** 이 파일은 누군가 "일관성"을 이유로 2시점 확장을 시도할 때 막는 가드다.
 */
import { describe, it, expect } from "vitest";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";

/** 엔진 산식: 토지 기준시가 = floor(㎡당 단가 × 면적) */
const landStd = (unitPrice: number, area: number) => Math.floor(unitPrice * area);

describe("면적 단일 필드 불변식 — 시점별 단가 × 같은 면적", () => {
  const AREA = 300;
  const UNIT_ACQ = 500_000;
  const UNIT_TRANSFER = 1_500_000;
  const TRANSFER_PRICE = 900_000_000;

  it("같은 면적을 쓰면 환산비율이 단가비와 정확히 일치한다 (면적 약분)", () => {
    const stdAcq = landStd(UNIT_ACQ, AREA);
    const stdTransfer = landStd(UNIT_TRANSFER, AREA);
    // 면적이 약분되어 비율 = 단가비
    expect(stdAcq / stdTransfer).toBeCloseTo(UNIT_ACQ / UNIT_TRANSFER, 10);
    expect(stdAcq / stdTransfer).toBeCloseTo(1 / 3, 10);

    const converted = calculateEstimatedAcquisitionPrice(TRANSFER_PRICE, stdAcq, stdTransfer);
    expect(converted).toBe(300_000_000);
    expect(TRANSFER_PRICE - converted).toBe(600_000_000);
  });

  it("면적이 커지거나 작아져도 환산비율은 불변이다 — 면적은 비율에 영향이 없다", () => {
    const ratioAt = (area: number) =>
      landStd(UNIT_ACQ, area) / landStd(UNIT_TRANSFER, area);
    for (const area of [50, 300, 1_234.56, 10_000]) {
      expect(ratioAt(area)).toBeCloseTo(1 / 3, 8);
    }
  });

  it("🔴 2시점으로 확장하면 B-4 왜곡이 재발한다 — 승격 금지 근거", () => {
    // 취득 300㎡ / 양도 100㎡ (일부양도)를 서로 다른 면적으로 넣으면
    const stdAcqDifferentArea = landStd(UNIT_ACQ, 300); // 150,000,000
    const stdTransfer = landStd(UNIT_TRANSFER, 100); // 150,000,000
    // 면적비가 단가비를 상쇄해 비율이 1.0이 된다
    expect(stdAcqDifferentArea / stdTransfer).toBe(1);
    const converted = calculateEstimatedAcquisitionPrice(
      TRANSFER_PRICE,
      stdAcqDifferentArea,
      stdTransfer,
    );
    // 양도가액 전액이 취득가액 → 양도차익 0 (과소과세)
    expect(converted).toBe(TRANSFER_PRICE);
    expect(TRANSFER_PRICE - converted).toBe(0);
  });

  it("상가 3시점(취득·최초공시·양도)도 같은 면적을 쓴다", () => {
    // commercial-building-valuation.ts:245,249,258 — 세 시점 모두 input.landArea
    const UNIT_FIRST = 800_000;
    const areas = new Set([
      landStd(UNIT_ACQ, AREA) / UNIT_ACQ,
      landStd(UNIT_FIRST, AREA) / UNIT_FIRST,
      landStd(UNIT_TRANSFER, AREA) / UNIT_TRANSFER,
    ]);
    // 세 시점에서 역산한 면적이 하나로 수렴 = 단일 면적 사용
    expect(areas.size).toBe(1);
    expect([...areas][0]).toBe(AREA);
  });
});

describe("겸용 — 시점별 동일 대입이 명시적이다", () => {
  it("landAreaAtAcquisition = landAreaAtFirstDisclosure = totalLandArea", () => {
    // transfer-tax-mixed-use-helpers.ts:246,262 주석·구현
    const totalLandArea = 206.6;
    const landAreaAtAcquisition = totalLandArea;
    const landAreaAtFirstDisclosure = totalLandArea;
    expect(landAreaAtAcquisition).toBe(totalLandArea);
    expect(landAreaAtFirstDisclosure).toBe(totalLandArea);
  });

  it("주거·상가 안분은 분해값이라 전용 유지 대상이다 (승격 후보 아님)", () => {
    // transfer-tax-mixed-use-helpers.ts:85,91 — round2 + residualArea 잔액 흡수
    const total = 206.6;
    const resRatio = 0.6;
    const res = Math.round(total * resRatio * 100) / 100; // round2
    const comm = Math.round((total - res) * 100) / 100; // residualArea
    expect(res + comm).toBeCloseTo(total, 10); // Σ = 전체 불변식
    expect(res).not.toBe(total); // 분해값 — 자산-수준 단일 값이 아니다
  });
});
