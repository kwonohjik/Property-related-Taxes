/**
 * 조특법 §99·§99의3·§99의4 리뷰 수정분 — 브라우저 확인 (갈래 B2: 결과 화면·판정 메뉴·PDF).
 *
 * 각 시나리오는 폼(세션 시드) → 계산 → 결과 화면의 문구·값을 본다. 기대값은 해당 PR의 anchor 시료와 같다:
 *  - S1 #2959(NH-66·68·71)   `__tests__/components/calc/new993-card-variant-formula.anchor.test.tsx`
 *  - S2 #2950(NH-33)         `__tests__/api/transfer.route.mixed-use-income-deduction.nh33.anchor.test.ts`
 *  - S3 #2950(NH-72)         `__tests__/api/transfer.route.multi-new-housing-99-993-nh72.anchor.test.ts`
 *  - S4 #2949(NH-80)         `__tests__/calc/new-99-4-aftercare-notes.anchor.test.ts`
 *  - S5 #2939(NH-64)         `__tests__/components/bundled-income-deduction-applied-nh64.anchor.test.tsx`
 *  - S6 #2959(다건 PDF)      `__tests__/print/pdf-multi-income-deduction-nh-l12.anchor.test.tsx`
 *
 * anchor는 mock 세율 시료라 세액은 같지 않다 — 세율과 무관한 값(감면 소득금액·안분 비율)과 문구를 대조한다.
 * 세율에 걸리는 S3은 anchor가 `loadFallbackTransferRates`로 쓴 값(단건 = 합산 고정값)을 그대로 쓴다.
 *
 * S2-B·C는 최초 `test.fixme`(결함 발견 표시)였고, 합산 세액 섹션에 차감 행·농특세 base를 넣어 풀었다(`MixedUseTotalTaxSection`).
 *
 * 실행: E2E_PORT=3152 npx playwright test e2e/nh99-browser-verify-result.spec.ts --workers=1
 */
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "../components/calc/transfer/UnifiedReductionPanel-defaults";
import { MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE } from "../lib/calc/multi-transfer-support-messages";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { withMixedHousingStd } from "./_helpers/mixed-housing-std-seed";
import { gotoJudgmentHoldingsStep } from "./_helpers/judgment-seed";
import { seedWithDeclaredRoster } from "./_helpers/roster-for-declared-count";

type Seed = Record<string, unknown>;

/** React가 host DOM에 fiber를 붙였는가 — 그 전의 클릭·fill은 조용히 유실된다(e2e/CLAUDE.md §6). */
async function waitHydrated(page: Page, selector: string) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    return !!el && Object.keys(el).some((k) => k.startsWith("__react"));
  }, selector);
}

/** 단건 계산기 — 세션 시드 → 「보유 상황·감면·공제·가산세」 → 계산. 계산 요청 본문과 응답 JSON을 돌려준다. */
async function seedAndCalc(page: Page, formData: Seed, opts: { onReductionStep?: () => Promise<void> } = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)), seedWithDeclaredRoster({
    state: { formData, pendingMigration: false },
    version: 0,
  }));
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await waitHydrated(page, "h1");
  for (const step of ["보유 상황", "감면·공제", "가산세"]) {
    await page.getByRole("button", { name: step, exact: true }).first().click();
    if (step === "감면·공제") await opts.onReductionStep?.();
  }
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp.catch(async (e) => {
    const banner = await page.getByText(/입력 확인이 필요합니다/).locator("xpath=ancestor::*[2]").innerText().catch(() => "(배너 없음)");
    throw new Error(`계산 요청이 나가지 않음 — ${banner}\n${String(e).slice(0, 200)}`);
  });
  expect(resp.ok(), `계산 API 비정상 응답 ${resp.status()}`).toBe(true);
  return { body: resp.request().postDataJSON() as Seed, json: (await resp.json()) as { data: Seed } };
}

