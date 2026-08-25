/**
 * anchor — C1-03 배관 : §89①4호 나목 「그 1주택 취득일」이 ④⑫⑬⑭를 모두 통과하는가.
 *
 * 이 필드는 **날짜**이고 재개발 payload(`redevelopment`) 안에 들어간다. 그래서 실패 지점이
 * 세 층에 흩어져 있고 **TypeScript가 하나도 잡지 못한다**:
 *
 *   ④ `lib/calc/transfer-tax-api-redev.ts`  — 폼 → payload. 안 실으면 body에 키가 없다.
 *   ⑫ `lib/api/transfer-tax-redevelopment-schema.ts` — Zod 객체에 없으면 route가 **조용히 제거**한다.
 *   ⑭ `app/api/calc/transfer/engine-input.ts`        — Date 변환이 없으면 **string**이 엔진에 도달해
 *      `transferDate <= deadline` 비교가 `Date <= string`이 되어 조용히 false가 된다
 *      (`lib/api/date-coerce.ts` 정책 · memory `feedback_api_zod_schema_sync`).
 *
 * 여기서는 ④(payload 도달)와 ⑫(Zod 통과)를 고정한다. ⑭ Date 변환은 엔진 anchor
 * (`one-right-clause-na-and-allocation.anchor.test.ts`)가 Date 입력으로 세액을 고정하고,
 * 아래 Z-3이 schema 출력 타입으로 확인한다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { redevelopmentSchema } from "@/lib/api/transfer-tax-redevelopment-schema";
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

/** 조합원입주권 단건 — §89①4호 나목 입력 포함 */
function makeForm(otherHouseAcquisitionDate: string) {
  return {
    transferDate: "2024-06-01",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdRightCount: "1",
    houses: [],
    presaleRights: [],
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "right_to_move_in" as const,
        acquisitionCause: "purchase" as const,
        acquisitionDate: "2010-04-09",
        fixedAcquisitionPrice: "300,000,000",
        actualSalePrice: "900,000,000",
        redevSubject: "right" as const,
        redevApprovalDate: "2018-10-23",
        redevApprovalLawBasis: "urban_renovation_art_74" as const,
        redevRightsValue: "500,000,000",
        redevSettlementDirection: "pay" as const,
        redevSettlementAmount: "50,000,000",
        redevOriginalAssetType: "housing" as const,
        redevExemptionEligibleAtApproval: "yes" as const,
        redevOtherHouseAcquisitionDate: otherHouseAcquisitionDate,
      },
    ],
  } as unknown as TransferFormData;
}

const redevOf = (body: Record<string, unknown> | undefined) =>
  body?.redevelopment as Record<string, unknown> | undefined;

describe("④⑬ — 나목 취득일이 API body의 redevelopment에 실린다", () => {
  it("P-1: 입력하면 body.redevelopment.otherHouseAcquisitionDate === 그 값", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm("2022-08-01"));
    // 대조군 — redevelopment 자체가 실려야 아래 단언이 의미를 갖는다.
    expect(redevOf(cap.body)).toBeDefined();
    expect(redevOf(cap.body)?.otherHouseAcquisitionDate).toBe("2022-08-01");
  });

  it("P-2: 미입력이면 키가 undefined — 「모르는 값」을 날짜로 지어내지 않는다", async () => {
    const cap = captureBody();
    await callTransferTaxAPI(makeForm(""));
    expect(redevOf(cap.body)).toBeDefined();
    expect(redevOf(cap.body)?.otherHouseAcquisitionDate).toBeUndefined();
  });
});

describe("⑫ — Zod가 나목 취득일을 통과시킨다 (침묵 stripping 차단)", () => {
  const base = {
    subject: "right" as const,
    approvalLawBasis: "urban_renovation_art_74" as const,
    approvalDate: "2018-10-23",
    rightsValue: 500_000_000,
    settlementDirection: "pay" as const,
    settlementAmount: 50_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing" as const,
  };

  // 스키마 자체가 `.optional()`이라 parse 결과도 optional이다 — 단언 전에 존재를 확인한다.
  it("Z-1: 유효한 날짜는 파싱 결과에 남는다", () => {
    const parsed = redevelopmentSchema.parse({ ...base, otherHouseAcquisitionDate: "2022-08-01" });
    expect(parsed).toBeDefined();
    expect(parsed?.otherHouseAcquisitionDate).toBe("2022-08-01");
  });

  it("Z-2: 생략 가능 (나목을 안 쓰는 가목 경로)", () => {
    const parsed = redevelopmentSchema.parse(base);
    expect(parsed).toBeDefined();
    expect(parsed?.otherHouseAcquisitionDate).toBeUndefined();
  });

  it("Z-3: 날짜 형식이 아니면 거부 — string이 그대로 엔진에 흘러가는 것을 막는다", () => {
    expect(() => redevelopmentSchema.parse({ ...base, otherHouseAcquisitionDate: "2022/08/01" })).toThrow();
  });
});
