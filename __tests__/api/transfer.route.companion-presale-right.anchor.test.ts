/**
 * anchor — **컴패니언(다른 물건) × 분양권** 개방 (2026-09-03).
 *
 * ## 막고 있던 것 (착수 전 route 실측)
 *
 * | 층 | 종전 동작 |
 * |---|---|
 * | ⑧ | 「분양권(소득세법 §104①1호)은(는) 함께 양도와 같이 계산할 수 없습니다」 |
 * | ④ | `toEngineAssetKind`가 `presale_right` → **`"housing"`으로 fold** |
 * | ⑩ | companion `assetKind` enum 4종에 분양권 부재 |
 * | route | **200** — 그러나 분양권이 주택으로 계산됨 |
 *
 * 🔑 **재개발·일반건물(400)과 장벽의 종류가 다르다.** 저쪽은 ⑩ enum이 막아 계산이 아예 안
 * 됐지만, 분양권은 ④가 접어 보내 **200이면서 틀린 값**이 됐다. ⑧이 막고 있어 화면에서
 * 도달하지는 못했으므로 살아 있는 오산은 아니었다.
 *
 * ## 편차 — 세율 22%p가 fold에서 사라진다
 *
 * 같은 픽스처(취득 3억 2015-03-01 → 양도 6억 2024-06-01) 단건 실측:
 *
 * | 종류 | 세율 | 과세표준 | 총세액 |
 * |---|---:|---:|---:|
 * | 주택 | 38% | 243,500,000 | 79,849,000 |
 * | **분양권** | **60%**(§104①1호) | 297,500,000 | **196,350,000** |
 *
 * 분양권은 §95② 장기보유특별공제가 배제되고 §104①1호 단일세율이 붙는다. 주택으로 접히면
 * 둘 다 사라져 **누진 그룹**에 합산된다.
 *
 * ## 부수 — fold는 「부수토지 배율」 축도 오염시켰다
 *
 * `resolveHousingContextFromCompanion`(`bundled-split-helpers.ts:85`)은 컴패니언 중
 * `assetKind === "housing"`인 것을 찾아 **정착면적·배율**의 기준으로 삼는다. 분양권이
 * 주택으로 접혀 오면 **정착면적이 없는 권리**가 그 자리에 앉는다. fold를 걷어내면 원천 차단된다.
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

/** ④가 만든 body를 가로채 route에 직접 먹인다 — ④→⑩⑫→⑭→엔진 전 구간 관통. */
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
  return { body: captured as { companionAssets?: Array<{ assetKind?: string }> }, status: res.status, json };
}

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

/** primary 주택 + companion 분양권. 총액 12억(각 6억). */
function form(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [asset(1), asset(2, { assetKind: "presale_right" })],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

describe("컴패니언 × 분양권 (소득세법 §104①1호)", () => {
  it("PR-1 ⑧이 더는 막지 않는다", () => {
    const msgs = collectStepIssues(0, form()).map((i) => i.message);
    expect(msgs.some((m) => /분양권.*함께 양도와 같이 계산할 수 없습니다/.test(m))).toBe(false);
  });

  it("PR-2 ④가 분양권을 주택으로 접지 않는다 (⑩ enum 통과)", async () => {
    const r = await pipeline(form());
    expect(r.body.companionAssets?.[0]?.assetKind).toBe("presale_right");
    expect(r.status, `route ${r.status} — ⑩ enum 확장 누락 의심`).toBe(200);
  });

  it("PR-3 분양권이 §104①1호 60% 세율군으로 분리된다", async () => {
    const r = await pipeline(form());
    const groups = r.json.data?.aggregated?.groupTaxes ?? [];
    const flat = groups.find((g) => g.appliedRate === 0.6);
    expect(flat, `60% 세율군 부재 — 세율군: ${groups.map((g) => g.appliedRate).join(",")}`).toBeDefined();
    // 컴패니언 1건만 그 군에 든다 — primary 주택은 누진으로 남는다.
    expect(flat!.assetIds).toHaveLength(1);
    expect(flat!.assetIds[0]).not.toBe("primary");
    const prog = groups.find((g) => g.group === "progressive");
    expect(prog?.assetIds).toEqual(["primary"]);
  });

  it("PR-4 fold 상태의 단일 누진 그룹이 아니다 (판별력)", async () => {
    const r = await pipeline(form());
    const groups = r.json.data?.aggregated?.groupTaxes ?? [];
    // 종전(fold): progressive 1개 그룹에 두 자산이 함께 들어 169,860,000.
    expect(groups).toHaveLength(2);
    const single = groups.find((g) => g.assetIds.length === 2);
    expect(single, "두 자산이 한 세율군에 남아 있다 — fold 잔존").toBeUndefined();
  });
});
