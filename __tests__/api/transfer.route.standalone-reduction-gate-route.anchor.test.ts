/**
 * anchor: standalone 감면의 **자산 종류 게이트**(§69)와 **매수 경로축**(§77의3) — 2026-08-24
 *
 * ## 🔴 착수 전 실측이 계획을 뒤집었다
 *
 * 이 배치는 원래 「§69·§77의2·§77의3 **입력 UI 신설** + 경로축 + 게이트」였다. 그런데
 * P-0 실측에서 **세부 입력 서브패널이 세 조문 모두 이미 존재**했다
 * (`app/calc/transfer-tax/steps/Step5.tsx` — §69 자경기간·§77의3 6필드·§77의2 2필드).
 * 값을 채우면 ⑧을 통과하고 ④⑫⑭를 지나 엔진까지 도달해 세액을 움직인다:
 *
 * | 조문 | P-0 감면세액 | 종전 판정 |
 * |---|---|---|
 * | §69 자경농지 | 100,000,000 (연 한도) | 「위젯 없어 항상 0」 ⇒ **오판** |
 * | §77의3 개발제한구역 | 174,774,000 (40% 1호) | 「위젯 없어 ⑧ 차단」 ⇒ **오판** |
 * | §77의2 대토보상 | 131,373,744 (40% × 대토비율 0.75) | 「위젯 없어 ⑧ 차단」 ⇒ **오판** |
 *
 * 당시 관측한 차단은 **기본값이 비어 있어서**(정상 동작)였지 위젯 부재가 아니었다.
 * ⇒ 남은 실재 갭은 **둘**이고, 이 anchor가 그 둘을 고정한다.
 *
 * ## 갭 1 — §69가 주택에도 걸린다 (자산 종류 게이트 부재)
 *
 * 조특법 §69①은 「… 직접 경작한 **토지** 중 대통령령으로 정하는 **토지**의 양도로 인하여
 * 발생하는 소득 …」이라 대상을 토지로 명시한다. 그런데 `asset-kind-gate.ts`의
 * `standalone` 분기가 **무조건 `true`** 여서 주택 자산에 100% 감면을 걸 수 있었다.
 *
 * ⚠️ 안전망 실측: standalone 게이트를 `assetKind === "land"`로 **완전히 뒤집는 뮤테이션**에
 *    357파일 3,286건이 **전건 통과**했다 — 자산 종류 판정을 보는 테스트가 0건이었다.
 *
 * ## 갭 2 — §77의3 ①의 §17/§20을 가르지 못한다 (매수 경로축 부재)
 *
 * 조특법 §77의3①은 「해당 토지등을 같은 법 **제17조**에 따른 토지매수의 청구 **또는** 같은 법
 * **제20조**에 따른 협의매수를 통하여」로 **한 항에 두 경로**를 담는데 대상 범위가 다르다
 * (「개발제한구역의 지정 및 관리에 관한 특별조치법」 MST 286509 원문):
 *
 * | 경로 | 문언 | 대상 |
 * |---|---|---|
 * | §17① | 「… 사실상 불가능하게 된 토지(이하 "**매수대상토지**"라 한다)의 소유자 … **그 토지**의 매수를 청구」 | **토지만** |
 * | §20① | 「개발제한구역의 **토지와 그 토지의 정착물**(이하 "토지등"이라 한다)을 매수」 | 토지 + **건물** |
 *
 * ②(해제 후)는 공익사업법 협의매수·수용이라 이 축을 쓰지 않는다.
 *
 * 🔑 **경로는 감면율을 가르지 않는다** — 40%/25%는 호(1호/2호)가 정한다. 가르는 것은
 *    **대상 범위**뿐이라 엔진 산식은 그대로고, 갈리는 곳은 ⑧ 게이트와 일반건물 카드 필터다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
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
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { validateStep2Reductions } from "@/lib/calc/transfer-tax-validate-reductions";
import { getStandaloneDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetReductionForm, TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";

const BASE = {
  propertyType: "land" as const,
  transferDate: "2026-03-01",
  acquisitionDate: "2000-01-01",
  transferPrice: 2_000_000_000,
  acquisitionPrice: 400_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
};

async function post(over: object = {}) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...BASE, ...over }),
    }),
  );
  const json = (await res.json()) as {
    data?: { result: { reductionAmount: number } };
    error?: unknown;
  };
  return { status: res.status, result: json.data?.result, error: json.error };
}

/** ⑧ 검증용 최소 폼 — 자산 1건 + 감면 1건. */
function formWith(reductions: AssetReductionForm[], assetKind: AssetForm["assetKind"] = "land") {
  const asset = { ...makeDefaultAsset(1), assetKind, acquisitionDate: "2000-01-01", reductions };
  return { assets: [asset], transferDate: "2026-03-01" } as unknown as TransferFormData;
}

const selfFarming = (): AssetReductionForm =>
  ({ ...getStandaloneDefault("self_farming"), farmingYears: "10" }) as AssetReductionForm;

/** §77의3 ① 1호 성립 픽스처 — 지정일 이전 취득 + 거주. 경로만 갈아끼운다. */
const gb = (over: Record<string, unknown> = {}): AssetReductionForm =>
  ({
    ...getStandaloneDefault("gb_designated_land"),
    gbBranch: "in_zone",
    gbPurchaseRoute: "negotiated",
    gbDesignationDate: "2005-01-01",
    gbTriggerDate: "2026-01-01",
    gbResided: true,
    ...over,
  }) as AssetReductionForm;

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

