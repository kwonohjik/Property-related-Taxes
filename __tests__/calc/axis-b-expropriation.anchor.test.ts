/**
 * anchor — 축 B(지분 분할 취득) × **공익수용**(소령 §164⑨1호 · 조특법 §77 계열).
 *
 * ## 종전 차단 사유가 틀렸다
 *
 * Gate-B는 「지분 분할 양도가액 = 총양도가 × 지분율이라 공익수용(**보상가액**)과 비양립」이라며
 * 막고 있었다. 실측하니 **양도가액은 총계약가를 그대로 쓴다** —
 * `transfer-tax-api.ts`의 `transferPrice` 삼항에 수용 분기가 없다.
 *
 * 보상 관련 필드는 §164⑨1호 **환산 분모** 전용이다:
 * - per-sqm 트랙(토지·건물·상가·일반건물): `denominator = min(기준시가㎡당, 보상㎡당, 보상기준㎡당) × 면적`
 * - 총액 트랙(주택): `denominator = min(양도시 기준시가총액, 보상총액, 보상기준총액)`
 *
 * 환산취득가 = `양도가액 × (취득시 기준시가 ÷ denominator)`이므로 **분모는 비율 성분**이고
 * 분자(취득시 기준시가)와 **약분**된다. 양도가액이 이미 지분분이면 결과도 지분분이다.
 * ⇒ **지분 스케일이 애초에 불필요**하다(재개발의 권리가액·청산금과 정반대 성질).
 *
 * ## 검증 기준
 *
 * **취득일을 같게 둔** 60% + 40% 2카드의 합계가 **단건 100%와 차익·세액 모두 일치**해야 한다.
 * 그리고 **각 카드에서 §164⑨ 특례가 실제로 발동**해야 한다 — 일치만으로는 「양쪽 다 미발동」과
 * 구별되지 않으므로 `expropriationValuationDetail`/`housingExpropriationValuationDetail`의
 * 존재를 함께 단언한다.
 *
 * ⚠️ 자산별 `reductionAmount`는 단건과 **다를 수 있다** — 집계 M-8이 §133 한도를 신고단위로
 *    재계산한 뒤 자산에 배분하기 때문이다. 판정 기준은 **최종 세액**이다.
 *
 * ⚠️ 수치는 mock 세율표 실측값이지 「정본 세액」이 아니다.
 */
import { describe, it, expect, vi } from "vitest";
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
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const EXPR = {
  transferCause: "public_expropriation",
  expropriationNoticeDate: "2023-01-01",
  useEstimatedAcquisition: true,
  standardPriceAtTransfer: "300000000",
  standardPriceAtAcq: "100000000",
};
/** per-sqm 트랙 3필드 — min(3,000,000 / 2,800,000 / **2,500,000**) × 100㎡ = 250,000,000 */
const PER_SQM = {
  standardPricePerSqmAtTransfer: "3000000",
  transferArea: "100",
  compensationPerSqm: "2800000",
  compensationBasisStdPrice: "2500000",
};

function form(over: Record<string, unknown>, shares: string[]): TransferFormData {
  return {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: shares.map(
      (num, i) =>
        ({
          ...makeDefaultAsset(i + 1),
          acquisitionCause: "purchase",
          acquisitionDate: "2010-01-01",
          ownershipNumerator: num,
          ownershipDenominator: "100",
          ...EXPR,
          ...over,
        }) as AssetForm,
    ),
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
    householdHousingCount: "2",
    isOneHousehold: false,
  } as unknown as TransferFormData;
}

/** §164⑨ 특례가 실제로 발동했는지 — 「일치」가 「양쪽 다 미발동」이 아님을 가른다. */
const fired = (o?: Record<string, unknown>): boolean =>
  !!o && (!!o.expropriationValuationDetail || !!o.housingExpropriationValuationDetail);

async function run(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
        isNonBusinessLand: false,
        annualBasicDeductionUsed: 0,
        ...cap.body,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
      }),
    }),
  );
  const json = (await res.json()) as {
    data?: {
      result?: Record<string, unknown>;
      aggregated?: { totalTax?: number; properties?: Record<string, unknown>[] };
    };
  };
  expect(res.status, `계산 실패: ${JSON.stringify(json).slice(0, 220)}`).toBe(200);
  const single = json.data?.result;
  if (single) {
    return {
      gain: single.transferGain as number,
      tax: single.totalTax as number,
      allFired: fired(single),
      cards: 1,
    };
  }
  const props = json.data?.aggregated?.properties ?? [];
  return {
    gain: props.reduce((s, p) => s + ((p.transferGain as number) ?? 0), 0),
    tax: json.data?.aggregated?.totalTax as number,
    allFired: props.length > 0 && props.every(fired),
    cards: props.length,
  };
}

