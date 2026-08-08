/**
 * Phase E — 비주택 → 주택 용도변경 5단 파이프라인 도달 검증.
 *
 *   폼(①②③) → API 변환(④) → fetch body(⑬) → Zod(⑫⑩) → Route 매핑(⑭) → 엔진 input
 *
 * ⑫⑬⑭는 **TypeScript가 잡지 못한다** — 어느 한 계층을 빠뜨리면 값이 조용히 사라져
 * 엔진에 도달하지 않는다(침묵 stripping). 여기서 각 계층을 실제로 통과시켜 고정한다.
 *
 * 계획서: docs/02-design/features/non-housing-to-housing-conversion.plan.md §8
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { clampResidenceToHousingPeriod } from "@/lib/stores/calc-wizard-asset-residence";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

/** fetch를 가로채 실제 전송 body를 캡처 */
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

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeAsset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2018-02-10",
    actualSalePrice: "1,500,000,000",
    fixedAcquisitionPrice: "600,000,000",
    hasNonHousingConversion: true,
    residentialUseStartDate: "2022-11-25",
    ...over,
  };
}

function makeForm(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    transferDate: "2026-01-27",
    assets: [makeAsset(over)],
    houses: [],
    presaleRights: [],
    isOneHousehold: true,
    householdHousingCount: "1",
    residencePeriodMonths: "36",
    annualBasicDeductionUsed: "0",
  } as unknown as TransferFormData;
}

describe("⑬ fetch body 도달 — 단건", () => {
  it("토글 ON이면 nonHousingToHousingConversion이 body에 실린다", async () => {
    const captured = captureBody();
    await callTransferTaxAPI(makeForm());

    expect(captured.body?.nonHousingToHousingConversion).toEqual({
      residentialUseStartDate: "2022-11-25",
      residenceMonthsTrimmed: 0, // direct 모드 — 클램프 불가
    });
  });

  it("토글 OFF면 undefined — JSON 직렬화에서 키 자체가 빠진다", async () => {
    const captured = captureBody();
    await callTransferTaxAPI(makeForm({ hasNonHousingConversion: false }));

    expect(captured.body).not.toHaveProperty("nonHousingToHousingConversion");
  });

  it("토글만 켜고 날짜가 비면 실리지 않는다 — 술어 단일 소스", async () => {
    const captured = captureBody();
    await callTransferTaxAPI(makeForm({ residentialUseStartDate: "" }));

    expect(captured.body).not.toHaveProperty("nonHousingToHousingConversion");
  });
});

describe("⑬ fetch body 도달 — 다자산(일괄양도)", () => {
  it("companion이 있어도 primary 자산의 용도변경 정보는 최상위에 실린다", async () => {
    const captured = captureBody();
    const form = makeForm();
    const companion = {
      ...makeDefaultAsset(2),
      assetKind: "land" as const,
      acquisitionDate: "2018-02-10",
      fixedAcquisitionPrice: "100,000,000",
      fixedSalePrice: "200,000,000",
      standardPriceAtTransfer: "150,000,000",
    };
    await callTransferTaxAPI({
      ...form,
      assets: [form.assets[0], companion],
      bundledSaleMode: "actual",
      totalSalePrice: "1,700,000,000",
      primaryActualSalePrice: "1,500,000,000",
    } as unknown as TransferFormData);

    expect(captured.body?.companionAssets).toHaveLength(1);
    expect(captured.body?.nonHousingToHousingConversion).toMatchObject({
      residentialUseStartDate: "2022-11-25",
    });
  });
});

