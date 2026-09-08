/**
 * E2E: 양도세 부담부증여 × **조합원입주권** (소령 §159 × §166①).
 *
 * 이 조합은 2026-09-08까지 3층(⑤ UI · ⑧ validate · 엔진)에서 차단돼 있었다.
 *
 * 화면에서 재는 것:
 *   ① ④′ 「증여재산 평가 — 조합원입주권」 3필드가 뜨고 ④ 단일 칸은 **사라진다**
 *   ② K-4 실지취득가액 칸이 **기준시가 모드에서도** 뜬다 (§159①1호 A괄호 미발동)
 *   ③ 취득시 기준시가 카드(`bg-acq-std-price`)가 **사라진다**
 *   ④ 보충적 평가액 박스가 3항 합을 보여준다
 *
 * 정책: worktree E2E는 `E2E_PORT` 필수 (`feedback_worktree_e2e_port_isolation`).
 * ⚠️ `<Frac>`·공용 카드는 텍스트를 여러 span으로 가르므로 셀렉터는 testid·짧은 문구로 잡는다.
 */
import { test, expect } from "@playwright/test";
import { expandAssetSection } from "./_helpers/expandAssetSection";

test.describe("부담부증여 × 조합원입주권 — 입력 경로 개방", () => {
  test("④′ 평가 3필드 + K-4 칸이 기준시가 모드에서 렌더된다", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);

    // 자산 종류: 입주권
    await card.getByRole("button", { name: "입주권", exact: true }).click();
    // 양도 형태: 부담부증여
    await card.getByRole("radio", { name: /부담부증여/ }).check();

    // 🔴 미지원 안내가 «뜨지 않는다»
    await expect(card.getByText(/에서만 지원됩니다/)).toHaveCount(0);
    await expect(card.getByText("부담부증여 (소득세법 시행령 §159)")).toBeVisible();

    // ① ④′ 섹션 — ④ 단일 칸은 사라진다
    await expect(card.getByText("증여재산 평가 — 조합원입주권")).toBeVisible();
    await expect(card.getByText("증여재산 평가 — 증여일 현재 기준시가")).toHaveCount(0);

    // 3필드
    await card.locator('[data-testid="bg-right-member-rights-value"]').fill("1,200,000,000");
    await card.locator('[data-testid="bg-right-paid-installments"]').fill("200,000,000");
    await card.locator('[data-testid="bg-right-premium"]').fill("100,000,000");

    // ④ 보충적 평가액 박스 = 3항 합
    const totalBox = card.locator('[data-testid="bg-right-valuation-total"]');
    await expect(totalBox).toBeVisible();
    await expect(totalBox).toContainText("1,500,000,000");
    // 🔴 「증여재산 평가액」이 아니라 「보충적 평가액」이다 (담보·임대 Max는 엔진이 정한다)
    await expect(totalBox).toContainText("보충적 평가액");

    // ② K-4 — 기준시가 모드인데도 실지취득가액 칸이 있다
    await expect(card.getByText("실지취득가액 입력")).toBeVisible();
    await expect(card.getByText("종전 부동산 실지취득가액")).toBeVisible();

    // ③ 취득시 기준시가 카드는 사라진다 (그 값을 쓰지 않는다)
    await expect(card.locator('[data-testid="bg-acq-std-price"]')).toHaveCount(0);
  });

  test("🔴 대조군 — 주택에서는 ④ 단일 칸과 취득시 기준시가 카드가 그대로다", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/calc/transfer-tax");
    await page.getByRole("heading", { name: "양도소득세 계산기" }).waitFor();

    const card = page.locator('[data-asset-card-index="0"]');
    await expandAssetSection(page, 1);
    await expandAssetSection(page, 2);

    await card.getByRole("button", { name: "주택", exact: true }).click();
    await card.getByRole("radio", { name: /부담부증여/ }).check();

    await expect(card.getByText("증여재산 평가 — 증여일 현재 기준시가")).toBeVisible();
    await expect(card.getByText("증여재산 평가 — 조합원입주권")).toHaveCount(0);
    await expect(card.locator('[data-testid="bg-acq-std-price"]')).toBeVisible();
    // 기준시가 모드에서 K-4 칸은 없다 (A괄호 발동)
    await expect(card.getByText("실지취득가액 입력")).toHaveCount(0);
  });
});
