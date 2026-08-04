/**
 * 함께양도(bundled)가 특수 계산 경로를 **삼킨다** — 라우트 if-체인 순서 결함.
 *
 * ## 원인
 *
 * `app/api/calc/transfer/route.ts`는 순서 있는 if-체인이고 **일괄 분기가 맨 앞**이다:
 *
 * ```
 * 5-a   일괄(bundled)    :446  → return :555
 * 5-a-2 겸용주택 분리계산  :568  → return :604
 * 5-a-3 일반건물          :611  → return :646
 * 5-b   단건             :660  → return :678
 * ```
 *
 * companion이 하나라도 있으면 `bundledOk`가 참이 되어 **뒤쪽 특수 분기는 실행조차 되지 않는다**.
 *
 * ## 두 가지 메커니즘을 구분할 것 (실측으로 확정)
 *
 * | 기능 | 메커니즘 | 결과 |
 * |---|---|---|
 * | 겸용·재개발·일반건물 | route 분기 **미실행** | 다른 계산이 나옴 |
 * | 부담부증여 | STEP 0.48은 **실행**되나 안분 transferPrice와 **스케일 충돌** | 필요경비 **음수** |
 * | 상가 | 전용 분기 없음 — 엔진 내부 처리 | **계산 정상**, 표시 상세만 누락 |
 *
 * → marker 부재만으로 결함이라 판정하면 **상가에서 오진**한다. 반드시 산출값까지 본다.
 *
 * 화면에는 특수 입력이 그대로 보이는데 계산이 어긋나므로 **사용자가 알 수 없다**.
 *
 * ## 이 테스트가 지키는 것
 *
 * 각 기능을 **단건 ↔ 함께양도 대조**로 돌려 "단건에서는 나오는 산출물이 함께양도에서는 사라진다"를
 * 고정한다. 이 대조 구조가 판별력의 핵심이다 — 단건 쪽이 녹색이어야 소실이 입증된다.
 *
 * 계산 자체는 `transfer-tax-validate.ts`가 **차단**하므로 사용자에게 도달하지 않는다.
 * 본 테스트는 **차단이 풀렸을 때 무슨 일이 일어나는지**를 문서화하는 회귀 방어선이다
 * (차단만 테스트하면 왜 막는지가 코드에서 사라진다).
 *
 * 실측: 2026-07-28.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

const COMMON = {
  transferPrice: 500_000_000,
  transferDate: "2024-03-01",
  acquisitionPrice: 300_000_000,
  acquisitionDate: "2009-03-01",
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [] as unknown[],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

/** companion 1건 — bundled 진입용 (apportioned 모드) */
const COMPANION = {
  companionAssets: [
    {
      assetId: "c1",
      assetLabel: "다른 주택",
      assetKind: "housing" as const,
      standardPriceAtTransfer: 400_000_000,
      directExpenses: 0,
      acquisitionCause: "purchase" as const,
      acquisitionDate: "2010-01-01",
      fixedAcquisitionPrice: 111_000_000,
      reductions: [] as unknown[],
      isOneHousehold: false,
    },
  ],
  totalSalePrice: 1_000_000_000,
  standardPriceAtTransferForApportion: 400_000_000,
};

const MIXED = {
  ...COMMON,
  propertyType: "mixed-use-house" as const,
  mixedUse: {
    isMixedUseHouse: true as const,
    residentialFloorArea: 60,
    nonResidentialFloorArea: 40,
    buildingFootprintArea: 50,
    totalLandArea: 100,
    landAcquisitionDate: "2009-03-01",
    buildingAcquisitionDate: "2009-03-01",
    transferStandardPrice: {
      housingPrice: 300_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 2_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 150_000_000,
      commercialBuildingPrice: 50_000_000,
      landPricePerSqm: 1_000_000,
    },
    residencePeriodYears: 0,
    zoneType: "general_residential" as const,
  },
};

const REDEV = {
  ...COMMON,
  propertyType: "redevelopment_apt" as const,
  redevelopment: {
    subject: "apt" as const,
    approvalLawBasis: "urban_renovation_art_74" as const,
    approvalDate: "2018-06-20",
    rightsValue: 400_000_000,
    settlementDirection: "pay" as const,
    settlementAmount: 0,
    preApprovalExpenses: 0,
    originalAssetType: "housing" as const,
    acquisitionStdPrice: 200_000_000,
    managementDisposalStdPrice: 400_000_000,
  },
};

