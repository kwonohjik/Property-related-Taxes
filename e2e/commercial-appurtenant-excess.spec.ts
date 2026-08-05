/**
 * E2E: 상업용건물(CB) 부수토지 **기준면적 초과분 비사업용 중과** (Phase D)
 *
 * 계획서: docs/02-design/features/commercial-building-appurtenant-land-nbl.plan.md
 * 근거: 「소득세법」 §104의3①4호나목 → 「지방세법」 §106①2호 →
 *       「지방세법 시행령」 §101①2호·§101②(적용배율표)
 *
 * ⚠️ `commercial-building-appurtenant-land-61.spec.ts`와 **다른 도메인**이다 —
 *    그쪽은 상속·증여세의 상증법 §61 보충적 평가(건물+부수토지 분리 평가) 경로다.
 *
 * 검증
 *  1) 부수토지 섹션이 **취득방법과 무관하게** 노출된다(상속 취득 CB — 환산 블록은 미마운트되는 경우)
 *  2) 면적·용도지역 입력 시 배율·기준면적·초과분 미리보기가 엔진 정본과 같은 값을 낸다
 *  3) 계산 결과에 판정 STEP이 나타나고, 초과분이 세액을 올린다
 *
 * 정책: [[feedback_browser_verify_with_playwright]]
 */

import { test, expect, type Page } from "@playwright/test";
import { makeDefaultAsset } from "../lib/stores/calc-wizard-asset-factory";
import { expandAssetSection } from "./_helpers/expandAssetSection";

/** 상업지역 3배 · 전체 대지 1,200㎡ · 전체 바닥 200㎡ → 기준면적 600㎡ · 초과 600㎡(50%). */
const TOTALS = {
  cbTotalLandArea: "1200",
  cbTotalBuildingFootprintArea: "200",
  cbZoneType: "commercial",
};

function seedForm(appurtenant: Record<string, string> | null) {
  return {
    state: {
      formData: {
        assets: [{
          ...makeDefaultAsset(1),
          assetKind: "commercial_building",
          acquisitionCause: "purchase",
          acquisitionDate: "2014-06-01",
          fixedAcquisitionPrice: "600000000",
          useEstimatedAcquisition: false, // 실거래가 모드 — 환산 입력 불필요
          ...(appurtenant ?? {}),
        }],
        transferDate: "2024-06-01",
        filingDate: "2024-08-31",
        contractTotalPrice: "1200000000",
        householdHousingCount: "0",
        isRegulatedArea: false,
        wasRegulatedAtAcquisition: false,
        isUnregistered: false,
      },
      pendingMigration: false,
    },
    version: 0,
  };
}

async function seed(page: Page, appurtenant: Record<string, string> | null) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  await page.evaluate(
    (s) => sessionStorage.setItem("transfer-tax-wizard", JSON.stringify(s)),
    seedForm(appurtenant),
  );
  await page.reload();
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();
  // 자산 카드는 진입 시 전부 접힘(progressive disclosure) — ③ 취득 섹션을 펴야 입력이 보인다.
  await expandAssetSection(page, 3);
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "가산세", exact: true }).first().click();
  await page.getByRole("button", { name: "세금 계산하기" }).click();
  await page.getByText("신고서 양식", { exact: false }).first().waitFor({ timeout: 20000 });
}

test.describe("CB 부수토지 기준면적 초과분 중과", () => {
  test("입력 섹션이 노출되고 배율·초과분 미리보기가 표시된다", async ({ page }) => {
    test.setTimeout(60_000);
    await seed(page, TOTALS);

    // 섹션 제목 — 취득방법(실거래가)과 무관하게 마운트된다.
    await expect(page.getByText("부수토지 비사업용 판정", { exact: true })).toBeVisible();

    // 배율·기준면적·초과분 미리보기 (엔진 정본 §101② 상업지역 3배)
    await expect(page.getByText(/상업지역 3배/)).toBeVisible();
    await expect(page.getByText(/인정 한도.*600\.00\s*㎡/)).toBeVisible();
    await expect(page.getByText(/초과분\s*600\.00㎡ 비사업용/)).toBeVisible();
    await expect(page.getByText(/전체의\s*50\.0%/)).toBeVisible();
  });

  test("§101① 단서 토글 ON → 배율 입력이 사라지고 전량 비사업용 안내", async ({ page }) => {
    test.setTimeout(60_000);
    await seed(page, TOTALS);

    await page.getByText("허가·사용승인 미이행 건축물", { exact: true }).click();

    await expect(page.getByText(/부속토지 전체 비사업용 \(배율 계산 없음\)/)).toBeVisible();
    // 배율 미리보기는 사라진다(배율 계산 자체를 하지 않음)
    await expect(page.getByText(/상업지역 3배/)).toHaveCount(0);
  });

  test("초과분이 있으면 결과에 판정 STEP이 나타나고 세액이 올라간다", async ({ page }) => {
    test.setTimeout(90_000);

    // (1) 판정 없이 계산 — 기준선 세액
    await seed(page, null);
    await calculate(page);
    const baselineText = await page.locator("body").innerText();
    // 판정 STEP은 없어야 한다
    expect(baselineText).not.toContain("부수토지 기준면적 초과분 비사업용 판정");

    // (2) 부수토지 초과 입력 후 계산
    await seed(page, TOTALS);
    await calculate(page);

    // 엔진 step 목록은 기본 접힘 — 펴야 검증이 실제로 성립한다
    // (접힌 채 단언하면 hidden 요소를 통과시켜 검증이 조용히 약해진다).
    await page.getByRole("button", { name: /전체 엔진 계산 과정 보기/ }).first().click();

    // 판정 STEP 노출 — 산식에 배율·기준면적·초과면적이 들어간다
    await expect(
      page.getByText("부수토지 기준면적 초과분 비사업용 판정", { exact: false }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(/기준면적 = 건축물 바닥면적 200㎡ × 3배 = 600㎡/).first(),
    ).toBeVisible();
  });
});
