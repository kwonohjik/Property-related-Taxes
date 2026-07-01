/**
 * transfer-expropriation-77-2025.spec.ts
 *
 * 비자발적 양도 감면 UI 검증 (2025 개정 + 신규 조문):
 *  - §77 공익수용: 2025.1.1 이후 양도분 개정 감면율(현금 15%/채권 20~45%) 라벨 노출
 *  - §77의3 개발제한구역 매수 토지: 입력 카드 + 구역상태 라디오 + 해제분 조건부 필드
 *  - §77의2 대토보상 과세특례: 입력 카드(현금/대토 보상액)
 *
 * 실행(비-worktree, 기본 3000): npx playwright test e2e/transfer-expropriation-77-2025.spec.ts
 */
import { test, expect, type Page, type Locator } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

function inputByLabel(scope: Page | Locator, labelText: string): Locator {
  return scope
    .locator(`label:has-text("${labelText}")`)
    .locator("xpath=..")
    .locator("input")
    .first();
}

/** 토지 자산 최소 입력 후 감면·공제 단계로 이동 (양도일 2026 → §77 개정율 적용 조건) */
async function gotoReductionStep(page: Page) {
  await page.goto("/calc/transfer-tax");
  await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

  // 양도일 2026-05-01 (2025.1.1 이후 → §77 개정 감면율)
  await page.getByTestId("transfer-date").getByLabel("연도").fill("2026");
  await page.getByTestId("transfer-date").getByLabel("월").fill("05");
  await page.getByTestId("transfer-date").getByLabel("일").fill("01");

  await expandAssetSection(page, 1);
  await expandAssetSection(page, 2);
  await expandAssetSection(page, 3);

  // 단순토지 → 독립 나대지 → 면적 → 양도가액
  await page.getByRole("button", { name: "단순토지" }).click();
  await page.getByText("독립 나대지", { exact: true }).click();
  await page.getByPlaceholder("면적 입력").first().fill("300");
  await inputByLabel(page, "양도가액 (원)").fill("1000000000");

  // 매매 → 환산취득가 → 취득일 2003-03-27
  await page.getByRole("button", { name: "매매", exact: true }).click();
  await page.getByRole("button", { name: "환산취득가" }).click();
  await page.getByLabel("연도", { exact: true }).nth(2).fill("2003");
  await page.getByLabel("월", { exact: true }).nth(2).fill("03");
  await page.getByLabel("일", { exact: true }).nth(2).fill("27");

  // 감면·공제 단계로 이동
  await page.getByRole("button", { name: "감면·공제" }).first().click();
}

test.describe("비자발적 양도 감면 UI (§77 2025 개정 · §77의2 · §77의3)", () => {
  test("§77 공익수용 — 2026 양도분에 개정 감면율(현금 15%/채권 20%) 노출", async ({ page }) => {
    await gotoReductionStep(page);

    // 공익사업 수용 감면(§77) 토글 ON
    await page.getByRole("switch", { name: /공익사업 수용 감면/ }).click();

    // 개정 감면율 안내 (2025.1.1 이후 양도 → 15/20/35/45)
    await expect(page.getByText(/현금 15%, 채권 20%/)).toBeVisible();
    await expect(page.getByText(/2025\.1\.1 이후 양도분 개정율/)).toBeVisible();
    // 만기특약 라디오 라벨도 개정율
    await expect(page.getByText("없음 (20%)")).toBeVisible();
    await expect(page.getByText("5년 (45%)")).toBeVisible();

    console.log("✅ §77 2026 양도분 개정 감면율 라벨 노출 확인");
  });

  test("§77의3 개발제한구역 매수 토지 — 카드·구역상태 라디오·해제분 조건부 필드", async ({ page }) => {
    await gotoReductionStep(page);

    await page.getByRole("switch", { name: /개발제한구역 매수 토지 감면/ }).click();

    // 입력 카드 헤더 + 안내
    await expect(page.getByText("개발제한구역 매수 토지 감면 (조특법 §77의3)")).toBeVisible();
    await expect(page.getByText(/40%\(지정일 이전 취득\+거주\)/)).toBeVisible();

    // 구역 상태 라디오 2종
    await expect(page.getByText("구역 내 매수·협의매수", { exact: true })).toBeVisible();
    const releasedRadio = page.getByText("해제 후 협의매수·수용", { exact: true });
    await expect(releasedRadio).toBeVisible();

    // in_zone 기본: 해제일 필드 미노출
    await expect(page.getByText("개발제한구역 해제일")).toHaveCount(0);

    // 해제분 선택 → 해제일 + 경제자유구역 토글 노출
    await releasedRadio.click();
    await expect(page.getByText("개발제한구역 해제일")).toBeVisible();
    await expect(page.getByRole("switch", { name: /경제자유구역 등 지정/ })).toBeVisible();

    // 거주요건 토글
    await expect(page.getByRole("switch", { name: /취득일~매수\/고시일 소재지 거주/ })).toBeVisible();

    console.log("✅ §77의3 입력 카드·조건부 필드 확인");
  });

  test("§77의2 대토보상 과세특례 — 입력 카드(현금/대토 보상액)", async ({ page }) => {
    await gotoReductionStep(page);

    await page.getByRole("switch", { name: /대토보상 과세특례/ }).click();

    await expect(page.getByText("대토보상 과세특례 (조특법 §77의2)")).toBeVisible();
    await expect(page.getByText(/대토\(토지\)보상 받는 부분의 양도세 40% 세액감면/)).toBeVisible();
    await expect(page.getByText("대토(토지) 보상액")).toBeVisible();

    console.log("✅ §77의2 입력 카드 확인");
  });
});