const BURDENED = {
  ...COMMON,
  propertyType: "housing" as const,
  transferType: "burdened_gift" as const,
  burdenedGiftInfo: {
    valuationMode: "sangjeungbeop_standard" as const,
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 300_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_001,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 500_000_001,
    donorRelation: "lineal_descendant" as const,
  },
};

/** 단건 ↔ 함께양도 대조. marker가 단건에만 있으면 "일괄이 삼켰다"는 뜻이다. */
async function compare(payload: object, marker: string) {
  const single = await POST(req(payload));
  const bundled = await POST(req({ ...payload, ...COMPANION }));
  const [sBody, bBody] = [await single.json(), await bundled.json()];
  return {
    singleStatus: single.status,
    bundledStatus: bundled.status,
    singleMode: sBody.data?.mode,
    bundledMode: bBody.data?.mode,
    inSingle: JSON.stringify(sBody).includes(marker),
    inBundled: JSON.stringify(bBody).includes(marker),
  };
}

const GB = {
  ...COMMON,
  propertyType: "general_building" as const,
  generalBuildingValuation: {
    landArea: 100,
    buildingFootprintArea: 50,
    transferLandPricePerSqm: 2_000_000,
    transferBuildingStdPrice: 200_000_000,
    acqLandPricePerSqm: 1_000_000,
    acqBuildingStdPrice: 100_000_000,
    buildingAcquisitionCause: "purchase" as const,
    zoneType: "general_residential" as const,
  },
};

/**
 * 상가·오피스텔 — **전용 route 분기가 없다**. `route.ts:363`에서 `engineInput`에 실려
 * `calculateTransferTax` 내부(환산취득가 §164⑥)에서 처리된다.
 * → if-체인 순서 결함의 대상이 아닐 수 있다. 실측으로 판정한다.
 */
const CB = {
  ...COMMON,
  propertyType: "commercial_building" as const,
  useEstimatedAcquisition: true,
  acquisitionPrice: 0,
  commercialBuildingValuation: {
    isPreDisclosure: false,
    exclusiveArea: 60,
    commonArea: 20,
    landArea: 30,
    unitPriceAtTransfer: 3_000_000,
    unitPriceAtAcquisition: 1_500_000,
    landPriceAtTransfer: 2_000_000,
    landPriceAtAcquisition: 1_000_000,
  },
};

