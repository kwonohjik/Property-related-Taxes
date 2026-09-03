/**
 * A5 — 결함 `P2-01`(critical) + `S1-02`(critical) 회귀 anchor.
 *
 * 두 결함은 **수정 지점이 하나**다: 「함께 양도」(`assets.length > 1`) 경로의 특수 분기 차단 목록
 * `SINGLE_ONLY`(`lib/calc/transfer-tax-validate.ts:128~138`)에 `redevelopment_apt`만 있고
 * **`right_to_move_in`·`presale_right`가 없다**.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## 근거 조문
 *
 * · 「소득세법 시행령」 제166조 제1항 제1호 — 원조합원이 조합에 기존건물과 그 부수토지를 제공하고
 *   취득한 **입주자로 선정된 지위(조합원입주권)**를 양도하는 경우, 양도차익은
 *   「관리처분계획등인가**후**양도차익」 + 「관리처분계획등인가**전**양도차익」의 **2분할 산식**으로 계산한다.
 * · 같은 영 제166조 제3항 — 기존건물·부수토지의 취득가액을 확인할 수 없으면 인가일/취득일 기준시가 비율 환산.
 * · 같은 영 제166조 제4항 제1호 — 「기존건물과 그 부수토지의 평가액」 = 관리처분계획등에 따라 정하여진 가격(권리가액).
 * · 같은 영 제166조 제5항 제1호 — 인가전양도차익의 **장기보유특별공제 보유기간은 취득일부터
 *   관리처분계획등 인가일까지**로 한정된다.
 * · 「소득세법」 제95조 제2항 — 장기보유특별공제 대상은 제94조 제1항 제1호 자산(3년 이상) **및
 *   제94조 제1항 제2호 가목 중 조합원입주권(조합원으로부터 취득한 것은 제외)**이며, 입주권은
 *   「관리처분계획 인가 **전** 토지분 또는 건물분의 양도차익으로 한정」된다. **분양권은 대상이 아니다.**
 * · 「소득세법」 제104조 제1항 제1호 — 제94조 제1항 제1호·제2호·제4호 자산은 제55조 제1항 누진세율,
 *   **「분양권의 경우에는 양도소득 과세표준의 100분의 60」**(보유기간 무관 단일세율).
 * · 「소득세법 시행령」 제163조 제6항 제4호 — 「부동산을 취득할 수 있는 권리」(입주권·분양권)의
 *   개산공제율은 **1%**(토지·건물 3%가 아니다).
 *
 * ⇒ 컴패니언이 조합원입주권·분양권이면 위 조문이 **하나도 적용되지 않는다**. 다건 계산기는
 *   같은 이유로 이미 둘 중 입주권을 차단했다(`lib/calc/multi-transfer-tax-validate.ts:69`,
 *   2026-08-23 — 「침묵 오산보다 명시 차단이 안전하다」). 함께양도 경로만 빠졌다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## 입력 사실관계 (이 파일의 `bundledForm()` 픽스처 그대로)
 *
 * 폼: 양도일 2024-06-01 · 총 양도가액 1,800,000,000 · `bundledSaleMode="actual"` · 세대 2주택
 * 자산 1(주 자산): 주택 · 매매 · 취득 2010-05-05 · 취득가 400,000,000 · 양도가 1,000,000,000
 * 자산 2(컴패니언): **아래 3종으로만 바꿔 대조** · 매매 · 취득 2010-05-05 · 양도가 800,000,000
 *   - `right_to_move_in` + §166 필수입력 전건(인가일 2018-06-20 · 권리가액 700,000,000 ·
 *     청산금 0(납부) · 인가전 필요경비 0 · 인가전 종전주택 취득가액 300,000,000)
 *   - `presale_right` (취득 2022-03-01 · 취득가 500,000,000 — 보유 27개월로 §104①1호 60% 구간)
 *   - `redevelopment_apt` + 같은 §166 필수입력 (형제 대조군)
 *
 * ⚠️ **기본값 폼이 다른 사유로 막혀 통과하는 것을 배제했다** — `createDefaultTransferFormData()`에
 *    양도일·총양도가액·세대주택수·취득일·취득가액·양도가액을 모두 채우고 §166 필수입력까지 넣었다.
 *    실측으로 「순수 주택 컴패니언」 대조군이 `[]`(무이슈)임을 함께 고정한다(AC-3b).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## 현행 실측값 (2026-08-25, 이 픽스처)
 *
 * | 컴패니언 자산 종류 | `collectStepIssues(0, form)` |
 * |---|---|
 * | `right_to_move_in` (§166 전건 입력) | **`[]` — 통과** 🔴 |
 * | `presale_right` | **`[]` — 통과** 🔴 |
 * | `redevelopment_apt` (형제) | 1건 차단 ✅ |
 * | `housing` (대조군) | `[]` — 통과 ✅ (정상) |
 *
 * ④ `buildAssetPayload`(`lib/calc/transfer-tax-api-helpers.ts:431`)가
 * `toEngineAssetKind`(:127)로 `right_to_move_in`·`presale_right`를 **`"housing"`으로 접는다**.
 * 실측 컴패니언 payload 키 14개 —
 * `acquisitionCause,acquisitionDate,assetId,assetKind,assetLabel,directExpenses,fixedAcquisitionPrice,`
 * `fixedSalePrice,isOneHousehold,isUnregistered,reductions,standardPriceAtTransfer,`
 * `standardPriceAtTransferForApportion,useEstimatedAcquisition`
 * — `redev*` 계열은 **한 개도 없고** top-level `redevelopment` 서브객체도 `undefined`다.
 *
 * 🔴 입주권 컴패니언 payload는 순수 주택 컴패니언 payload와 **`transferCause:"general"` 한 키를
 *    빼면 완전히 동일**하고(그 키는 공익수용 게이트 값이라 일반 양도에서는 no-op),
 *    **route(200) 응답은 `JSON.stringify` 바이트 단위로 동일**하다.
 *
 * 그 결과 입주권 컴패니언의 산출근거는 §166이 아니라 순수 주택 산식이 된다(실측 breakdown):
 *   양도차익 500,000,000 → 장기보유특별공제 **140,000,000**(보유 14년 × 2% = 28%, 근거 「소득세법 §95 ②」)
 *   → 과세표준 360,000,000 → 결정세액 118,060,000
 * 「소득세법 시행령」 제166조 제5항 제1호에 따르면 인가전양도차익의 보유기간은
 * 2010-05-05 ~ **2018-06-20**(8년 1개월)이고 공제 대상도 **인가전양도차익뿐**이므로,
 * 전체 양도차익에 14년치 28%를 적용한 위 값은 조문상 성립할 수 없다.
 *
 * 분양권은 fold로 §104①1호 60% 단일세율·§95② 배제·§163⑥4호 1%가 전부 사라진다.
 * 단건 route 대조 실측(양도 2024-06-01 · 취득 2022-03-01 · 취득가 500,000,000 · 양도가 800,000,000):
 *   `propertyType:"housing"`      → 세율 38%(누진) · 총 납부세액 **102,421,000**
 *   `propertyType:"presale_right"` → 세율 **60%**(§104①1호) · 총 납부세액 **196,350,000**
 *   차이 **93,929,000** (fold가 이 크기를 삼킨다)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ## 기대값 (법령상 옳은 값)
 *
 * `collectStepIssues(0, form)`이 **입주권에 대해** 차단 이슈 1건을 돌려주어야 한다 —
 * `SINGLE_ONLY`에 `right_to_move_in`을 추가해 형제 `redevelopment_apt`와 **대칭**으로.
 * (도메인 오너 결정: 「함께 양도 토글을 끄고 단건으로 계산」 유도. 다건 계산기와 동일 정책.)
 *
 * 🔄 **분양권은 2026-09-03에 차단이 아니라 개방으로 종결됐다**(AC-2 반전 참조).
 *    AC-5가 실증한 삼킴의 원인이 **fold**였고, 그것을 걷어내니 서브객체 없이 정합이 성립했다.
 *
 * 🔑 라벨 **문구는 구현 자유**다. 이 anchor는 `SINGLE_ONLY` 공통 템플릿
 *    「함께 양도와 같이 계산할 수 없습니다」만 단언한다.
 *
 * ## 🔴 이 anchor는 수정 전 실패한다
 *   AC-1(입주권)이 `[]`를 받아 실패한다. (AC-2는 2026-09-03 개방으로 반전됐다.)
 *   AC-3(형제 `redevelopment_apt`)·AC-3b(순수 주택 대조군)·AC-4·AC-5는 수정 전후 모두 통과한다 —
 *   판별력(비대칭 고정)과 「왜 막는가」(삼킴의 실증)를 코드에 남기기 위한 것이다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

/** `SINGLE_ONLY` 가드의 공통 메시지 템플릿 — 라벨 문구는 구현 자유이므로 이것만 본다. */
const BLOCK_TEMPLATE = "함께 양도와 같이 계산할 수 없습니다";