describe("⑫⑩ Zod — 정의 존재와 날짜 순서 검증", () => {
  const base = {
    propertyType: "housing",
    transferPrice: 1_500_000_000,
    transferDate: "2026-01-27",
    acquisitionPrice: 600_000_000,
    acquisitionDate: "2018-02-10",
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 36,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
  };

  it("⑫ 스키마에 정의돼 있어 값이 살아남는다 (침묵 strip 없음)", () => {
    const parsed = propertySchema.safeParse({
      ...base,
      nonHousingToHousingConversion: {
        residentialUseStartDate: "2022-11-25",
        residenceMonthsTrimmed: 5,
      },
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.nonHousingToHousingConversion).toEqual({
      residentialUseStartDate: "2022-11-25",
      residenceMonthsTrimmed: 5,
    });
  });

  it("⑩ 주거용 사용 개시일이 취득일 이전이면 400이다 (C-8)", () => {
    const parsed = propertySchema.safeParse({
      ...base,
      nonHousingToHousingConversion: {
        residentialUseStartDate: "2017-01-01",
        residenceMonthsTrimmed: 0,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toMatch(/취득일보다 이후/);
  });

  it("⑩ 양도일 이후여도 400이다 (C-9)", () => {
    const parsed = propertySchema.safeParse({
      ...base,
      nonHousingToHousingConversion: {
        residentialUseStartDate: "2026-06-01",
        residenceMonthsTrimmed: 0,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0].message).toMatch(/양도일보다 이전/);
  });
});

describe("§95⑤2호 거주기간 클램프", () => {
  const interval = (periods: { moveInDate: string; moveOutDate: string }[]) => ({
    residenceInputMode: "interval" as const,
    residencePeriods: periods,
    residencePeriodMonthsAsset: "0",
  });

  it("주거용 사용일 이전 거주는 잘라낸다", () => {
    // 2020-01-01 ~ 2026-01-01 = 72개월 중, 2022-11-25 이후는 37개월
    const r = clampResidenceToHousingPeriod(
      interval([{ moveInDate: "2020-01-01", moveOutDate: "2026-01-01" }]),
      "2026-01-27",
      "0",
      "2022-11-25",
    );

    expect(r.months).toBe(37);
    expect(r.trimmed).toBe(72 - 37);
  });

  it("구간 전체가 주거용 사용일 이전이면 0이 된다", () => {
    const r = clampResidenceToHousingPeriod(
      interval([{ moveInDate: "2019-01-01", moveOutDate: "2020-01-01" }]),
      "2026-01-27",
      "0",
      "2022-11-25",
    );

    expect(r.months).toBe(0);
    expect(r.trimmed).toBe(12);
  });

  it("구간 전체가 주거용 사용일 이후면 그대로다", () => {
    const r = clampResidenceToHousingPeriod(
      interval([{ moveInDate: "2023-01-01", moveOutDate: "2026-01-01" }]),
      "2026-01-27",
      "0",
      "2022-11-25",
    );

    expect(r.months).toBe(36);
    expect(r.trimmed).toBe(0);
  });

  it("C-10b direct 모드는 클램프하지 않는다 — 스칼라에는 시점이 없다", () => {
    const r = clampResidenceToHousingPeriod(
      { residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "60" },
      "2026-01-27",
      "0",
      "2022-11-25",
    );

    // 비율로 깎지 않는다 — 자동 안분 fallback 금지. Step4가 안내로 처리한다.
    expect(r.months).toBe(60);
    expect(r.trimmed).toBe(0);
  });

  it("용도변경이 아니면 클램프 대상이 아니다 (회귀 0)", () => {
    const r = clampResidenceToHousingPeriod(
      interval([{ moveInDate: "2020-01-01", moveOutDate: "2026-01-01" }]),
      "2026-01-27",
      "0",
      undefined,
    );

    expect(r.months).toBe(72);
    expect(r.trimmed).toBe(0);
  });
});

/**
 * ⚠️ **여기는 API 변환 계층만 본다** — body에 실린 값이 클램프 후 개월 수인지까지다.
 *
 * 종전 제목은 "클램프가 비과세를 탈락시킨다"였는데 **세액을 한 번도 단언하지 않았다**.
 * 파이프라인 중간값만 보는 anchor라 클램프가 실제로 세액을 가르는지는 증명하지 못했다
 * (`feedback_anchor_observes_wrong_stage`). 세액 단언은 엔진 계층으로 옮겼다 —
 * `__tests__/tax-engine/transfer/non-housing-to-housing-conversion.engine.test.ts`
 * **R-G-1~R-G-3**(과세 108,148,800 ↔ 비과세 0 ↔ 비조정 무영향).
 *
 * 두 계층을 함께 둬야 한다: 여기가 깨지면 **엔진에 잘못된 값이 들어가는** 것이고,
 * 저기가 깨지면 **같은 값이 다른 세액을 낳는** 것이다.
 */
describe("★ C-10c — 클램프 후 개월 수가 API body에 실린다 (세액 단언은 엔진 R-G)", () => {
  it("클램프 후 거주 2년 미만이면 body의 residencePeriodMonths도 그 값이다", async () => {
    const captured = captureBody();
    // 2018-02-10 입주 ~ 2026-01-01 퇴거 = 94개월. 주거용 사용일 2025-06-01 이후는 7개월.
    await callTransferTaxAPI(
      makeForm({
        residentialUseStartDate: "2025-06-01",
        residenceInputMode: "interval",
        residencePeriods: [{ moveInDate: "2018-02-10", moveOutDate: "2026-01-01" }],
      }),
    );

    expect(captured.body?.residencePeriodMonths).toBe(7);
    expect(captured.body?.nonHousingToHousingConversion).toMatchObject({
      residenceMonthsTrimmed: 94 - 7,
    });
  });
});