const baseForm = (assets: Seed[], over: Seed = {}): Seed => ({
  assets,
  householdHousingCount: "1",
  householdNoOtherHousesConfirmed: true,
  householdNoPresaleRightsConfirmed: true,
  isOneHousehold: true,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  houses: [],
  presaleRights: [],
  ...over,
});

const NEW_993_CARD = "조특법 §99의3 신축주택 과세특례 (양도소득금액 차감 방식)";

// ───────────────────────── S1. §99의3 결과 카드 (NH-66·68·71) ─────────────────────────

/** anchor `base993` — 양도시 350M · 신축 취득시 200M · 종전주택 100M · 5년 시점 300M. 취득 2003.9.1.(계약 2003.3.1. — 2003.1.1. 이후라 종전 고급주택 칸 없음). */
function house993(over: Seed = {}) {
  return {
    ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2003-09-01", assetContractDate: "2003-03-01",
    actualSalePrice: "500000000", fixedAcquisitionPrice: "300000000",
    reductions: [{
      ...getReductionDefault("new_99_3"),
      contractDate993: "2003-03-01", standardPriceAtAcquisition993: "200000000", standardPriceAt5Years: "300000000", standardPriceAtTransfer993: "350000000",
      exclusiveAreaSqm993: "84", firstContract993: "yes", isRedevelopedNewHouse993: true, previousHouseStdPrice993: "100000000",
      ...over,
    }],
  };
}

/** 카드 문구에 새면 안 되는 내부 enum·조어 */
const FORBIDDEN_IN_CARD = [/all_positive/, /pos_neg/, /neg_pos/, /all_negative/, /부호 케이스/, /IMF/];

test.describe("S1 §99의3 결과 카드", () => {
  test("[S1-A] 재개발 변형 + 5년 이내 → 「전액 차감」이 아니라 종전주택 기준시가 분모 안분 · 세로 분수 · 내부 enum·IMF 없음", async ({ page }) => {
    test.setTimeout(90_000);
    const { body, json } = await seedAndCalc(
      page,
      baseForm([house993()], { transferDate: "2008-03-01", filingDate: "2008-05-31", contractTotalPrice: "500000000" }),
      {
        // 감면·공제 단계의 선택 라벨 — 「IMF」 조어가 아니라 법문 명칭
        onReductionStep: async () => {
          await expect(page.getByText("§99의3 — 신축주택의 취득자에 대한 양도소득세의 과세특례").first()).toBeVisible();
          await expect(page.getByText(/IMF/)).toHaveCount(0);
        },
      },
    );
    // request body — ④가 변형 플래그·종전주택 기준시가를 싣는다
    expect(body.reductions).toEqual([
      expect.objectContaining({ type: "new_99_3", isRedevelopedNewHouse993: true, previousHouseStdPrice993: 100_000_000, standardPriceAtTransfer993: 350_000_000 }),
    ]);
    // 엔진 값 — 양도소득금액 184,000,000 × (350M−200M)/(350M−100M) = 110,400,000 (표시만 바뀐 수정이라 세액 불변)
    const detail = (json.data.result as Seed).new993Detail as Seed;
    expect(detail.isWithin5Years).toBe(true);
    expect(detail.reducibleTransferIncome).toBe(110_400_000);

    const card = page.getByText(NEW_993_CARD).locator("xpath=..");
    await expect(card).toBeVisible();
    const t = (await card.innerText()).replace(/\s+/g, " ");
    expect(t).not.toContain("전액 차감");
    expect(t).toContain("5년 이내 양도 — 재개발·재건축 신축주택은 종전주택 취득 당시 기준시가를 분모에 써서 안분");
    expect(t).toContain("조특령 §99의3 ② 1호 단서");
    expect(t).toContain("350,000,000 − 200,000,000 = 150,000,000");
    expect(t).toContain("350,000,000 − 100,000,000 = 250,000,000");
    expect(t).toContain("감면 양도소득금액 = 110,400,000");
    // 안분 비율은 「/」 글자가 아니라 세로 분수
    expect(t).not.toMatch(/\d\s\/\s\d/);
    await expect(card.locator("span.inline-flex.flex-col")).not.toHaveCount(0);
    for (const re of FORBIDDEN_IN_CARD) expect(t).not.toMatch(re);
    // 결과 화면 전체에도 IMF 조어가 없다
    await expect(page.getByText(/IMF/)).toHaveCount(0);
  });

  test("[S1-B] 5년 후 양도(변형 아님) → 부호 케이스 enum 없음 · 안분 비율 세로 분수", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndCalc(
      page,
      baseForm(
        [house993({ isRedevelopedNewHouse993: false, previousHouseStdPrice993: "", standardPriceAtTransfer993: "500000000" })],
        { transferDate: "2012-03-01", filingDate: "2012-05-31", contractTotalPrice: "500000000", isOneHousehold: false }, // 1세대 해당이면 비과세라 감면이 안 보인다
      ),
    );
    const card = page.getByText(NEW_993_CARD).locator("xpath=..");
    await expect(card).toBeVisible();
    const t = (await card.innerText()).replace(/\s+/g, " ");
    expect(t).toContain("5년 후 양도 — 5년간 발생분 안분 산식");
    expect(t).toContain("5년 안분 비율");
    expect(t).not.toMatch(/\d\s\/\s\d/);
    await expect(card.locator("span.inline-flex.flex-col")).not.toHaveCount(0);
    for (const re of FORBIDDEN_IN_CARD) expect(t).not.toMatch(re);
  });
});

