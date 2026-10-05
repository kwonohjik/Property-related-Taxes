/**
 * 명부 필수화(PR-1, 2026-10-05) — `"housing"` 양도 + 명부 0행이면 「다른 보유 주택이 없습니다」를
 * 확정해야 ⑧이 통과한다(`docs/00-pm/merge-composition-unknown-unfavorable.plan.md` §3-2).
 *
 * UI를 처음부터 채워 넣는(sessionStorage 시드가 아닌) E2E spec은 이 확정을 거치지 않으면
 * "세금 계산하기"에서 막힌다. 명부를 편집할 일이 없는 1주택 시나리오에서 이 헬퍼로 한 번
 * 켜 준다(이미 명부 행이 있거나 다른 자산 종류면 토글 자체가 없으므로 호출이 no-op이다).
 */
import type { Page } from "@playwright/test";

export async function confirmNoOtherHouses(page: Page): Promise<void> {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  const toggle = page.getByRole("switch", { name: /^다른 보유 주택이 없습니다/ });
  if (await toggle.count() > 0) {
    await toggle.click();
  }
}