const CASES: [string, Record<string, unknown>][] = [
  ["토지 (per-sqm 트랙)", { assetKind: "land", landNature: "independent", ...PER_SQM }],
  ["건물 (per-sqm 트랙)", { assetKind: "building", ...PER_SQM }],
  [
    "주택 (총액 트랙)",
    {
      assetKind: "housing",
      housingCompensationTotal: "280000000",
      housingCompensationBasisTotal: "250000000",
    },
  ],
  [
    "토지 + §77 감면 (현금6:채권4)",
    {
      assetKind: "land",
      landNature: "independent",
      ...PER_SQM,
      reductions: [
        {
          type: "public_expropriation",
          expropriationCash: "600000000",
          expropriationBond: "400000000",
          expropriationBondHoldingYears: "none",
          expropriationApprovalDate: "2023-01-01",
        },
      ],
    },
  ],
  [
    "토지 + §77 감면 (전액 현금)",
    {
      assetKind: "land",
      landNature: "independent",
      ...PER_SQM,
      reductions: [
        {
          type: "public_expropriation",
          expropriationCash: "1000000000",
          expropriationBond: "0",
          expropriationBondHoldingYears: "none",
          expropriationApprovalDate: "2023-01-01",
        },
      ],
    },
  ],
  [
    "토지 + §77의2 대토보상",
    {
      assetKind: "land",
      landNature: "independent",
      ...PER_SQM,
      reductions: [
        { type: "replacement_land_comp", rlCashComp: "400000000", rlLandComp: "600000000" },
      ],
    },
  ],
];

describe("축 B × 공익수용 — 단건 100%와 정합", () => {
  for (const [name, over] of CASES) {
    it(`X: ${name}`, async () => {
      const full = await run(form(over, ["100"]));
      const axisB = await run(form(over, ["60", "40"]));

      // 픽스처가 실제로 §164⑨ 특례를 태우는지 — 「양쪽 다 미발동」인 무의미 통과 차단
      expect(full.allFired, "단건에서 §164⑨ 특례 미발동 — 픽스처를 확인할 것").toBe(true);
      expect(axisB.allFired, "축 B **전 카드**에서 §164⑨ 특례가 발동해야 한다").toBe(true);
      expect(axisB.cards).toBe(2);

      expect(axisB.gain).toBe(full.gain);
      expect(axisB.tax).toBe(full.tax);
    }, 30_000);
  }

  it("X-D 감면이 실제로 세액을 움직인다 — 판별력", async () => {
    const plain = await run(form({ assetKind: "land", landNature: "independent", ...PER_SQM }, ["60", "40"]));
    const reduced = await run(form(CASES[3][1], ["60", "40"]));
    expect(reduced.tax).toBeLessThan(plain.tax);
  }, 30_000);

  it("X-G ⑧ Gate-B: 공익수용 × 축 B가 **통과**한다", () => {
    const msgs = collectStepIssues(
      0,
      form({ assetKind: "land", landNature: "independent", ...PER_SQM }, ["60", "40"]) as never,
    ).map((i) => i.message);
    expect(msgs.some((m) => /지분 분할 취득과 함께 계산할 수 없습니다/.test(m))).toBe(false);
    expect(msgs.some((m) => /함께 양도와 같이 계산할 수 없습니다/.test(m))).toBe(false);
  });
});

/**
 * §77의3(개발제한구역) — **판별력 없음**을 명시적으로 기록한다.
 *
 * 이 픽스처는 요건 미충족으로 **감면이 0**이라 「일치」가 그 축을 증명하지 못한다.
 * 감면이 발동하는 픽스처를 만들면 위 `CASES`로 승격할 것.
 */
describe("축 B × §77의3 — 🟡 판별력 없는 확인", () => {
  it("X-GB 일치하지만 감면 0이라 그 축을 증명하지 못한다", async () => {
    const over = {
      assetKind: "land",
      landNature: "independent",
      ...PER_SQM,
      reductions: [
        {
          type: "gb_designated_land",
          gbBranch: "in_zone",
          gbDesignationDate: "1990-01-01",
          gbTriggerDate: "2023-01-01",
          gbFreeEconZone: false,
          gbResided: true,
          gbPurchaseRoute: "claim",
        },
      ],
    };
    const full = await run(form(over, ["100"]));
    const axisB = await run(form(over, ["60", "40"]));
    expect(axisB.tax).toBe(full.tax);
    // 🟡 감면 0 — 이 단언이 「감면 축이 정합함」을 뜻하지 않는다는 사실 자체를 고정한다.
    const plain = await run(form({ assetKind: "land", landNature: "independent", ...PER_SQM }, ["100"]));
    expect(full.tax).toBe(plain.tax);
  }, 30_000);
});
