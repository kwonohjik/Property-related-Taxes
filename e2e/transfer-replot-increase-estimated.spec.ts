/**
 * 증환지 환산 모드 — 증가분 자동복사(Phase A) + 면적 정합(Phase B) 브라우저 확인 (PR#473)
 *
 * 세액 정확성은 vitest 앵커(__tests__/tax-engine/transfer-tax/replot-increase-doublecount.anchor.test.ts)가
 * 검증하므로, 본 E2E는 환산 모드 증환지 흐름이 브라우저에서 동작하고
 *  - Phase A: 증가분 자동추가 시 소재지·공시가격·토지 성격 자동복사(취득가액만 남김)
 *  - Phase B: 당초분 양도면적=권리면적(교부면적은 전체, 증가분 산출용)
 * 가 UI에 반영되는지 확인한다.
 *
 * 비-worktree 실행: npx playwright test e2e/transfer-replot-increase-estimated.spec.ts
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("증환지 환산 모드 — 증가분 자동복사 (PR#473 Phase A+B)", () => {
  test("증환지+환산 흐름 → 증가분 자동복사·면적 분리 브라우저 확인", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일
    await page.getByTestId("transfer-date").getByLabel("연도", { exact: true }).fill("2023");
    await page.getByTestId("transfer-date").getByLabel("월", { exact: true }).fill("05");
    await page.getByTestId("transfer-date").getByLabel("일", { exact: true }).fill("01");

    await expandAssetSection(page, 1);
    // 단순토지
    await page.getByRole("button", { name: "단순토지" }).click();

    // 면적 입력 방식 → 환지처분(증환지)
    await page.getByTestId("area-scenario-select").click();
    await page.getByRole("option", { name: /증환지/ }).click();

    // 환지처분확정일
    const confirmDate = page.getByTestId("replot-inc-confirm-date");
    await confirmDate.getByLabel("연도", { exact: true }).fill("2007");
    await confirmDate.getByLabel("월", { exact: true }).fill("04");
    await confirmDate.getByLabel("일", { exact: true }).fill("26");

    // 권리/교부면적 (Phase B: 권리=당초분 취득·양도 면적, 교부=전체 받은 면적)
    await page.getByTestId("replot-inc-entitlement-area").fill("396.8");
    await page.getByTestId("replot-inc-allocated-area").fill("429");

    // 토지 성격 = 독립 나대지 (자동복사 대상)
    await page.getByText("독립 나대지", { exact: true }).click();

    // 취득정보 → 매매 → 환산취득가 (환산 모드 브라우저 진입 확인)
    await expandAssetSection(page, 3);
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByRole("radio", { name: "환산취득가" }).click();

    // 증가분(32.2㎡) 자산 자동 추가
    await page.getByTestId("replot-inc-add-btn").click();

    // ── Phase A 검증: 증가분 추가 배너 (취득가액 입력 안내) ──
    await expect(page.getByText(/취득가액\(청산금\)/)).toBeVisible();

    // 자산 2 카드(증가분) 생성 + 자산명·면적 확인
    const asset2 = page.locator('[data-asset-card-index="1"]');
    await expect(asset2).toBeVisible();
    await expandAssetSection(page, 1, 1);
    // 자산2 자산명 = 증환지 증가분 (자산 명칭 input value)
    await expect(
      asset2.getByRole("textbox", { name: /아파트, 농지/ }),
    ).toHaveValue("증환지 증가분");
    // 증가분 면적 = 교부 429 − 권리 396.8 = 32.20㎡ (배너에 표시)
    await expect(page.getByText(/32\.20㎡가 추가됨/)).toBeVisible();

    // ── Phase B 검증: 당초분 양도면적=권리(396.8), 교부면적=전체(429) 분리 ──
    await expect(page.getByTestId("replot-inc-entitlement-area")).toHaveValue("396.8");
    await expect(page.getByTestId("replot-inc-allocated-area")).toHaveValue("429");

    // 증환지 증가분 → 양도가액 결정방식 토글 숨김 (한 필지·한 계약이라 구분 기재 불가 → 안분 강제)
    await expect(page.getByText("양도가액 결정 방식 (§166⑥)")).toHaveCount(0);

    // 양도가액 입력 위치 안내: 증가분 배너 + 상단 "총 양도가액" 강조 badge
    await expect(page.getByText(/맨 위.*총 양도가액/)).toBeVisible();
    await expect(page.getByText("증환지 양도가액 입력란")).toBeVisible();
  });
});
