/**
 * anchor — **컴패니언(다른 물건) × 일반건물(토지+건물 일괄)** 개방 (2026-09-03).
 *
 * 설계: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md` (권고 (B))
 *
 * ## 막고 있던 것 — 배관이 아니라 **route 구조**였다
 *
 * `route.ts`의 5-a(일괄 `:172`)가 `if (bundledOk) { … return NextResponse.json(…) }`이라
 * 5-a-3 일반건물 분기(`:471`)가 **도달조차 하지 않는다**. ⑩ enum도 함께 막고 있었다(400).
 *
 * ## 왜 GB가 겸용주택보다 먼저인가 (설계 §2)
 *
 * GB는 `buildProperties(cards) → TransferTaxItemInput[]`로 **5-a가 쓰는 것과 같은 형태**를
 * 이미 만든다(축 B `general-building-fractional.ts`가 「지분별 카드 concat → aggregate 1회」로
 * 그 패턴을 돌린다). 겸용주택은 `MixedUseGainBreakdown`으로 **세액까지 자체 완결**해서
 * aggregate에 합류할 경로가 없다 — 그쪽은 세액 계산 주체를 옮기는 별건이다.
 *
 * ## V-1 (설계 미검증 항목) — 이 anchor가 답한다
 *
 * 「GB 카드가 5-a의 자산 간 안분 결과를 받아 토지·건물로 다시 나눌 때, 축 B가 쓰는 분모와
 * 같은 키를 쓰는가」 ⇒ **2단 안분**이다. 5-a가 자산 간(§166⑥ 키)으로 나눈 몫을 GB 엔진의
 * `totalTransferPrice` 자리에 넣으면, GB가 **자기 기준시가 분모**(토지 + 건물)로 내부 분해한다.
 * 축 B가 `sharePrice`를 같은 자리에 넣는 것과 **완전히 같은 형태**다.
 *
 * ⇒ GBC-4가 그것을 **단건 GB 기준값과 대조**해 고정한다. 기준값을 상수로 박지 않고 **같은
 *   테스트에서 계산**하므로, 엔진이 바뀌면 양쪽이 함께 움직여 anchor가 조용히 굳지 않는다.
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
import { baseCardId } from "@/lib/tax-engine/general-building-share-id";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

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
  return {
    body: captured as {
      companionAssets?: Array<{ assetKind?: string; generalBuildingValuation?: Record<string, unknown> }>;
    },
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

/**
 * 일반건물 — 환산 경로(§97①1호나목). 양도시 기준시가 = 토지 300,000,000(1,500,000 × 200㎡)
 * + 건물 200,000,000 = **500,000,000**.
 */
const GB_FIELDS = {
  assetKind: "general_building",
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  acquisitionDate: "2015-03-01",
  useEstimatedAcquisition: true,
  landAcqMode: "estimated",
  buildingAcqMode: "estimated",
  gbLandArea: "200",
  gbBuildingFootprintArea: "100",
  gbZoneType: "commercial",
  // 환산 모드 필수 — ⑧이 요구한다(`transfer-tax-validate-gb.ts:407`). 유닛 anchor는
  // 특정 차단 메시지만 보고 route probe는 ⑧을 건너뛰어, 이 누락을 **E2E가 잡았다**.
  gbBuildingArea: "300",
  gbTransferLandPricePerSqm: "1500000",
  gbTransferBuildingValue: "200000000",
  gbAcqLandPricePerSqm: "750000",
  gbAcqBuildingValue: "100000000",
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
    standardPriceAtTransfer: "500000000",
    standardPriceAtAcq: "250000000",
    ...over,
  };
}

