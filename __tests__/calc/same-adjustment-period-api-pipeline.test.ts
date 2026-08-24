/**
 * §164⑧ 동일조정기간 환산 — 5단 파이프라인 도달 검증.
 *
 *   폼(①②③) → API 변환(④) → fetch body(⑬) → Zod(⑫) → Route 매핑(⑭) → 엔진 input
 *
 * ⑫⑬⑭는 **TypeScript가 잡지 못한다** — 한 계층만 빠져도 값이 조용히 사라져 엔진에
 * 도달하지 않는다. 각 계층을 실제로 통과시켜 고정한다.
 *
 * 계획: docs/00-pm/transfer-same-adjustment-period-std-price.plan.md §8
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import { buildSameAdjustmentPeriodInput } from "@/lib/calc/transfer-same-adjustment-period-input";
import { buildTransferEngineInput } from "@/app/api/calc/transfer/engine-input";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

function captureBody() {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  return captured;
}

afterEach(() => vi.unstubAllGlobals());

/** 집행기준 사례1 — 환산 모드 + 취득·양도 기준시가 동일 */
function makeAsset(over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2005-07-28",
    actualSalePrice: "1,000,000,000",
    useEstimatedAcquisition: true,
    standardPriceAtAcq: "161,000,000",
    standardPriceAtTransfer: "161,000,000",
    sapEnabled: true,
    sapFormula: "prev" as const,
    sapPriorStdPrice: "149,000,000",
    sapAdjustMonths: "12",
    sapPriceSource: "lookup" as const,
    ...over,
  };
}

function makeForm(over: Record<string, unknown> = {}) {
  return {
    transferDate: "2006-03-24",
    contractTotalPrice: "1,000,000,000", // 폼-전역 양도가액 → ④가 transferPrice로
    assets: [makeAsset(over)],
    houses: [],
    presaleRights: [],
    isOneHousehold: false,
    householdHousingCount: "2",
    residencePeriodMonths: "0",
    annualBasicDeductionUsed: "0",
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
  } as unknown as TransferFormData;
}

describe("§164⑧ — ② initial · ③ migrate", () => {
  it("② 신규 자산 기본값은 OFF (회귀 0)", () => {
    const a = makeDefaultAsset(1);
    expect(a.sapEnabled).toBe(false);
    expect(a.sapFormula).toBe("prev");
    expect(a.sapPriorBasis).toBe("direct");
  });

  it("③ 구 sessionStorage(키 부재)를 마이그레이션이 보정한다", () => {
    // 신규 필드가 통째로 없는 stale 자산
    const stale = { ...makeDefaultAsset(1) } as Record<string, unknown>;
    for (const k of ["sapEnabled", "sapFormula", "sapPriorStdPrice", "sapNewStdPrice",
      "sapAdjustMonths", "sapPriorBasis", "sapPriceSource"]) delete stale[k];
    const migrated = migrateAsset(stale);
    expect(migrated.sapEnabled).toBe(false);
    expect(migrated.sapFormula).toBe("prev"); // undefined면 RadioCardGroup 선택이 비어 보인다
    expect(migrated.sapPriorBasis).toBe("direct");
  });
});

describe("§164⑧ — ④ 변환 게이트", () => {
  it("sapEnabled=false면 객체 자체를 만들지 않는다", () => {
    expect(buildSameAdjustmentPeriodInput(makeAsset({ sapEnabled: false }))).toBeUndefined();
  });

  it("상대 기준시가가 비면 만들지 않는다 (반쪽 객체 금지)", () => {
    expect(buildSameAdjustmentPeriodInput(makeAsset({ sapPriorStdPrice: "" }))).toBeUndefined();
    expect(
      buildSameAdjustmentPeriodInput(makeAsset({ sapFormula: "new", sapNewStdPrice: "" })),
    ).toBeUndefined();
  });

  it("조정월수 미입력은 전송하지 않는다 — 엔진 기본 12 (⑧ validate와 같은 fallback)", () => {
    const r = buildSameAdjustmentPeriodInput(makeAsset({ sapAdjustMonths: "" }));
    expect(r).toBeDefined();
    expect(r!.adjustmentMonths).toBeUndefined();
  });

  it("🔴 콤마 포맷 조정월수도 전송된다 — ④↔⑧ 파싱 동기화", () => {
    // CurrencyInput은 1,000 이상을 "1,200"으로 포맷한다. Number("1,200")은 NaN이라
    // 콤마를 벗기지 않으면 값이 **조용히 미전송**되는데, ⑧ validation은 벗기고 통과시킨다
    // → 「UI 통과 ↔ 엔진 미도달」 불일치.
    const r = buildSameAdjustmentPeriodInput(makeAsset({ sapAdjustMonths: "1,200" }));
    expect(r!.adjustmentMonths).toBe(1200);
  });

  it("나목은 newStandardPrice만 싣는다", () => {
    const r = buildSameAdjustmentPeriodInput(
      makeAsset({ sapFormula: "new", sapNewStdPrice: "220,000,000" }),
    );
    expect(r!.formula).toBe("new");
    expect(r!.newStandardPrice).toBe(220_000_000);
    expect(r!.priorStandardPrice).toBeUndefined();
  });
});

describe("§164⑧ — ⑬ body → ⑫ Zod → ⑭ route 관통", () => {
  it("★ 전 계층 도달 — 폼 값이 엔진 input까지 살아남는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm());

    // ⑬ body
    const sap = cap.body!.sameAdjustmentPeriod as Record<string, unknown>;
    expect(sap).toBeDefined();
    expect(sap.formula).toBe("prev");
    expect(sap.priorStandardPrice).toBe(149_000_000);
    expect(sap.adjustmentMonths).toBe(12);
    expect(sap.priceSource).toBe("lookup"); // 세액 무영향이어도 strip되면 배지가 사라진다

    // ⑫ Zod — parse 후에도 남아야 한다
    const parsed = propertySchema.parse(cap.body);
    expect(parsed.sameAdjustmentPeriod).toEqual(sap);

    // ⑭ route 매핑 — 엔진 input까지
    const engineInput = buildTransferEngineInput(
      parsed as never,
      new Date("2006-03-24"),
      new Date("2005-07-28"),
      undefined,
    );
    expect(engineInput.sameAdjustmentPeriod).toEqual(sap);
  });

  it("★ 구별력 — OFF면 전 계층에서 키가 없다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm({ sapEnabled: false }));
    expect(cap.body!.sameAdjustmentPeriod).toBeUndefined();
    const parsed = propertySchema.parse(cap.body);
    expect(parsed.sameAdjustmentPeriod).toBeUndefined();
    expect(
      buildTransferEngineInput(
        parsed as never,
        new Date("2006-03-24"),
        new Date("2005-07-28"),
        undefined,
      ).sameAdjustmentPeriod,
    ).toBeUndefined();
  });
});
