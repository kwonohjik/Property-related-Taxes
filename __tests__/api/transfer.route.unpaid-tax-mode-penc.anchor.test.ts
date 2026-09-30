/**
 * anchor: PEN-C — 지연납부가산세 미납세액의 「자동(전액 미납)」 ↔ 「직접 입력(0 = 완납 포함)」 구별
 * (2026-09-30 사용자 결정 · 계획서 `docs/00-pm/zod-engine-required-mismatch.plan.md` §4.1).
 *
 * 종전에는 `delayedPaymentDetails.unpaidTax === 0`을 route·엔진이 **「결정세액 전액 미납」으로 바꿨다**.
 * 「가산세 계산하기」는 기납부세액 ≥ 결정세액이면 `"0"`(완납)을 싣는데, 그것도 전액 미납이 됐다
 * ⇒ 완납인데 납부지연가산세가 붙었다.
 *
 * 결정: 명시 모드 `unpaidTaxMode: "auto" | "manual"`.
 *   - `manual` → 값을 그대로(0 포함) 쓴다.
 *   - `auto` → 결정세액 전액 미납(종전 동작). ⑫는 `auto` + `unpaidTax > 0`(모순)을 거부한다.
 *   - **모드 부재 = 종전 의미 그대로**(0 → 전액 · 값 → 그 값) — 저장된 이력의 의미를 뒤집지 않는다
 *     (memory `feedback_flipping_enum_default_rewrites_absent_records`).
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님).
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildPenaltyAmendmentPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { effectiveUnpaidTaxMode } from "@/lib/calc/transfer-unpaid-tax-mode";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import {
  mixedUseCase14,
  CASE14_TRANSFER_PRICE,
  CASE14_TRANSFER_DATE,
} from "../tax-engine/_helpers/mixed-use-fixture";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

type Delayed = { unpaidTax: number; delayedPaymentPenalty: number };
type Json = {
  data?: {
    result?: { determinedTax: number; penaltyDetail?: { delayedPaymentPenalty?: Delayed } };
    properties?: unknown;
    [k: string]: unknown;
  };
  error?: { fieldErrors?: Record<string, string[]> };
};
async function post(handler: (req: NextRequest) => Promise<Response>, url: string, body: unknown) {
  const res = await handler(
    new NextRequest(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const single = (body: unknown) => post(SINGLE, "http://localhost/api/calc/transfer", body);
const multi = (body: unknown) => post(MULTI, "http://localhost/api/calc/transfer/multi", body);

const BASE = {
  propertyType: "housing",
  transferPrice: 800_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2003-01-15",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
};
const DUE = { paymentDeadline: "2024-05-31", actualPaymentDate: "2024-12-31" };
const withDelayed = (d: Record<string, unknown>) => ({ ...BASE, delayedPaymentDetails: { ...DUE, ...d } });

async function delayedOf(body: unknown) {
  const r = await single(body);
  expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  return {
    determinedTax: r.json.data!.result!.determinedTax,
    delayed: r.json.data!.result!.penaltyDetail!.delayedPaymentPenalty!,
  };
}

describe("PEN-C route — 완납(manual 0)은 납부지연가산세 0", () => {
  it("🔴 manual + 0 → 미납세액 0 · 가산세 0 (종전: 모드가 strip돼 전액 미납으로 계산)", async () => {
    const { delayed } = await delayedOf(withDelayed({ unpaidTax: 0, unpaidTaxMode: "manual" }));
    expect(delayed.unpaidTax).toBe(0);
    expect(delayed.delayedPaymentPenalty).toBe(0);
  });

  it("🟢 모드 부재 + 0 → 종전 그대로 결정세액 전액 미납 (저장 이력 의미 보존)", async () => {
    const { determinedTax, delayed } = await delayedOf(withDelayed({ unpaidTax: 0 }));
    expect(determinedTax).toBeGreaterThan(0);
    expect(delayed.unpaidTax).toBe(determinedTax);
    expect(delayed.delayedPaymentPenalty).toBe(AUTO_PENALTY);
  });

  it("🟢 auto + 0 → 결정세액 전액 미납 (모드 부재와 같은 값)", async () => {
    const { determinedTax, delayed } = await delayedOf(withDelayed({ unpaidTax: 0, unpaidTaxMode: "auto" }));
    expect(delayed.unpaidTax).toBe(determinedTax);
    expect(delayed.delayedPaymentPenalty).toBe(AUTO_PENALTY);
  });

  it("🟢 manual + 값 → 그 값 (모드 부재 + 같은 값과 같은 결과)", async () => {
    const a = await delayedOf(withDelayed({ unpaidTax: 10_000_000, unpaidTaxMode: "manual" }));
    const b = await delayedOf(withDelayed({ unpaidTax: 10_000_000 }));
    expect(a.delayed.unpaidTax).toBe(10_000_000);
    expect(a.delayed).toEqual(b.delayed);
  });

  it("🔴 auto + 값 → 400 (모순 — auto는 결정세액 전액이다)", async () => {
    const r = await single(withDelayed({ unpaidTax: 10_000_000, unpaidTaxMode: "auto" }));
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error?.fieldErrors ?? {})).toContain("delayedPaymentDetails.unpaidTaxMode");
  });
});

/** mock 세율 실측 — 모드 부재 + 0(종전 동작)의 납부지연가산세. 완납(manual 0)이 종전엔 이 값이 됐다. */
const AUTO_PENALTY = 5_297_991;