// ───────────────────────── S2. 겸용주택 × §99의3 (NH-33) ─────────────────────────

/** anchor `r993` 시료의 기준시가(100M · 200M · 400M)와 같은 겸용 — 취득 2005.6.1.은 개별주택가격 공시(2005.4.30.) 뒤라 PHD 환산이 필요 없다. */
function mixedAsset() {
  return withMixedHousingStd({
    ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2005-06-01", assetContractDate: "2003-03-01",
    isOneHousehold: false, isMixedUseHouse: true,
    residentialFloorArea: "100", nonResidentialFloorArea: "100", mixedUseTotalLandArea: "200", buildingFootprintArea: "100",
    mixedTransferHousingPrice: "400000000", mixedTransferLandPricePerSqm: "2000000", mixedTransferCommercialBuildingPrice: "100000000",
    mixedAcqHousingPrice: "100000000", mixedAcqLandPricePerSqm: "500000", mixedAcqCommercialBuildingPrice: "50000000",
    mixedIsMetropolitanArea: true, useEstimatedAcquisition: true, actualSalePrice: "1100000000",
    reductions: [{
      ...getReductionDefault("new_99_3"),
      contractDate993: "2003-03-01", standardPriceAtAcquisition993: "100000000", standardPriceAt5Years: "200000000", standardPriceAtTransfer993: "400000000",
      exclusiveAreaSqm993: "84", firstContract993: "yes",
    }],
  });
}

async function calcMixed(page: Page) {
  const r = await seedAndCalc(
    page,
    baseForm([mixedAsset()], { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1100000000", isOneHousehold: false }),
  );
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 30_000 });
  return r;
}

/** 「합산 세액」 섹션 ~ §99의3 카드 직전까지의 화면 문구 (줄 단위로 읽는다) */
async function mixedTotalSectionText(page: Page): Promise<string> {
  const body = await page.locator("body").innerText();
  const from = body.indexOf("합산 세액\n");
  const to = body.indexOf(NEW_993_CARD);
  expect(from, "「합산 세액」 섹션이 화면에 있어야 한다").toBeGreaterThanOrEqual(0);
  expect(to, "§99의3 카드가 화면에 있어야 한다").toBeGreaterThan(from);
  return body.slice(from, to);
}

