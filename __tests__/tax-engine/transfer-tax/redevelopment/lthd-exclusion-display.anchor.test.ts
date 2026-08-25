/**
 * anchor: 재개발 §95② 장특공제 배제 — **배제한 이유를 화면까지 보낸다** (2026-08-25)
 *
 * 계획서: `docs/00-pm/transfer-right-to-move-in-surcharge-scope.plan.md` §10
 *
 * ## 종전 결함 — 공제는 0인데 **왜 0인지 화면에 없다**
 *
 * 일반 경로(`transfer-tax-lthd.ts`)는 결과에 `lthdExclusionReason`을 채우고,
 * 상세명세서가 그것을 「0원 — 조정대상지역 다주택 중과 대상 …」으로 표시한다
 * (`DetailedStatementLthdFormulas.ts:45`). **재개발 경로만 비어 있었다** — 실측:
 *
 * | 경로 | `lthdExclusionReason` |
 * |---|---|
 * | 일반 주택 · 조정 3주택 | `multi_house_surcharge` |
 * | **재개발APT · 조정 3주택** | **`undefined`** |
 *
 * 재개발은 자체 산식 빌더(`DetailedStatementRedevelopmentBuilders.ts`)를 쓰므로 일반 경로의
 * 배제 대체(`buildLthdFallbackFormulas`)를 타지 않는다. 그래서 화면에는
 * 「315,000,000 × **0%** (보유 21년 1개월) = 0」이 남아 **보유기간이 짧아서 0인 것처럼** 읽혔다.
 * (memory `feedback_engine_result_display_drift` — 차감값 ↔ 결과 표시 일관성)
 *
 * ⭐ 배제 여부와 사유는 **같은 술어**(`lthdExcludedBySurcharge`)에서 나온다 — 따로 판정하면
 *   「공제는 0인데 사유는 없다」는 세 번째 진실이 생긴다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer";
import {
  makeMockRates,
  makeMockRatesWithHouseEngine,
  baseTransferInput,
} from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const rates = makeMockRatesWithHouseEngine(); // 유예 OFF
const suspended = makeMockRates(); // suspended_until 2026-05-09

function apt(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-06-01"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    ...over,
  });
}

const statement = (i: TransferTaxInput, r = rates) =>
  buildStatementItems(calculateTransferTax(i, r), createDefaultTransferFormData(), undefined, undefined, undefined);

describe("재개발 §95② 배제 — 사유 전달", () => {
  it("LX-01: 🔴 엔진이 `lthdExclusionReason`을 싣는다 (종전 undefined)", () => {
    const r = calculateTransferTax(apt(), rates);
    expect(r.longTermHoldingDeduction).toBe(0);
    expect(r.lthdExclusionReason).toBe("multi_house_surcharge");
  });

  it("LX-02: 🔑 배제가 없으면 사유도 없다 — 같은 술어에서 나온다", () => {
    // 비조정·1주택: 공제가 살아 있다.
    const plain = calculateTransferTax(apt({ isRegulatedArea: false, householdHousingCount: 1 }), rates);
    expect(plain.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(plain.lthdExclusionReason).toBeUndefined();

    // 유예 중: 중과가 안 걸리므로 배제도 사유도 없다.
    const inWindow = calculateTransferTax(apt({ transferDate: new Date("2026-05-09") }), suspended);
    expect(inWindow.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(inWindow.lthdExclusionReason).toBeUndefined();
  });

  it("LX-03: 🔴 상세명세서가 산식 대신 **사유**를 쓴다 (종전 「× 0% (보유 21년 …)」)", () => {
    const lt = statement(apt()).get("ltDeduction")!;
    expect(lt.formula).toBe(`0원 — ${LTHD_EXCLUSION_LABEL.multi_house_surcharge}`);
    // 분할별 산식을 남기면 0%가 보유기간 탓으로 읽힌다 — 함께 비운다.
    expect(lt.perAsset).toBeUndefined();
  });

  it("LX-04: 대조 — 배제가 없으면 **분할별 산식이 그대로 나온다** (게이트가 통째로 덮지 않는다)", () => {
    const lt = statement(apt({ isRegulatedArea: false, householdHousingCount: 1 })).get("ltDeduction")!;
    expect(lt.formula).not.toContain("0원 —");
    expect(lt.formula).toContain("§166⑤"); // 재개발 분할 산식 문구 유지
    expect(lt.perAsset).toBeDefined();
    expect(lt.perAsset!.length).toBeGreaterThan(0);
  });

  it("LX-05: 라벨은 일반 경로와 **같은 소스**다 (화면 두 곳이 달라지지 않는다)", () => {
    const redevFormula = statement(apt()).get("ltDeduction")!.formula;
    const general = calculateTransferTax(
      apt({ propertyType: "housing", redevelopment: undefined, useEstimatedAcquisition: false, acquisitionPrice: 200_000_000 }),
      rates,
    );
    expect(general.lthdExclusionReason).toBe("multi_house_surcharge");
    expect(redevFormula).toContain(LTHD_EXCLUSION_LABEL[general.lthdExclusionReason!]);
  });
});
