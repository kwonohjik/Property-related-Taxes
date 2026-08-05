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

/**
 * 이력 모달을 연다 — **URL이 바뀌지 않는 이동**이라 `clickAndExpectUrl`로는 판정할 수 없다.
 *
 * 세 단계를 순서대로 밟는다. 하나라도 빠지면 아래 두 결함 중 하나가 남는다:
 *
 *  1. **닫힘 완료 대기** — 모달을 두 번 여는 spec에서, 직전 모달이 닫히는 중에 런처를 누르면
 *     그 안의 항목이 detach돼 후속 클릭이 `element was detached from the DOM`으로 죽는다.
 *  2. **클릭 재시도** — 런처는 `<Button onClick>`(순수 React)이라 hydration 전 클릭이 no-op이다.
 *     CI에서 모달이 아예 열리지 않아 15초 뒤 `element(s) not found`로 실패했다
 *     (run 30988428979 · 샤드 4 `1 flaky`).
 *  3. **열림 확인 후 내용 확인** — 판정 기준은 **모달 자체**(`multi-history-modal`)다.
 *     안의 항목 텍스트로 판정하면 안 된다 — 목록이 전 레코드를 나열하므로 닫히는 중인
 *     모달의 잔상도 같은 텍스트를 보여 「새로 열렸다」와 구분되지 않는다.
 *
 * ⚠️ 2026-08-05에 1·3을 빠뜨린 두 버전을 만들었다가 로컬 실측에서 현행보다 나쁜 것을 확인하고
 *    폐기했다(v1 7회 중 2회 실패 · v2 6회 중 6회 실패 · master 6회 중 0회). 판정 기준을 바꾸는
 *    변경은 **같은 부하로 반복 측정**한 뒤에만 넣는다.
 */
export async function openHistoryModal(
  page: Page,
  launcher: Locator,
  expected: Locator,
): Promise<void> {
  const modal = page.getByTestId("multi-history-modal");
  // 1. 직전 모달이 완전히 사라질 때까지 (첫 호출이면 즉시 통과)
  await expect(modal).toHaveCount(0, { timeout: 15_000 });
  // 2·3. 모달이 열릴 때까지 클릭 재시도
  await expect(async () => {
    if ((await modal.count()) === 0) await launcher.click({ timeout: 5_000 });
    await expect(modal).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(expected).toBeVisible({ timeout: 15_000 });
}

/** `target`을 눌러 `url`로 이동할 때까지 재시도한다. */
export async function clickAndExpectUrl(page: Page, target: Locator, url: RegExp): Promise<void> {
  await expect(async () => {
    if (!url.test(page.url())) await target.click({ timeout: 5_000 });
    await expect(page).toHaveURL(url, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}
