/**
 * anchor — 축 A(단건 공유지분) **선형성 불변식**: 지분 r이면 양도차익도 r배다.
 *
 * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md` §3.6
 *
 * ## 왜 이 불변식인가
 *
 * 화면 규약은 「모든 금액을 **100% 기준**으로 입력하고 시스템이 지분율을 자동 적용한다」이다
 * (`OwnershipRatioInput.tsx`). 그 규약이 지켜지면 **양도차익은 지분율에 정비례**해야 한다.
 * (세액은 누진·문턱 때문에 비선형이므로 **차익**으로 잰다.)
 *
 * ## 이 anchor가 잡는 것
 *
 * 자산-수준 **서브객체 빌더가 지분율을 빠뜨리는 것**. 실제로 재개발이 그랬다 —
 * `buildRedevelopmentPayload`에 ratio가 한 군데도 없어 권리가액·청산금이 100%로 남았다
 * (차익 138,000,000원 과소). 종전에도 같은 계열이 있었다(U2-03 — 「승계조합원 입주권·§166
 * 재개발 갈래가 100%로 새 나갔다」, 이월과세 F16 A-10/V-1, 부담부증여 #851).
 *
 * **새 서브객체를 추가할 때 이 anchor에 케이스를 함께 넣으면** 같은 누락이 조용히 반복되지 않는다.
 *
 * ⚠️ 재개발·입주권은 여기 넣지 않는다 — 현재 **차단**돼 있고(⑧ `isFractionalUnsupportedAssetKind`),
 *    비선형 상태를 anchor로 고정하면 결함을 정상으로 굳힌다. 차단 자체는 D8·D9가 지킨다.
 *    지분 스케일을 구현하면 그때 이 파일에 케이스를 **추가**할 것.
 *
 * ⚠️ 이 anchor는 **route를 태운다** — 서브객체는 ④에서 만들어져 ⑫⑬⑭를 거친다.
 *    leaf 직접 호출로는 빌더 누락을 볼 수 없다.
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 자산-수준 서브객체가 실제로 실리도록 각 종류의 필수 필드를 채운다. */
const CASES: Record<string, Record<string, unknown>> = {
  주택: { assetKind: "housing", fixedAcquisitionPrice: "400000000" },
  토지: { assetKind: "land", fixedAcquisitionPrice: "400000000", landNature: "independent" },
  분양권: { assetKind: "presale_right", fixedAcquisitionPrice: "400000000" },
  "상가(환산)": {
    assetKind: "commercial_building",
    useEstimatedAcquisition: true,
    cbExclusiveArea: "60",
    cbSharedArea: "20",
    cbLandArea: "30",
    cbUnitPriceAtTransfer: "5000000",
    cbUnitPriceAtFirstOrAcq: "2000000",
    cbLandPricePerSqmAtTransfer: "3000000",
  },
  "일반건물(환산)": {
    assetKind: "general_building",
    useEstimatedAcquisition: true,
    gbTransferLandPricePerSqm: "3000000",
    gbTransferBuildingValue: "200000000",
    gbLandArea: "100",
    gbBuildingFootprintArea: "60",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "80000000",
    gbZoneType: "general_residential",
    gbIsMetropolitan: false,
  },
  "일반건물(실가)": {
    assetKind: "general_building",
    useEstimatedAcquisition: false,
    gbTransferLandPricePerSqm: "3000000",
    gbTransferBuildingValue: "200000000",
    gbLandArea: "100",
    gbBuildingFootprintArea: "60",
    gbAcqLandPricePerSqm: "1000000",
    gbAcqBuildingValue: "80000000",
    gbZoneType: "general_residential",
    gbIsMetropolitan: false,
    fixedAcquisitionPrice: "400000000",
  },
};

function mkForm(over: Record<string, unknown>, num: string, den: string): TransferFormData {
  const a = {
    ...makeDefaultAsset(1),
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    ownershipNumerator: num,
    ownershipDenominator: den,
    ownershipRemainderThirdParty: num === den ? "" : "yes",
    standardPriceAtTransfer: "800000000",
    standardPriceAtAcq: "300000000",
    ...over,
  } as AssetForm;
  return {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "1000000000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

/** 단건 결과와 일반건물(파트별) 결과 양쪽에서 양도차익 합계를 꺼낸다. */
async function transferGainOf(form: TransferFormData): Promise<number> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
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
    error?: unknown;
    data?: {
      result?: { transferGain?: number };
      aggregated?: { properties?: { transferGain?: number }[] };
    };
  };
  expect(res.status, `계산 실패: ${JSON.stringify(json).slice(0, 200)}`).toBe(200);
  const single = json.data?.result?.transferGain;
  if (single !== undefined) return single;
  const props = json.data?.aggregated?.properties ?? [];
  return props.reduce((s, p) => s + (p.transferGain ?? 0), 0);
}

describe("R4 L — 축 A 선형성 불변식 (지분 40% ⇒ 양도차익 0.4배)", () => {
  for (const [name, over] of Object.entries(CASES)) {
    it(`L: ${name}`, async () => {
      const full = await transferGainOf(mkForm(over, "100", "100"));
      const part = await transferGainOf(mkForm(over, "40", "100"));
      expect(full).toBeGreaterThan(0); // 픽스처가 실제로 차익을 내는지 — 0끼리 비교하는 무의미 통과 차단
      // 성분별 독립 floor 때문에 원 단위 오차가 날 수 있다(잔액 흡수 금지 — 소득세법 §100②).
      expect(Math.abs(part - Math.floor(full * 0.4))).toBeLessThanOrEqual(2);
    }, 30_000);
  }
});
