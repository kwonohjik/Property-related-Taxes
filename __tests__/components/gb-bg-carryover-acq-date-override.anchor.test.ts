/**
 * anchor — 일반건물 부담부증여 × 이월과세(F27) A 채택이면 신고서·상세명세서의 파트 카드 취득일이 당초 증여자 취득일이다 (PR-4)
 *
 * 엔진은 A에서 토지·건물 카드 보유기간을 당초 증여자 취득일부터 센다(§95④ 단서). 종전 표시는 폼 취득일(증여받은 날)이라
 * 「보유 1년 10월 · 장특공제율 22%」가 한 표에 같이 나왔다. 화면 단언은 E2E GBPB-E3·E4.
 */
import { describe, it, expect } from "vitest";
import { gbCarryoverAcqDateOverride } from "@/components/calc/results/transfer/FilingFormTableDateHelpers";
import type { AggregateTransferResult } from "@/lib/tax-engine/types/transfer-aggregate.types";

type Detail = NonNullable<AggregateTransferResult["burdenedGiftCarryoverDetail"]>;
const summary = (land: string, building: string) => ({ parts: [], landHoldingStartDate: land, buildingHoldingStartDate: building });
const detail = (over: Partial<Detail> = {}): Detail => ({
  isEligible: true, applicablePeriodYears: 10, adoptedScenario: "A", determinedTaxA: 2, determinedTaxB: 1,
  donorAcquisitionDate: new Date("2015-01-01"), giftTaxAmount: 0,
  scenarioA: summary("2015-01-01", "2016-02-02"), scenarioB: summary("2024-05-01", "2024-05-01"),
  ...over,
});

describe("gbCarryoverAcqDateOverride", () => {
  it("A 채택: 토지 카드 3종 → 토지 기산일 · 원건물 카드 → 건물 기산일 · 지분 접미사도 벗긴다", () => {
    for (const pid of ["land", "land_business", "land_nbl", "land#1"]) expect(gbCarryoverAcqDateOverride(detail(), pid)).toBe("2015-01-01");
    for (const pid of ["building", "building1"]) expect(gbCarryoverAcqDateOverride(detail(), pid)).toBe("2016-02-02");
  });

  it("덮지 않는다: B 채택 · echo 없음 · 요약 없는 옛 결과 · 증축 카드 · GB 카드가 아닌 열", () => {
    expect(gbCarryoverAcqDateOverride(detail({ adoptedScenario: "B" }), "land")).toBeUndefined();
    expect(gbCarryoverAcqDateOverride(undefined, "land")).toBeUndefined();
    expect(gbCarryoverAcqDateOverride(detail({ scenarioA: undefined }), "land")).toBeUndefined();
    expect(gbCarryoverAcqDateOverride(detail(), "building2")).toBeUndefined();
    expect(gbCarryoverAcqDateOverride(detail(), "primary")).toBeUndefined();
  });
});
