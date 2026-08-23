/**
 * anchor — **지분(공유) 모드 × 배우자등 이월과세(§97의2) 스케일 정합** (F16 A-10 / V-1).
 *
 * 계획: `docs/00-pm/transfer-f16-companion-carryover.plan.md` §8 V-1
 * 대상: `lib/calc/transfer-tax-api-carryover.ts` `buildCarryoverPayload(asset, transferDate, ratio)`
 *
 * ## 무엇이 깨져 있었나 (수정 전 실측 — 회귀 판별용으로 남긴다)
 *
 * 화면은 「지분 모드 — 모든 금액을 **100% 기준**으로 입력하세요. 시스템이 지분율을 자동으로
 * 적용합니다」라고 선언한다(`components/calc/transfer/OwnershipRatioInput.tsx`). 그런데 이월과세
 * 서브객체만 그 계약 **밖**에 있어 같은 body 안에 두 스케일이 섞였다.
 *
 * | 픽스처(지분 1/2 · 아래 `FIX`) | 수정 전 | 수정 후 |
 * |---|---|---|
 * | payload `giftDateValuation` | 600,000,000 (100%) | **300,000,000** |
 * | payload `donorAcquisitionPrice` | 300,000,000 (100%) | **150,000,000** |
 * | payload `donorCapitalExpenditure` | 40,000,000 (100%) | **20,000,000** |
 * | 단건 · 수용배제 `transferGain` | **0** (음수 −100,000,000 clamp) · 결정세액 **0** | 200,000,000 · 55,110,000 |
 * | 지분분할 2건 · 수용배제 primary `transferGain` | **−100,000,000** | **+200,000,000** |
 * | 〃 공유자 지분 `lossOffsetFromSameGroup` | **100,000,000** (허수 차손 잠식) | **0** |
 * | 〃 신고단위 결정세액 | 34,785,000 | 151,460,000 |
 *
 * ⚠️ 위 수치는 **mock 세율표(`makeMockRates`) 기준 실측값**이지 「정본 세액」이 아니다.
 *
 * ## 🔴 스케일하지 않는 것 (R-3이 지킨다)
 *
 * `donorStandardPriceAtAcquisition` · `donorStandardPriceAtTransfer`는 환산 산식에서 분자·분모로
 * 함께 나타나 약분되고, `ownershipRatio`가 이미 개산공제(영 §163⑥) base를 줄인다 — 기준시가까지
 * 줄이면 **이중 축소**다(`lib/calc/transfer-tax-api-gb-shares.ts` `applyShareScale` 주석과 동일 규율).
 * `giftTaxAmount`는 **미결**이라 현행(미스케일)을 고정한다 — R-1c가 조용한 변경을 막는다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

// ── 픽스처 ────────────────────────────────────────────────────────────
/** 전부 **100% 기준** 입력값 — UI 안내문과 같은 계약. */
const FIX = {
  totalTransferPrice: "1000000000",
  donorAcquisitionPrice: "300000000",
  giftDateValuation: "600000000",
  donorCapitalExpenditure: "40000000",
  giftTaxAmount: "60000000",
  donorStdAtAcq: "200000000",
  donorStdAtTransfer: "800000000",
} as const;

const GIFT_DATE = "2021-06-01";
const DONOR_ACQ = "2005-01-01";
const TRANSFER_DATE = "2024-06-01";

function carryoverForm(over: Partial<CarryoverTaxationForm> = {}): CarryoverTaxationForm {
  return {
    ...CARRYOVER_DEFAULTS,
    giftRegistryDate: GIFT_DATE,
    donorAcquisitionDate: DONOR_ACQ,
    donorAcquisitionPrice: FIX.donorAcquisitionPrice,
    useEstimatedAcquisition: false,
    giftTaxAmount: FIX.giftTaxAmount,
    donorCapitalExpenditure: FIX.donorCapitalExpenditure,
    giftDateValuation: FIX.giftDateValuation,
    donorRelation: "spouse",
    ...over,
  };
}

/** 이월과세 지분 자산 (`num/den` 지분). */
function carryoverShare(
  num: string,
  den: string,
  over: Partial<CarryoverTaxationForm> = {},
  id = 1,
): AssetForm {
  return {
    ...makeDefaultAsset(id),
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    acquisitionDate: GIFT_DATE,
    ownershipNumerator: num,
    ownershipDenominator: den,
    actualSalePrice: FIX.totalTransferPrice,
    standardPriceAtTransfer: "800000000",
    carryover: carryoverForm(over),
  } as AssetForm;
}

