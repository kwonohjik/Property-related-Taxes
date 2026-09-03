/**
 * anchor — **컴패니언(다른 물건) × 조합원입주권·재개발APT (시행령 §166)** 개방 (2026-09-03).
 *
 * 계획서: `docs/02-design/features/transfer-companion-remaining-4.plan.md` §3
 *
 * ## 두 자산의 장벽이 서로 달랐다 (착수 전 route 실측)
 *
 * | 컴패니언 | ④ payload | route |
 * |---|---|---|
 * | **입주권** | `toEngineAssetKind`가 **housing으로 fold** | 200 · §166 없이 주택으로 계산 |
 * | **재개발APT** | `redevelopment_apt` 유지 | **400** — ⑩ enum 부재 |
 *
 * 같은 §166 자산인데 한쪽은 접혀서 통과하고 한쪽은 튕겼다. 둘 다 ⑧이 막고 있어 화면
 * 도달은 없었다(살아 있는 오산 아님 — 축 개방).
 *
 * ## 왜 배관만으로 되는가
 *
 * `buildRedevelopmentPayload(asset, ownershipRatio)`가 **이미 존재**하고 절대금액 성분
 * (권리가액·필요경비)의 지분 스케일까지 처리한다(축 A에서 구현). 컴패니언은 **각 자산이
 * 자기 물건의 100%**라 스케일 자체가 불요하다 ⇒ 자산별로 같은 빌더를 부르면 된다.
 *
 * ⑫에 `redevelopment` 서브객체를 등록하지 않으면 **침묵 strip**이라, 그 자산만 §166을 잃고
 * 일반 주택 산식으로 계산된다(fold와 같은 결과).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

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
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

async function pipeline(form: TransferFormData) {
  let captured: unknown = null;
  const orig = global.fetch;
  global.fetch = (async (_u: unknown, init: { body?: string }) => {
    captured = JSON.parse(init?.body ?? "{}");
    return { ok: true, status: 200, json: async () => ({ success: true, data: {} }) };
  }) as unknown as typeof fetch;
  try {
    await callTransferTaxAPI(form);
  } catch {
    /* body만 필요하다 */
  }
  global.fetch = orig;
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      body: JSON.stringify(captured),
      headers: { "content-type": "application/json" },
    }),
  );
  const json = (await res.json()) as {
    data?: { mode?: string; aggregated?: AggregateTransferResult };
    error?: unknown;
  };
  return {
    body: captured as {
      companionAssets?: Array<{ assetKind?: string; redevelopment?: Record<string, unknown> }>;
    },
    status: res.status,
    json,
  };
}

/** §166 필수입력 전건 — 원조합원 실가 모드 · 청산금 납부 · 종전자산 주택. */
const REDEV_166 = {
  redevApprovalLawBasis: "urban_renovation_art_74",
  redevApprovalDate: "2018-05-01",
  redevRightsValue: "350000000",
  redevSettlementDirection: "pay",
  redevSettlementAmount: "50000000",
  redevPreApprovalExpenses: "0",
  redevOriginalAssetType: "housing",
  redevActualAcquisitionPrice: "300000000",
};

function asset(i: number, over: Record<string, unknown> = {}) {
  return {
    ...makeDefaultAsset(i),
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    useEstimatedAcquisition: false,
    fixedAcquisitionPrice: "300000000",
    actualSalePrice: "600000000",
    standardPriceAtTransfer: "400000000",
    standardPriceAtAcq: "200000000",
    ...over,
  };
}

function form(companionKind: "right_to_move_in" | "redevelopment_apt"): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [asset(1), asset(2, { assetKind: companionKind, ...REDEV_166 })],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

describe.each([
  ["조합원입주권", "right_to_move_in"],
  ["재개발·재건축 APT", "redevelopment_apt"],
] as const)("컴패니언 × %s (시행령 §166)", (label, kind) => {
  it(`RD-1 ⑧이 더는 막지 않는다 — ${label}`, () => {
    const msgs = collectStepIssues(0, form(kind)).map((i) => i.message);
    expect(msgs.some((m) => /함께 양도와 같이 계산할 수 없습니다/.test(m))).toBe(false);
  });

  it(`RD-2 ④가 자산 종류를 접지 않고 ⑩을 통과한다 — ${label}`, async () => {
    const r = await pipeline(form(kind));
    expect(r.body.companionAssets?.[0]?.assetKind).toBe(kind);
    expect(r.status, `route ${r.status} — ⑩ enum 확장 누락 의심`).toBe(200);
  });

  it(`RD-3 ⑫가 §166 서브객체를 strip하지 않는다 — ${label}`, async () => {
    const r = await pipeline(form(kind));
    const redev = r.body.companionAssets?.[0]?.redevelopment;
    expect(redev, "⑬ emit 또는 ⑫ 등록 누락 — 침묵 strip").toBeDefined();
    expect(redev!.approvalDate).toBe("2018-05-01");
    expect(redev!.rightsValue).toBe(350_000_000);
    expect(redev!.subject).toBe(kind === "right_to_move_in" ? "right" : "apt");
  });

  it(`RD-4 컴패니언 결과에 §166 산출물이 실린다 (판별력) — ${label}`, async () => {
    const r = await pipeline(form(kind));
    const props = r.json.data?.aggregated?.properties ?? [];
    expect(props).toHaveLength(2);
    // primary 주택에는 없고 컴패니언에만 있다 — 「둘 다 없음」으로 통과하는 것을 막는다.
    expect(props[0].redevelopmentDetail).toBeUndefined();
    expect(
      props[1].redevelopmentDetail,
      "§166 산출물 부재 — 서브객체가 엔진에 도달하지 않았다",
    ).toBeDefined();
  });
});
