/**
 * R3 구조적 결함 수정 anchor (2026-07-17)
 *
 * R3-03: 조정지역 3억↑ 주택 증여 §13의2② 12% 중과가 오케스트레이터 배선누락으로
 *        항상 미발동하던 버그. assessSurcharge 호출에 standardValue를 전달하지 않아
 *        assessGiftSurcharge의 stdValue가 항상 0(3억 미만)으로 읽혀 12%가 안 붙었다.
 *        UI(Step3)는 wholeHouseStandardValue를 다주택 저가배제 토글에서만 노출 →
 *        단일주택 증여는 필드 미렌더 → standardValue fallback으로 판정해야 한다.
 *
 * R3-04: determineTaxBase가 isRelatedParty 분기를 무상취득(상속·증여) 분기보다 먼저
 *        평가해, 상속+특수관계인+감정가 입력 시 §10의3②(유상 부당행위) 경로로
 *        오라우팅되어 §10의2②1호(상속 = 시가표준액 강제)를 우회하던 버그.
 */

import { describe, it, expect } from "vitest";
import { calcAcquisitionTax } from "../../../lib/tax-engine/acquisition-tax";
import type { AcquisitionTaxInput } from "../../../lib/tax-engine/types/acquisition.types";

describe("[AT-R3-03] 증여 §13의2② 12% 중과 배선 — standardValue fallback", () => {
  it("[AT-R3-03-01] 단일주택 증여 조정지역 5억(3억↑) — wholeHouseStandardValue 미입력이어도 12% 발동", () => {
    const input = {
      propertyType: "housing",
      acquisitionCause: "gift",
      reportedPrice: 0,
      standardValue: 500_000_000, // 시가표준액 5억 (§13의2② 3억 이상)
      // wholeHouseStandardValue 의도적 미설정 — 단일주택 증여는 UI가 필드를 렌더하지 않음
      acquiredBy: "individual",
      giftorRelation: "other",
      giftorIs1HHHolder: false,
      houseCountAfter: 1,
      isRegulatedArea: true,
      isMetropolitanRegion: true,
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    // 정답: §13의2② 12% → 5억 × 12% = 60,000,000 (버그 시 3.5% = 17,500,000)
    expect(r.isSurcharged).toBe(true);
    expect(r.acquisitionTax).toBe(60_000_000);
  });

  it("[AT-R3-03-02] 3억 미만(2억) 단일주택 증여 조정지역 — 12% 미발동(정상)", () => {
    const input = {
      propertyType: "housing",
      acquisitionCause: "gift",
      reportedPrice: 0,
      standardValue: 200_000_000, // 3억 미만 → 중과 대상 아님
      acquiredBy: "individual",
      giftorRelation: "other",
      giftorIs1HHHolder: false,
      houseCountAfter: 1,
      isRegulatedArea: true,
      isMetropolitanRegion: true,
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    // 증여 표준율 3.5% → 2억 × 3.5% = 7,000,000
    expect(r.acquisitionTax).toBe(7_000_000);
  });
});

describe("[AT-R3-04] 상속+특수관계인 — §10의2②1호 시가표준액 강제 유지", () => {
  it("[AT-R3-04-01] 상속 주택 + 특수관계인 ON + 감정가 8억 — 과세표준은 시가표준액 5억(감정가 우회 차단)", () => {
    const input = {
      propertyType: "housing",
      acquisitionCause: "inheritance",
      reportedPrice: 0,
      standardValue: 500_000_000, // 시가표준액 5억
      marketValue: 800_000_000, // 감정가(시가인정액) 8억
      isRelatedParty: true, // 특수관계인 거래 토글 ON (상속은 피상속인↔상속인 특수관계)
      acquiredBy: "individual",
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    // 상속은 §10의2②1호로 시가표준액 강제 — 감정가 8억이 아니라 5억
    expect(r.taxBase).toBe(500_000_000);
    expect(r.taxBaseMethod).not.toBe("recognized_market");
  });

  it("[AT-R3-04-guard] 유상 매매 + 특수관계인 + 신고가 시가 70%↓ — 시가인정액 과세 유지(부당행위 정상 동작 불변)", () => {
    const input = {
      propertyType: "land",
      acquisitionCause: "purchase",
      reportedPrice: 300_000_000, // 신고가 3억 (시가 8억의 70%=5.6억 미만 → 비정상)
      standardValue: 500_000_000,
      marketValue: 800_000_000,
      isRelatedParty: true,
      acquiredBy: "individual",
      balancePaymentDate: "2024-06-01",
    } as AcquisitionTaxInput;

    const r = calcAcquisitionTax(input);
    // 유상 부당행위는 §10의3②로 시가인정액 8억 과세 — R3-04 수정에 영향받지 않음
    expect(r.taxBase).toBe(800_000_000);
    expect(r.taxBaseMethod).toBe("recognized_market");
  });
});