test.describe("S2 겸용주택 × §99의3 (NH-33)", () => {
  test("[S2-A] 겸용 + §99의3 → 엔진이 주택분 차감을 적용하고 §99의3 감면 카드가 결과 화면에 보인다", async ({ page }) => {
    test.setTimeout(90_000);
    const { body, json } = await calcMixed(page);
    expect(body.reductions).toEqual([expect.objectContaining({ type: "new_99_3", standardPriceAtTransfer993: 400_000_000 })]);
    const total = ((json.data.result as Seed).total as { incomeDeduction?: { appliedId: string; reducibleIncome: number }; reductionDetails?: { new993Detail?: { isEligible: boolean } } });
    // 시료 실측: 주택부분 양도소득금액 327,900,001 × (200M−100M)/(400M−100M) = 109,300,000
    expect(total.incomeDeduction).toMatchObject({ appliedId: "new_99_3", reducibleIncome: 109_300_000 });
    expect(total.reductionDetails?.new993Detail?.isEligible).toBe(true);

    // ReductionDetailCards 표시 — PR 작성자가 «미확인»이라 남긴 핵심 확인 대상
    const card = page.getByText(NEW_993_CARD).locator("xpath=..");
    await expect(card).toBeVisible();
    const t = (await card.innerText()).replace(/\s+/g, " ");
    expect(t).toContain("5년 후 양도 — 5년간 발생분 안분 산식");
    expect(t).toContain("감면 양도소득금액 = 109,300,000");
    expect(t).toContain("농어촌특별세 (20%)");
    for (const re of FORBIDDEN_IN_CARD) expect(t).not.toMatch(re);
  });

  // 합산 세액 섹션이 주택분 차감 행을 싣는다 — 엔진은 주택분·상가분 소득금액을 그대로 두고 합산 소득만 109,300,000 줄이므로(anchor A3),
  // 차감 행이 없으면 「주택부분 327,900,001 + 상가부분 217,900,002」(합 545,800,003)가 합산 436,500,003과 맞지 않는다.
  test("[S2-B] 겸용 + §99의3 → 합산 세액 섹션에 주택분 차감 행(109,300,000)이 있어 합산 양도소득금액 산식이 맞는다", async ({ page }) => {
    test.setTimeout(90_000);
    await calcMixed(page);
    const sec = (await mixedTotalSectionText(page)).replace(/\s+/g, " ");
    expect(sec).toContain("양도소득금액 차감 (주택부분) △ 109,300,000");
    expect(sec).toContain("조세특례제한법 §99의3 신축주택 과세특례");
    expect(sec).toContain("합산 양도소득금액 436,500,003");
    expect(sec).toContain("주택부분 327,900,001 + 상가부분 217,900,002 - 양도소득금액 차감 109,300,000");
  });

  // 같은 섹션의 농어촌특별세 행 산식 — 값 8,917,200 = (차감 전 − 차감 후 양도소득세) 44,586,000 × 20%. 「감면세액 0 × 20%」가 아니다.
  test("[S2-C] 겸용 + §99의3 → 농어촌특별세 행 산식이 값(8,917,200)과 맞는다 (「감면세액 0 × 20%」가 아니다)", async ({ page }) => {
    test.setTimeout(90_000);
    await calcMixed(page);
    const sec = (await mixedTotalSectionText(page)).replace(/\s+/g, " ");
    expect(sec).toContain("농어촌특별세 8,917,200");
    expect(sec).not.toContain("감면세액 0 × 20%");
    const m = sec.match(/차감 전 양도소득세 ([\d,]+) - 차감 후 양도소득세 ([\d,]+)\) × 20%/);
    expect(m, "농특세 산식의 차감 전·후 양도소득세").toBeTruthy();
    expect(Math.floor((Number(m![1].replace(/,/g, "")) - Number(m![2].replace(/,/g, ""))) * 0.2)).toBe(8_917_200);
    expect(Number(m![1].replace(/,/g, "")) - Number(m![2].replace(/,/g, ""))).toBe(44_586_000);
  });
});

