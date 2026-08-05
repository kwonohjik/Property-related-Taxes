/**
 * 클릭 → 화면 이동 공용 헬퍼.
 *
 * ⚠️ **Next.js는 hydration이 끝나기 전까지 `onClick` 핸들러가 붙어 있지 않다.** 그래서 CI
 *    호스팅 러너에서는 Playwright가 「보이고 활성화된」 버튼을 정상적으로 눌러도 **아무 일도
 *    일어나지 않는** 구간이 실재한다. actionability 검사는 DOM만 보므로 이 구간을 걸러내지
 *    못한다 — 클릭은 성공하고, 이동만 일어나지 않는다.
 *
 * 📌 러너 사양 — 「2코어」가 아니다(2026-08-05 정정). 저장소가 public이라 호스팅 Linux 러너는
 *    **4 vCPU**다(비공개 저장소 표준 러너가 2 vCPU). 실측 근거: `playwright.config.ts`에
 *    `workers`를 지정하지 않아 Playwright 기본값(코어의 절반)이 쓰이는데, CI 로그가
 *    `Running 218 tests using 2 workers`다 — 2코어였다면 worker가 1이다.
 *    ⇒ 원인은 「코어가 적어서」가 아니라 **로컬(10코어+)보다 느려 타이밍 창이 벌어져서**다.
 *      진단·수정은 그대로 유효하다(수정 후 flaky 0).
 *
 * 2026-08-05 CI 실측: `toHaveURL`이 5초 동안 **원래 URL만 9회** 확인하고 실패했다
 * (`deemed-to-wizard` 2건 · 홈 카드 링크 1건). 세 건 모두 재시도에서 살아나 `flaky`로
 * 집계됐다 — job이 초록이라 보이지 않았다.
 *
 * ⇒ **클릭 자체를 재시도**한다. 무효화된 클릭이었다면 다음 회차에는 hydration이 끝나 있다.
 *   이미 이동했으면 다시 누르지 않는다.
 *
 * (같은 「재시도로 가려진 실패」가 `cross-104-5`에서 두 달 넘게 방치되다 CI를 빨갛게 만든
 *  전례가 있다 — `history-seed.ts` 참조.)
 */
import { expect, type Locator, type Page } from "@playwright/test";

/** `target`을 눌러 `url`로 이동할 때까지 재시도한다. */
export async function clickAndExpectUrl(page: Page, target: Locator, url: RegExp): Promise<void> {
  await expect(async () => {
    if (!url.test(page.url())) await target.click({ timeout: 5_000 });
    await expect(page).toHaveURL(url, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}