/** 원조합원 입주권 §166 필수입력 전건 (실가 모드 · 청산금 납부 0원 · 종전자산=주택) */
const REDEV_166_REQUIRED: Partial<AssetForm> = {
  useEstimatedAcquisition: false,
  redevApprovalDate: "2018-06-20",
  redevRightsValue: "700,000,000",
  redevSettlementAmount: "0",
  redevPreApprovalExpenses: "0",
  redevActualAcquisitionPrice: "300,000,000",
};

/**
 * 함께 양도(서로 다른 물건 2건) — 주 자산은 주택 고정, **컴패니언만 바꿔** 비대칭을 잰다.
 * `assetId`는 고정한다(`makeDefaultAsset`이 `Date.now()`로 만들어 호출마다 달라진다 — AC-4의
 * 바이트 대조에서 이 값이 유일한 잡음원이었다).
 */
function bundledForm(companion: Partial<AssetForm>): TransferFormData {
  const form = createDefaultTransferFormData();
  form.transferDate = "2024-06-01";
  form.contractTotalPrice = "1,800,000,000";
  form.bundledSaleMode = "actual";
  form.householdHousingCount = "2";
  form.assets[0] = {
    ...form.assets[0],
    assetId: "primary-fixed",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,000,000,000",
    standardPriceAtTransfer: "600,000,000",
  };
  form.assets.push({
    ...makeDefaultAsset(2),
    assetId: "companion-fixed",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-05-05",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "800,000,000",
    standardPriceAtTransfer: "400,000,000",
    ...companion,
  } as AssetForm);
  return form;
}

