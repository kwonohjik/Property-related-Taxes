/**
 * anchor — §77 「직접 경작한 토지」 플래그가 다건·일괄양도 경로에서 소실됐다 (D11-01·D11-02)
 *
 * ## 조문
 *
 * 농어촌특별세법 시행령 §4①1호: 「「조세특례제한법」 제66조부터 제70조까지, … **제77조**
 * [「조세특례제한법」 제69조제1항 본문에 따른 거주자가 **직접 경작한 토지**(8년 이상 경작할
 * 것의 요건은 적용하지 아니한다)로 한정한다] … 에 따른 감면」
 * ⇒ §77 감면은 **직접 경작 토지일 때만** 농특세 비과세다. 그 외에는 감면세액 × 20%.
 *
 * ## 결함
 *
 * · **D11-01 (다건)**: ⑬(`multi-transfer-tax-api.ts`)·⑭(`multi/route.ts`) **양쪽**에 없었다.
 *   ⑭의 `base` 객체가 단건 헬퍼를 재사용하지 않고 키를 자체 열거하기 때문에, ⑬만 고치면
 *   세액이 1원도 움직이지 않는다(실측 뮤테이션으로 확인된 이중 갭).
 * · **D11-02 (일괄양도 컴패니언)**: ④(`transfer-tax-api.ts`가 `primary.reductions`만 봤다)·
 *   ⑫(`companionAssetSchema`)·⑭(`bundled-split-helpers.ts`) 동시 부재.
 *   **자산 배치(순서)에 의존**하는 결함이었다 — 같은 농지를 주 자산에 두면 0원,
 *   컴패니언에 두면 감면세액 × 20%가 부과됐다.
 *
 * ⚠️ 기존 다건 anchor(`rural-surtax-tax-credit.anchor.test.ts`)는 **엔진을 직접** 호출해
 *   ⑬⑭를 태우지 않는다 — 그래서 이 갭을 못 봤다. 아래는 **route를 통과**한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as MULTI_POST } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { companionAssetSchema } from "@/lib/api/transfer-tax-schema-sub";
import { buildCompanionEngineInputs } from "@/app/api/calc/transfer/bundled-split-helpers";
import { toSelfCultivatedExpropriatedLand } from "@/lib/calc/transfer-tax-api-reductions";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-helpers";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import {
  RURAL_SURTAX_TABLE,
  resolveTaxCreditRuralSurtax,
} from "@/lib/tax-engine/transfer-tax-rural-surtax";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const EXPROPRIATION = {
  type: "public_expropriation",
  cashCompensation: 800_000_000,
  bondCompensation: 0,
  businessApprovalDate: "2024-01-01",
};

const asset = (id: string, over: object = {}) => ({
  propertyId: id,
  propertyLabel: id,
  propertyType: "land" as const,
  transferDate: "2026-03-01",
  acquisitionDate: "2010-01-01",
  transferPrice: 1_000_000_000,
  acquisitionPrice: 100_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [EXPROPRIATION] as unknown[],
  residencePeriodMonths: 0,
  ...over,
});

async function callMulti(properties: object[]) {
  const res = await MULTI_POST(
    new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxYear: 2026, annualBasicDeductionUsed: 0, properties }),
    }),
  );
  expect(res.status).toBe(200);
  return (await res.json()).data as { ruralSurtax?: number; totalTax: number };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("D11-01 다건(연간합산) — ⑬⑭ 이중 배선", () => {
  it("D11-01-1: 직접 경작 = 예 → 농특세 0", async () => {
    const r = await callMulti([asset("a1", { isSelfCultivatedExpropriatedLand: true })]);
    expect(r.ruralSurtax ?? 0).toBe(0);
  });

  it("D11-01-2 대조군: 미선언 → 농특세가 부과된다 (감면세액 × 20%)", async () => {
    const r = await callMulti([asset("a1")]);
    expect(r.ruralSurtax ?? 0).toBeGreaterThan(0);
  });

  it("D11-01-3: 두 경로의 총 납부세액이 갈린다 — 플래그가 실제로 도달한다는 증거", async () => {
    const on = await callMulti([asset("a1", { isSelfCultivatedExpropriatedLand: true })]);
    const off = await callMulti([asset("a1")]);
    expect(on.totalTax).toBeLessThan(off.totalTax);
    expect(off.totalTax - on.totalTax).toBe(off.ruralSurtax ?? 0);
  });
});

describe("D11-01 다건 ⑬ — buildPropertyPayload", () => {
  it("D11-01-4 ⑬: 폼의 §77 자경 선언이 다건 payload에 실린다", () => {
    const form = (selfCultivated: boolean) => {
      const f = createDefaultTransferFormData();
      f.transferDate = "2026-03-01";
      f.assets[0] = {
        ...f.assets[0],
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-01-01",
        actualSalePrice: "1,000,000,000",
        fixedAcquisitionPrice: "100,000,000",
        reductions: [
          {
            type: "public_expropriation",
            expropriationCash: "1,000,000,000",
            expropriationBond: "0",
            expropriationNoticeDate: "2024-01-01",
            expropriationSelfCultivated: selfCultivated,
          },
        ],
      } as unknown as (typeof f.assets)[number];
      return f;
    };
    const on = buildPropertyPayload(form(true)) as Record<string, unknown>;
    const off = buildPropertyPayload(form(false)) as Record<string, unknown>;
    expect(on.isSelfCultivatedExpropriatedLand).toBe(true);
    expect(off.isSelfCultivatedExpropriatedLand).toBeUndefined();
  });
});

describe("D11-02 일괄양도 컴패니언 — ④⑫⑭", () => {
  const CTX = {
    primaryAcquisitionDate: new Date("2010-01-01"),
    transferDate: new Date("2026-03-01"),
    primaryAcquisitionCause: "purchase" as const,
    primaryEngineInput: {
      householdHousingCount: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      residencePeriodMonths: 0,
      propertyType: "land" as const,
    },
  };
  const APPORTIONED = {
    allocatedSalePrice: 500_000_000,
    allocatedAcquisitionPrice: 100_000_000,
    allocatedExpenses: 0,
  };

  it("D11-02-1 ⑫: companionAssetSchema가 자산-수준 플래그를 받는다", () => {
    const parsed = companionAssetSchema.safeParse({
      assetId: "c1",
      assetLabel: "동반자산",
      assetKind: "land",
      acquisitionCause: "purchase",
      acquisitionDate: "2010-01-01",
      reductions: [EXPROPRIATION],
      isSelfCultivatedExpropriatedLand: true,
    });
    expect(parsed.success, JSON.stringify(parsed.success ? [] : parsed.error.issues)).toBe(true);
    expect((parsed as { data: Record<string, unknown> }).data.isSelfCultivatedExpropriatedLand).toBe(
      true,
    );
  });

  it("D11-02-2 ⑭: buildCompanionEngineInputs가 그 값을 엔진 input에 싣는다", () => {
    const c = (
      companionAssetSchema.safeParse({
        assetId: "c1",
        assetLabel: "동반자산",
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-01-01",
        reductions: [EXPROPRIATION],
        isSelfCultivatedExpropriatedLand: true,
      }) as { data: unknown }
    ).data;
    const [engineInput] = buildCompanionEngineInputs(c as never, APPORTIONED, CTX);
    expect(
      (engineInput as { isSelfCultivatedExpropriatedLand?: boolean })
        .isSelfCultivatedExpropriatedLand,
    ).toBe(true);
  });

  it("D11-02-3 ④: buildAssetPayload가 자산의 reductions에서 값을 승격한다", () => {
    const form = (selfCultivated: boolean): AssetForm =>
      ({
        ...makeDefaultAsset(2),
        assetKind: "land",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-01-01",
        actualSalePrice: "500,000,000",
        fixedAcquisitionPrice: "100,000,000",
        reductions: [
          {
            type: "public_expropriation",
            expropriationCash: "500,000,000",
            expropriationBond: "0",
            expropriationNoticeDate: "2024-01-01",
            expropriationSelfCultivated: selfCultivated,
          },
        ],
      }) as unknown as AssetForm;

    const on = buildAssetPayload(form(true), "actual", "2026-03-01") as Record<string, unknown>;
    const off = buildAssetPayload(form(false), "actual", "2026-03-01") as Record<string, unknown>;
    expect(on.isSelfCultivatedExpropriatedLand).toBe(true);
    expect(off.isSelfCultivatedExpropriatedLand).toBeUndefined();
  });
});

describe("공용 leaf — 판정식을 복제하지 않는다", () => {
  it("LEAF-1: public_expropriation + 자경 선언일 때만 true, 그 외 undefined", () => {
    expect(
      toSelfCultivatedExpropriatedLand([
        { type: "public_expropriation", expropriationSelfCultivated: true },
      ]),
    ).toBe(true);
    expect(
      toSelfCultivatedExpropriatedLand([
        { type: "public_expropriation", expropriationSelfCultivated: false },
      ]),
    ).toBeUndefined();
    // 다른 감면 유형에 같은 키가 있어도 걸리지 않는다
    expect(
      toSelfCultivatedExpropriatedLand([
        { type: "self_farming", expropriationSelfCultivated: true },
      ]),
    ).toBeUndefined();
    expect(toSelfCultivatedExpropriatedLand(undefined)).toBeUndefined();
    expect(toSelfCultivatedExpropriatedLand([])).toBeUndefined();
  });
});

describe("D7-04 농특세 판정표 — §69 변종 id 커버리지", () => {
  it("D7-04-1: §69 계열 3개 id가 모두 exempt다 (농특세령 §4①1호 「§66부터 §70까지」)", () => {
    expect(RURAL_SURTAX_TABLE.self_farming).toBe("exempt");
    expect(RURAL_SURTAX_TABLE.self_farming_incorp).toBe("exempt");
    expect(RURAL_SURTAX_TABLE.self_farming_inherited).toBe("exempt");
  });

  it("D7-04-2: 「미판정」 verdict가 나지 않는다 — 내부 enum id 노출 방지", () => {
    for (const id of ["self_farming", "self_farming_incorp", "self_farming_inherited"]) {
      const r = resolveTaxCreditRuralSurtax({
        reductionTypeApplied: id,
        reductionAmount: 80_000_000,
        isSelfCultivatedExpropriatedLand: undefined,
      });
      expect(r.verdict, id).toBe("exempt");
      expect(r.surtax, id).toBe(0);
      expect(r.reason, id).not.toContain(id);
    }
  });

  it("D7-04-3: §77은 여전히 조건부다 (직접 경작일 때만 비과세)", () => {
    expect(RURAL_SURTAX_TABLE.public_expropriation).toBe("self_cultivated_only");
    expect(
      resolveTaxCreditRuralSurtax({
        reductionTypeApplied: "public_expropriation",
        reductionAmount: 50_000_000,
        isSelfCultivatedExpropriatedLand: true,
      }).surtax,
    ).toBe(0);
    expect(
      resolveTaxCreditRuralSurtax({
        reductionTypeApplied: "public_expropriation",
        reductionAmount: 50_000_000,
        isSelfCultivatedExpropriatedLand: undefined,
      }).surtax,
    ).toBe(10_000_000);
  });
});
