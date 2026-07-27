/**
 * E2E: 상속 취득 "자산 구분" 토글 보조계산 강등 (PR #824).
 *
 * 상단 coarse 자산구분(토지/개별주택/공동주택) 라디오를 폐지하고, 핵심 입력을
 * "평가방법 + 신고가액"으로 정리. 토지/주택 판정은 상단 assetKind 파생, 주택 개별/공동
 * 픽커("주택 구분 (공시가격 조회용)")는 보충적평가 보조계산·§164⑦ 환산 맥락 내부에만 노출.
 *
 * 검증(live app):
 *   D1. 주택 상속(현대·보충적평가) → 상단 자산구분 라디오 없음 + 평가방법·신고가액 노출.
 *   D2. + 보조계산 ON → 주택 구분 픽커 노출.
 *   D3. 주택 상속(< 2005.4.30 미공시) → §164⑦ 환산 안내 + 주택 구분 픽커 노출(보조계산 없이도).
 *   D4. 토지 상속 → 상단 자산구분 라디오 없음 + 주택 구분 픽커 없음.
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 * 비-worktree 실행: npx playwright test e2e/inheritance-asset-kind-demote.spec.ts
 */
import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";

const COARSE_RADIO = "자산 구분 (상속개시일 기준)";
const HOUSE_KIND_PICKER = "주택 구분 (공시가격 조회용)";
const METHOD_LABEL = "상속세 신고 시 평가방법";
const REPORTED_LABEL = "상속세 신고가액";
const HOUSE_VAL_NOTICE = "개별주택가격 미공시";

function seedForm(overrides: Record<string, unknown> = {}) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "housing",
          acquisitionCause: "inheritance",
          acquisitionDate: "2015-05-01",
          decedentAcquisitionDate: "2005-02-02",
          inheritanceStartDate: "2015-05-01",
          inheritanceAssetKind: "land", // 기본값 잔존 — 강등 후에도 assetKind 파생으로 안전
          inheritanceValuationMethod: "supplementary",
          publishedValueAtInheritance: "500000000",
          useSupplementaryHelper: false,
          useEstimatedAcquisition: false,
          ...overrides,
        }],
        transferDate: "2025-06-01",
        filingDate: "2025-08-31",
        contractTotalPrice: "800000000",
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

async function seedAndOpen(page: Page, overrides: Record<string, unknown> = {}) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(overrides),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 취득정보 섹션 펼치기 (기본 접힘) — 상속 취득 폼 노출.
  await page.getByRole("button", { name: /취득정보/ }).first().click();
}

test.describe("상속 자산구분 토글 보조계산 강등 (PR #824)", () => {
  test("D1: 주택 상속(현대·보충적평가) → 상단 라디오 없음 + 평가방법·신고가액 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page);

    // 폐지된 상단 coarse 자산구분 라디오는 나타나지 않는다.
    await expect(page.getByText(COARSE_RADIO, { exact: false })).toHaveCount(0);
    await expect(page.getByText("자산 구분", { exact: false })).toHaveCount(0);

    // 핵심 입력(평가방법 + 신고가액)은 노출된다.
    await expect(page.getByText(METHOD_LABEL, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(REPORTED_LABEL, { exact: false }).first()).toBeVisible();

    // 보조계산 OFF·§164⑦ 없음 → 주택 구분 픽커는 아직 없다.
    await expect(page.getByText(HOUSE_KIND_PICKER, { exact: false })).toHaveCount(0);
  });

  test("D2: 보조계산 ON → 주택 구분 픽커 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page, { useSupplementaryHelper: true });

    await expect(page.getByText(COARSE_RADIO, { exact: false })).toHaveCount(0);
    await expect(page.getByText(HOUSE_KIND_PICKER, { exact: false }).first()).toBeVisible();
  });

  test("D3: 주택 상속(<2005.4.30 미공시) → §164⑦ 환산 안내 + 주택 구분 픽커 노출", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page, {
      acquisitionDate: "2003-05-01",
      inheritanceStartDate: "2003-05-01",
    });

    await expect(page.getByText(COARSE_RADIO, { exact: false })).toHaveCount(0);
    // §164⑦ 환산 안내(개별주택가격 미공시)와 주택 구분 픽커가 보조계산 없이도 노출된다.
    await expect(page.getByText(HOUSE_VAL_NOTICE, { exact: false }).first()).toBeVisible();
    await expect(page.getByText(HOUSE_KIND_PICKER, { exact: false }).first()).toBeVisible();
  });

  test("D4: 토지 상속 → 상단 라디오 없음 + 주택 구분 픽커 없음", async ({ page }) => {
    test.setTimeout(60_000);
    await seedAndOpen(page, { assetKind: "land" });

    await expect(page.getByText(COARSE_RADIO, { exact: false })).toHaveCount(0);
    await expect(page.getByText("자산 구분", { exact: false })).toHaveCount(0);
    // 토지는 주택 개별/공동 픽커가 노출되지 않는다.
    await expect(page.getByText(HOUSE_KIND_PICKER, { exact: false })).toHaveCount(0);
  });
});