/** ④⑬ — `callTransferTaxAPI`가 실제로 fetch에 싣는 body를 잡는다. */
async function captureBody(form: TransferFormData): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "bundled" } }) } as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  return captured!;
}

const req = (b: object) =>
  new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

/** 단건 route 대조용 공통 입력 — `propertyType`만 갈아끼운다. */
const SINGLE_BASE = {
  transferPrice: 800_000_000,
  transferDate: "2024-06-01",
  acquisitionPrice: 500_000_000,
  acquisitionDate: "2022-03-01",
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

describe("[A5] 함께양도 × 조합원입주권·분양권 — ⑧ 명시 차단 (P2-01 · S1-02)", () => {
  beforeEach(() => {
    vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
  });
  afterEach(() => vi.unstubAllGlobals());

  /**
   * 🔄 **AC-1 반전 (2026-09-03) — 입주권도 개방으로 끝났다.**
   *
   * 이 anchor가 든 차단 사유는 「§166①·③·④·⑤가 한 필드도 도달하지 않는다」였다. 그것은
   * **사실이었지만 원인이 두 층**이었다 — ④ `toEngineAssetKind`의 fold와 ⑫ 서브객체 부재.
   * 두 층을 함께 열자 §166이 자산별로 도달한다(`buildRedevelopmentPayload`를 자산마다 호출).
   *
   * ⇒ 개방 후 계산 정합은 `__tests__/api/transfer.route.companion-redev-166.anchor.test.ts`가 본다.
   */
  it("✅ AC-1 (반전): 컴패니언 조합원입주권은 더는 차단되지 않는다", () => {
    const form = bundledForm({ assetKind: "right_to_move_in", ...REDEV_166_REQUIRED });
    const issues = collectStepIssues(0, form);
    expect(issues.filter((i) => i.message.includes(BLOCK_TEMPLATE))).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it("✅ AC-2 (반전): 컴패니언 분양권은 더는 차단되지 않는다", () => {
    const form = bundledForm({
      assetKind: "presale_right",
      acquisitionDate: "2022-03-01",
      fixedAcquisitionPrice: "500,000,000",
    });
    const issues = collectStepIssues(0, form);

    expect(
      issues.filter((i) => i.message.includes(BLOCK_TEMPLATE)),
      "분양권은 2026-09-03에 개방됐다 — 차단이 남아 있으면 ⑧ 정리 누락",
    ).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  /**
   * 🔄 **AC-3 반전 (2026-09-03).** 「형제 `redevelopment_apt`는 이미 차단된다」는 판별력이었으나,
   * 재개발APT도 같은 날 함께 열렸다(장벽은 ⑩ enum 400 — 입주권의 fold와 **다른 층**이었다).
   * 판별력은 아래 AC-3b(over-block 금지)와 AC-5(세율 차)가 계속 맡는다.
   */
  it("✅ AC-3 (반전): 형제 `redevelopment_apt`도 더는 차단되지 않는다", () => {
    const form = bundledForm({ assetKind: "redevelopment_apt", ...REDEV_166_REQUIRED });
    const issues = collectStepIssues(0, form);
    expect(issues.filter((i) => i.message.includes(BLOCK_TEMPLATE))).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it("✅ AC-3b (over-block 금지): 순수 주택 컴패니언은 계속 통과한다", () => {
    // 픽스처가 다른 사유로 막히고 있지 않다는 증거이기도 하다 — 이것이 `[]`이므로
    // AC-1·AC-2의 현행 `[]`는 「가드 부재」 외의 원인이 없다.
    const form = bundledForm({ assetKind: "housing" });
    expect(collectStepIssues(0, form)).toEqual([]);
  });

  /**
   * 🔄 **AC-4 반전 (2026-09-03) — 「바이트 동일」의 반대가 이제 판별력이다.**
   *
   * 종전에는 §166 입력을 다 채운 입주권 컴패니언과 **하나도 안 넣은 순수 주택**의 응답이
   * `JSON.stringify` 바이트 단위로 같았다. 그것이 fold + ⑫ 부재의 실증이었다.
   * 개방 후에는 **달라져야 한다** — 같으면 배관 어딘가가 다시 침묵 strip하고 있다는 뜻이다.
   */
  it("✅ AC-4 (반전): 입주권 컴패니언 응답이 순수 주택과 **더는 같지 않다**", async () => {
    const rightForm = bundledForm({ assetKind: "right_to_move_in", ...REDEV_166_REQUIRED });
    const plainForm = bundledForm({ assetKind: "housing", useEstimatedAcquisition: false });

    const rightBody = await captureBody(rightForm);
    const plainBody = await captureBody(plainForm);

    const companion = (rightBody.companionAssets as Array<Record<string, unknown>>)[0];
    // ④는 더는 접지 않는다.
    expect(companion.assetKind).toBe("right_to_move_in");
    // ⑫ 서브객체가 실려 나간다 — 종전에는 §166 계열 키가 하나도 없었다.
    expect(companion.redevelopment, "⑬ emit 또는 ⑫ 등록 누락 — 침묵 strip 재발").toBeDefined();

    const rightRes = await POST(req(rightBody));
    const plainRes = await POST(req(plainBody));
    expect(rightRes.status).toBe(200);
    const [rightJson, plainJson] = [await rightRes.json(), await plainRes.json()];
    expect(
      JSON.stringify(rightJson),
      "🔴 §166 입력이 응답을 전혀 바꾸지 못한다 — 배관 어딘가가 다시 strip하고 있다",
    ).not.toBe(JSON.stringify(plainJson));

    // 산출근거에 §166이 실린다 — 종전에는 결과 어디에도 「166」이 없었다.
    const companionResult = rightJson.data.aggregated.properties.find(
      (p: { propertyId: string }) => p.propertyId === "companion-fixed",
    );
    expect(companionResult.redevelopmentDetail, "§166 산출물 부재").toBeDefined();
  });

  it("✅ AC-5 (왜 막는가 · 세율): 단건 route에서 분양권과 주택은 세액이 다르다", async () => {
    // fold가 손실임을 크기로 고정한다. `presale_right`가 `housing`으로 접히면 이 차액이 사라진다.
    const housing = await (
      await POST(req({ ...SINGLE_BASE, propertyType: "housing" }))
    ).json();
    const presale = await (
      await POST(req({ ...SINGLE_BASE, propertyType: "presale_right" }))
    ).json();

    // 「소득세법」 제104조 제1항 제1호 — 분양권은 보유기간(27개월) 무관 60% 단일세율.
    expect(presale.data.result.appliedRate).toBe(0.6);
    expect(housing.data.result.appliedRate).toBe(0.38);
    expect(presale.data.result.totalTax).toBe(196_350_000);
    expect(housing.data.result.totalTax).toBe(102_421_000);
    expect(presale.data.result.totalTax - housing.data.result.totalTax).toBe(93_929_000);
  });
});