// ───────────────────────── S3·S6 다건 (NH-72 · PDF) ─────────────────────────

const MULTI_KEY = "multi-transfer-tax-wizard";

const r99 = () => ({
  ...getReductionDefault("new_99"),
  contractDate99: "1998-06-01", standardPriceAtAcquisition99: "100000000", standardPriceAt5Years99: "160000000", standardPriceAtTransfer99: "250000000",
  exclusiveAreaSqm99: "84", firstContract99: "yes", houseType99: "apartment", // 1998 계약은 종전 고급주택 기준 — 주택 유형 필수
});
const r993 = () => ({
  ...getReductionDefault("new_99_3"),
  contractDate993: "2002-03-01", standardPriceAtAcquisition993: "100000000", standardPriceAt5Years: "160000000", standardPriceAtTransfer993: "250000000",
  exclusiveAreaSqm993: "84", firstContract993: "yes", houseType993: "apartment",
});
// 소재지는 비조정 지역 — 서울이면 2018 양도가 조정대상지역 주소 판정으로 다주택 중과를 받아 anchor 고정값(중과 없음)과 갈린다
const multiHouse = (acq: string, contract: string, reductions: unknown[]) => ({
  ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "강원특별자치도 춘천시 테스트동 1", regionCode: "5111010100", assetKind: "housing", acquisitionCause: "purchase",
  acquisitionDate: acq, assetContractDate: contract, fixedAcquisitionPrice: "500000000", actualSalePrice: "800000000", reductions,
});
const multiLand = () => ({
  ...makeDefaultAsset(2), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 2-2", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
  acquisitionArea: "1000", fixedAcquisitionPrice: "100000000", actualSalePrice: "300000000", reductions: [],
});
const multiForm = (assets: Seed[], transferDate: string, price: string): Seed => seedWithDeclaredRoster({
  assets, transferDate, filingDate: "", contractTotalPrice: price, householdHousingCount: "2", isRegulatedArea: false, wasRegulatedAtAcquisition: false,
  isUnregistered: false, isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, houses: [], presaleRights: [],
});

