/**
 * E2E — 일체 주택 본인 신축 × 「소득세법」 §114조의2 가산세(건물분) × 영 §164⑨ 공익수용(1호)·공매·경락(2호) 특례 (Q-12 후속 PR-A)
 *
 * 계획서: docs/00-pm/self-built-housing-164-9-plan.md (§5.7 SB-13~21 · §9 PR-A)
 * 시드는 `transfer-self-built-housing-base.spec.ts` 와 같다 — 신축 2022-01-10 · 양도 2026-03-01 · 주택공시가격 취득 2억/양도 4억 · 양도 당시 토지 2.4억·건물 1.6억.
 * 특례 시드: 양도가 3억 · 보상액 3억 / 보상산정 기초 3.5억 (H_T′ = 3억 → 건물분 base 75,000,000 · 가산세 3,750,000 · 종전 자산 전체 200,000,000 / 10,000,000).
 *
 *  SB-13 감정 × 공익수용: 보상액 칸은 화면에 없다(감정은 §164⑨ 무관) · 건물 감정가액만 body 에 · 가산세 5,500,000 · 「§164⑨ … 확인 필요」 고지 0
 *  SB-14 감정 × stale 공매 플래그(환산+공매 입력 후 감정으로 변경): 카드는 감정 건물분 · 안내 문단 없음 · 5,500,000
 *  SB-15 환산 × 공익수용: 새 입력 칸 0 + 안내 문단 · body 에 최상위 보상액 2값 + selfBuiltHousing 5값 동시 · 결과 카드의 «양도 당시 주택공시가격» 이 특례 카드의 «적용 양도당시 기준시가» 와 같은 숫자 · 고지 1회 · 신고서 각주 · 인쇄
 *  SB-16 ⑧ 차단 순서: 보상액 → 보상기초 → 건물분 카드 첫 빈 칸 (화면 순서 ② → ③)
 *  SB-17 환산 × 공매·경락: 경락가액 · 2호 안내 · 공매 특례 카드와 같은 숫자
 *  SB-18 함께 양도 자산 2 환산 × 공익수용: companionAssets[0] 에 selfBuiltHousing + 보상액 · 자산 2 가산세 6,250,000
 *  SB-19 구별력(stale): 공익수용을 일반 양도로 되돌리면 안내 문단이 사라지고 body 에 보상액 키가 없다(카드는 유지)
 *  SB-20 375px 가로 스크롤 없음 + 안내 문단 라이트·다크 대비
 *  SB-21 화면 조작 경로(시드 아님): 양도원인 라디오로 공익수용 선택 → 보상액 입력 → 안내 문단·body → 일반 양도로 되돌리면 문단이 사라지고 body 에 보상액 키가 없다
 *  (계획서의 SB-21 «일부 양도 × 공익수용» 은 Q-8 로 범위 밖이라 이 PR 에 넣지 않았다)
 *
 * 사람이 브라우저로 직접 한 수동 확인은 아니다(headless).
 * 실행(워크트리): E2E_PORT=3301 npx playwright test e2e/transfer-self-built-housing-164-9.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard } from "./_helpers/split-acq-display";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";

type Over = Record<string, unknown>;

const INPUTS = {
  standardPricePerSqmAtAcq: "1000000",
  buildingStandardPriceAtAcq: "60000000",
  standardPricePerSqmAtTransfer: "2400000",
  buildingStandardPriceAtTransfer: "160000000",
};
const BLANK_INPUTS = Object.fromEntries(Object.keys(INPUTS).map((k) => [k, ""]));

const asset = (over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  assetKind: "housing",
  acquisitionCause: "purchase",
  acquisitionDate: "2022-01-10",
  actualSalePrice: "1000000000",
  useEstimatedAcquisition: true,
  standardPriceAtAcq: "200000000",
  standardPriceAtTransfer: "400000000",
  isSelfBuilt: true,
  buildingType: "new",
  constructionDate: "2022-01-10",
  acquisitionArea: "100",
  transferArea: "100",
  saleSplitMode: "apportioned",
  ...INPUTS,
  ...over,
});

const seed = (assets: Over[], formOver: Over = {}) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-03-01",
      filingDate: "2026-04-30",
      contractTotalPrice: "1000000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      ...formOver,
    },
    pendingMigration: false,
  },
  version: 0,
});

type Wire = Record<string, unknown> & { selfBuiltHousing?: Record<string, unknown>; companionAssets?: (Record<string, unknown> & { selfBuiltHousing?: Record<string, unknown> })[] };

const APPRAISAL = { useEstimatedAcquisition: false, isAppraisalAcquisition: true, fixedAcquisitionPrice: "300000000" };
const S3 = { actualSalePrice: "300000000" };
const S3_FORM = { contractTotalPrice: "300000000" };
const EXPR = { transferCause: "public_expropriation", housingCompensationTotal: "300000000", housingCompensationBasisTotal: "350000000" };
const AUCTION = { isAuctionTransfer: true, auctionPrice: "300000000" };
const card = (page: Page) => page.getByTestId("self-built-housing-share");
const note = (page: Page) => page.getByTestId("self-built-housing-sec164-9-note");
const CONFIRM_SEC = "특례 적용 금액을 토지·건물로 나누는 정면 해석례는 확인하지 못했습니다 — 확인 필요.";
const bodyCount = (page: Page, needle: string) => page.evaluate((n) => document.body.innerText.split(n).length - 1, needle);
const roseNote = (page: Page) => page.locator('[data-print-id="form-table"]').first().getByTestId("filing-rose-note");

async function openAcq(page: Page) {
  await expandAssetSection(page, 3);
}
async function focusedField(page: Page) {
  return page.evaluate(() => (document.activeElement as HTMLElement | null)?.closest("[data-field]")?.getAttribute("data-field") ?? null);
}
function trackPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

test.describe("일체 주택 본인 신축 §114조의2 건물분 × 영 §164⑨ 특례", () => {
  test("SB-13 감정 × 공익수용: 보상액 칸 없음 · 건물 감정가액만 body · 가산세 5,500,000 · 고지 0", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ ...APPRAISAL, selfBuiltBuildingAppraisal: "110000000", transferCause: "public_expropriation" })]));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    await expect(page.getByTestId("self-built-building-appraisal")).toBeVisible();
    await expect(note(page)).toHaveCount(0);
    await expandAssetSection(page, 2);
    await expect(page.getByText("보상산정 기초 기준시가 총액")).toHaveCount(0);
    const body = (await calculate(page)) as Wire;
    expect(body.selfBuiltHousing).toEqual({ buildingAppraisalValue: 110_000_000 });
    expect(body.housingCompensationTotal).toBeUndefined();
    expect(num((await formRow(page, "가산세액"))[1])).toBe(5_500_000);
    expect(await bodyCount(page, "확인하지 못했습니다 — 확인 필요.")).toBe(1); // 감정 고지(종전 «자산 전체 기준» 고지가 아니다)
    await expect(page.getByTestId("self-built-notice")).toContainText("감정평가서에 구분 표시된 건물 감정가액만 적용했습니다");
  });

  test("SB-14 감정 × stale 공매 플래그: 환산+공매로 입력한 뒤 감정으로 바꿔도 감정 건물분(5,500,000) · 안내 문단 없음", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ ...APPRAISAL, selfBuiltBuildingAppraisal: "110000000", ...AUCTION })]));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    await expect(note(page)).toHaveCount(0);
    const body = (await calculate(page)) as Wire;
    expect(body.selfBuiltHousing).toEqual({ buildingAppraisalValue: 110_000_000 });
    expect(num((await formRow(page, "가산세액"))[1])).toBe(5_500_000);
    await expect(page.getByTestId("self-built-penalty-card")).toContainText("건물 감정가액 110,000,000");
  });

  test("SB-15 환산 × 공익수용: 새 칸 없이 안내 문단 · body 최상위 보상액 + selfBuiltHousing · 결과의 두 카드가 같은 숫자 · 고지 1회 · 각주 · 인쇄", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    await seedWizard(page, seed([asset({ ...S3, ...EXPR })], S3_FORM));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    await expect(note(page)).toContainText("소득세법 시행령 §164⑨ 1호");
    await expect(note(page)).toContainText("개별주택가격·보상액·보상산정 기초 기준시가 중 가장 작은 금액");
    await expect(note(page)).toContainText("다시 입력할 필요는 없습니다");
    // 새 입력 칸이 없다 — 보상액 칸은 ② 양도정보 한 곳뿐
    await expect(page.locator('[data-field="housingCompensationTotal"]')).toHaveCount(1);
    const body = (await calculate(page)) as Wire;
    expect(body).toMatchObject({ transferCause: "public_expropriation", housingCompensationTotal: 300_000_000, housingCompensationBasisTotal: 350_000_000 });
    expect(body.selfBuiltHousing).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000,
      landArea: 100,
      buildingStdPriceAtAcquisition: 60_000_000,
      landStdPriceAtTransfer: 240_000_000,
      buildingStdPriceAtTransfer: 160_000_000,
    });
    expect(num((await formRow(page, "가산세액"))[1])).toBe(3_750_000);
    // 결과 — 본인 신축 카드의 «양도 당시 주택공시가격» 과 특례 카드의 «적용 양도당시 기준시가» 가 같은 숫자
    const c = page.getByTestId("self-built-penalty-card");
    await expect(c).toBeVisible();
    await expect(c).toContainText("양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라 개별주택가격 400,000,000·보상액 300,000,000·보상산정 기초 기준시가 350,000,000 중 가장 작은 금액입니다.");
    await expect(c).toContainText("양도 당시 주택공시가격 300,000,000 = 토지분 180,000,000 + 건물분 120,000,000");
    await expect(c).toContainText("건물분 환산취득가액 75,000,000 = 건물분 양도가액 120,000,000");
    await expect(page.getByText("주택 수용 양도당시 기준시가 특례").first()).toBeVisible();
    await expect(page.getByText(/적용 양도당시 기준시가\s*300,000,000/).first()).toBeVisible();
    await expect(page.getByTestId("self-built-penalty-line")).toHaveText("가산세 3,750,000 = 75,000,000 × 5%");
    expect(await bodyCount(page, CONFIRM_SEC), "고지는 한 번").toBe(1);
    await expect(roseNote(page)).toContainText("소득세법 시행령 §164⑨ 1호 공익수용 특례 적용");
    // 인쇄 — 전체 선택 후 print 매체에서도 보인다
    await page.getByRole("button", { name: "전체 선택" }).first().click();
    await page.emulateMedia({ media: "print" });
    await expect(c).toBeVisible();
    await expect(roseNote(page)).toBeVisible();
    await page.emulateMedia({ media: "screen" });
    expect(errors).toEqual([]);
  });

  test("SB-16 ⑧ 차단 순서: 보상액 → 보상산정 기초 → 건물분 카드 첫 빈 칸 (화면 순서 ② → ③)", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    await seedWizard(
      page,
      seed([asset({ ...S3, ...BLANK_INPUTS, transferCause: "public_expropriation", housingCompensationTotal: "", housingCompensationBasisTotal: "" })], S3_FORM),
    );
    const next = page.getByRole("button", { name: "다음", exact: true });
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("housingCompensationTotal");
    await page.locator('[data-field="housingCompensationTotal"] input').first().fill("300000000");
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("housingCompensationBasisTotal");
    await page.locator('[data-field="housingCompensationBasisTotal"] input').first().fill("350000000");
    await next.click();
    await expect.poll(() => focusedField(page)).toBe("standardPricePerSqmAtAcq");
    expect(errors).toEqual([]);
  });

  test("SB-17 환산 × 공매·경락: 경락가액 · 2호 안내 · 공매 특례 카드와 같은 숫자", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, seed([asset({ ...S3, ...AUCTION })], S3_FORM));
    await openAcq(page);
    await expect(note(page)).toContainText("소득세법 시행령 §164⑨ 2호");
    await expect(note(page)).toContainText("개별주택가격·공매·경락가액 중 작은 금액");
    const body = (await calculate(page)) as Wire;
    expect(body).toMatchObject({ isAuctionTransfer: true, auctionPrice: 300_000_000 });
    expect(body.selfBuiltHousing).toBeDefined();
    expect(num((await formRow(page, "가산세액"))[1])).toBe(3_750_000);
    const c = page.getByTestId("self-built-penalty-card");
    await expect(c).toContainText("양도 당시 주택공시가격 300,000,000은 소득세법 시행령 §164⑨ 2호 공매·경락 특례에 따라 개별주택가격 400,000,000·공매·경락가액 300,000,000 중 작은 금액입니다.");
    await expect(page.getByText("공매·경락 양도당시 기준시가 특례").first()).toBeVisible();
    await expect(page.getByText(/적용 양도당시 기준시가\s*300,000,000/).first()).toBeVisible();
    expect(await bodyCount(page, CONFIRM_SEC)).toBe(1);
  });

  test("SB-18 함께 양도 자산 2 환산 × 공익수용: companionAssets[0] 에 selfBuiltHousing + 보상액 · 자산 2 가산세 6,250,000 (종전 16,666,666)", async ({ page }) => {
    test.setTimeout(240_000);
    const second = asset({
      assetId: makeDefaultAsset(2).assetId,
      assetLabel: "자산 2",
      acquisitionDate: "2021-06-01",
      addressJibun: "서울 강남구 테스트동 2-2",
      standardPriceAtTransfer: "1000000001",
      constructionDate: "2021-06-01",
      standardPricePerSqmAtTransfer: "6000000",
      buildingStandardPriceAtTransfer: "400000000",
      actualSalePrice: "",
      ...EXPR,
    });
    const first = asset({
      acquisitionDate: "2021-06-01",
      isSelfBuilt: false,
      buildingType: "",
      constructionDate: "",
      ...BLANK_INPUTS,
      standardPriceAtTransfer: "1000000001",
      actualSalePrice: "",
    });
    await seedWizard(page, seed([first, second], { transferDate: "2024-03-01", filingDate: "2024-05-31" }));
    await expandAssetSection(page, 3, 1);
    const c2 = page.locator('[data-asset-card-index="1"]');
    await expect(c2.getByTestId("self-built-housing-share")).toBeVisible();
    await expect(c2.getByTestId("self-built-housing-sec164-9-note")).toContainText("소득세법 시행령 §164⑨ 1호");
    for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
    const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: /계산하기/ }).last().click();
    const resp = await rp;
    expect(resp.status(), await resp.text()).toBe(200);
    const body = resp.request().postDataJSON() as Wire;
    expect(body.companionAssets?.[0].selfBuiltHousing).toBeDefined();
    expect(body.companionAssets?.[0]).toMatchObject({ transferCause: "public_expropriation", housingCompensationTotal: 300_000_000, housingCompensationBasisTotal: 350_000_000 });
    const props = (await resp.json()).data.aggregated.properties as { penaltyTax: number; penaltyBase: number }[];
    expect(props[1]).toMatchObject({ penaltyBase: 125_000_000, penaltyTax: 6_250_000 });
    await expect(page.getByTestId("self-built-penalty-card")).toHaveCount(1, { timeout: 60_000 });
    await expect(page.getByTestId("self-built-penalty-card")).toContainText("건물분 환산취득가액 125,000,000 = 건물분 양도가액 200,000,000");
    await expect(page.getByTestId("self-built-penalty-card")).toContainText("소득세법 시행령 §164⑨ 1호 공익수용 특례에 따라");
  });

  test("SB-19 구별력(stale): 공익수용을 일반 양도로 되돌리면 안내 문단이 사라지고 body 에 보상액 키가 없다(카드는 유지)", async ({ page }) => {
    test.setTimeout(240_000);
    await seedWizard(page, seed([asset({ ...S3, transferCause: "general", housingCompensationTotal: "300000000", housingCompensationBasisTotal: "350000000" })], S3_FORM));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    await expect(note(page)).toHaveCount(0);
    const body = (await calculate(page)) as Wire;
    expect(body.transferCause).toBe("general");
    expect(body.housingCompensationTotal).toBeUndefined();
    expect(body.selfBuiltHousing).toBeDefined();
    await expect(page.getByTestId("self-built-penalty-card")).toBeVisible();
    await expect(page.getByTestId("self-built-penalty-card")).not.toContainText("§164⑨");
    await expect(page.getByText("주택 수용 양도당시 기준시가 특례")).toHaveCount(0);
    expect(await bodyCount(page, CONFIRM_SEC)).toBe(0);
  });

  test("SB-20 375px 가로 스크롤 없음 · 안내 문단 라이트·다크 대비", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset({ ...S3, ...EXPR })], S3_FORM));
    await openAcq(page);
    await expect(note(page)).toBeVisible();
    await expectLightContrast(page, note(page));
    await expectDarkContrast(page, note(page));
    await expectNoPageHScroll(page);
  });

  test("SB-21 화면 조작: 공익수용 라디오 → 보상액 2칸 입력 → 안내 문단 · 일반 양도로 되돌리면 문단이 사라지고 body 에 보상액 키가 없다", async ({ page }) => {
    test.setTimeout(240_000);
    const errors = trackPageErrors(page);
    await seedWizard(page, seed([asset({ ...S3 })], S3_FORM));
    await openAcq(page);
    await expect(card(page)).toBeVisible();
    await expect(note(page)).toHaveCount(0);
    await expandAssetSection(page, 2);
    await page.getByTestId("expr-cause-radio").click();
    await page.locator('[data-field="housingCompensationTotal"] input').first().fill("300000000");
    await page.locator('[data-field="housingCompensationBasisTotal"] input').first().fill("350000000");
    await expect(note(page)).toContainText("소득세법 시행령 §164⑨ 1호");
    // 일반 양도로 되돌린다 — 입력값은 보존되지만 문단은 사라진다
    await page.getByRole("radio", { name: "일반 양도" }).first().click();
    await expect(note(page)).toHaveCount(0);
    await expect(card(page)).toBeVisible();
    const back = (await calculate(page)) as Wire;
    expect(back.housingCompensationTotal).toBeUndefined();
    expect(back.selfBuiltHousing).toBeDefined();
    // 특례 없는 S=3억 → 건물분 56,250,000 의 5%
    expect(num((await formRow(page, "가산세액"))[1])).toBe(2_812_500);
    expect(errors).toEqual([]);
  });
});
