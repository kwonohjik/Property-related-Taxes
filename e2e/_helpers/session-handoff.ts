import type { Page } from "@playwright/test";

/**
 * 마법사 handoff payload는 **한 번 읽히고 지워진다**.
 * `GiftTaxForm`이 마운트하면서 `sessionStorage.removeItem("giftTaxResumeInput")`으로
 * 소비하는 것이 제품 의도다(1회성 전달 — 뒤로가기·새로고침에 유령 prefill이 남지 않게).
 *
 * 그런데 이동은 client-side `router.push`라 **reload가 없어** 목적지 컴포넌트가 곧바로
 * 마운트한다. 그래서 E2E가 `waitForURL` 뒤에 `page.evaluate`로 그 키를 읽으면 소비와
 * 경합해 `null`이 돌아온다 — 전체 스위트(5 worker)에서 실측 재현되고, 단독 실행에서는
 * 거의 나지 않아 **flake처럼 보이는 spec 결함**이다.
 *
 * ⇒ 제품 동작을 바꾸지 않고, 지워지기 **직전** 값을 테스트 전용 키에 복제해 둔다.
 *
 * ⚠️ `page.goto` **전에** 호출해야 한다 — 초기 문서부터 훅이 걸려 있어야 한다.
 */
export async function captureSessionHandoff(page: Page, key: string): Promise<void> {
  await page.addInitScript((k: string) => {
    const mirror = `__e2e_kept__${k}`;
    const original = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (name: string) {
      if (name === k) {
        const value = this.getItem(k);
        if (value !== null) this.setItem(mirror, value);
      }
      return original.call(this, name);
    };
  }, key);
}

/** 소비 전 원본을 우선 읽고, 이미 소비됐으면 복제본을 읽는다. 둘 다 없으면 throw. */
export async function readSessionHandoff(page: Page, key: string): Promise<string> {
  const raw = await page.evaluate(
    (k: string) => sessionStorage.getItem(k) ?? sessionStorage.getItem(`__e2e_kept__${k}`),
    key,
  );
  if (raw === null) throw new Error(`handoff payload 부재: ${key} (원본·복제본 모두 없음)`);
  return raw;
}