/** primary 주택 + companion 일반건물. 양도시 기준시가를 **같게** 두어 안분이 정확히 50:50이 된다. */
function bundledForm(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [asset(1), asset(2, { ...GB_FIELDS, standardPriceAtTransfer: "500000000" })],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

/** 단건 일반건물 — 양도가액 600,000,000(컴패니언 몫과 같다). GBC-4의 기준값. */
function singleGbForm(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [asset(1, GB_FIELDS)],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "600000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

describe("컴패니언 × 일반건물 (시행령 §166⑥ 2단 안분)", () => {
  it("GBC-1 ⑧이 더는 막지 않는다", () => {
    const msgs = collectStepIssues(0, bundledForm()).map((i) => i.message);
    expect(msgs.some((m) => /일반건물.*함께 양도와 같이 계산할 수 없습니다/.test(m))).toBe(false);
  });

  /**
   * ⚠️ 이 항목은 **④ emit과 ⑩ 통과만** 본다 — payload는 Zod **앞**의 값이라 ⑫ 등록 여부를
   *    구별하지 못한다(⑫를 지워도 통과함을 뮤테이션으로 확인). ⑫→⑭ 도달은 GBC-3·GBC-4가 본다.
   */
  it("GBC-2 ④가 GB 서브객체를 emit하고 ⑩을 통과한다", async () => {
    const r = await pipeline(bundledForm());
    expect(r.body.companionAssets?.[0]?.assetKind).toBe("general_building");
    expect(r.status, `route ${r.status} — ⑩ enum 확장 누락 의심`).toBe(200);
    const gbv = r.body.companionAssets?.[0]?.generalBuildingValuation;
    expect(gbv, "⑬ emit 또는 ⑫ 등록 누락 — 침묵 strip").toBeDefined();
    expect(gbv!.landArea).toBe(200);
    expect(gbv!.transferBuildingStdPrice).toBe(200_000_000);
  });

  it("GBC-3 컴패니언 1건이 토지·건물 **2 item**으로 펼쳐진다", async () => {
    const r = await pipeline(bundledForm());
    const props =
      (r.json.data as { aggregated?: { properties?: Array<{ propertyId: string }> } })?.aggregated
        ?.properties ?? [];
    // primary 주택 1 + GB 토지 1 + GB 건물 1 = 3
    expect(props).toHaveLength(3);
    const ids = props.map((p) => p.propertyId);
    expect(ids[0]).toBe("primary");
    // 파트 카드 id는 `<카드>#<컴패니언 assetId>` — `baseCardId`가 접미사를 벗기는 규약과 같다.
    const bases = ids.slice(1).map((id) => baseCardId(id));
    expect(bases).toEqual(["land", "building"]);
    // 접미사가 컴패니언 assetId여야 한다(지분 인덱스가 아니다) — 자산 간 충돌 방지.
    const companionId = (r.body.companionAssets as unknown as Array<{ assetId: string }>)[0].assetId;
    expect(ids.slice(1).every((id) => id.endsWith(companionId))).toBe(true);
  });

  it("GBC-4 GB 두 파트 차익 합 = 같은 양도가액 단건 GB의 차익 (2단 안분 판별력)", async () => {
    const bundled = await pipeline(bundledForm());
    const single = await pipeline(singleGbForm());
    expect(single.status, `단건 GB 기준값 산출 실패 ${single.status}`).toBe(200);

    const props =
      (bundled.json.data as {
        aggregated?: { properties?: Array<{ propertyId: string; transferGain: number }> };
      })?.aggregated?.properties ?? [];
    /**
     * 🔴 **파트가 정확히 2건임을 먼저 단언한다.** 이것 없이 합계만 보면 확장이 없어도
     *    (컴패니언 1건이 일반 자산으로 계산돼) 우연히 같은 값이 나와 **구별력이 0**이 된다 —
     *    ⑫ 제거 뮤테이션에서 실제로 그랬다.
     */
    const gbParts = props.filter((p) => p.propertyId !== "primary");
    expect(gbParts, "GB가 파트로 펼쳐지지 않았다 — 확장 미실행").toHaveLength(2);
    const gbSum = gbParts.reduce((s, p) => s + p.transferGain, 0);

    const singleGain = (single.json.data as { aggregated?: { totalTransferGain?: number } })
      ?.aggregated?.totalTransferGain;

    expect(gbSum, "컴패니언 GB 차익 합이 0 — 카드 확장 미실행").toBeGreaterThan(0);
    expect(singleGain, "단건 GB 기준값을 읽지 못했다").toBeGreaterThan(0);
    // 🔑 기준값을 상수로 박지 않는다 — 엔진이 바뀌면 양쪽이 함께 움직여야 한다.
    expect(gbSum).toBe(singleGain);
  });
  /**
   * 🔴 **GBC-5 — ⑩ refine의 「⑧ 통과 ↔ ⑩ 400」 모순**.
   *
   * `addCompanionAcquisitionCauseRefines`가 `purchase` + `useEstimatedAcquisition`에
   * 컴패니언-수준 `standardPriceAtAcquisition`을 요구했다. 그런데 일반건물은 환산 기준시가를
   * **자기 서브객체가 갖고**(`acquisitionLandPricePerSqm`·`acquisitionBuildingStdPrice`),
   * ⑧은 GB를 `validateGeneralBuildingAsset`에 통째로 위임해 그 칸을 요구하지 않는다.
   * ⇒ 화면은 통과시키고 route가 400을 내는 **안내 없는 dead-end**였다.
   *
   * ⚠️ **위 GBC-1~4의 픽스처는 이 결함을 못 잡는다** — 기본 자산이 `standardPriceAtAcq`를
   *    들고 있어 refine이 만족돼 버린다. **E2E가 먼저 잡았고**(그쪽 GB 자산에는 그 칸이 없다),
   *    여기서 유닛으로 고정한다. 픽스처가 우연히 채워 준 값이 결함을 가리는 전형이다.
   */
  it("GBC-5 컴패니언-수준 취득시 기준시가가 없어도 계산된다 (⑧↔⑩ 모순 방지)", async () => {
    const f = bundledForm();
    // GB 컴패니언에서 일반 기준시가 칸을 **비운다** — 화면에도 그 칸이 없다.
    (f.assets[1] as unknown as Record<string, unknown>).standardPriceAtAcq = "";
    const msgs = collectStepIssues(0, f).map((i) => i.message);
    expect(msgs, "⑧이 막으면 이 anchor의 전제가 무너진다").toHaveLength(0);

    const r = await pipeline(f);
    expect(r.status, `route ${r.status} — ⑩ refine이 GB를 예외 처리하지 않는다`).toBe(200);
  });
});
