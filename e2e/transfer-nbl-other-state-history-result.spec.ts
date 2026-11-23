/**
 * transfer-nbl-other-state-history-result.spec.ts
 *
 * NBL-STATE-HISTORY-U2 — 기타토지 «소유기간 중 건축물 유무 이력» 결과 카드(⑦) — 구간표 · 영 §168조의6 기준.
 *
 * 검증:
 *  1) 단건 철거 이력 → 결과 카드에 구간표(2구간 · 일수 합 = 소유기간) · 가·나·다목 충족/미충족 · 한정 고지 1회. 라이트·다크 대비 · 375px 가로 스크롤 없음(UV-14).
 *  2) UV-6 고정 — 축 B 지분(같은 토지를 다른 날 나눠 취득) 2장: 지분마다 비사업용 판정 카드와 자기 구간표가 «자산별 계산 결과»(`BundledAllocationSubCards` → `ValuationDetailCards`)에 각각 그려진다.
 *     같은 철거 사건(2021-01-01)이 지분마다 다른 소유 시작일과 만난다 — 지분1(취득 2014-01-02)은 철거 전 2,555일 · 지분2(취득 2020-01-01)는 철거 전 365일.
 *
 * 폼은 sessionStorage로 시드한다(`transfer-axis-b-land-share-nbl.spec.ts` 방식) — 입력 화면(⑤)은 `transfer-nbl-other-state-history.spec.ts`가 검증한다.
 *
 * 실행: E2E_PORT=<포트> npx playwright test e2e/transfer-nbl-other-state-history-result.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expectDarkContrast, expectLightContrast } from "./_helpers/dark-contrast";
import { expectNoPageHScroll } from "./_helpers/no-page-hscroll";

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
const LAND = {
  assetKind: "land", acquisitionArea: "300", transferArea: "300", addressJibun: "서울 강남구 테스트동 1",
  acquisitionCause: "purchase", acquisitionDate: "2014-01-02", fixedAcquisitionPrice: "400000000", standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true, nblUseDetailedJudgment: true, nblLandType: "other_land", nblZoneType: "residential", nblOtherPropertyTaxType: "comprehensive",
  nblOtherStateHistoryMode: "changed", nblOtherHasBuilding: false,
  nblOtherStateEvents: [{ kind: "building_removed", date: "2021-01-01", propertyTaxTypeBefore: "separate" }],
};
const SHARE2 = { acquisitionCause: "purchase", acquisitionDate: "2020-01-01", fixedAcquisitionPrice: "400000000", ...HALF };

async function seedAndCalc(page: Page, formData: Record<string, unknown>) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate((v) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(v)), { state: { formData, pendingMigration: false }, version: 0 });
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  for (const step of ["보유 상황", "감면·공제", "가산세"]) await page.getByRole("button", { name: step }).first().click();
  const rp = page.waitForResponse((r) => r.url().includes("/api/calc/transfer") && r.request().method() === "POST", { timeout: 60_000 });
  await page.getByRole("button", { name: /계산하기/ }).click();
  const resp = await rp;
  expect(resp.status()).toBe(200);
}

const BASE = { transferDate: "2024-06-03", filingDate: "2024-08-31", contractTotalPrice: "1000000000" };

test.describe("기타토지 건축물 이력 — 결과 카드 구간표", () => {
  test("단건 철거 이력: 구간표 2행 · 일수 합 = 소유기간 · 가·나·다목 · 한정 고지 1회 · 라이트/다크 대비 · 375px", async ({ page }) => {
    test.setTimeout(150_000);
    await seedAndCalc(page, { ...BASE, assetSplitMode: "single", assets: [{ ...makeDefaultAsset(1), ...LAND, ownershipNumerator: "100", ownershipDenominator: "100" }] });

    const table = page.getByTestId("nbl-state-history-intervals");
    await expect(table).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("nbl-state-history-period")).toHaveCount(1);
    const rows = page.getByTestId(/^nbl-state-history-interval-\d+$/);
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("2014-01-03 ~ 2020-12-31");
    await expect(rows.nth(0)).toContainText("별도합산");
    await expect(rows.nth(1)).toContainText("2021-01-01 ~ 2024-06-02");
    await expect(rows.nth(1)).toContainText("종합합산");
    // 일수 합 = 소유기간(합계 행)
    const days = await rows.evaluateAll((els) => els.map((e) => Number((e.querySelectorAll("td")[1].textContent ?? "").replace(/[^0-9]/g, ""))));
    const total = Number(((await page.getByTestId("nbl-state-history-total-row").locator("td").nth(1).textContent()) ?? "").replace(/[^0-9]/g, ""));
    expect(days.reduce((a, b) => a + b, 0)).toBe(total);
    // 영 §168조의6 기준 — 3행(소유 5년 이상)
    for (const k of ["ga", "na", "da"]) await expect(page.getByTestId(`nbl-state-history-criterion-${k}`)).toBeVisible();
    await expect(page.getByTestId("nbl-state-history-criteria")).toContainText("제1호");
    // 한정 고지는 카드 «주의사항»에 한 번만
    await expect(page.getByText("건축물 유무와 철거 직전 재산세 구분만 기간별(일 단위 구간)로 판정했습니다")).toHaveCount(1);

    await page.screenshot({ path: "e2e/_artifacts/u2-single-light.png", fullPage: false });
    await page.getByTestId("nbl-state-history-period").scrollIntoViewIfNeeded();
    await page.getByTestId("nbl-state-history-period").screenshot({ path: "e2e/_artifacts/u2-card-light.png" });
    await expectLightContrast(page, page.getByTestId("nbl-state-history-period"));
    await expectDarkContrast(page, page.getByTestId("nbl-state-history-period"));
    await page.getByTestId("nbl-state-history-period").screenshot({ path: "e2e/_artifacts/u2-card-dark.png" });
    await expectNoPageHScroll(page, 375);
    await page.getByTestId("nbl-state-history-period").scrollIntoViewIfNeeded();
    await page.getByTestId("nbl-state-history-period").screenshot({ path: "e2e/_artifacts/u2-card-375.png" });
  });

  test("UV-6 고정 — 축 B 지분 2장: 지분마다 비사업용 판정 카드와 자기 구간표가 그려진다", async ({ page }) => {
    test.setTimeout(150_000);
    await seedAndCalc(page, {
      ...BASE, assetSplitMode: "fractional",
      assets: [{ ...makeDefaultAsset(1), ...LAND, ...HALF }, { ...makeDefaultAsset(2), ...SHARE2 }],
    });

    const periods = page.getByTestId("nbl-state-history-period");
    await expect(periods).toHaveCount(2, { timeout: 20_000 });
    // 지분1: 취득 2014-01-02 → 소유는 2014-01-03부터, 철거 전 건축물 구간 2,555일
    const first = periods.nth(0);
    const second = periods.nth(1);
    await expect(first.getByTestId("nbl-state-history-interval-0")).toContainText("2014-01-03 ~ 2020-12-31");
    await expect(first.getByTestId("nbl-state-history-interval-0")).toContainText("2,555일");
    // 지분2: 취득 2020-01-01 — 철거(2021-01-01) 전 365일은 별도합산 건축물 구간, 이후는 나대지
    await expect(second.getByTestId("nbl-state-history-interval-0")).toContainText("2020-01-02 ~ 2020-12-31");
    await expect(second.getByTestId("nbl-state-history-interval-0")).toContainText("365일");
    // 두 지분의 비사업용 판정 카드(배너)가 서로 다른 결론으로 각각 보인다
    await expect(page.getByText("사업용 토지 — 일반세율이 적용됩니다.")).toHaveCount(1);
    await expect(page.getByText(/비사업용 토지 — 기본세율 \+10%p 중과/)).toHaveCount(1);
    await page.screenshot({ path: "e2e/_artifacts/u2-uv6-fractional.png", fullPage: true });
  });
});
