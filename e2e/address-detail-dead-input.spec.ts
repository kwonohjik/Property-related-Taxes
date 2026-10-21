/**
 * address-detail-dead-input.spec.ts
 *
 * §155⑯ 공공기관·법인 지방이전 특례의 「이전한 기관·법인 소재지」·「신규 주택 소재지」는 시·군 코드만 쓰는데,
 * 세대 목록·동·호 드롭다운·상세주소 칸을 그렸다. 동 선택·상세주소 입력은 `pnu` 없이 발화해 코드가 `""`로 저장됐고,
 * 엔진은 코드가 없으면 「해당」 선언을 그대로 쓴다(`transfer-tax-temporary-two-house-timing.ts` `meetsPublicInstitutionRelocationRegion`).
 * 그래서 이전지와 연접하지 않는 신규 주택이 아파트면 동만 골라도 처분기한이 5년으로 늘어
 * 「과세」가 「부분 비과세」로 바뀌었다(실측). 계획서 `docs/00-pm/address-detail-dead-input.plan.md` R1(Q-1 a)
 *
 * 공시가격 mock은 늘 세대 목록(아파트)을 돌려준다 — 세대 조회가 돌면 드롭다운이 뜬다.
 *
 * 실행: E2E_PORT=3122 npx playwright test e2e/address-detail-dead-input.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { gotoJudgmentStep2 } from "./_helpers/judgment-seed";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { fillDateAndVerify } from "./_helpers/tax-flow";
import {
  addApartmentWithDebt,
  enableBurdenedTransferToggle,
  fillApartmentTransferInfo,
  setupTransferApiMock,
} from "./_helpers/gift-burdened-transfer";

const UNITS = [
  { dong: "101동", ho: "501", floor: "5", price: 900000000, year: "2026" },
  { dong: "101동", ho: "502", floor: "5", price: 800000000, year: "2026" },
];
const SUWON = { pnu: "4111710100100010000", title: "영통 1", road: "영통로 1", jibun: "경기도 수원시 영통구 매탄동 1", building: "", zipcode: "", lng: "", lat: "" };
const JEJU = { pnu: "5011010100100010000", title: "제주 1", road: "중앙로 1", jibun: "제주특별자치도 제주시 일도일동 1", building: "", zipcode: "", lng: "", lat: "" };

/** 주소 검색은 두 후보를 모두 돌려주고, 세대 조회는 늘 아파트 세대 목록을 돌려준다. 세대 조회 횟수를 센다 */
async function mockAddress(page: Page) {
  const st = { unitLookups: 0 };
  await page.route("**/api/address/search**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ results: [SUWON, JEJU] }) }),
  );
  await page.route("**/api/address/standard-price**", (r) => {
    st.unitLookups++;
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ units: UNITS, price: 900000000, priceType: "apart_housing_price", year: "2026", message: "조회 성공" }) });
  });
  return st;
}

/** 라벨 바로 위 블록(라벨 + 주소 검색) */
const fieldBox = (scope: Page | Locator, label: string) => scope.getByText(label, { exact: true }).locator("xpath=..");

/** 블록 안에서 주소를 고르고, 세대 목록·상세주소 칸이 생기지 않았는지 본다 */
async function pickAndExpectNoUnitInputs(page: Page, box: Locator, query: string, road: RegExp) {
  await box.getByPlaceholder("도로명 또는 지번 주소 입력").fill(query);
  await box.getByRole("button", { name: road }).click();
  await expect(box.getByRole("button", { name: "지우기" })).toBeVisible();
  // 세대 조회가 돌았다면 지나갔을 시간을 준 뒤 본다 — 바로 보면 조회 중이라 칸이 원래 없다
  await page.waitForTimeout(800);
  await expect(box.getByText("동/호수 조회 중...")).toHaveCount(0);
  await expect(box.getByText("동 선택")).toHaveCount(0);
  await expect(box.getByPlaceholder(/상세주소/)).toHaveCount(0);
}

async function readJudgmentCodes(page: Page) {
  return page.evaluate(() => {
    const f = JSON.parse(sessionStorage.getItem("one-house-judgment-wizard")!).state.formData;
    return { relocatedSigunguCode: f.relocatedSigunguCode, newHouseSigunguCode: f.newHouseSigunguCode };
  });
}