function makeForm(assets: AssetForm[]): TransferFormData {
  return {
    transferDate: TRANSFER_DATE,
    assets,
    houses: [],
    presaleRights: [],
    contractTotalPrice: FIX.totalTransferPrice,
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

/** ④ 변환이 실제로 fetch에 실은 body를 그대로 잡는다 — 재구성하지 않는다. */
async function buildBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  return captured.body!;
}

const carryoverOf = (body: Record<string, unknown>) =>
  (body.carryoverTaxation ?? {}) as Record<string, number | undefined>;

/**
 * 폼-전역 토글 몇 개는 ④가 emit하지 않아 ⑫에서 400이 난다(이 anchor의 관심사가 아니다).
 * ④가 실은 값은 절대 덮지 않도록 **spread 뒤**에 body를 둔다.
 */
async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        isOneHousehold: false,
        householdHousingCount: 1,
        annualBasicDeductionUsed: 0,
        residencePeriodMonths: 0,
        ...body,
      }),
    }),
  );
  return { status: res.status, json: await res.json() };
}

interface CarryoverDetail {
  adoptedScenario: string;
  exclusionReason?: string;
  scenarioA: {
    acquisitionPrice: number;
    transferGain: number;
    estimatedStdPriceAtAcquisition?: number;
    estimatedStdPriceAtTransfer?: number;
    lumpDeductionBase?: number;
  };
  scenarioB: { acquisitionPrice: number; transferGain: number };
}
interface SingleResult {
  transferGain: number;
  determinedTax: number;
  carryoverTaxationDetail?: CarryoverDetail;
}
interface AggProperty {
  propertyId: string;
  transferGain: number;
  lossOffsetFromSameGroup: number;
  carryoverTaxationDetail?: CarryoverDetail;
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

// ══════════════════════════════════════════════════════════════════════
// R-1 — ④ payload 스케일
// ══════════════════════════════════════════════════════════════════════
describe("R-1: ④ payload — 지분 1/2에서 이월과세 금액 3필드가 × ratio 된다", () => {
  it("R-1a: 시나리오 B 취득가액(증여 당시 평가액)·시나리오 A 취득가액(증여자 취득가액)", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2")]));
    const ct = carryoverOf(body);
    expect(body.transferPrice, "양도가액은 종전부터 × ratio 된다 — 기준선").toBe(500_000_000);
    expect(ct.giftDateValuation).toBe(300_000_000);
    expect(ct.donorAcquisitionPrice).toBe(150_000_000);
  });

  it("R-1b: 증여자 자본적지출(§97의2①2호)도 100% 기준 입력이다", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2")]));
    expect(carryoverOf(body).donorCapitalExpenditure).toBe(20_000_000);
  });

