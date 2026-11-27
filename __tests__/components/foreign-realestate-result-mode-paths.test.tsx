/** @vitest-environment jsdom */
/**
 * result.mode === "foreign"이 결과 store·이력·교차 계산 경로에서 **터지지 않는다**(국외 이력 저장 자체는 U3).
 *
 * 국외 결과는 지금 이력에 저장하지 않지만(계산기가 보류), 백업 가져오기·이후 U3 저장분이 이 경로들에 닿는다.
 * 각 경로는 «국외를 모른다 = 해당 없음»으로 안전하게 떨어져야 하고(침묵 오계산 금지), 납부세액 표시만 국외 값을 읽는다.
 */
import { describe, it, expect } from "vitest";
import { calculateForeignRealEstateTransferTax as calc } from "@/lib/tax-engine/foreign-realestate";
import { k1Input, ratesAt } from "../tax-engine/foreign-realestate/_fixtures";
import { extractTotalTax } from "@/app/history/HistoryClient";
import { classifyAmendableTransfer } from "@/lib/calc/transfer-amendment-entry";
import { classifyLoadableTransfer } from "@/lib/calc/transfer-multi-load-entry";
import { extractGiftResaleDeterminedTax } from "@/lib/calc/gift-resale-101-2-history";
import { extractRealEstateSide } from "@/lib/calc/cross-104-5-adapter";
import { computeTransferSummary, createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import type { CalculationRecord } from "@/lib/storage/types";
import type { TransferAPIResult } from "@/lib/calc/transfer-tax-api";
import { foreignForm } from "../calc/_foreign-form-fixture";

const result = calc(k1Input({ domesticResidenceYears: 7 }), ratesAt("2026-07-10"));
const wrapped: TransferAPIResult = { mode: "foreign", result };

const record = (): CalculationRecord =>
  ({
    id: "r1",
    userId: "u",
    taxType: "transfer",
    title: "국외",
    inputData: foreignForm() as unknown as Record<string, unknown>,
    resultData: wrapped as unknown as Record<string, unknown>,
    taxLawVersion: "2026-07-10",
    linkedCalculationId: null,
    clientId: null,
    createdAt: "2026-07-10T00:00:00Z",
    updatedAt: "2026-07-10T00:00:00Z",
  }) as unknown as CalculationRecord;

describe("result.mode foreign — 결과 store·이력·교차 경로", () => {
  it("이력 목록의 납부세액은 국외 총 납부세액을 읽는다", () => {
    expect(extractTotalTax(record().resultData)).toBe("162,646,000");
  });

  it("정정·불러오기(다건 편입) 대상이 아니다(null) — 국내 단건으로 오분류되지 않는다", () => {
    expect(classifyAmendableTransfer(record())).toBeNull();
    expect(classifyLoadableTransfer(record())).toBeNull();
  });

  it("증여 후 양도 §101② 기준·§104⑤ 교차 합산 후보가 아니다 — 거부하되 던지지 않는다", () => {
    expect(extractGiftResaleDeterminedTax(record()).ok).toBe(false);
    const side = extractRealEstateSide(record().resultData);
    expect(side.ok).toBe(false);
  });

  it("마법사 합계·자산별 요약은 foreign 결과에서 터지지 않는다(국내 요약은 국외 값을 읽지 않는다)", () => {
    const f = createDefaultTransferFormData();
    expect(() => computeTransferSummary(f, wrapped)).not.toThrow();
    expect(computeTransferSummary(f, wrapped).estimatedTax).toBeNull();
    expect(() => computeTransferPerAssetSummary(f, wrapped)).not.toThrow();
  });
});
