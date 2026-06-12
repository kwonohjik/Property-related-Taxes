/**
 * E2E: 법령 리서치 조문 플로팅 창 — 다중 동시·바깥클릭 비소멸·헤더 드래그·모두 닫기.
 *
 * 검증:
 *   FLOAT-1: 두 조문을 검색하면 창 2개가 동시에 떠 있고, 바깥을 클릭해도 안 닫힌다.
 *   FLOAT-2: 헤더를 드래그하면 창이 이동한다(위치 변경).
 *   FLOAT-3: "모두 닫기"로 모든 창이 일괄 정리된다.
 *
 * 비고:
 *   - 라우팅 배너·창 셸(헤더 제목)은 props 기반이라 외부 의존 없이 결정적.
 *   - 조문 본문은 법제처 API(KOREAN_LAW_OC) 의존 → 로컬 미설정 시 실패할 수 있으나
 *     창 개수·헤더·이동·닫기는 본문과 무관하게 검증 가능.
 * 정책: [[feedback_browser_verify_with_playwright]] [[feedback_e2e_worktree_port_isolation]]
 */
import { test, expect, type Page } from "@playwright/test";

async function search(page: Page, query: string) {
  const input = page.getByLabel("통합 검색창");
  await input.click();
  await input.fill(query);
  await page.getByRole("button", { name: /검색|라우팅 중/ }).first().click();
}

test.describe("법령 리서치 — 조문 플로팅 창", () => {
  test("FLOAT-1: 여러 조문 창 동시 + 바깥 클릭 비소멸", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "소득세법 55조");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    // 본문 로드 시 헤더(h3)+본문(pre) 양쪽 매칭 → 헤더로 한정
    await expect(page.getByRole("dialog").getByRole("heading", { name: /제55조/ })).toBeVisible();

    await search(page, "민법 750조");
    await expect(page.getByRole("dialog")).toHaveCount(2);

    // 바깥(빈 영역) 클릭 → 백드롭 없음 → 창 비소멸
    await page.mouse.click(8, 320);
    await expect(page.getByRole("dialog")).toHaveCount(2);
  });

  test("FLOAT-2: 헤더 드래그로 창 이동", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "소득세법 55조");
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();

    const before = await dialog.boundingBox();
    expect(before).not.toBeNull();
    // 헤더(상단 중앙, 버튼 영역 회피) 잡고 우하향 드래그
    const hx = before!.x + before!.width / 2;
    const hy = before!.y + 14;
    await page.mouse.move(hx, hy);
    await page.mouse.down();
    await page.mouse.move(hx + 150, hy + 120, { steps: 10 });
    await page.mouse.up();

    const after = await dialog.boundingBox();
    expect(after!.x).toBeGreaterThan(before!.x + 60);
    expect(after!.y).toBeGreaterThan(before!.y + 60);
  });

  test("FLOAT-3: 모두 닫기로 일괄 정리", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/law");

    await search(page, "소득세법 55조");
    await search(page, "민법 750조");
    await expect(page.getByRole("dialog")).toHaveCount(2);

    await page.getByRole("button", { name: "모두 닫기" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
