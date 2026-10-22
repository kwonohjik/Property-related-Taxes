/**
 * E2E — 부담부증여 × 이월과세 × 당초 증여자 신축·증축 「소득세법」 §114조의2 가산세 (PR-4: ⑤ 토글 · ④ body · ⑧ 차단 · ⑦ 결과)
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-4)
 * 시드(엔진 anchor 와 같은 셀) — 주택 · 시가 800M · 채무 500M(채무비율 0.625) · 양도 2026-02-16 · 증여 2023-06-01 · 당초 증여자 취득 2000-06-01 · 당초 증여자 신축 2022-01-10.
 *   · K-7 감정가액 A 채택: 당초 증여자 건물 감정가액 200M × 0.625 = 125,000,000 → 가산세 6,250,000
 *   · K-5 환산 A 채택: 93,750,000 → 가산세 4,687,500
 *   · ②3호 B 채택: 가산세 0 + 중립 안내
 * 「당초 증여자」= 양도인에게 이 자산을 증여한 사람 — 양도인 본인 신축(`isSelfBuilt`)과 다른 축이다.
 *
 * vitest 는 폼 → ④ → route → 4뷰를 함수로 잇는다. 여기서는 **브라우저 폼**에서 토글·입력이 요청 body 의 `burdenedGiftInfo.carryoverDonorBasis.donorBuilt` 로 실리는지,
 * 결과 화면이 그것을 그리는지, ⑧이 미입력을 막고 그 칸으로 이동하는지 본다.
 *
 * 실행(워크트리): E2E_PORT=3285 npx playwright test e2e/carryover-donor-built-bg.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "../lib/stores/calc-wizard-asset-carryover";
import { DIRECT_RESIDENCE } from "./_helpers/residence-direct";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { calculate, formRow, num, seedWizard, stmtText } from "./_helpers/split-acq-display";

type Over = Record<string, unknown>;

const CARRYOVER = {
  ...CARRYOVER_DEFAULTS,
  giftRegistryDate: "2023-06-01",
  donorAcquisitionDate: "2000-06-01",
  donorAcquisitionPrice: "100000000",
  giftDateValuation: "600000000",
  giftTaxAmount: "0",
  donorRelation: "lineal",
  donorSameHousehold: "no",
};
const DONOR_BUILT_NEW = { donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" };

const asset = (method: "appraisal" | "converted", co: Over = {}, over: Over = {}): Over => ({
  ...makeDefaultAsset(1),
  ...DIRECT_RESIDENCE,
  addressJibun: "서울 강남구 테스트동 1-1",
  regionCode: "1168010100",
  assetKind: "housing",
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-06-01",
  transferType: "burdened_gift",
  bgValuationMode: "sangjeungbeop_market",
  bgMarketValueAtTransfer: "800000000",
  bgLendingDepositTotal: "300000000",
  bgMortgageDebtAmount: "200000000",
  bgDonorRelation: "lineal_descendant",
  bgAcquisitionMethod: method,
  standardPriceAtTransfer: "800000000",
  standardPriceAtAcq: "400000000",
  landStandardPriceAtTransfer: "0",
  buildingStandardPriceAtTransfer: "800000000",
  bgActualAcquisitionTotal: "600000000",
  bgCoDonorLandStdPriceAtAcq: "0",
  bgCoDonorBuildingStdPriceAtAcq: "150000000",
  ...(method === "appraisal" ? { bgCoDonorPresumedAcquisitionTotal: "200000000" } : {}),
  carryover: { ...CARRYOVER, ...DONOR_BUILT_NEW, ...co },
  ...over,
});

const seed = (assets: Over[]) => ({
  state: {
    formData: {
      assets,
      transferDate: "2026-02-16",
      filingDate: "2026-04-30",
      contractTotalPrice: "800000000",
      householdHousingCount: "2",
      householdNoOtherHousesConfirmed: true,
      householdNoPresaleRightsConfirmed: true,
      isOneHousehold: false,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
    },
    pendingMigration: false,
  },
  version: 0,
});

type Wire = { burdenedGiftInfo?: { carryoverDonorBasis?: { donorBuilt?: Record<string, unknown> }; presumedExtensionAppraisalValue?: number }; isSelfBuilt?: boolean };

async function readStore(page: Page) {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("transfer-tax-wizard");
    return raw ? JSON.parse(raw)?.state?.formData?.assets?.[0]?.carryover : undefined;
  });
}

test.describe("부담부증여 × 이월과세 × 당초 증여자 신축·증축 §114조의2", () => {
  test("DBG-E1 K-7 A 채택: body 의 burdenedGiftInfo.carryoverDonorBasis.donorBuilt · 결과 카드 안분 후 기준액 · 신고서 가산세 6,250,000", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("appraisal")]));
    const body = (await calculate(page)) as Wire;
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    expect(body.isSelfBuilt).not.toBe(true); // 양도인 본인 신축 축은 이월과세에서 보내지 않는다
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "true");
    // 산정방식 문구 — K-7 은 «감정가액»(조문 제목: 감정가액 또는 환산취득가액 적용 가산세)
    await expect(card.locator("xpath=..")).toContainText("감정가액 가산세");
    await expect(card.locator("xpath=..")).not.toContainText("환산취득가액");
    await expect(page.getByTestId("donor-built-window").first()).toHaveText("증여자 신축 취득일 2022-01-10부터 5년이 되는 날(2027-01-10)까지 양도하는 경우입니다.");
    await expect(card).toContainText("가산세 기준액 = 당초 증여자 건물 감정가액 중 채무비율 안분 후 금액 125,000,000");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 6,250,000 = 125,000,000 × 5%");
    await expect(page.getByTestId("donor-built-notice").first()).toContainText("정면 해석례는 확인하지 못했습니다 — 확인 필요");
    expect(num((await formRow(page, "가산세액"))[1])).toBe(6_250_000);
    expect(await stmtText(page, "가산세액")).toContain("증여자 신축·증축");
  });

  test("DBG-E2 K-5 A 채택: 환산취득가액 안분 후 기준액 · 가산세 4,687,500", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("converted")]));
    await calculate(page);
    await expect(page.getByTestId("donor-built-penalty-card").first().locator("xpath=..")).toContainText("건물 환산취득가액 가산세");
    await expect(page.getByTestId("donor-built-penalty-card").first()).toContainText("가산세 기준액 = 당초 증여자 건물 환산취득가액 중 채무비율 안분 후 금액 93,750,000");
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 4,687,500 = 93,750,000 × 5%");
    expect(num((await formRow(page, "가산세액"))[1])).toBe(4_687_500);
  });

  test("DBG-E3 ②3호 B 채택: 가산세 없음 + 중립 안내 (「더했다」류 문구 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("appraisal", {}, { bgCoDonorPresumedAcquisitionTotal: "790000000" })]));
    await calculate(page);
    const card = page.getByTestId("donor-built-penalty-card").first();
    await expect(card).toHaveAttribute("data-applied", "false");
    await expect(page.getByTestId("donor-built-notice").first()).toHaveText(
      "이월과세를 적용하지 않아 수증자 취득가액을 증여 당시 평가액(실지거래가액)으로 계산했고, 증여자 신축분 소득세법 §114조의2 가산세는 붙지 않았습니다.",
    );
    await expect(card).not.toContainText(/같은 금액|더했/);
    expect(num((await formRow(page, "가산세액"))[1])).toBe(0);
  });

  test("DBG-E4 UI 입력 경로: 토글 ON → 구분·신축일 입력 → body 에 실린다 (신축일 자동 채움 없음)", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("appraisal", { donorBuilt: false, donorBuiltType: "", donorBuiltDate: "" })]));
    await expandAssetSection(page, 2);
    const toggle = page.getByTestId("donor-built-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("donor-built-fields")).toHaveCount(0);
    await toggle.getByRole("switch").first().click();
    await expect(page.getByTestId("donor-built-fields")).toBeVisible();
    // 일체 주택 안분 칸은 없다 — §159 가 토지·건물을 자산별로 따로 구한다
    await expect(page.getByTestId("donor-built-housing")).toHaveCount(0);
    expect(await readStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "", donorBuiltDate: "" });
    await page.getByTestId("donor-built-type").getByRole("radio", { name: "신축" }).check();
    const dateScope = page.locator('[data-field="carryover.donorBuiltDate"]');
    const [y, m, d] = "2022-01-10".split("-");
    await dateScope.locator('input[type="text"][aria-label="연도"]').first().fill(y);
    await dateScope.locator('input[type="text"][aria-label="월"]').first().fill(m);
    await dateScope.locator('input[type="text"][aria-label="일"]').first().fill(d);
    expect(await readStore(page)).toMatchObject({ donorBuilt: true, donorBuiltType: "new", donorBuiltDate: "2022-01-10" });
    const body = (await calculate(page)) as Wire;
    expect(body.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt).toEqual({ buildingType: "new", constructionDate: "2022-01-10" });
    await expect(page.getByTestId("donor-built-penalty-line").first()).toHaveText("가산세 6,250,000 = 125,000,000 × 5%");
  });

  test("DBG-E5 ⑧ 차단: 토글 ON 인데 신축일이 비면 «다음» 이 막히고 그 칸으로 이동한다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("appraisal", { donorBuiltDate: "" })]));
    await expandAssetSection(page, 2);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => !!(document.activeElement as HTMLElement | null)?.closest('[data-field="carryover.donorBuiltDate"]')))
      .toBe(true);
    for (const key of ["carryover.donorBuilt", "carryover.donorBuiltType", "carryover.donorBuiltDate"]) {
      await expect(page.locator(`[data-field="${key}"]`), key).toHaveCount(1);
    }
  });

  test("DBG-E6 증축: K-7 은 증축 부분 감정가액 칸 · K-5 는 증축 부분 기준시가 칸 (하나씩만) / 범위 밖(실지 K-4)은 칸이 없다", async ({ page }) => {
    test.setTimeout(180_000);
    await seedWizard(page, seed([asset("appraisal", { donorBuiltType: "extension" })]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("donor-built-ext-area")).toBeVisible();
    await expect(page.getByTestId("donor-built-ext-appraisal")).toBeVisible();
    await expect(page.getByTestId("donor-built-ext-std")).toHaveCount(0);
    await seedWizard(page, seed([asset("converted", { donorBuiltType: "extension" })]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("donor-built-ext-std")).toBeVisible();
    await expect(page.getByTestId("donor-built-ext-appraisal")).toHaveCount(0);
    await seedWizard(page, seed([asset("converted", {}, { bgAcquisitionMethod: "actual", bgCoDonorActualAcquisitionTotal: "100000000" })]));
    await expandAssetSection(page, 2);
    await expect(page.getByTestId("donor-built-toggle")).toHaveCount(0);
  });
});
