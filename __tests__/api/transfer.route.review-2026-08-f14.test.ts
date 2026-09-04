/**
 * anchor — F14 · 일괄양도 **컴패니언** 감면의 일자 변환이 27 variant 중 3개만 돼 있었다.
 *
 * ## 결함 (코드리뷰 2026-08, CONFIRMED)
 *
 * `bundled-split-helpers.ts`에 `mapCompanionReductions`라는 **전용 매퍼**가 따로 있었고,
 * 그 매퍼는 `public_expropriation` · `replacement_land_comp` · `self_farming` 3개만
 * string → Date로 바꾸고 나머지는 `return r as TransferReduction`으로 통과시켰다.
 * 그런데 ⑫(`companionAssetSchema.reductions`)는 `z.array(reductionSchema)` — **27 variant 전부**를
 * 받고, 클라이언트도 자산마다 같은 감면 패널을 렌더한다.
 *
 * ⇒ **같은 감면인데 자산1(primary)과 자산2(companion)의 세액이 달랐다.**
 *   · §77의3 개발제한구역: `designationDate`가 string으로 도달 → `Date < string`이 침묵 false가 되어
 *     ①1호(40%)가 아니라 ①2호(25%)로 떨어졌다.
 *   · §97 장기임대: 기간 판정이 전부 어긋나 `OUT_OF_PERIOD`로 감면이 통째로 소실됐다.
 *   · §99의4·§98의9: `.getTime is not a function` TypeError → 계산 자체가 **500**.
 *
 * ## 수정
 *
 * 전용 매퍼를 삭제하고 단건·다건이 이미 쓰는 정본 `mapReductionsToEngine`
 * (`route-reductions-mapper.ts`)을 그대로 호출한다. `CompanionRawAsset.reductions`는
 * 느슨한 index-signature 대신 `z.infer<typeof reductionSchema>` 유니온으로 재타이핑해,
 * variant가 늘 때 한쪽만 갱신되는 일을 **컴파일러가 잡게** 했다.
 *
 * F14-1이 이 회귀의 본체다 — 일자 필드를 갖는 20 variant 전부를 훑는다.
 * (전용 매퍼로 되돌리면 3 variant를 뺀 17건이 red)
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

// route를 먼저 import해야 스키마 모듈 순환 초기화(TDZ)가 정상 순서로 풀린다.
import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildCompanionEngineInputs } from "@/app/api/calc/transfer/bundled-split-helpers";
import { companionAssetSchema } from "@/lib/api/transfer-tax-schema-sub";

// ─── 공통 ────────────────────────────────────────────────────────

const CTX = {
  primaryAcquisitionDate: new Date("2003-03-27"),
  transferDate: new Date("2026-06-15"),
  // 겸용 축 없음 — 명시 opt-out(누락을 컴파일 에러로 남기기 위한 `| null`)
  mixedUseCtx: null,
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

/** 감면 1건을 companion에 실어 엔진 input의 `reductions[0]`을 꺼낸다. */
function mapOne(reduction: unknown): Record<string, unknown> {
  // ⑫를 실제로 통과시켜 「스키마가 받는 모양 그대로」를 매퍼에 넣는다(픽스처 창작 방지).
  const parsed = companionAssetSchema.safeParse({
    assetId: "c1",
    assetLabel: "동반자산",
    assetKind: "land",
    acquisitionCause: "purchase",
    acquisitionDate: "2003-03-27",
    reductions: [reduction],
  });
  expect(parsed.success, `⑫ 통과 실패: ${JSON.stringify(reduction)}`).toBe(true);
  const c = (parsed as { data: Record<string, unknown> }).data;

  const [engineInput] = buildCompanionEngineInputs(c as never, APPORTIONED, CTX);
  return (engineInput.reductions ?? [])[0] as unknown as Record<string, unknown>;
}

const RENTAL_97_COMMON = {
  registrationDate: "1995-02-01",
  rentalStartDate: "1995-03-01",
  isTaxRegistered: true,
} as const;

/**
 * 일자 필드를 갖는 감면 variant 전수 — `[payload, Date여야 하는 키들]`.
 * 정본 매퍼(`route-reductions-mapper.ts`)가 실제로 변환하는 키만 담는다.
 */