/** 다건 세션을 만들어 「공통 설정」 단계로 연다(`transfer-multi-step-gate.spec.ts`와 같은 방식). */
async function seedMulti(page: Page, forms: Seed[], taxYear: number) {
  await page.goto("/calc/transfer-tax/multi");
  await page.waitForFunction((k) => !!sessionStorage.getItem(k), MULTI_KEY);
  await page.evaluate(
    ({ k, forms, taxYear }) => {
      const parsed = JSON.parse(sessionStorage.getItem(k)!);
      const base = parsed.state.form.properties[0];
      parsed.state.form.properties = forms.map((f, i) => ({ ...base, propertyId: `p${i + 1}`, propertyLabel: `양도 ${i + 1}번`, completionPercent: 100, form: { ...base.form, ...f } }));
      parsed.state.form.activeStep = "settings";
      parsed.state.form.activePropertyIndex = 0;
      parsed.state.form.taxYear = taxYear;
      sessionStorage.setItem(k, JSON.stringify(parsed));
    },
    { k: MULTI_KEY, forms, taxYear },
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 연간 합산 과세 계산" }).waitFor();
  await waitHydrated(page, "h1");
}

type MultiData = { totalTax: number; determinedTax: number; ruralSurtax: number; properties: { incomeDeductionReducible?: number }[] };
async function calcMulti(page: Page): Promise<MultiData> {
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer/multi") && r.request().method() === "POST", { timeout: 30_000 });
  await page.getByRole("button", { name: "세액 계산" }).click();
  const resp = await rp;
  expect(resp.status()).toBe(200);
  await expect(page.getByText("건별 상세").first()).toBeVisible({ timeout: 15_000 });
  return ((await resp.json()) as { data: MultiData }).data;
}

test.describe("S3 다건 §99·§99의3 (NH-72)", () => {
  // 고정값: anchor 「2016.1.1. 이후 양도분은 단건 = 합산」 grid (세율표 = 로컬 fallback 시드, 자산 1건 · 양도가 8억 · 취득가 5억)
  test("[S3-A] §99 · 2022.8.1. 양도 → 차단 없이 계산 (anchor 37,382,500)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedMulti(page, [multiForm([multiHouse("1999-01-01", "1998-06-01", [r99()])], "2022-08-01", "800000000")], 2022);
    const d = await calcMulti(page);
    expect(d.totalTax).toBe(37_382_500);
    expect(d.properties[0].incomeDeductionReducible ?? 0).toBeGreaterThan(0);
  });

  test("[S3-B] §99의3 · 2018.6.1. 양도 → 차단 없이 계산 (anchor 38,972,500)", async ({ page }) => {
    test.setTimeout(90_000);
    await seedMulti(page, [multiForm([multiHouse("2003-09-01", "2002-03-01", [r993()])], "2018-06-01", "800000000")], 2018);
    const d = await calcMulti(page);
    expect(d.totalTax).toBe(38_972_500);
    expect(d.properties[0].incomeDeductionReducible ?? 0).toBeGreaterThan(0);
  });

  for (const [name, red, acq, contract] of [
    ["§99", r99(), "1999-01-01", "1998-06-01"],
    ["§99의3", r993(), "2003-09-01", "2002-03-01"],
  ] as const) {
    test(`[S3-C] ${name} · 2015.12.31. 양도 → 계산 요청 없이 2016.1.1. 사유 문구로 차단`, async ({ page }) => {
      test.setTimeout(90_000);
      const calls: string[] = [];
      page.on("request", (r) => {
        if (r.url().includes("/api/calc/transfer/multi") && r.method() === "POST") calls.push(r.url());
      });
      await seedMulti(page, [multiForm([multiHouse(acq, contract, [red])], "2015-12-31", "800000000")], 2015);
      await page.getByRole("button", { name: "세액 계산" }).click();
      await expect(page.getByRole("alert").filter({ hasText: MULTI_NEW_HOUSING_PRE_2016_UNSUPPORTED_MESSAGE })).toBeVisible();
      expect(calls).toEqual([]);
    });
  }
});

test.describe("S6 다건 PDF (소득금액 감면대상)", () => {
  test("[S6] 다건 + §99 → PDF가 내려받아지고 「소득금액 감면대상」이 0이 아니다 (합산 양식 · 자산별 양식)", async ({ page }) => {
    test.setTimeout(240_000);
    // 폰트 CDN은 E2E 헤더가 CORS에 걸려 route에서 뗀다(transfer-pdf-head-rows.spec.ts)
    await page.route("https://cdn.jsdelivr.net/**", async (r) => {
      const h = { ...r.request().headers() };
      for (const k of Object.keys(h)) if (k.startsWith("x-e2e")) delete h[k];
      await r.continue({ headers: h });
    });
    await seedMulti(page, [
      multiForm([multiHouse("1999-01-01", "1998-06-01", [r99()])], "2022-08-01", "800000000"),
      multiForm([multiLand()], "2022-08-01", "300000000"),
    ], 2022);
    const d = await calcMulti(page);
    const applied = d.properties.reduce((s, p) => s + (p.incomeDeductionReducible ?? 0), 0);
    expect(applied).toBeGreaterThan(0);
    expect(d.ruralSurtax).toBeGreaterThan(0);

    const panel = page.getByTestId("print-selection-panel");
    await panel.getByRole("button", { name: "전체 선택" }).click();
    const dl = page.waitForEvent("download", { timeout: 120_000 });
    await panel.getByRole("button", { name: /선택 항목 PDF/ }).click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);

    // PDF 텍스트 파싱 — 폰트·CJK 글리프와 무관하게 문자열만 본다
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync((await download.path())!)) }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const c = await (await doc.getPage(i)).getTextContent();
      pages.push(c.items.map((it) => ("str" in it ? it.str : "")).join(" "));
    }
    const text = pages.join("\n").replace(/\s+/g, " ");
    const values = [...text.matchAll(/소득금액 감면대상 ([\d,]+)/g)].map((m) => m[1]);
    // 합산 양식 1건 + 자산별 양식 2건(감면 있는 주택 · 없는 토지)
    expect(values).toEqual([applied, applied, 0].map((n) => n.toLocaleString("en-US")));
    expect(text).toContain(`농어촌특별세 ${d.ruralSurtax.toLocaleString("en-US")}`);
    // 합산 PDF 「계산 단계」 — 세액감면 합산 재계산 행의 「감면 없음」은 사실(§99는 소득금액 차감형)이고, 농특세 base는 별도 단계 행이 싣는다
    expect(text).toContain("감면 없음 (합산 재계산 대상·건별 감면세액 모두 0)");
    const surtaxStep = text.match(/농어촌특별세 \(감면세액 × 20%\) (\(감면 전 산출세액 ([\d,]+) − 감면 후 산출세액 ([\d,]+)\) × 20% = ([\d,]+))/);
    expect(surtaxStep, "PDF 계산 단계에 농특세 산식 행").toBeTruthy();
    expect(Math.floor((Number(surtaxStep![2].replace(/,/g, "")) - Number(surtaxStep![3].replace(/,/g, ""))) * 0.2)).toBe(d.ruralSurtax);
    expect(surtaxStep![4]).toBe(d.ruralSurtax.toLocaleString("en-US"));
  });
});

