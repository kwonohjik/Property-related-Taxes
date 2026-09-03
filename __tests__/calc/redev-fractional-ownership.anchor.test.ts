/**
 * anchor — 재개발·입주권 × 공유지분(축 A) **§166 필드별 스케일 정합**.
 *
 * 계획서: `docs/02-design/features/transfer-fractional-single-asset-declaration.plan.md` §3.6~3.9
 *
 * ## 결함 (수정 전 실측 — 회귀 판별용으로 남긴다)
 *
 * `buildRedevelopmentPayload`가 **지분율을 전혀 몰랐다**. 권리가액·청산금·필요경비가 100%로 남아
 * 취득가액이 부풀고 **양도차익이 과소**해졌다:
 *
 * | 40% 지분 · 원조합원 | 양도차익 | |
 * |---|---|---|
 * | 수정 전 | 170,000,000 | 🔴 |
 * | 수정 후 = 지분분 직접입력 | **302,000,000** | ✅ |
 *
 * 세액으로는 **68,026,797원 과소**였다.
 *
 * ## 스케일 규율 (근거)
 *
 * - **O `rightsValue`(평가액)** — §166④1호 「관리처분계획등에 따라 **정하여진 가격**」.
 *   「도시 및 주거환경정비법」 §39①1호가 **공유는 대표 1명을 조합원으로 본다**고 하므로
 *   계획은 공유자별로 가격을 따로 정하지 않는다 ⇒ 각자의 몫은 지분율로 귀속된다.
 * - **O 인가전·인가후 필요경비** — §97①2·3호. 화면 규약 「필요경비는 100% 기준 입력」.
 * - **🔴 X `settlementAmount`(청산금)** — §166①1호 「**납부한** 청산금」은 **사실**이다.
 *   조합은 청산금을 대표조합원 1인에게 부과하고 공유자 간 분담은 **내부 약정**이라
 *   지분율로 파생되지 않는다. 엔진이 쪼개면 자동 안분 fallback(정책 위반).
 *   ⇒ 사용자가 **지분 해당분을 직접 입력**한다(부담부증여 인수채무와 같은 구조).
 * - **X 기준시가류** — §166③ 환산에서 분자·분모로 함께 나타나 **약분**된다. 줄이면 이중 축소.
 *
 * ## 검증 방식
 *
 * `P`(지분율 40% + 물건 전체 입력)와 `Q`(지분율 100% + 모든 값을 지분분으로 직접 입력)가
 * **같은 결과**를 내야 한다. **청산금은 양쪽 모두 지분 해당분**을 넣는다 — 그것이 규약이다.
 *
 * ⚠️ 이 anchor는 **route를 태운다** — 서브객체는 ④에서 만들어져 ⑫⑬⑭를 거친다.
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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

/** 청산금은 **스케일하지 않는다** — 양쪽 모두 이 값(지분 해당분)을 그대로 쓴다. */
const SETTLEMENT_SHARE = "80000000";

/**
 * @param k 1 → 물건 전체(100%) 기준 입력 · 0.4 → 모든 값을 지분분으로 직접 입력
 */