describe("PEN-C multi route — 자산별 입력도 같은 규약", () => {
  const item = (d: Record<string, unknown>) => ({
    ...BASE,
    propertyId: "p1",
    propertyLabel: "자산 1",
    delayedPaymentDetails: { ...DUE, ...d },
  });
  const body = (d: Record<string, unknown>) => ({ taxYear: 2024, properties: [item(d)] });
  const totalOf = async (d: Record<string, unknown>) => {
    const r = await multi(body(d));
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    return r.json.data as unknown as { totalTax?: number; penaltyTax?: number };
  };

  it("🔴 manual + 0 → 모드 부재 + 0(전액 미납)보다 가산세가 작다", async () => {
    const manual0 = await totalOf({ unpaidTax: 0, unpaidTaxMode: "manual" });
    const legacy0 = await totalOf({ unpaidTax: 0 });
    expect(manual0.penaltyTax).toBe(0);
    expect(legacy0.penaltyTax).toBeGreaterThan(0);
  });
});

// ── ④ — 폼 → payload ─────────────────────────────────────────────────────
function form(o: Partial<TransferFormData> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    enablePenalty: true,
    filingType: "correct",
    paymentDeadline: "2024-05-31",
    actualPaymentDate: "2024-12-31",
    ...o,
  };
}
type DelayedPayload = { unpaidTax: number; unpaidTaxMode?: string };
const delayedPayload = (p: object) =>
  (p as { delayedPaymentDetails?: DelayedPayload }).delayedPaymentDetails;

