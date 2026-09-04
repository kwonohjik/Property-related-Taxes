/**
 * anchor — **컴패니언(다른 물건) × 겸용주택 분리계산** 개방 (2026-09-04).
 *
 * 설계: `docs/02-design/features/transfer-bundled-subengine-hosting.design.md`
 * 사용자 결정 **Q-1 = 「분리」**(파트별 세율군 유지) · V-2~V-4 실측 완료.
 *
 * ## 막고 있던 것
 *
 * route 5-a(일괄 `:172`)가 `return`해 5-a-2 겸용 분기(`:362`)가 **도달조차 하지 않는다**.
 * 실측: primary 겸용 + 토지 컴패니언의 `groupTaxes`가 **일반주택 대조군과 완전 동일**했다.
 *
 * ## V-2~V-4 실측 결과 (aggregate 재현 가능)
 *
 * | | 실측 |
 * |---|---|
 * | **V-2** §89① 12억 | 재현 ✅ — 10.7억 → `isExempt: true`, 15억 → 안분 후 차익 × LTHD |
 * | **V-3** LTHD 표1/표2 | 재현 ✅ — 거주 120개월 **0.8** vs 거주 0 **0.28** |
 * | **V-4** 비사토 파트 | 재현 ✅ — `non_business_land` 별도 세율군 · `surchargeRate 0.10` |
 *
 * 🔴 **12억 판정은 카드 단위다.** 주택분을 토지·건물 2카드로 쪼개면 각 8억(합 16억)일 때
 *    **둘 다 비과세**가 된다(실측). ⇒ 주택분은 **한 카드**로 묶는다 — 겸용 엔진의
 *    `rateParts`도 주택을 `kind: "housing"` **하나**로 본다(토지·건물 합산 income).
 *
 * ## 파트 카드 구성 — 겸용 엔진 `rateParts`와 1:1
 *
 * | 카드 | `propertyType` | 근거 |
 * |---|---|---|
 * | 주택(토지+건물) | `housing` | §104①2·3호 괄호(딸린 토지 포함) |
 * | 상가 토지 | `land` | |
 * | 상가 건물 | `building` | |
 * | 배율초과 비사토 | `land` + `isNonBusinessLand` | §104⑤ 후단(별개 자산) · §104①8호 |
 *
 * ## ✅ 열었다 (2026-09-04)
 *
 * | 지점 | 내용 |
 * |---|---|
 * | leaf 승격 | route 5-a-2의 25필드 조립을 `buildMixedUseAssetInput`으로 — 컴패니언이 **같은 소스**를 쓴다 |
 * | ⑩⑫ | `assetKind` += `mixed_use_house` · `mixedUse` 서브객체 + **없으면 400**인 refine |
 * | ⑬ | ④가 컴패니언마다 `buildMixedUsePayload`를 싣는다 |
 * | ⑭ | `buildMixedUsePartCards` — 겸용 엔진 1회 호출 후 **파트 4~5장**으로 대체 |
 * | ⑧ | 차단을 **primary 겸용만**으로 좁혔다 |
 *
 * 🔑 **설계 §9.2가 틀렸다.** 「주택은 토지+건물 **한 카드**」로 적혀 있었으나, 주택분 장특은
 *    토지·건물 **각각의 보유기간**으로 계산해 더하므로 한 카드로는 재현할 수 없다
 *    (실측 38,272,640원 차이). 주택은 **2카드 + `totalPropertyTransferPrice`**가 정답이다 —
 *    12억 판정은 그 분모가 담당한다. 등가는 `mixed-use-part-cards.equivalence.anchor.test.ts`가 고정한다.
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
    body: captured as { companionAssets?: Array<{ assetKind?: string; mixedUse?: Record<string, unknown> }> },
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

type AggProp = { propertyId?: unknown; rateGroup?: unknown };
function aggregated(r: { json: Record<string, unknown> }) {
  return (r.json as { data?: { aggregated?: { properties?: AggProp[] } } }).data?.aggregated ?? {};
}

/** 겸용주택 — 주택 60㎡ · 상가 40㎡ · 정착 50㎡ · 대지 600㎡(배율초과 발생). */
const MIXED_FIELDS = {
  assetKind: "housing",
  isMixedUseHouse: true,
  acquisitionCause: "purchase",
  acquisitionDate: "2009-03-01",
  useEstimatedAcquisition: false,
  residentialFloorArea: "60",
  nonResidentialFloorArea: "40",
  buildingFootprintArea: "50",
  mixedUseTotalLandArea: "600",
  mixedTransferHousingPrice: "900000000",
  mixedTransferCommercialBuildingPrice: "300000000",
  mixedTransferLandPricePerSqm: "2000000",
  mixedAcqHousingPrice: "300000000",
  mixedAcqCommercialBuildingPrice: "100000000",
  mixedAcqLandPricePerSqm: "1000000",
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

/** primary 주택 + companion 겸용주택. 기준시가를 같게 두어 안분이 50:50. */
function bundledForm(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [
      asset(1),
      asset(2, { ...MIXED_FIELDS, standardPriceAtTransfer: "500000000", actualSalePrice: "600000000" }),
    ],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

/** primary가 겸용인 조합 — **계속 차단**된다(별건 축). */
function primaryMixedForm(): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    assets: [asset(1, MIXED_FIELDS), asset(2)],
    transferDate: "2024-06-01",
    filingDate: "2024-08-31",
    contractTotalPrice: "1200000000",
    householdHousingCount: "2",
  } as TransferFormData;
}