  it("R-1c: 🔴 증여세 상당액은 **미스케일**(미결 사항 — 조용히 바꾸지 말 것)", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2")]));
    expect(
      carryoverOf(body).giftTaxAmount,
      "영 §163의2②는 사용자가 「양도한 해당 자산」 기준으로 직접 산정해 넣는 값이라 " +
        "「100% 기준 증여세 상당액」이 관측되지 않는다. 스케일은 실제 납부액을 반감시키는 " +
        "방향이므로 근거 확정 전까지 현행 유지.",
    ).toBe(60_000_000);
  });

  it("R-1d: 🔴 단독 소유(ratio 1)는 **아무것도 바뀌지 않는다** — 회귀 가드", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "1")]));
    const ct = carryoverOf(body);
    expect(body.transferPrice).toBe(1_000_000_000);
    expect(ct.giftDateValuation).toBe(600_000_000);
    expect(ct.donorAcquisitionPrice).toBe(300_000_000);
    expect(ct.donorCapitalExpenditure).toBe(40_000_000);
    expect(ct.giftTaxAmount).toBe(60_000_000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// R-2 — 음수 양도차익 부재
// ══════════════════════════════════════════════════════════════════════
describe("R-2: 배제경로(§97의2②1호 수용) — 음수 양도차익·허수 차손통산이 없다", () => {
  const expropriated: Partial<CarryoverTaxationForm> = {
    exclusionDeclared: {
      expropriationWithin2Years: true,
      oneHouseExemptionApplies: false,
      isFamilyBusinessInheritedAsset: false,
    },
  };

  /**
   * 배제되면 취득가액이 `giftDateValuation`로 그대로 내려간다
   * (`lib/tax-engine/transfer-tax-carryover.ts` `buildInputB`). 100% 스케일이면
   * **취득가액 > 안분 양도가액**이 되어 양도차익이 음수가 된다.
   */
  it("R-2a: 단건 지분 1/2 — transferGain ≥ 0", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2", expropriated)]));
    const r = await post(body);
    expect(r.status).toBe(200);
    const res = r.json.data.result as SingleResult;
    expect(res.carryoverTaxationDetail?.exclusionReason).toBe("expropriation");
    expect(res.transferGain, "수정 전에는 −100,000,000 → 0 clamp라 결정세액이 0이었다").toBeGreaterThanOrEqual(0);
    expect(res.transferGain).toBe(200_000_000);
    expect(res.determinedTax).toBe(55_110_000);
  });

  it("R-2b: 🔴 지분분할 2건 — 공유자 지분이 허수 차손을 흡수하지 않는다", async () => {
    const share2 = {
      ...makeDefaultAsset(2),
      assetKind: "housing" as const,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2015-01-01",
      ownershipNumerator: "1",
      ownershipDenominator: "2",
      fixedAcquisitionPrice: "400000000",
      standardPriceAtTransfer: "800000000",
    } as AssetForm;
    const body = await buildBody(
      makeForm([carryoverShare("1", "2", expropriated), share2]),
    );
    const r = await post(body);
    expect(r.status).toBe(200);
    const props = r.json.data.aggregated.properties as AggProperty[];
    const primary = props.find((p) => p.propertyId === "primary")!;
    const other = props.find((p) => p.propertyId !== "primary")!;

    expect(primary.transferGain, "수정 전 −100,000,000").toBeGreaterThanOrEqual(0);
    expect(primary.transferGain).toBe(200_000_000);
    expect(
      other.lossOffsetFromSameGroup,
      "수정 전에는 허수 차손 100,000,000이 공유자 지분의 양도차익을 잠식해 " +
        "신고단위 결정세액이 151,460,000 → 34,785,000으로 떨어졌다",
    ).toBe(0);
    expect(r.json.data.aggregated.determinedTax).toBe(151_460_000);
  });
});

// ══════════════════════════════════════════════════════════════════════
// R-3 — 환산(§97①1호나목) 경로 불변
// ══════════════════════════════════════════════════════════════════════
describe("R-3: 🔴 general 환산 모드 — 기준시가는 스케일하지 않는다(이중 축소 가드)", () => {
  const general: Partial<CarryoverTaxationForm> = {
    useEstimatedAcquisition: true,
    estimationMode: "general",
    donorStandardPriceAtAcquisition: FIX.donorStdAtAcq,
    donorStandardPriceAtTransfer: FIX.donorStdAtTransfer,
  };

  it("R-3a: payload 최상위 기준시가 2필드가 100% 원값 그대로다", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2", general)]));
    expect(body.useEstimatedAcquisition).toBe(true);
    expect(body.standardPriceAtAcquisition).toBe(200_000_000);
    expect(body.standardPriceAtTransfer).toBe(800_000_000);
  });

  it("R-3b: 시나리오 A 환산취득가액·echo 기준시가가 A-10 수정 전후 **동일**하다", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2", general)]));
    const r = await post(body);
    expect(r.status).toBe(200);
    const d = (r.json.data.result as SingleResult).carryoverTaxationDetail!;
    // 환산: 안분 양도가액 500,000,000 × 200,000,000 ÷ 800,000,000 = 125,000,000.
    // 분자·분모가 함께 100%라 약분된다 — 기준시가를 × ratio 하면 분자만 반토막 나 취득가액이 무너진다.
    expect(d.scenarioA.acquisitionPrice).toBe(125_000_000);
    expect(d.scenarioA.estimatedStdPriceAtAcquisition).toBe(200_000_000);
    expect(d.scenarioA.estimatedStdPriceAtTransfer).toBe(800_000_000);
  });

  it("R-3c: 🔴 개산공제(영 §163⑥) base는 **엔진이 한 번만** 지분을 적용한다 — 이중 축소 가드", async () => {
    const body = await buildBody(makeForm([carryoverShare("1", "2", general)]));
    const r = await post(body);
    const d = (r.json.data.result as SingleResult).carryoverTaxationDetail!;
    expect(
      d.scenarioA.lumpDeductionBase,
      "엔진이 `computeLumpSumDeductionBase(기준시가, ownershipRatio)`로 × 1/2 한다. " +
        "④에서도 기준시가를 스케일하면 50,000,000이 되어 개산공제가 반토막 난다.",
    ).toBe(100_000_000);
  });
});