describe("PEN-C ④ — 모드를 싣는다 (단건·다건 같은 leaf)", () => {
  it.each([
    ["manual + 0(완납)", { unpaidTaxMode: "manual", unpaidTax: "0" }, { unpaidTax: 0, unpaidTaxMode: "manual" }],
    ["manual + 값", { unpaidTaxMode: "manual", unpaidTax: "5,000,000" }, { unpaidTax: 5_000_000, unpaidTaxMode: "manual" }],
    ["auto (stale 값은 싣지 않는다)", { unpaidTaxMode: "auto", unpaidTax: "5,000,000" }, { unpaidTax: 0, unpaidTaxMode: "auto" }],
    ["모드 부재 + 0 → auto (종전 의미)", { unpaidTax: "0" }, { unpaidTax: 0, unpaidTaxMode: "auto" }],
    ["모드 부재 + 값 → manual (종전 의미: 값 그대로)", { unpaidTax: "5,000,000" }, { unpaidTax: 5_000_000, unpaidTaxMode: "manual" }],
  ] as const)("%s", (_n, over, expected) => {
    const f = form(over as Partial<TransferFormData>);
    expect(delayedPayload(buildPenaltyAmendmentPayload(f))).toMatchObject(expected);
    expect(delayedPayload(buildPropertyPayload(f))).toMatchObject(expected);
  });

  it("effectiveUnpaidTaxMode — 부재는 값으로 판정(0·빈칸 → auto, 양수 → manual)", () => {
    expect(effectiveUnpaidTaxMode(form({ unpaidTax: "" }))).toBe("auto");
    expect(effectiveUnpaidTaxMode(form({ unpaidTax: "0" }))).toBe("auto");
    expect(effectiveUnpaidTaxMode(form({ unpaidTax: "1" }))).toBe("manual");
    expect(effectiveUnpaidTaxMode(form({ unpaidTaxMode: "manual", unpaidTax: "0" }))).toBe("manual");
    expect(effectiveUnpaidTaxMode(form({ unpaidTaxMode: "auto", unpaidTax: "1" }))).toBe("auto");
  });
});

// ── 결정세액 주입 지점 전수 — 일반건물(집계 신고 단위) · 겸용(합산) ──────────────

describe("PEN-C 집계·겸용 — 같은 leaf(`resolveUnpaidTax`)", () => {
  const gb = (): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "general_building",
      acquisitionCause: "purchase",
      gbBuildingAcquisitionCause: "purchase",
      acquisitionDate: "2009-03-01",
      useEstimatedAcquisition: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      gbLandArea: "100",
      gbBuildingArea: "200",
      gbBuildingFootprintArea: "50",
      gbTransferLandPricePerSqm: "2,000,000",
      gbTransferBuildingValue: "200,000,000",
      gbAcqLandPricePerSqm: "1,000,000",
      gbAcqBuildingValue: "100,000,000",
      gbZoneType: "general_residential",
    }) as AssetForm;
  const gbPenalty = async (d: Record<string, unknown>) => {
    const r = await single({
      ...BASE,
      propertyType: "general_building",
      transferPrice: 1_000_000_000,
      totalPropertyTransferPrice: 1_000_000_000,
      acquisitionPrice: 200_000_000,
      acquisitionDate: "2009-03-01",
      generalBuildingValuation: buildGeneralBuildingValuation(gb(), "2024-03-01"),
      delayedPaymentDetails: { ...DUE, ...d },
    });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    return (r.json.data as unknown as { aggregated: { penaltyTax: number } }).aggregated.penaltyTax;
  };

  it("🔴 일반건물 manual + 0 → 가산세 0 · 🟢 모드 부재 + 0 → 전액 미납 가산세(종전)", async () => {
    expect(await gbPenalty({ unpaidTax: 0, unpaidTaxMode: "manual" })).toBe(0);
    expect(await gbPenalty({ unpaidTax: 0 })).toBeGreaterThan(0);
  });

  it("🔴 겸용 manual + 0 → 가산세 0 · 🟢 모드 부재 + 0 → 전액 미납 가산세(종전)", () => {
    const run = (d: Record<string, unknown>) =>
      calcMixedUseTransferTax(
        CASE14_TRANSFER_PRICE,
        CASE14_TRANSFER_DATE,
        {
          ...mixedUseCase14(),
          delayedPaymentDetails: {
            unpaidTax: 0,
            paymentDeadline: new Date("2024-08-31"),
            actualPaymentDate: new Date("2024-12-31"),
            ...d,
          },
        },
        makeMockRates(),
      ).total.penaltyTax;
    expect(run({ unpaidTaxMode: "manual" })).toBe(0);
    expect(run({})).toBeGreaterThan(0);
  });
});