describe("§69 자산 종류 게이트", () => {
  it("SG-01: 토지에는 그대로 적용된다 (회귀 0 — P-0 실측 100,000,000)", async () => {
    const r = await post({ reductions: toEngineReductions([selfFarming()], "purchase") });
    expect(r.status).toBe(200);
    expect(r.result!.reductionAmount).toBe(100_000_000);
    expect(validateStep2Reductions(2, formWith([selfFarming()], "land"))).toBeNull();
  });

  it("SG-02: 🔴 **주택에서는 차단된다** (§69① 「직접 경작한 토지」 — 종전 통과)", () => {
    const issue = validateStep2Reductions(2, formWith([selfFarming()], "housing"));
    expect(issue).not.toBeNull();
    expect(issue!.message).toContain("토지 양도에만");
  });

  it("SG-03: 사유 문구가 **거꾸로 나가지 않는다** (§69는 「주택 전용」의 반대다)", () => {
    const issue = validateStep2Reductions(2, formWith([selfFarming()], "building"));
    expect(issue!.message).not.toContain("주택 양도에만");
  });

  it("SG-04: 입주권·재개발APT·상가·일반건물 전부 차단 — 권리·건물은 「토지」가 아니다", () => {
    for (const kind of [
      "right_to_move_in",
      "presale_right",
      "commercial_building",
      "general_building",
      "redevelopment_apt",
    ] as const) {
      expect(validateStep2Reductions(2, formWith([selfFarming()], kind)), kind).not.toBeNull();
    }
  });

  it("SG-05: 대조군 — §77·§77의2는 「토지등」이라 건물에서도 통과한다 (게이트 확대 금지)", () => {
    const exp = {
      ...getStandaloneDefault("public_expropriation"),
      expropriationCash: "1,000,000,000",
      expropriationApprovalDate: "2024-01-01",
    } as AssetReductionForm;
    const rl = {
      ...getStandaloneDefault("replacement_land_comp"),
      rlLandComp: "1,500,000,000",
    } as AssetReductionForm;
    expect(validateStep2Reductions(2, formWith([exp], "building"))).toBeNull();
    expect(validateStep2Reductions(2, formWith([rl], "building"))).toBeNull();
  });
});

describe("§77의3 매수 경로축 (§17 / §20)", () => {
  it("GR-01: 🔴 ① 경로 **미선택은 차단**된다 (§17/§20은 대상 범위가 달라 기본값이 없다)", () => {
    const issue = validateStep2Reductions(2, formWith([gb({ gbPurchaseRoute: "" })]));
    expect(issue!.message).toContain("매수 경로");
  });

  it("GR-02: ② 해제 후는 경로 미선택이어도 통과한다 (공익사업법 경로 — 축 대상 아님)", () => {
    const released = gb({
      gbBranch: "released",
      gbPurchaseRoute: "",
      gbReleasedDate: "2025-06-01",
    });
    expect(validateStep2Reductions(2, formWith([released]))).toBeNull();
  });

  it("GR-03: 🔴 §17 매수청구 + **토지 파트가 없는 자산**은 차단된다 (「매수대상토지」)", () => {
    const claim = gb({ gbPurchaseRoute: "claim" });
    for (const kind of ["housing", "building", "right_to_move_in"] as const) {
      const issue = validateStep2Reductions(2, formWith([claim], kind));
      expect(issue, kind).not.toBeNull();
      expect(issue!.message).toContain("매수대상토지");
    }
  });

  it("GR-04: §17 매수청구 + 토지·일반건물·상가는 통과 (토지 파트가 독립 계산된다)", () => {
    const claim = gb({ gbPurchaseRoute: "claim" });
    for (const kind of ["land", "general_building", "commercial_building"] as const) {
      expect(validateStep2Reductions(2, formWith([claim], kind)), kind).toBeNull();
    }
  });

  it("GR-05: 🔴 ④가 경로를 **payload에 싣는다** (①만 — ②는 키 자체가 없다)", () => {
    const inZone = toEngineReductions([gb({ gbPurchaseRoute: "claim" })], "purchase")[0] as Record<
      string,
      unknown
    >;
    expect(inZone.purchaseRoute).toBe("claim");

    const released = toEngineReductions(
      [gb({ gbBranch: "released", gbReleasedDate: "2025-06-01" })],
      "purchase",
    )[0] as Record<string, unknown>;
    expect(released.purchaseRoute).toBeUndefined();
  });

  /**
   * ⚠️ 이 케이스는 **⑫ strip을 봉인하지 못한다** — 단건 경로에서는 경로가 세액을 바꾸지 않기
   *    때문이다(실측: Zod에서 `purchaseRoute`를 지운 뮤테이션에 이 파일 + 카드 leaf anchor
   *    **20/20 전건 통과**). ⑫ 봉인은 일반건물 route를 지나는 GBRT-03이 맡는다
   *    (`transfer.route.gb-reduction-penalty-f17.anchor.test.ts`).
   */
  it("GR-06: 경로를 실어도 400이 나지 않는다 (⑫ 스키마 수용 — strip 봉인은 GBRT-03)", async () => {
    const payload = toEngineReductions([gb({ gbPurchaseRoute: "negotiated" })], "purchase");
    const r = await post({ reductions: payload });
    expect(r.status, JSON.stringify(r.error)).toBe(200);
    // 경로는 감면율을 가르지 않는다 — 1호 40%가 그대로 나온다(P-0 실측값과 동일).
    expect(r.result!.reductionAmount).toBe(174_774_000);
  });

  it("GR-07: 경로가 **세액을 바꾸지 않는다** — 가르는 것은 대상 범위뿐이다", async () => {
    const claim = await post({
      reductions: toEngineReductions([gb({ gbPurchaseRoute: "claim" })], "purchase"),
    });
    const negotiated = await post({
      reductions: toEngineReductions([gb({ gbPurchaseRoute: "negotiated" })], "purchase"),
    });
    expect(claim.result!.reductionAmount).toBe(negotiated.result!.reductionAmount);
  });
});