const DATE_BEARING_VARIANTS: Array<[string, Record<string, unknown>, string[]]> = [
  [
    "public_expropriation",
    {
      type: "public_expropriation",
      cashCompensation: 100_000_000,
      bondCompensation: 0,
      businessApprovalDate: "2020-01-01",
    },
    ["businessApprovalDate"],
  ],
  [
    "replacement_land_comp",
    {
      type: "replacement_land_comp",
      cashCompensation: 0,
      replacementLandComp: 100_000_000,
      businessApprovalDate: "2020-01-01",
    },
    ["businessApprovalDate"],
  ],
  [
    "self_farming",
    { type: "self_farming", farmingYears: 10, incorporationDate: "2010-01-01" },
    ["incorporationDate"],
  ],
  [
    "gb_designated_land",
    {
      type: "gb_designated_land",
      branch: "in_zone",
      designationDate: "2005-06-01",
      triggerDate: "2026-05-01",
      releasedDate: "2024-01-01",
      residedFromAcqToTrigger: true,
      freeEconZone: false,
    },
    ["designationDate", "triggerDate", "releasedDate"],
  ],
  [
    "rental_97_main",
    { type: "rental_97_main", ...RENTAL_97_COMMON },
    ["registrationDate", "rentalStartDate"],
  ],
  [
    "rental_97_proviso",
    { type: "rental_97_proviso", ...RENTAL_97_COMMON },
    ["registrationDate", "rentalStartDate"],
  ],
  [
    "rental_97_2",
    { type: "rental_97_2", ...RENTAL_97_COMMON },
    ["registrationDate", "rentalStartDate"],
  ],
  [
    "rental_97_3",
    { type: "rental_97_3", ...RENTAL_97_COMMON },
    ["registrationDate", "rentalStartDate"],
  ],
  [
    "rental_97_4",
    { type: "rental_97_4", ...RENTAL_97_COMMON },
    ["registrationDate", "rentalStartDate"],
  ],
  [
    "rental_97_5",
    { type: "rental_97_5", ...RENTAL_97_COMMON },
    ["registrationDate", "rentalStartDate"],
  ],
  [
    "new_99",
    { type: "new_99", contractDate99: "1998-06-01", usageApprovalDate99: "1999-06-01" },
    ["contractDate99", "usageApprovalDate99"],
  ],
  [
    "new_99_3",
    { type: "new_99_3", contractDate993: "2001-06-01", usageApprovalDate993: "2002-06-01" },
    ["contractDate993", "usageApprovalDate993"],
  ],
  [
    "new_99_4_rural",
    { type: "new_99_4_rural", ruralHouseAcquisitionDate: "2010-05-01" },
    ["ruralHouseAcquisitionDate"],
  ],
  [
    "new_99_4_hometown",
    { type: "new_99_4_hometown", ruralHouseAcquisitionDate: "2010-05-01" },
    ["ruralHouseAcquisitionDate"],
  ],
  [
    "unsold_98",
    { type: "unsold_98", contractDate98: "1995-06-01" },
    ["contractDate98"],
  ],
  [
    "unsold_98_2",
    { type: "unsold_98_2", contractDate982: "2009-03-01" },
    ["contractDate982"],
  ],
  [
    "unsold_98_3",
    {
      type: "unsold_98_3",
      contractDate983: "2009-03-01",
      constructionStartDate983: "2009-01-01",
      usageApprovalDate983: "2010-01-01",
    },
    ["contractDate983", "constructionStartDate983", "usageApprovalDate983"],
  ],
  [
    "unsold_98_4",
    { type: "unsold_98_4", contractDate984: "2010-03-01" },
    ["contractDate984"],
  ],
  [
    "unsold_98_5",
    { type: "unsold_98_5", contractDate985: "2010-03-01" },
    ["contractDate985"],
  ],
  [
    "unsold_98_6",
    {
      type: "unsold_98_6",
      rentalContractDate986: "2011-04-01",
      rentalStartDate986: "2011-05-01",
      rentalEndDate986: "2013-05-01",
    },
    ["rentalContractDate986", "rentalStartDate986", "rentalEndDate986"],
  ],
  [
    "unsold_98_7",
    { type: "unsold_98_7", contractDate987: "2013-06-01" },
    ["contractDate987"],
  ],
  [
    "unsold_98_8",
    {
      type: "unsold_98_8",
      contractDate988: "2015-03-01",
      rentalStartDate988: "2015-04-01",
      rentalEndDate988: "2020-04-01",
    },
    ["contractDate988", "rentalStartDate988", "rentalEndDate988"],
  ],
  [
    "unsold_98_9",
    { type: "unsold_98_9", unsoldHouseAcquisitionDate: "2024-06-01" },
    ["unsoldHouseAcquisitionDate"],
  ],
  [
    "unsold_99_2",
    { type: "unsold_99_2", contractDate992: "2013-05-01", usageApprovalDate992: "2013-01-01" },
    ["contractDate992", "usageApprovalDate992"],
  ],
];

// ─── 라우트 헬퍼 ─────────────────────────────────────────────────

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

/** 대칭 시나리오 — primary·companion이 경제적으로 **완전히 동일한** 토지 2건. */
const SYMMETRIC_BASE = {
  propertyType: "land" as const,
  transferPrice: 500_000_000,
  transferDate: "2026-06-15",
  acquisitionPrice: 100_000_000,
  acquisitionDate: "2003-03-27",
  acquisitionCause: "purchase" as const,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  annualBasicDeductionUsed: 0,
  totalSalePrice: 1_000_000_000,
  standardPriceAtTransferForApportion: 300_000_000,
};

/** 조특법 §77의3 — 지정 2005-06-01 · 매수청구 2026-05-01 · 거주요건 충족 ⇒ ①1호 40% */
const GB_77_3 = {
  type: "gb_designated_land" as const,
  branch: "in_zone" as const,
  designationDate: "2005-06-01",
  triggerDate: "2026-05-01",
  residedFromAcqToTrigger: true,
  freeEconZone: false,
};