/** 판정 메뉴 ③ — 일시적 2주택(신규 2022-06-01 · 양도 2026-06-01, 3년 초과 5년 이내) + §155⑯ 켜짐 */
async function gotoRelocation(page: Page, over: Record<string, unknown>) {
  await gotoJudgmentStep2(page, {
    assets: [{ ...makeDefaultAsset(1), ...DIRECT_RESIDENCE, addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", fixedAcquisitionPrice: "700000000", transferPrice: "2000000000", residencePeriodYears: "3" }],
    transferDate: "2026-06-01",
    filingDate: "2026-08-31",
    contractTotalPrice: "2000000000",
    isRegulatedArea: false,
    isUnregistered: false,
    temporaryTwoHouseSpecial: true,
    newHouseAcquisitionDate: "2022-06-01",
    publicInstitutionRelocation: true,
    houses: [{ id: "h1", region: "capital", acquisitionOrigin: "general", acquisitionDate: "2022-06-01", officialPrice: "300000000", isInherited: false, isLongTermRental: false }],
    ...over,
  });
}

test.describe("§155⑯ 주소 칸 — 동·호를 받지 않아 시·군 코드가 남는다", () => {
  test("A-1: 신규 주택이 이전지와 연접하지 않는 아파트 — 드롭다운·상세주소 칸이 없고, 코드가 남아 판정이 「과세」다", async ({ page }) => {
    const st = await mockAddress(page);
    await gotoRelocation(page, { relocatedInstitutionJibun: SUWON.jibun, relocatedSigunguCode: "4111700000" });
    await pickAndExpectNoUnitInputs(page, fieldBox(page, "신규 주택 소재지"), "제주 1", /중앙로 1/);
    expect(st.unitLookups).toBe(0);
    expect(await readJudgmentCodes(page)).toEqual({ relocatedSigunguCode: "4111700000", newHouseSigunguCode: "5011000000" });
    await expect(page.getByTestId("relocation-region-verdict")).toContainText("연접하지 않습니다");
    await expect(page.getByTestId("temp-two-house-verdict")).toContainText("미충족 · 요건 B");
    await page.getByTestId("one-house-judge-cta").click();
    // 판정 API 첫 컴파일이 5초를 넘길 수 있다(실측 — 「판정 중입니다…」에서 만료)
    await expect(page.getByTestId("one-house-judgment-result")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("one-house-verdict")).toHaveText("과세");
  });

  test("A-2: 이전한 기관·법인 소재지가 아파트 — 드롭다운·상세주소 칸이 없고 코드가 남는다", async ({ page }) => {
    const st = await mockAddress(page);
    await gotoRelocation(page, { newHouseJibun: JEJU.jibun, newHouseSigunguCode: "5011000000" });
    await pickAndExpectNoUnitInputs(page, fieldBox(page, "이전한 기관·법인 소재지"), "영통 1", /영통로 1/);
    expect(st.unitLookups).toBe(0);
    expect(await readJudgmentCodes(page)).toEqual({ relocatedSigunguCode: "4111700000", newHouseSigunguCode: "5011000000" });
    await expect(page.getByTestId("relocation-region-verdict")).toContainText("연접하지 않습니다");
  });

  test("A-3: 증여세 부담부증여 — 두 칸을 고르면 요청 본문에 시·군·법정동 코드가 실린다", async ({ page }) => {
    test.setTimeout(120_000);
    const transfer = await setupTransferApiMock(page);
    const st = await mockAddress(page);
    await page.goto("/calc/gift-tax");
    await fillDateAndVerify(page, { year: "2023", month: "6", day: "1" });
    await page.locator("select").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: /^다음/ }).click();
    const dialog = await addApartmentWithDebt(page);
    await enableBurdenedTransferToggle(dialog);
    await fillApartmentTransferInfo(dialog);
    const count = dialog.getByTestId("bg-transfer-house-count");
    await count.fill("2");
    await expect(count).toHaveValue("2");
    const f = dialog.getByText("신규 주택 취득일", { exact: true }).locator("xpath=ancestor::div[.//input[@aria-label='연도']][1]");
    await f.getByRole("textbox", { name: "연도" }).fill("2020");
    await f.getByRole("textbox", { name: "월" }).fill("1");
    await f.getByRole("textbox", { name: "일" }).fill("1");
    await dialog.getByRole("switch", { name: /공공기관·법인 지방이전 특례/ }).click();
    await pickAndExpectNoUnitInputs(page, fieldBox(dialog, "이전한 기관·법인 소재지"), "영통 1", /영통로 1/);
    await pickAndExpectNoUnitInputs(page, fieldBox(dialog, "신규 주택 소재지"), "제주 1", /중앙로 1/);
    expect(st.unitLookups).toBe(0);
    await expect(dialog.getByTestId("relocation-region-verdict")).toContainText("연접하지 않습니다");

    await page.getByRole("button", { name: "닫기" }).click();
    await expect(page.getByTestId("estate-edit-dialog")).toBeHidden();
    await page.getByRole("button", { name: /^다음/ }).click();
    await page.getByRole("button", { name: /^다음/ }).click();
    const resp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 30_000 });
    await page.getByRole("button", { name: /계산하기/ }).click();
    await resp;
    expect(transfer.bodies[0].temporaryTwoHouse).toMatchObject({
      publicInstitutionRelocation: true,
      relocatedSigunguCode: "4111700000",
      newHouseSigunguCode: "5011000000",
      newHouseRegionCode: "5011010100",
    });
  });
});
