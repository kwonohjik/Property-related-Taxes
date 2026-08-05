/**
 * 이력(IndexedDB) 시드 공용 가드.
 *
 * ⚠️ 이력 시드 spec들은 `indexedDB.open("KoreanTaxCalcLocal")`을 **버전 없이** 연다.
 *    이 호출은 DB가 없으면 **스토어가 하나도 없는 빈 DB(v1)를 만들어 버린다**. 그래서
 *    앱(Dexie) 초기화보다 먼저 실행되면 곧바로
 *    `NotFoundError: One of the specified object stores was not found.`로 죽고,
 *    그 예외가 페이지를 넘어뜨려 후속 assertion이
 *    `Execution context was destroyed, most likely because of a navigation.`으로 터진다.
 *
 * ❌ **`indexedDB.databases()`에 이름이 뜨는 것만 보는 가드로는 부족하다** — 그건 **DB 존재**만
 *    보장하고 **스토어 생성**은 보장하지 않는다. 로컬은 빨라서 통과하지만 2코어 호스팅 러너에서는
 *    Dexie의 versionchange 트랜잭션이 끝나기 전에 시드가 끼어든다
 *    (2026-08-05 실측 — E2E 샤드 4에서 8건 실패, 서로 무관한 PR 두 건에서 동일 재현).
 *
 * ⇒ **스토어 존재 자체를 조건으로 폴링**한다. Dexie는 자기 버전으로 열며 업그레이드하므로
 *   폴링 중 빈 DB가 생겨도 곧 스토어가 채워진다.
 *   (이 방식은 `cross-104-5.spec.ts`가 2026-08-04에 같은 실패를 겪고 도입해 CI에서 검증된 것이다.)
 */
import type { Page } from "@playwright/test";

/** 앱(Dexie)이 `calculations` object store를 만들 때까지 대기. 시드 **직전에** 호출한다. */
export async function waitForCalculationsStore(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open("KoreanTaxCalcLocal");
        req.onsuccess = () => {
          const ok = req.result.objectStoreNames.contains("calculations");
          req.result.close();
          resolve(ok);
        };
        req.onerror = () => resolve(false);
      }),
    undefined,
    { timeout: 15_000 },
  );
}