function mkForm(
  assetKind: string,
  redevSubject: string,
  num: string,
  den: string,
  k: number,
  over: Record<string, unknown> = {},
): TransferFormData {
  const m = (v: number) => String(Math.floor(v * k));
  const a = {
    ...makeDefaultAsset(1),
    assetKind,
    acquisitionCause: "purchase",
    acquisitionDate: "2010-01-01",
    ownershipNumerator: num,
    ownershipDenominator: den,
    ownershipRemainderThirdParty: num === den ? "" : "yes",
    redevSubject,
    redevOriginalAssetType: "housing",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevApprovalDate: "2018-05-01",
    redevSettlementDirection: "pay",
    redevSettlementSaleDate: "2023-05-01",
    redevRightsValue: m(500_000_000),
    redevSettlementAmount: SETTLEMENT_SHARE,
    redevPreApprovalExpenses: m(30_000_000),
    redevPostApprovalExpenses: m(20_000_000),
    // 원조합원 실가 모드의 인가전 종전주택 취득가액 — ⑧ validate가 필수로 요구하는 실제 경로다.
    // (상위 `transfer-tax-api.ts`의 `shareOf(...)` 삼항 안에 있어 이미 지분 스케일된다 — U2-03.)
    redevActualAcquisitionPrice: m(400_000_000),
    fixedAcquisitionPrice: m(400_000_000),
    standardPriceAtTransfer: "800000000",
    standardPriceAtAcq: "300000000",
    capitalExpenditure: m(10_000_000),
    transferExpense: m(5_000_000),
    ...over,
  } as AssetForm;
  return {
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    assets: [a],
    houses: [],
    presaleRights: [],
    contractTotalPrice: m(1_000_000_000),
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

async function run(form: TransferFormData) {
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
    data?: { result?: { transferGain?: number; totalTax?: number } };
  };
  expect(res.status, `계산 실패: ${JSON.stringify(json).slice(0, 220)}`).toBe(200);
  return {
    redev: (cap.body!.redevelopment ?? {}) as Record<string, number>,
    gain: json.data?.result?.transferGain ?? 0,
    tax: json.data?.result?.totalTax ?? 0,
  };
}

const VARIANTS: [string, Record<string, unknown>][] = [
  ["원조합원 · 청산금 납부", {}],
  ["원조합원 · 청산금 수령", { redevSettlementDirection: "receive" }],
  [
    "환산(§166③ — 취득가액 확인불가)",
    {
      redevAcquisitionStdPrice: "200000000",
      redevManagementDisposalStdPrice: "400000000",
      fixedAcquisitionPrice: "",
      redevActualAcquisitionPrice: "",
    },
  ],
  ["승계조합원", { redevIsSuccessorMember: "yes" }],
];

describe("R4 RV — 재개발·입주권 × 공유지분 스케일 정합", () => {
  for (const [assetKind, subject] of [
    ["redevelopment_apt", "apt"],
    ["right_to_move_in", "right"],
  ]) {
    for (const [vname, over] of VARIANTS) {
      it(`RV: ${assetKind} / ${vname}`, async () => {
        const P = await run(mkForm(assetKind, subject, "40", "100", 1, over));
        const Q = await run(mkForm(assetKind, subject, "100", "100", 0.4, over));

        // 픽스처가 실제로 차익을 내는지 — 0끼리 비교하는 무의미 통과 차단
        expect(P.gain).toBeGreaterThan(0);
        // 성분별 독립 floor 때문에 원 단위 오차 허용(잔액 흡수 금지 — 소득세법 §100②)
        expect(Math.abs(P.gain - Q.gain)).toBeLessThanOrEqual(2);
        expect(Math.abs(P.tax - Q.tax)).toBeLessThanOrEqual(2);
      }, 30_000);
    }
  }

  it("RV-P: payload — 평가액·필요경비는 지분분, **청산금은 입력값 그대로**", async () => {
    const { redev } = await run(mkForm("redevelopment_apt", "apt", "40", "100", 1));
    expect(redev.rightsValue).toBe(200_000_000); // 5억 × 0.4
    expect(redev.preApprovalExpenses).toBe(12_000_000); // 3천만 × 0.4
    // 🔴 스케일 X — §166①1호 「납부한 청산금」은 사실이다
    expect(redev.settlementAmount).toBe(Number(SETTLEMENT_SHARE));
  });

  it("RV-S: 단독 소유(100%)는 완전 무변경 (회귀 가드)", async () => {
    const { redev } = await run(mkForm("redevelopment_apt", "apt", "100", "100", 1));
    expect(redev.rightsValue).toBe(500_000_000);
    expect(redev.preApprovalExpenses).toBe(30_000_000);
  });
});