// ───────────────────────── S4. 판정 메뉴 §99의4 사후관리 고지 (NH-80) ─────────────────────────

const RURAL994 = { type: "new_99_4_rural", ruralHouseAcquisitionDate: "", ruralHouseStdPrice: "150000000", isRegisteredHanok: false, adjacentArea994: "no", meetsLocationRequirement: true };
const judgeRow = (acq: string) => ({
  id: "h1", region: "non_capital", acquisitionOrigin: "general", acquisitionDate: acq, officialPrice: "150000000",
  isInherited: false, isLongTermRental: false, isApartment: false, isOfficetel: false, isUnsoldHousing: false,
  countExclusion: { kind: "reduction", reduction: RURAL994 },
});

async function judge994(page: Page, acq: string): Promise<{ excluded: string; notes: string }> {
  await gotoJudgmentHoldingsStep(page, {
    transferDate: "2024-06-01", contractTotalPrice: "900000000", isRegulatedArea: false, wasRegulatedAtAcquisition: false,
    assets: [{ assetKind: "housing", acquisitionDate: "2015-01-01" }],
    houses: [judgeRow(acq)],
  });
  const response = page.waitForResponse((r) => r.url().includes("/api/calc/one-house-exemption") && r.request().method() === "POST");
  await page.getByTestId("one-house-judge-cta").click();
  expect((await response).ok()).toBe(true);
  await expect(page.getByTestId("one-house-judgment-result")).toBeVisible();
  await expect(page.getByTestId("one-house-verdict")).toHaveText("비과세");
  return {
    excluded: await page.getByTestId("one-house-count-excluded").innerText(),
    notes: await page.getByTestId("one-house-count-excluded-notes").innerText(),
  };
}

