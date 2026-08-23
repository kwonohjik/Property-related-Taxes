/**
 * anchor — F16 · 컴패니언 자산 이월과세(§97의2) 정식 지원 (⑩⑫⑭ 배관).
 *
 * ## 결함 (계획서 `docs/00-pm/transfer-f16-companion-carryover.plan.md` D-1·D-2·D-3)
 *
 * 함께양도(일괄) 컴패니언의 취득원인 라디오에는 「이월과세(증여)」가 **게이트 없이** 있고
 * ⑧(`transfer-tax-validate-asset.ts`)은 오히려 그 폼을 필드별로 **필수 입력으로 강제**한다.
 * 그런데 API 계약에는 세 곳이 비어 있었다:
 *
 * · **D-1 ⑫** `companionAssetSchema`에 `carryoverTaxation`이 없어 ④가 실은 값이 **조용히 strip**.
 *   400이 아니라 **200 + 컴패니언 취득가액 0**이었다.
 * · **D-3 ⑩** 컴패니언 superRefine에 `carryover_gift` arm이 없어(`purchase`/`gift`/`inheritance` 셋뿐)
 *   `carryover_gift`가 **취득가액 0으로 엔진에 도달할 수 있는 유일한 컴패니언 취득원인**이었다.
 * · **D-2 ⑭** `buildCompanionEngineInputs`의 증여자 취득일 게이트가 `"gift"` 하나뿐이라
 *   **쓰이지 않는 경우에만 싣고 쓰이는 경우에 버렸다**(§104②2호 소급은 `carryover_gift` 전용).
 *
 * ## 안전망은 0건에서 시작했다
 * 계획서 §6이 mutation probe로 실측했다 — 컴패니언 payload에 `carryoverTaxation`을 넣은 응답과
 * 넣지 않은 응답이 **`JSON.stringify` 완전 일치**였다(= 아무 테스트도 이 필드를 관측하지 않는다).
 * 그래서 `N-1`은 「수정 전 적색」이 성립 조건이다 — 지금은 **200 vs 400**으로 갈린다.
 *
 * ## 수정 후 실측 (이 파일의 C-BASE 픽스처, `makeMockRates`)
 *   컴패니언 `acquisitionPrice` **0 → 100,000,000**(= 증여자 취득가액, 시나리오 A 채택)
 *   `necessaryExpense` 30,000,000(= 증여세 상당액 §97의2①1호) · `transferGain` 384,285,714
 *   단건 대조군과 `transferGain`·LTHD·적용세율이 **완전 일치**하고, 결정세액 차이는
 *   기본공제 안분분 2,500,000 × 38% = **950,000**으로 전액 설명된다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({
    allowed: true,
    limit: 30,
    remaining: 29,
    resetAt: Date.now() + 60_000,
  }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { propertySchema } from "@/lib/api/transfer-tax-schema";
import { buildCompanionEngineInputs } from "@/app/api/calc/transfer/bundled-split-helpers";

// ─── C-BASE 픽스처 (계획서 §6) ───────────────────────────────────

const PRIMARY_LAND = {
  propertyType: "land",
  transferPrice: 1_800_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 500_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionCause: "purchase",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  totalSalePrice: 1_800_000_000,
  standardPriceAtTransferForApportion: 1_000_000_000,
};

/** 증여자 취득 2005-01-01 → 2021-06-01 증여 → 2024-03-01 양도 (배우자, 생존) */
const CT = {
  giftRegistryDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 300_000_000,
  donorRelation: "spouse" as const,
  exclusionDeclared: {},
};

const COMPANION = {
  assetId: "c1",
  assetLabel: "이월과세 주택",
  assetKind: "housing" as const,
  standardPriceAtTransfer: 400_000_000,
  standardPriceAtTransferForApportion: 400_000_000,
  directExpenses: 0,
  isOneHousehold: false,
  reductions: [] as unknown[],
  acquisitionCause: "carryover_gift" as const,
  acquisitionDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  carryoverTaxation: CT,
};

/** 컴패니언에 배분된 양도가액을 그대로 단건으로 계산한 대조군 */
const SINGLE_CONTROL = {
  propertyType: "housing",
  transferPrice: 514_285_714,
  transferDate: "2024-03-01",
  acquisitionPrice: 0,
  acquisitionDate: "2021-06-01",
  acquisitionCause: "carryover_gift",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  carryoverTaxation: CT,
};

// 엔진 실측값 (route POST 관측 — 산식 추론 아님)
const COMPANION_ACQ = 100_000_000;
const COMPANION_NE = 30_000_000;
const COMPANION_TP = 514_285_714;
const COMPANION_GAIN = 384_285_714;
const COMPANION_LTHD = 115_285_714;
const PRIMARY_TP = 1_285_714_286;
const PRIMARY_GAIN = 785_714_286;
/** 기본공제 2,500,000이 최고세율 소득(주 자산)에 전액 귀속되어 생기는 차이 */
const BASIC_DEDUCTION_DELTA = 950_000;