describe("함께양도가 특수 계산 경로를 삼킨다 (라우트 if-체인 순서)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it("🔴 겸용주택 — 단건 mode=mixed-use / 함께양도에서 분리계산 소실", async () => {
    const r = await compare(MIXED, "housingPart");
    expect(r.singleStatus).toBe(200);
    expect(r.singleMode).toBe("mixed-use");
    expect(r.inSingle, "단건 대조군이 녹색이어야 소실이 입증된다").toBe(true);
    expect(r.bundledMode).toBe("bundled");
    expect(r.inBundled, "일괄에서 겸용 분리계산이 사라진다").toBe(false);
  });

  it("🔴 재개발 — 단건에는 redevelopment 산출물, 함께양도에서 소실", async () => {
    const r = await compare(REDEV, "redevelopment");
    expect(r.singleStatus).toBe(200);
    expect(r.inSingle).toBe(true);
    expect(r.inBundled).toBe(false);
  });

  it("🔴 일반건물 — 단건 토지·건물 분리 안분이 함께양도에서 소실", async () => {
    const r = await compare(GB, "generalBuilding");
    expect(r.singleStatus).toBe(200);
    expect(r.inSingle).toBe(true);
    expect(r.inBundled).toBe(false);
  });

  it("🔴 일반건물 — 단건 필수 검증(zoneType)조차 함께양도에서는 타지 않는다", async () => {
    // 분기 미실행의 **결정적 증거**: 단건이면 500으로 막히는 입력이 일괄에서는 200으로 통과한다.
    const noZone = {
      ...GB,
      generalBuildingValuation: { ...GB.generalBuildingValuation, zoneType: undefined },
    };
    const single = await POST(req(noZone));
    const bundled = await POST(req({ ...noZone, ...COMPANION }));
    expect(single.status).toBe(500);
    expect(bundled.status).toBe(200);
  });

  it("상가·오피스텔 — 계산 정상 + 상세도 이제 일괄에 실린다 (R1-a)", async () => {
    // 상가는 전용 route 분기가 없고 `engineInput`에 실려 엔진 내부에서 처리된다(route.ts:363).
    // → if-체인 순서 결함의 대상이 **아니다**(차단하지 않은 근거).
    //   marker 부재만 보고 결함이라 판정했다면 오진이었다 — 산출값까지 봐야 한다.
    const r = await compare(CB, "commercialBuildingValuationDetail");
    expect(r.singleStatus).toBe(200);
    expect(r.inSingle, "단건 대조군이 녹색이어야 판정이 성립한다").toBe(true);
    // R1-a 이전에는 false였다(표시 갭). `pickValuationDetails()`가 복구했다.
    expect(r.inBundled, "🟢 상가 환산 상세가 일괄 자산별 결과에 실린다").toBe(true);

    // 계산은 처음부터 정상이었다 — 양도차익이 단건과 동일하고 필요경비도 음수가 아니다.
    const sb = await (await POST(req(CB))).json();
    const bb = await (await POST(req({ ...CB, ...COMPANION }))).json();
    const bp = bb.data.aggregated.properties.find(
      (x: { propertyId: string }) => x.propertyId === "primary",
    );
    expect(bp.transferGain).toBe(sb.data.result.transferGain);
    expect(bp.necessaryExpense, "필요경비가 음수가 아니다 — 내부 모순 없음").toBeGreaterThanOrEqual(0);
  });

  /**
   * 일괄 결과의 **상세 카드 표시 갭** — 계산 손실이 아니다.
   *
   * `transfer-tax-aggregate.ts:181`이 자산별로 `calculateTransferTax`를 **완전히 호출**하므로
   * 계산은 전부 수행된다. 그런데 `PerPropertyBreakdown` 조립부(:526~)가 그 결과에서
   * **Detail 4개만 골라 담고** 나머지는 버린다 → 결과 화면에 산출근거가 안 나온다.
   *
   * 단건 `TransferTaxResult`의 Detail은 **40개**, 집계는 **4개**.
   * 세액에는 영향이 없으므로 차단 대상이 아니며, 결과 화면 완성도 관점의 후속 항목이다.
   */
  /**
   * 계약 타입 ↔ 주입 헬퍼 **1:1 동기화**를 소스 수준에서 강제한다.
   *
   * 가장 위험한 실패 모드는 "타입만 넓히고 헬퍼를 빠뜨리는 것"이다 — TypeScript가 잡지 않고
   * 일괄 경로에서 값이 조용히 비어 화면에 안 뜬다(⑫⑬⑭ 침묵 strip과 같은 부류).
   */
  it.each([
    // 25종 — 2026-08-05 §95⑤ 용도변경 echo(`usageConversionDetail`) 추가. 감면은 아니지만
    // LTHD가 낳는 echo라 `rental97LthdDetail`과 같은 계약에 실린다.
    ["감면·LTHD echo 25종", "TransferReductionDetailSource", "pickReductionDetails", 25],
    ["평가·판정 13종", "TransferValuationDetailSource", "pickValuationDetails", 13],
  ])("%s — 계약 ↔ 주입 헬퍼 동기화", async (_label, typeName, fnName, minCount) => {
    const { readFileSync } = await import("node:fs");
    const typeSrc = readFileSync("lib/tax-engine/types/transfer-result.types.ts", "utf8");
    const contract = [
      ...new Set(
        [...typeSrc
          .slice(typeSrc.indexOf(`export type ${typeName}`))
          .split(">;")[0]
          .matchAll(/"(\w+)"/g)].map((m) => m[1]),
      ),
    ].sort();

    // picker 2종은 800줄 정책으로 `-pickers.ts`로 분리됐다(2026-08-04, Phase A-0).
    const engineSrc = readFileSync("lib/tax-engine/transfer-tax-aggregate-pickers.ts", "utf8");
    const body = engineSrc.slice(engineSrc.indexOf(`function ${fnName}`));
    const picked = [
      ...new Set([...body.slice(0, body.indexOf("\n}")).matchAll(/^\s+(\w+):/gm)].map((m) => m[1])),
    ].sort();

    expect(contract.length).toBe(minCount);
    expect(picked, `${fnName}가 ${typeName} 계약과 어긋난다`).toEqual(contract);
  });

  it("ValuationDetailCards가 계약 필드를 모두 렌더 분기한다", async () => {
    // 계약·헬퍼가 값을 옮겨도 컴포넌트가 분기하지 않으면 화면에는 여전히 안 나온다.
    const { readFileSync } = await import("node:fs");
    const typeSrc = readFileSync("lib/tax-engine/types/transfer-result.types.ts", "utf8");
    const contract = [
      ...new Set(
        [...typeSrc
          .slice(typeSrc.indexOf("export type TransferValuationDetailSource"))
          .split(">;")[0]
          .matchAll(/"(\w+Detail)"/g)].map((m) => m[1]),
      ),
    ];
    const ui = readFileSync("components/calc/results/transfer/ValuationDetailCards.tsx", "utf8");
    // ⚠️ 파일 전체를 훑으면 상단 `hasAny` 체크에 걸려 **렌더 분기를 지워도 통과**한다.
    //    JSX(`return (` 이후)로 범위를 좁혀야 실제 렌더 여부를 본다.
    const jsx = ui.slice(ui.lastIndexOf("return ("));
    const missing = contract.filter((f) => !jsx.includes(`result.${f}`));
    expect(missing, "계약에 있으나 컴포넌트가 렌더하지 않는 필드").toEqual([]);
  });

  it("🟢 감면 상세가 일괄 자산별 결과에 실린다 (표시 갭 복구)", async () => {
    // 자경농지 감면(조특법 §69)을 companion에 걸고 그 자산의 breakdown을 확인한다.
    // 종전에는 감면 **금액**만 반영되고 `selfFarmingReductionDetail`이 버려져
    // 결과 화면에 "감면" 배지만 뜨고 산출근거를 볼 수 없었다.
    const withFarmland = {
      ...COMMON,
      propertyType: "housing" as const,
      companionAssets: [
        {
          ...COMPANION.companionAssets[0],
          assetId: "farm",
          assetLabel: "농지(밭)",
          assetKind: "land" as const,
          reductions: [{ type: "self_farming", farmingYears: 18 }],
        },
      ],
      totalSalePrice: 1_000_000_000,
      standardPriceAtTransferForApportion: 400_000_000,
    };
    const res = await POST(req(withFarmland));
    expect(res.status).toBe(200);
    const body = await res.json();
    const farm = body.data.aggregated.properties.find(
      (x: { propertyId: string }) => x.propertyId === "farm",
    );
    expect(farm, "companion 자산 breakdown이 있어야 한다").toBeDefined();
    expect(
      farm.selfFarmingReductionDetail,
      "🔴 감면 산출근거가 일괄 결과에 실려야 화면에 카드가 뜬다",
    ).toBeDefined();
  });

  it("표시 갭은 **계산에 영향이 없다** — 일괄 자산별 양도차익 = 단건", async () => {
    // 갭을 "경미"로 분류하는 근거. 이 단언이 깨지면 표시 갭이 아니라 계산 결함이다.
    const sb = await (await POST(req(CB))).json();
    const bb = await (await POST(req({ ...CB, ...COMPANION }))).json();
    const bp = bb.data.aggregated.properties.find(
      (x: { propertyId: string }) => x.propertyId === "primary",
    );
    expect(bp.transferGain).toBe(sb.data.result.transferGain);
    expect(bp.transferGain).toBeGreaterThan(0);
  });

  it("🔴 부담부증여 — §159 gain과 안분 양도가액이 충돌해 **필요경비가 음수**가 된다", async () => {
    // ⚠️ 부담부증여만 메커니즘이 다르다. 겸용·재개발·일반건물은 route 분기가 **미실행**이지만,
    //    부담부증여의 STEP 0.48은 엔진 내부라 **실행된다**. 문제는 route가 transferPrice를
    //    안분값(5억)으로 덮어쓰는데 gain은 §159 기준(채무 6억)으로 산출된다는 **스케일 충돌**이다.
    //    → 표시 필요경비 = 양도가 − 취득가 − 양도차익 = 500,000,000 − 300,000,000 − 291,000,000
    //      = **−91,000,000** (음수). 명백한 내부 모순이며 사용자에게 그대로 노출된다.
    const r = await compare(BURDENED, "debtRatio");
    expect(r.singleMode).toBe("single");
    expect(r.inSingle).toBe(true);
    expect(r.inBundled, "§159 breakdown이 일괄 결과에 실리지 않는다").toBe(false);

    const bb = await (await POST(req({ ...BURDENED, ...COMPANION }))).json();
    const bp = bb.data.aggregated.properties.find(
      (x: { propertyId: string }) => x.propertyId === "primary",
    );
    expect(bp.transferPrice, "안분 양도가액").toBe(500_000_000);
    expect(bp.necessaryExpense, "🔴 필요경비 음수 — 스케일 충돌의 직접 증거").toBeLessThan(0);
  });
});