type Breakdown = {
  propertyId: string;
  transferGain: number;
  reductionAmount: number;
  determinedTax: number;
};

/** 엔진 실측값 — 산식 추론 아님 (수정 후 route POST 관측) */
const SYMMETRIC_REDUCTION = 34_584_000;
const SYMMETRIC_DETERMINED = 51_876_000;

describe("F14 — 컴패니언 감면 일자 변환 정본 매퍼 일원화", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });

  it.each(DATE_BEARING_VARIANTS)(
    "F14-1: %s — 컴패니언 감면의 일자가 Date로 도달한다",
    (_name, payload, dateKeys) => {
      const mapped = mapOne(payload);
      for (const key of dateKeys) {
        expect(
          mapped[key],
          `${_name}.${key} 가 string으로 엔진에 도달 — Date 비교가 침묵 false가 된다`,
        ).toBeInstanceOf(Date);
      }
    },
  );

  it("F14-2: §97 임대이력·공실기간 등 **중첩 배열**의 일자도 Date로 도달한다", () => {
    const mapped = mapOne({
      type: "rental_97_main",
      ...RENTAL_97_COMMON,
      rentHistory: [
        { contractDate: "1995-03-01", contractType: "jeonse", monthlyRent: 0, deposit: 10_000_000 },
      ],
      vacancyPeriods: [{ startDate: "1996-01-01", endDate: "1996-03-01" }],
    });

    const hist = mapped.rentHistory as Array<{ contractDate: unknown }>;
    const vac = mapped.vacancyPeriods as Array<{ startDate: unknown; endDate: unknown }>;
    expect(hist[0].contractDate).toBeInstanceOf(Date);
    expect(vac[0].startDate).toBeInstanceOf(Date);
    expect(vac[0].endDate).toBeInstanceOf(Date);
  });

  it("F14-3: 경제적으로 동일한 토지 2건 — §77의3 감면액이 **자산 위치와 무관하게** 같다", async () => {
    const { status, json } = await run({
      ...SYMMETRIC_BASE,
      reductions: [GB_77_3],
      companionAssets: [
        {
          assetId: "c1",
          assetLabel: "토지2",
          assetKind: "land",
          acquisitionCause: "purchase",
          acquisitionDate: "2003-03-27",
          fixedAcquisitionPrice: 100_000_000,
          standardPriceAtTransfer: 300_000_000,
          directExpenses: 0,
          reductions: [GB_77_3],
        },
      ],
    });

    expect(status).toBe(200);
    const props: Breakdown[] = json.data.aggregated.properties;
    expect(props).toHaveLength(2); // 대조군 — 컴패니언이 실제로 실려야 아래 단언이 의미를 갖는다

    const primary = props.find((p) => p.propertyId === "primary")!;
    const companion = props.find((p) => p.propertyId === "c1")!;

    // 안분·취득가·취득일이 완전히 같으므로 감면액도 같아야 한다.
    expect(primary.transferGain).toBe(companion.transferGain);
    expect(primary.reductionAmount).toBe(SYMMETRIC_REDUCTION);
    // 🔴 여기가 결함 지점이었다 — 종전 컴패니언은 ①2호(25%)로 떨어져 더 작은 값이 나왔다
    expect(companion.reductionAmount).toBe(SYMMETRIC_REDUCTION);
    expect(companion.determinedTax).toBe(SYMMETRIC_DETERMINED);
    expect(primary.determinedTax).toBe(SYMMETRIC_DETERMINED);
  });

  it("F14-4: §99의4 컴패니언이 500을 내지 않는다 (`.getTime is not a function`)", async () => {
    const { status } = await run({
      ...SYMMETRIC_BASE,
      reductions: [],
      companionAssets: [
        {
          assetId: "c1",
          assetLabel: "주택2",
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2003-03-27",
          fixedAcquisitionPrice: 100_000_000,
          standardPriceAtTransfer: 300_000_000,
          directExpenses: 0,
          reductions: [
            {
              type: "new_99_4_rural",
              ruralHouseAcquisitionDate: "2010-05-01",
              meetsLocationRequirement: true,
            },
          ],
        },
      ],
    });

    expect(status).toBe(200);
  });

  it("F14-5: §98의9 컴패니언도 500을 내지 않는다", async () => {
    const { status } = await run({
      ...SYMMETRIC_BASE,
      reductions: [],
      companionAssets: [
        {
          assetId: "c1",
          assetLabel: "주택2",
          assetKind: "housing",
          acquisitionCause: "purchase",
          acquisitionDate: "2003-03-27",
          fixedAcquisitionPrice: 100_000_000,
          standardPriceAtTransfer: 300_000_000,
          directExpenses: 0,
          reductions: [
            {
              type: "unsold_98_9",
              unsoldHouseAcquisitionDate: "2024-06-01",
              isNonCapitalRegion: true,
            },
          ],
        },
      ],
    });

    expect(status).toBe(200);
  });
});