function makeRequest(body: object): NextRequest {
  return new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function run(body: object) {
  const res = await POST(makeRequest(body));
  return { status: res.status, json: await res.json() };
}

type Breakdown = {
  propertyId: string;
  transferPrice: number;
  acquisitionPrice: number;
  necessaryExpense: number;
  transferGain: number;
  longTermHoldingDeduction: number;
  appliedRate: number;
  determinedTax: number;
};

describe("F16 — 컴패니언 이월과세 §97의2 ⑩⑫⑭ 배관", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("A-A: ⑫ companionAssetSchema가 carryoverTaxation을 strip하지 않는다", () => {
    const parsed = propertySchema.safeParse({
      ...PRIMARY_LAND,
      companionAssets: [COMPANION],
    });

    expect(parsed.success).toBe(true);
    const c = parsed.data!.companionAssets![0]!;
    // 🔴 종전: 스키마에 키가 없어 파싱 결과에서 통째로 사라졌다(400이 아니라 침묵 strip)
    expect("carryoverTaxation" in c).toBe(true);
    expect(c.carryoverTaxation).toEqual(CT);
  });

  it("A-B: ⑭가 carryoverTaxation을 엔진 input에 싣고 일자를 Date로 변환한다", () => {
    const [engineInput] = buildCompanionEngineInputs(
      COMPANION as never,
      {
        allocatedSalePrice: COMPANION_TP,
        allocatedAcquisitionPrice: 0,
        allocatedExpenses: 0,
      },
      {
        primaryAcquisitionDate: new Date("2010-01-01"),
        transferDate: new Date("2024-03-01"),
        primaryAcquisitionCause: "purchase",
        primaryEngineInput: {
          householdHousingCount: 1,
          isRegulatedArea: false,
          wasRegulatedAtAcquisition: false,
          residencePeriodMonths: 0,
          propertyType: "land",
        },
      },
    );

    expect(engineInput.carryoverTaxation).toBeDefined();
    // ⚠️ string이 그대로 도달하면 `Date < string` 비교가 침묵 false가 된다(date-coerce 정책)
    expect(engineInput.carryoverTaxation!.giftRegistryDate).toBeInstanceOf(Date);
    expect(engineInput.carryoverTaxation!.donorAcquisitionDate).toBeInstanceOf(Date);

    // spread 매핑이라 ⑫의 필드가 **열거 없이** 전부 따라온다 (F15 재발 방지 형태)
    expect(engineInput.carryoverTaxation!.donorAcquisitionPrice).toBe(COMPANION_ACQ);
    expect(engineInput.carryoverTaxation!.giftTaxAmount).toBe(COMPANION_NE);
    expect(engineInput.carryoverTaxation!.giftDateValuation).toBe(300_000_000);
    expect(engineInput.carryoverTaxation!.donorRelation).toBe("spouse");

    // D-2 — §104②2호 보유기간 소급용 최상위 증여자 취득일. 🔴 종전 게이트는 "gift" 하나뿐이었다.
    expect(engineInput.donorAcquisitionDate).toBeInstanceOf(Date);
    expect(engineInput.donorAcquisitionDate!.toISOString()).toBe("2005-01-01T00:00:00.000Z");
  });

  it("A-C: route 세액 — 컴패니언 취득가액이 0이 아니고 단건 대조군과 정합", async () => {
    const { status, json } = await run({ ...PRIMARY_LAND, companionAssets: [COMPANION] });
    expect(status).toBe(200);

    const props: Breakdown[] = json.data.aggregated.properties;
    const companion = props.find((p) => p.propertyId === "c1")!;

    // 🔴 종전: acquisitionPrice 0 (⑫가 strip → 엔진이 §97의2 STEP 0.475에 진입조차 못 했다)
    expect(companion.acquisitionPrice).toBe(COMPANION_ACQ);
    expect(companion.acquisitionPrice).not.toBe(0);
    expect(companion.necessaryExpense).toBe(COMPANION_NE);
    expect(companion.transferGain).toBe(COMPANION_GAIN);

    // 단건 대조군 — 같은 양도가액·같은 이월과세 입력
    const single = await run(SINGLE_CONTROL);
    expect(single.status).toBe(200);
    const sr = single.json.data.result;

    expect(sr.transferGain).toBe(companion.transferGain);
    expect(sr.longTermHoldingDeduction).toBe(companion.longTermHoldingDeduction);
    expect(sr.appliedRate).toBe(companion.appliedRate);
    // §97의2②3호 비교 결과도 단건과 같다 (시나리오 A 채택 — 증여자 취득가액)
    expect(sr.carryoverTaxationDetail.adoptedScenario).toBe("A");
    // 결정세액 차이는 기본공제 안분분 하나로 전부 설명된다
    expect(companion.determinedTax - sr.determinedTax).toBe(BASIC_DEDUCTION_DELTA);
  });

  it("A-D: 신고서 열 자기검산 — 양도가액 − 취득가액 − 필요경비 = 양도차익", async () => {
    const { json } = await run({ ...PRIMARY_LAND, companionAssets: [COMPANION] });
    const props: Breakdown[] = json.data.aggregated.properties;

    for (const p of props) {
      expect(p.transferPrice - p.acquisitionPrice - p.necessaryExpense).toBe(p.transferGain);
    }

    const companion = props.find((p) => p.propertyId === "c1")!;
    expect(companion.transferPrice).toBe(COMPANION_TP);
    expect(companion.longTermHoldingDeduction).toBe(COMPANION_LTHD);

    // 주 자산은 그대로 — 「컴패니언만 보는 anchor」가 아니다
    const primary = props.find((p) => p.propertyId === "primary")!;
    expect(primary.transferPrice).toBe(PRIMARY_TP);
    expect(primary.transferGain).toBe(PRIMARY_GAIN);
  });

  it("N-1: carryoverTaxation 유무로 응답이 달라진다 (종전엔 바이트 동일)", async () => {
    const withCt = await run({ ...PRIMARY_LAND, companionAssets: [COMPANION] });
    const withoutCt = await run({
      ...PRIMARY_LAND,
      companionAssets: [{ ...COMPANION, carryoverTaxation: undefined }],
    });

    // 🔴 계획서 §6 실측: 종전에는 둘 다 200이고 JSON.stringify가 **완전 일치**했다.
    expect(JSON.stringify(withCt.json)).not.toBe(JSON.stringify(withoutCt.json));
    expect(withCt.status).toBe(200);
    // D-3 — 이제 「취득가액 0으로 조용히 계산」이 아니라 명시 차단이다
    expect(withoutCt.status).toBe(400);
    expect(withoutCt.json.error.fieldErrors["companionAssets.0.carryoverTaxation"]).toEqual([
      "이월과세(증여) 자산은 증여 정보(carryoverTaxation) 필수",
    ]);
  });
});

