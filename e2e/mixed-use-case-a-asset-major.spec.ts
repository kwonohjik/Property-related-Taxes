/**
 * E2E: 겸용주택 Case A(용도변경 4부분) 자산-우선 전치 렌더
 *
 * Case A = 겸용 + 보유 중 일부 용도변경(house→commercial) + 최초공시일 < 용도변경일.
 * 시점-우선(splitMode 4부분)에서 자산-우선(주택 섹션/상가 섹션 × 3시점)으로 전치됨을 검증.
 * (T6/T7은 배치 모달 동작만 검증 — 본 스펙은 전치 구조 자체를 검증.)
 *
 * 계획: docs/02-design/features/mixed-use-case-a-asset-major.plan.md
 * 정책: feedback_browser_verify_with_playwright · feedback_e2e_togglecard_setchecked
 */
import { test, expect, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";
import { fillDateAndVerify } from "./_helpers/tax-flow";

async function fillDateExact(
  scope: Locator,
  { year, month, day }: { year: string; month: string; day: string },
) {
  await scope.getByLabel("연도", { exact: true }).first().fill(year);
  await scope.getByLabel("월", { exact: true }).first().fill(month);
  await scope.getByLabel("일", { exact: true }).first().fill(day);
}

test.describe("겸용주택 Case A — 자산-우선 전치", () => {
  test("용도변경(최초공시<용도변경) → 주택/상가 섹션 × 3시점 전치 렌더", async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    await fillDateAndVerify(page, { year: "2025", month: "05", day: "01" }, {
      scope: page.getByTestId("transfer-date"),
    });

    await expandAssetSection(page, 1);
    await page.getByRole("button", { name: "주택", exact: true }).first().click();
    await page.getByRole("switch", { name: "겸용주택 분리계산" }).click();
    await page.getByRole("switch", { name: "보유 중 일부 용도변경" }).click();
    await fillDateExact(page.locator("div").filter({ hasText: /^용도변경일/ }).first(), {
      year: "2018",
      month: "06",
      day: "15",
    });

    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();
    await fillDateExact(page.locator('[data-asset-card-index="0"] [data-asset-section="3"]'), {
      year: "2010",
      month: "06",
      day: "15",
    });
    await page.getByPlaceholder("주택 전용면적").fill("120");
    await page.getByPlaceholder("상가(비주택) 전용면적").fill("80");
    await page.getByPlaceholder("건축물대장의 건축면적").fill("100");
    await page.getByRole("switch", { name: /개별주택가격 미공시/ }).click();

    const mixedPhd = page
      .locator("div.bg-primary\\/5")
      .filter({ hasText: "개별주택가격 미공시 취득" })
      .first();
    await expect(mixedPhd).toBeVisible();
    // 최초고시일 2015 < 용도변경일 2018 → Case A → 자산-우선 전치
    await fillDateExact(mixedPhd, { year: "2015", month: "04", day: "30" });

    // ── 자산-우선 전치 구조 검증 ──
    await expect(mixedPhd.getByText("토지 개별공시지가 (3시점", { exact: false })).toBeVisible();
    await expect(mixedPhd.getByText("주택 기준시가", { exact: true })).toBeVisible();
    await expect(mixedPhd.getByText("상가 기준시가", { exact: true })).toBeVisible();
    // 자산별 건물 입력 + 자산분 토지 auto
    await expect(mixedPhd.getByText("주택건물 기준시가").first()).toBeVisible();
    await expect(mixedPhd.getByText("상가건물 기준시가").first()).toBeVisible();
    await expect(mixedPhd.getByText("주택분 토지기준시가 (자동)").first()).toBeVisible();
    await expect(mixedPhd.getByText("상가분 토지기준시가 (자동)").first()).toBeVisible();
    // 개별 시점 건물 계산기 버튼은 없음(배치가 6값 산출)
    await expect(mixedPhd.getByRole("button", { name: "건물 기준시가 계산" })).toHaveCount(0);
    // D1: 상단 단일 배치 버튼 대신 주택/상가 섹션 헤더 런처 2개(둘 다 결합 모달)
    // 계획: docs/02-design/features/mixed-use-case-a-per-section-stdprice-calculator.plan.md
    await expect(
      mixedPhd.getByRole("button", { name: /주택·상가 건물기준시가 일괄 계산/ }),
    ).toHaveCount(0);
    await expect(mixedPhd.getByTestId("phd-housing-stdprice-calc")).toHaveCount(1);
    await expect(mixedPhd.getByTestId("phd-commercial-stdprice-calc")).toHaveCount(1);
    // 주택 런처 클릭 → 결합 모달 열림
    await mixedPhd.getByTestId("phd-housing-stdprice-calc").click();
    await expect(page.getByRole("heading", { name: "3시점 건물 기준시가 일괄 계산" })).toBeVisible();
  });
});
