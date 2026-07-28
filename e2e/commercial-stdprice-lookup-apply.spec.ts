/**
 * E2E: 상가·오피스텔 호별 기준시가 자동조회 모달 — 조회 → 호 선택 → 단일 배치 적용.
 *
 * 검증:
 *   1. 런처가 자산 카드 ③ 취득 섹션의 환산 블록에 노출되고, 모달이 열려 호 목록을 그린다.
 *   2. 층구분이 다른 같은 층·호가 **별개 행**으로 나온다(지상/지하 단가 2.4배 — 혼입 시 세액 오류).
 *   3. 적용 시 ㎡당 고시가 2시점 + 전용·공유면적이 **한 번에** 폼에 채워진다.
 *
 * API는 mock한다 — 산출 파티션(`data/stdprice`)은 빌드 산출물이라 CI에 없다.
 * 선례: e2e/building-register-autofill.spec.ts:22 `page.route("**\/api/address/search**")`.
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

const PNU = "1111010700100800000";

const MOCK_RESPONSE = {
  success: true,
  dateStatus: { "2013-01-01": "ok", "2021-01-01": "ok" },
  availableDates: ["2013-01-01", "2021-01-01"],
  units: [
    {
      key: "1(단일)|1|1|1",
      buildingName: "적선현대빌딩",
      dong: "1(단일)",
      floorClass: "지하",
      floor: "1",
      ho: "1",
      kind: "상가",
      prices: {
        "2013-01-01": { price: 1_597_000, ea: 7.18, sa: 2.4 },
        "2021-01-01": { price: 2_485_000, ea: 7.18, sa: 2.4 },
      },
    },
    {
      key: "1(단일)|4|1|1",
      buildingName: "적선현대빌딩",
      dong: "1(단일)",
      floorClass: "지상",
      floor: "1",
      ho: "1",
      kind: "상가",
      prices: {
        "2013-01-01": { price: 4_000_000, ea: 639.47, sa: 357.74 },
        "2021-01-01": { price: 5_898_000, ea: 639.47, sa: 357.74 },
      },
    },
  ],
};

function seedForm() {
  return {
    state: {
      formData: {
        assets: [
          {
            ...makeDefaultAsset(1),
            assetKind: "commercial_building",
            acquisitionCause: "purchase",
            acquisitionDate: "2013-05-10",
            useEstimatedAcquisition: true,
            cbEra: "post_disclosure",
            addressPnu: PNU,
            addressJibun: "서울특별시 종로구 적선동 80",
          },
        ],
        transferDate: "2021-06-01",
        filingDate: "2021-08-31",
        contractTotalPrice: "540000000",
        householdHousingCount: "1",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndOpen(page: Page) {
  await page.route("**/api/address/commercial-standard-price**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_RESPONSE) }),
  );
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await expandAssetSection(page, 3);
}

test.describe("상가 호별 기준시가 자동조회", () => {
  test("조회 → 지상 1층 1호 선택 → 단가 2시점 + 면적 2필드 일괄 적용", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndOpen(page);

    await page.getByTestId("cb-stdprice-lookup-open").click();
    const modal = page.getByRole("dialog").filter({ hasText: "호별 고시가 조회" });
    await expect(modal).toBeVisible();

    // 층구분이 다른 같은 1층 1호가 별개 행으로 존재해야 한다
    await expect(page.getByTestId("cb-stdprice-unit-1__1__1")).toBeVisible();
    await expect(page.getByTestId("cb-stdprice-unit-4__1__1")).toBeVisible();

    await page.getByTestId("cb-stdprice-unit-4__1__1").click();
    await page.getByTestId("cb-stdprice-apply").click();
    await expect(modal).toBeHidden();

    // CurrencyInput은 label htmlFor 연결이 없어 getByLabel 불가 → 값으로 확인
    await expect(page.locator('input[value="5,898,000"]')).toHaveCount(1); // 양도시 ㎡당
    await expect(page.locator('input[value="4,000,000"]')).toHaveCount(1); // 취득시 ㎡당
    await expect(page.locator('input[value="639.47"]')).toHaveCount(1); // 전용면적
    await expect(page.locator('input[value="357.74"]')).toHaveCount(1); // 공유면적
  });

  test("미고시 필지는 실패가 아니라 수기 입력 안내 — 폼은 그대로 쓸 수 있다", async ({ page }) => {
    test.setTimeout(90_000);
    await page.route("**/api/address/commercial-standard-price**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          dateStatus: { "2013-01-01": "no_notice", "2021-01-01": "no_notice" },
          availableDates: [],
          units: [],
        }),
      }),
    );
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await page.evaluate(
      (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
      seedForm(),
    );
    await page.reload();
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
    await expandAssetSection(page, 3);

    await page.getByTestId("cb-stdprice-lookup-open").click();
    await expect(page.getByTestId("cb-stdprice-status")).toContainText("미고시 물건입니다");
    // 적용 버튼은 비활성 — 빈 값이 폼에 들어가지 않는다
    await expect(page.getByTestId("cb-stdprice-apply")).toBeDisabled();
  });
});