/**
 * A-8(V-10) 세액 크기 — 계획서 V-2 「D-5의 세액 변동폭 미측정」을 여기서 고정한다.
 *
 * 이월과세 `general` 환산 컴패니언은 §166⑥ 안분 키(사용자 400,000,000)와 §97①1호나목
 * 환산 분모(증여자 222,222,222)가 **다른 값**이다. 종전에는 ④의 override가 안분 키를
 * 환산 분모로 치환해 일괄 안분 자체가 어긋났다.
 */
const CT_EST = {
  giftRegistryDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  useEstimatedAcquisition: true,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 300_000_000,
  donorRelation: "spouse" as const,
  exclusionDeclared: {},
};

const COMPANION_EST = {
  assetId: "c1",
  assetLabel: "이월과세 주택(환산)",
  assetKind: "housing" as const,
  /** §97①1호나목 환산 분모 — 증여자 축 */
  standardPriceAtTransfer: 222_222_222,
  /** §166⑥ 안분 키 — 사용자 입력 */
  standardPriceAtTransferForApportion: 400_000_000,
  standardPriceAtAcquisition: 111_111_111,
  useEstimatedAcquisition: true,
  directExpenses: 0,
  isOneHousehold: false,
  reductions: [] as unknown[],
  acquisitionCause: "carryover_gift" as const,
  acquisitionDate: "2021-06-01",
  donorAcquisitionDate: "2005-01-01",
  carryoverTaxation: CT_EST,
};

describe("F16 A-8 — 안분 키가 환산 분모로 치환되지 않는다 (route 세액)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("전용 키가 있으면 사용자 입력 기준시가로 안분한다", async () => {
    const { status, json } = await run({ ...PRIMARY_LAND, companionAssets: [COMPANION_EST] });
    expect(status).toBe(200);

    const props: Breakdown[] = json.data.aggregated.properties;
    const companion = props.find((p) => p.propertyId === "c1")!;
    const primary = props.find((p) => p.propertyId === "primary")!;

    // 안분 키 1,000,000,000 : 400,000,000 = 1,800,000,000 배분
    expect(primary.transferPrice).toBe(1_285_714_286);
    expect(companion.transferPrice).toBe(514_285_714);
    // 환산 분모는 살아 있다 — 시나리오 B(증여 당시 평가액) 채택
    expect(companion.acquisitionPrice).toBe(300_000_000);
    expect(companion.transferGain).toBe(214_285_714);
    expect(json.data.aggregated.determinedTax).toBe(290_610_000);
  });

  it("전용 키가 없으면 종전 동작(증여자 기준시가로 안분) — 차이 4,861,818", async () => {
    const legacy = { ...COMPANION_EST } as Record<string, unknown>;
    delete legacy.standardPriceAtTransferForApportion;

    const { status, json } = await run({ ...PRIMARY_LAND, companionAssets: [legacy] });
    expect(status).toBe(200);

    const props: Breakdown[] = json.data.aggregated.properties;
    const companion = props.find((p) => p.propertyId === "c1")!;
    const primary = props.find((p) => p.propertyId === "primary")!;

    // 🔴 안분 키가 222,222,222로 치환됐을 때의 배분 — 컴패니언 몫이 187,012,987 줄어든다
    expect(primary.transferPrice).toBe(1_472_727_273);
    expect(companion.transferPrice).toBe(327_272_727);
    expect(json.data.aggregated.determinedTax).toBe(295_471_818);
    expect(295_471_818 - 290_610_000).toBe(4_861_818);
  });
});