test.describe("S4 판정 메뉴 §99의4 사후관리 고지 (NH-80)", () => {
  test("[S4-A] 보유 3년 미만(2022.9.1. 취득 · 양도 2024.6.1.) → 보유기간 1년 + §99의4⑥ 납부 고지", async ({ page }) => {
    test.setTimeout(90_000);
    const { excluded, notes } = await judge994(page, "2022-09-01");
    expect(excluded).toContain("농어촌주택등 — 소유주택으로 보지 않음");
    expect(notes).toContain("농어촌주택 보유기간 1년 (양도일 기준)");
    expect(notes).toContain("농어촌주택 보유 3년 미만");
    for (const cite of ["조특법 §99의4④", "조특법 §99의4⑥", "조특령 §99의4⑧", "조특령 §99의4⑨"]) expect(notes).toContain(cite);
    expect(notes).toContain("양도소득세로 납부해야 합니다");
  });

  test("[S4-B] 보유 3년 이상(2020.1.1. 취득) → 보유기간 4년 · 사후관리 대상이 아니라는 안내 · 납부 고지 없음", async ({ page }) => {
    test.setTimeout(90_000);
    const { notes } = await judge994(page, "2020-01-01");
    expect(notes).toContain("농어촌주택 보유기간 4년 (양도일 기준)");
    expect(notes).toContain("사후관리 대상이 아닙니다");
    expect(notes).not.toContain("양도소득세로 납부해야 합니다");
    expect(notes).not.toContain("보유 3년 미만");
  });
});

// ───────────────────────── S5. 함께 양도 감면 카드 (NH-64) ─────────────────────────

test.describe("S5 함께 양도 감면 카드 (NH-64)", () => {
  test("[S5] 함께 양도: 카드가 합산 적용액(72,500,000)을 표시하고 차이 사유(시행령 §167의2) 한 줄을 단다", async ({ page }) => {
    test.setTimeout(90_000);
    // anchor 시료 — §99 주택(양도 8억 · 취득 1억 · 1999 취득) + 양도차손 2억 토지. 함께 양도 안분은 양도시 기준시가 비율이라 8:2로 맞춘다.
    const house = {
      ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase",
      acquisitionDate: "1999-06-01", assetContractDate: "1999-02-01", fixedAcquisitionPrice: "100000000", actualSalePrice: "800000000", standardPriceAtTransfer: "800000000",
      reductions: [{
        ...getReductionDefault("new_99"),
        contractDate99: "1999-02-01", standardPriceAtAcquisition99: "100000000", standardPriceAt5Years99: "150000000", standardPriceAtTransfer99: "300000000",
        exclusiveAreaSqm99: "84", firstContract99: "yes", houseType99: "apartment",
      }],
    };
    const land = {
      ...makeDefaultAsset(2), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01",
      landNature: "standalone", fixedAcquisitionPrice: "400000000", actualSalePrice: "200000000", standardPriceAtTransfer: "200000000",
    };
    const { json } = await seedAndCalc(
      page,
      baseForm([house, land], { transferDate: "2024-06-01", filingDate: "2024-08-31", contractTotalPrice: "1000000000", isOneHousehold: false }),
    );
    expect(json.data.mode).toBe("bundled");
    const props = ((json.data.aggregated as Seed).properties as { incomeDeductionReducible: number; new99Detail?: { reducibleTransferIncome: number; ruralSurtax: number } }[]);
    const h = props.find((p) => p.new99Detail)!;
    // 단건 detail 122,500,000 · 9,800,000 ↔ 합산 적용 72,500,000 (anchor 값 — 소득금액은 세율과 무관하다)
    expect([h.new99Detail!.reducibleTransferIncome, h.new99Detail!.ruralSurtax]).toEqual([122_500_000, 9_800_000]);
    expect(h.incomeDeductionReducible).toBe(72_500_000);

    const applied = page.getByTestId("income-deduction-aggregate-applied");
    await expect(applied).toBeVisible();
    const note = (await applied.innerText()).replace(/\s+/g, " ");
    expect(note).toContain("122,500,000");
    expect(note).toContain("양도차손");
    expect(note).toContain("시행령 §167의2");
    await expect(page.getByTestId("income-deduction-aggregate-rural")).toBeVisible();
    // 카드가 단건 값(9,800,000)을 찍지 않는다
    await expect(page.getByText("9,800,000")).toHaveCount(0);
    await expect(page.getByText("72,500,000").first()).toBeVisible();
  });
});
