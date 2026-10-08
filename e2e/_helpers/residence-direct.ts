/**
 * 거주기간 입력 — **개월 수 직접 입력**(구 기본값) 축을 명시 선택한다 (2026-10-08).
 *
 * 신규 자산 기본값이 「구간 입력 + 빈 구간 1개」로 바뀌었다. 빈 구간은 ⑧이 「입주일을 입력하세요」로
 * 막으므로, 거주를 다루지 않던 spec은 그대로 두면 Step4·판정 ②에서 멈춘다.
 * spec을 새 기본값으로 갈아태우지 않고 **원래 보던 축**(direct · 0개월)을 명시한다
 * (memory `feedback_flipping_enum_default_rewrites_absent_records`).
 */
import { expect, type Page } from "@playwright/test";

/** `makeDefaultAsset()` 스프레드 **바로 뒤**에 펼친다 — 뒤따르는 명시값이 우선한다. */
export const DIRECT_RESIDENCE = {
  residenceInputMode: "direct" as const,
  residencePeriods: [] as { moveInDate: string; moveOutDate: string }[],
};

/**
 * 화면에서 「거주 기간 입력」 토글을 끈다(켜져 있을 때만). 1세대가 아니라 섹션이 없으면 아무것도 하지 않는다.
 * ⚠️ 그 섹션이 있는 단계(계산기 「보유 상황」 · 판정 ②)에 서 있을 때 부른다.
 */
export async function selectDirectResidenceInput(page: Page): Promise<void> {
  const sw = page.getByRole("switch", { name: /^거주 기간 입력/ });
  if ((await sw.count()) === 0) return;
  if ((await sw.getAttribute("aria-checked")) === "true") await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
}
