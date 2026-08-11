/**
 * E2E: 미등기 양도(「소득세법」 §104③) 토글의 **자산 종류 게이트**.
 *
 * 계획서: docs/02-design/features/transfer-unregistered-asset-kind-coverage.plan.md §4 Phase A
 *
 * §104③은 미등기양도자산을 「제94조제1항제1호 및 제2호에서 규정하는 자산」으로 정의한다 —
 * 1호가 토지·건물이므로 자산 종류를 가리지 않는다. 종전 UI는 주택·토지·건물 3종만 토글을
 * 띄워 **상업용건물·재개발APT에서는 입력 경로 자체가 없었다**(⑤ 특수 상황 카드가 빈 상태).
 *
 * 검증
 *  1) 상업용건물 — 토글이 보이고, 켜면 70% 단일세율로 계산된다
 *  2) 분양권 — 여전히 보이지 않는다(§94①2호 권리 — 소유권이전등기 대상 아님)
 *  3) 일반건물 — 보이지 않는다(**Phase C 한시 제외** — bundled 배관 미완이라 no-op 방지)
 *
 * 2·3은 1이 「전부 열어버린 것」이 아님을 증명하는 대조군이다 — 게이트 자체가 사라졌다면
 * 이 둘이 깨진다.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

function seedForm(assetKind: string) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind,
          acquisitionCause: "purchase",
          acquisitionDate: "2014-06-01",
          fixedAcquisitionPrice: "600000000",
          useEstimatedAcquisition: false, // 실거래가 모드 — 환산 입력 불필요
        }],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        // 비과세 미해당(다주택) — 미등기 세율 검증이 §91① 비과세로 가려지지 않게 한다.
        isOneHousehold: false,
        householdHousingCount: "2",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seedAndGoToHolding(page: Page, assetKind: string) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(assetKind),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.getByRole("button", { name: "보유 상황", exact: true }).first().click();
  await expect(page.getByText("⑤ 특수 상황")).toBeVisible();
}

test.describe("미등기 양도 토글 — 자산 종류 게이트 (§104③)", () => {
  test("상업용건물: 토글이 노출되고, ON 시 70% 단일세율로 계산된다", async ({ page }) => {
    test.setTimeout(90_000);
    await seedAndGoToHolding(page, "commercial_building");

    // 종전에는 이 토글이 렌더되지 않아 ⑤ 카드가 비어 있었다.
    const toggle = page.getByText("미등기 양도", { exact: true });
    await expect(toggle).toBeVisible();
    await toggle.click();

    await page.getByRole("button", { name: "가산세", exact: true }).first().click();
    await page.getByRole("button", { name: "세금 계산하기" }).click();
    await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });

    // 세율 70% — §104①10호가 실제로 적용됐음을 결과에서 확인한다.
    await expect(page.getByText(/70(\.0)?%/).first()).toBeVisible();
  });

  test("분양권: 토글이 노출되지 않는다 (§94①2호 권리)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndGoToHolding(page, "presale_right");
    await expect(page.getByText("미등기 양도", { exact: true })).toHaveCount(0);
  });

  test("일반건물: 토지·건물 2토글이 나오고 단일 토글은 없다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndGoToHolding(page, "general_building");

    // 토지·건물은 별개 부동산·별개 등기부라 축이 둘이다.
    await expect(page.getByText("토지 미등기 양도", { exact: true })).toBeVisible();
    await expect(page.getByText("건물 미등기 양도", { exact: true })).toBeVisible();
    // 폼-전역 단일 토글은 GB에서 쓰지 않는다(단일 boolean으로 표현 불가).
    await expect(page.getByText("미등기 양도", { exact: true })).toHaveCount(0);
  });

  test("일반건물: 한쪽만 켜면 「미등기 파트만 70%」 안내가 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndGoToHolding(page, "general_building");

    // 대조군 — 켜기 전에는 안내가 없다(부정 단언이 다른 이유로 통과하지 않게 고정).
    await expect(page.getByText(/미등기 파트만 70%가 적용됩니다/)).toHaveCount(0);

    await page.getByText("건물 미등기 양도", { exact: true }).click();
    await expect(page.getByText(/미등기 파트만 70%가 적용됩니다/)).toBeVisible();
  });

  /**
   * §168① 제외 사유 안내 (C-6c).
   *
   * 엔진은 제외 사유를 판정하지 않는다 — 입력이 없다. 사용자가 제외 대상인데 토글을 켜면
   * 70%가 그대로 적용돼 **과대 계산**되므로, 켠 시점에 확인을 유도하는 안내가 필요하다.
   */
  test("미등기를 켜면 §168① 제외 사유 안내가 뜬다 (상업용건물)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndGoToHolding(page, "commercial_building");

    const notice = page.getByText("미등기양도자산에서 제외되는 경우", { exact: true });
    // 대조군 — 켜기 전에는 없다.
    await expect(notice).toHaveCount(0);

    await page.getByText("미등기 양도", { exact: true }).click();
    await expect(notice).toBeVisible();
    // 각 호가 실제로 나열되는지 — 문구가 통째로 비어도 제목만으로는 통과하므로 본문을 짚는다.
    await expect(page.getByText(/장기할부조건/)).toBeVisible();
    await expect(page.getByText(/토지구획환지처분공고 전/)).toBeVisible();
  });

  test("일반건물도 축 하나만 켜면 §168① 안내가 뜬다", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndGoToHolding(page, "general_building");

    const notice = page.getByText("미등기양도자산에서 제외되는 경우", { exact: true });
    await expect(notice).toHaveCount(0);

    // 폼-전역이 아니라 자산-수준 2축이므로, 그 축을 보지 않으면 안내가 안 뜬다.
    await page.getByText("토지 미등기 양도", { exact: true }).click();
    await expect(notice).toBeVisible();
  });
});