describe("컴패니언 × 겸용주택 (시행령 §160① 단서)", () => {

  it("MU-2 primary 겸용은 **계속 차단**된다 (양성 대조군 · 별건 축)", () => {
    const msgs = collectStepIssues(0, primaryMixedForm()).map((i) => i.message);
    expect(
      msgs.some((m) => /겸용주택은 함께 양도의 주 자산\(1번\)이 될 수 없습니다/.test(m)),
      "primary 겸용까지 열면 5-a의 primary 조립부를 바꿔야 한다 — 이번 범위 밖",
    ).toBe(true);
  });

  it("MU-1 컴패니언 겸용은 ⑧을 통과한다 (차단 해제)", () => {
    const msgs = collectStepIssues(0, bundledForm()).map((i) => i.message);
    expect(msgs.filter((m) => /겸용주택/.test(m))).toEqual([]);
  });

  it("MU-3 ⑬⑫ 도달 — `mixed_use_house` + `mixedUse` 서브객체가 실린다", async () => {
    const r = await pipeline(bundledForm());
    expect(r.body.companionAssets?.[0]?.assetKind).toBe("mixed_use_house");
    // 🔴 서브객체가 없으면 ⑭ 분기가 안 타고 평범한 주택으로 계산된다(침묵 오산).
    expect(r.body.companionAssets?.[0]?.mixedUse).toBeDefined();
    expect(r.status).toBe(200);
  });

  it("MU-4 ⑭ 겸용 컴패니언 1건이 **파트 5장**으로 펼쳐진다", async () => {
    const r = await pipeline(bundledForm());
    const props = aggregated(r).properties ?? [];
    // primary 1 + 겸용 파트 5
    expect(props).toHaveLength(6);
    expect(props.map((p) => String(p.propertyId).split("#")[0])).toEqual([
      "primary",
      "mu-house-land",
      "mu-house-bld",
      "mu-comm-land",
      "mu-comm-bld",
      "mu-nbl",
    ]);
    // 🔑 파트 id는 `#<assetId>`로 자산을 되짚을 수 있어야 한다(결과뷰·신고서).
    expect(props.slice(1).every((p) => String(p.propertyId).includes("#"))).toBe(true);
  });

  it("MU-5 배율초과 파트가 §104⑤ 후단 **별개 자산**으로 갈린다", async () => {
    const r = await pipeline(bundledForm());
    const props = aggregated(r).properties ?? [];
    const nbl = props.find((p) => String(p.propertyId).startsWith("mu-nbl"));
    expect(nbl?.rateGroup).toBe("non_business_land");
    // 대조군 — 주택·상가 파트는 그 세율군이 아니다(전건이 비사토가 되는 오류 방지).
    expect(props.filter((p) => p.rateGroup === "non_business_land")).toHaveLength(1);
  });

  it("MU-6 ⑩ `mixedUse` 없이 `mixed_use_house`를 보내면 **400** (침묵 오산 금지)", async () => {
    const r = await pipeline(bundledForm());
    const body = JSON.parse(JSON.stringify(r.body)) as {
      companionAssets: { mixedUse?: unknown }[];
    };
    delete body.companionAssets[0].mixedUse;
    const res = await POST(
      new NextRequest("http://localhost/api/calc/transfer", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });



});
