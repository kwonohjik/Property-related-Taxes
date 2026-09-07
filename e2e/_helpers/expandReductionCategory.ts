import type { Page } from "@playwright/test";

/**
 * 감면·공제 단계의 카테고리 섹션을 **열린 상태로 만든다**.
 *
 * 🔴 **「무조건 클릭」을 쓰지 말 것** (2026-09-07). 카테고리는 이제 **이미 고른 조문이 있으면
 *    열린 채로 시작한다**(`UnifiedReductionPanel`의 `useState` 초기화 —
 *    검증 오류로 되돌아왔을 때 오류가 지목한 입력칸이 화면에 없던 문제를 고친 것이다).
 *    seed에 감면이 담겨 있으면 클릭이 **오히려 접어** 뒤 단언이 전부 깨진다 —
 *    `red-phd-two-article-snapshot-keys.spec.ts`가 실제로 그렇게 실패했다.
 *
 * `aria-expanded`로 판정하고 필요할 때만 누른다. 이미 열려 있으면 아무 것도 하지 않는다.
 */
export async function expandReductionCategory(page: Page, name: RegExp): Promise<void> {
  const header = page.getByRole("button", { name }).first();
  await header.waitFor();
  if ((await header.getAttribute("aria-expanded")) === "false") await header.click();
}
