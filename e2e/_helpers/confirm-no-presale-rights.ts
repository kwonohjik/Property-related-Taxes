/**
 * 분양권·입주권 목록 필수화(PR-D, 2026-10-05) — `housing`·`redevelopment_apt`·`right_to_move_in`
 * 양도 + 목록 0행이면 「보유한 분양권·조합원입주권이 없습니다」를 확정해야 ⑧이 통과한다
 * (`docs/00-pm/roster-required-other-assets.plan.md` §4-5·§4-6).
 *
 * UI를 처음부터 채워 넣는(sessionStorage 시드가 아닌) E2E spec은 이 확정을 거치지 않으면
 * "세금 계산하기"에서 막힌다. 분양권·입주권을 입력할 일이 없는 시나리오에서 이 헬퍼로 한 번
 * 켜 준다(이미 목록에 행이 있거나 대상 외 자산 종류면 토글 자체가 없으므로 호출이 no-op이다).
 */
import type { Page } from "@playwright/test";

export async function confirmNoPresaleRights(page: Page): Promise<void> {
  await page.getByRole("button", { name: "보유 상황" }).first().click();
  const toggle = page.getByRole("switch", { name: /^보유한 분양권·조합원입주권이 없습니다/ });
  if (await toggle.count() > 0) {
    await toggle.click();
  }
}
