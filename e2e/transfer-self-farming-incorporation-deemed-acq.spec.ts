/**
 * 자경농지 §66⑤⑥ 편입 부분감면 — 의제취득(≤1985.1.1) 취득시 기준시가 읽기전용 + 3시점 단가 레이아웃
 *
 * 검증(실브라우저):
 *  - 취득일 1984 입력 → "1985-01-01" 클램핑(의제취득) → §66 취득시 기준시가 조회 위젯 숨김 + "취득시기 의제" 안내 (작업 4·5).
 *  - "㎡당 단가"(단축 라벨) 정확히 2개 = 편입시·양도시만(취득시는 읽기전용) → unitPriceWide 라벨 적용 + 취득시 조회 숨김 (작업 1·3).
 *
 * 실행(비-worktree 기본 3000): npx playwright test e2e/transfer-self-farming-incorporation-deemed-acq.spec.ts
 * 계획: docs/00-pm/transfer-self-farming-incorporation-ui-fixes.plan.md
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope.locator(`label:has-text("${labelText}")`).locator("xpath=..").locator("input").first();
}

test.describe("자경 §66 편입 — 의제취득 취득시 기준시가 읽기전용", () => {
  test("취득일 1984(→1985.1.1 의제) → 취득시 조회 숨김 + 의제 안내 + 단가 라벨 2개", async ({ page }) => {
    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    // 양도일 2026-01-12
    await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
    await page.getByTestId("transfer-date").getByLabel("월").fill("01");
    await page.getByTestId("transfer-date").getByLabel("일").fill("12");

    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);
    await expandAssetSection(page, 3);

    // 자산: 단순토지 → 독립 나대지 → 면적
    await page.getByRole("button", { name: "단순토지" }).click();
    await page.getByText("독립 나대지", { exact: true }).click();
    await page.getByPlaceholder("면적 입력").first().fill("661");
    await inputByLabel(page, "양도가액 (원)").fill("826000000");

    // 취득원인 매매 → 취득일 1984 (앱이 1985-01-01로 클램핑 = 의제취득)
    await page.getByRole("button", { name: "매매", exact: true }).click();
    await page.getByLabel("연도", { exact: true }).nth(2).fill("1984");
    await page.getByLabel("월", { exact: true }).nth(2).fill("06");
    await page.getByLabel("일", { exact: true }).nth(2).fill("01");

    // 감면·공제 → 자경농지 감면 ON → 주거·상업·공업지역 편입 ON
    await page.getByRole("button", { name: "감면·공제" }).first().click();
    await page.getByRole("switch", { name: /자경농지 감면/ }).setChecked(true);
    await page.getByRole("switch", { name: /주거·상업·공업지역 편입/ }).setChecked(true);

    // 편입 위젯 렌더 확인
    await expect(page.getByText(/편입 부분감면 비율/)).toBeVisible();

    // 작업 4·5: 의제취득 → 취득시 읽기전용 안내
    await expect(page.getByText(/취득시기 의제/)).toBeVisible();

    // 작업 1·3 + 취득시 숨김: "㎡당 단가"(단축 라벨)는 편입시·양도시 2개만
    // (취득시는 조회 위젯 대신 읽기전용 → 단가칸 없음)
    await expect(page.getByText("㎡당 단가", { exact: true })).toHaveCount(2);

    // 작업 1: 편입시 행의 단가·면적·금액 input이 같은 라인(같은 높이)에 정렬되는지 boundingBox로 검증.
    // (버그: 총액 label="" 라벨 붕괴로 금액칸만 위로 뜸)
    const incorpRow = page.locator('div:has(> label:has-text("편입일 당시 기준시가"))').first();
    const unitBox = await incorpRow.getByPlaceholder("공시지가 단가").boundingBox();
    const areaBox = await incorpRow.getByPlaceholder("면적 입력").first().boundingBox();
    const amtBox = await incorpRow.getByPlaceholder("금액 입력").first().boundingBox();
    expect(unitBox && areaBox && amtBox).toBeTruthy();
    // 세 input의 top(y)이 4px 이내로 정렬
    expect(Math.abs(unitBox!.y - areaBox!.y)).toBeLessThanOrEqual(4);
    expect(Math.abs(unitBox!.y - amtBox!.y)).toBeLessThanOrEqual(4);

    console.log("✅ 자경 §66 편입 의제취득 — 취득시 읽기전용 + 단가 라벨 2개 + 3칸 정렬 확인");
  });
});
