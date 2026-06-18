import { test, expect, type Page } from "@playwright/test";

/**
 * 종부세 "주택 0채" 허용 — 토지전용(사례10 종합합산) 입력 흐름 E2E.
 *
 * Plan: docs/00-pm/comprehensive-land-only-zero-house.plan.md
 * - Step2에서 초기 1채를 명시적 삭제 → 0채 빈 상태 안내
 * - Step4 종합합산 토지 입력(테이블+모달) → 계산 → 결과에 토지분(8,638,017) 표시, 주택분 산출근거 카드 부재
 *
 * worktree: E2E_PORT=3100 npx playwright test e2e/comprehensive-land-only-zero-house.spec.ts
 */

const PAGE = "/calc/comprehensive-tax";

async function clickNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^다음/ }).click();
}

/** 필지 추가(자동 모달 오픈) → 모달 필드 입력 → 닫기. priorMode auto면 prior 포함. */
async function addParcel(
  page: Page,
  kind: "aggregate" | "separate",
  data: { jurisdiction: string; name?: string; area: string; share: string; price: string; prior?: string },
): Promise<void> {
  await page.getByRole("button", { name: /필지 추가/ }).click();
  const dialog = page.getByTestId(`land-${kind}-parcel-dialog`);
  await expect(dialog).toBeVisible();

  await page.getByTestId(`land-${kind}-parcel-jurisdiction`).fill(data.jurisdiction);
  if (data.name) await page.getByTestId(`land-${kind}-parcel-name`).fill(data.name);
  await page.getByTestId(`land-${kind}-parcel-area`).locator("input").fill(data.area);
  await page.getByTestId(`land-${kind}-parcel-share`).locator("input").fill(data.share);
  await page.getByTestId(`land-${kind}-parcel-price`).locator("input").last().fill(data.price);
  if (data.prior !== undefined) {
    await page.getByTestId(`land-${kind}-parcel-prior-price`).locator("input").last().fill(data.prior);
  }

  await page.getByRole("dialog").getByRole("button", { name: "닫기" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("종부세 토지전용 (주택 0채)", () => {
  test("LO-E2E: 1채 삭제 → 0채 안내 → 토지 입력 → 결과 주택분 숨김·토지분 표시", async ({ page }) => {
    test.setTimeout(120_000);
    const consoleErrors: string[] = [];
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await page.goto(PAGE);
    await page.getByRole("radio", { name: "2022" }).check();
    await clickNext(page); // → Step2 주택

    // 초기 1채 행 클릭 → 모달 → 삭제 → 0채
    await page.locator('[data-testid^="property-table-row-"]').first().click();
    await expect(page.getByTestId("property-edit-dialog")).toBeVisible();
    await page.locator('[data-testid^="property-remove-"]').click();
    await expect(page.getByTestId("property-edit-dialog")).toBeHidden();

    // 0채 빈 상태 안내
    await expect(page.getByTestId("property-empty-state")).toBeVisible();

    await clickNext(page); // → Step3 합산배제
    await clickNext(page); // → Step4 토지

    // 종합합산 토지 ON → 필지 자동 계산 모드
    await page.getByText("종합합산 토지 보유").click();
    await page.getByRole("radio", { name: /필지별 자동 계산/ }).first().check();
    await page.getByRole("radio", { name: /직전 공시지가로 자동 계산/ }).check();

    // 필지 3건 — 추가→모달 fill→닫기 1건씩
    await addParcel(page, "aggregate", { jurisdiction: "서초구", area: "200", share: "50", price: "4300000", prior: "3200000" });
    await addParcel(page, "aggregate", { jurisdiction: "송파구", name: "송파구-1", area: "100", share: "100", price: "3700000", prior: "3300000" });
    await addParcel(page, "aggregate", { jurisdiction: "송파구", name: "송파구-2", area: "200", share: "100", price: "5000000", prior: "4000000" });

    // 계산 (0채 + 토지 → Zod refine 통과)
    const calcResponse = page.waitForResponse(
      (r) => r.url().includes("/api/calc/comprehensive") && r.request().method() === "POST",
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: /계산하기/ }).click();
    const resp = await calcResponse;
    expect(resp.ok(), `계산 API 비정상 ${resp.status()}`).toBe(true);

    // 토지분 결정세액 표시
    await expect(page.getByText(/8,638,017/).first()).toBeVisible({ timeout: 30_000 });
    // 토지분 산출근거 카드 표시
    await expect(page.getByTestId("land-agg-payable-calc")).toBeVisible();
    // 주택분 산출근거 카드 부재 (0채)
    await expect(page.getByTestId("housing-payable-calc")).toHaveCount(0);
    // 주택분 과세표준 섹션 부재
    await expect(page.getByText("주택분 과세표준 계산")).toHaveCount(0);

    expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
