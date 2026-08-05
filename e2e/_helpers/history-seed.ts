/**
 * 이력(IndexedDB) 시드 공용 헬퍼.
 *
 * ⚠️ 이력 시드는 `indexedDB.open("KoreanTaxCalcLocal")`을 **버전 없이** 연다. 이 호출은 DB가
 *    없으면 **스토어가 하나도 없는 빈 DB(v1)를 만들어 버린다**. 그래서 앱(Dexie) 초기화보다
 *    먼저 실행되면 `db.transaction("calculations")`가
 *    `NotFoundError: One of the specified object stores was not found.`를 **동기적으로 던지고**,
 *    그 예외가 페이지를 넘어뜨려 후속 assertion이
 *    `Execution context was destroyed, most likely because of a navigation.`으로 터진다.
 *
 * ── 왜 「사전 검사」로는 부족한가 ─────────────────────────────────────────────
 * 종전에는 시드 **직전에** 스토어 존재를 폴링하는 가드를 뒀다. 그 방식은 두 번 부족했다:
 *
 *  1. `indexedDB.databases()`에 **이름이 뜨는 것**만 보던 최초 가드는 **DB 존재**만 보장하고
 *     **스토어 생성**은 보장하지 않았다 — CI 호스팅 러너에서 샤드 4가 8건 실패했다(2026-08-05).
 *  2. 스토어 존재까지 보도록 고쳐도, **가드 통과와 시드 사이**의 상태 변화는 막지 못한다.
 *     `cross-104-5.spec.ts`가 이 가드를 쓰고도 CI에서 상시 flaky였다
 *     (2026-08-05 실측 — 직전 3개 run 모두 첫 시도 실패 후 재시도로 살아남았고, 재시도까지
 *      소진한 run에서 job이 빨개졌다).
 *
 * ⇒ **시점 검사를 버리고 시드 자체를 재시도**한다. 던져지는 `NotFoundError`를 잡아 스토어가
 *   준비될 때까지 다시 시도하면 초기화 순서가 어떻게 꼬이든 무관해진다. 사전 검사가 필요 없어져
 *   호출부도 단순해진다.
 */
import type { Page } from "@playwright/test";

/**
 * Dexie `calculations` 스토어에 이력 record 1건을 넣는다.
 * 스토어가 아직 없으면 준비될 때까지 재시도한다 — 호출 전 별도 대기가 필요 없다.
 */
export async function putCalculationRecord(page: Page, record: unknown): Promise<void> {
  await page.evaluate(async (rec) => {
    const DB_NAME = "KoreanTaxCalcLocal";
    const STORE = "calculations";

    /** 스토어까지 준비된 연결만 돌려준다. 준비 전이면 닫고 null. */
    const openIfReady = () =>
      new Promise<IDBDatabase | null>((resolve) => {
        const req = indexedDB.open(DB_NAME);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.close();
            resolve(null);
            return;
          }
          resolve(db);
        };
        req.onerror = () => resolve(null);
        // Dexie가 versionchange 중이면 blocked — 이번 회차는 포기하고 재시도한다.
        req.onblocked = () => resolve(null);
      });

    const put = (db: IDBDatabase) =>
      new Promise<boolean>((resolve) => {
        let tx: IDBTransaction;
        try {
          // ⚠️ NotFoundError는 여기서 **동기적으로** 던져진다 — 잡지 않으면 페이지가 넘어간다.
          tx = db.transaction(STORE, "readwrite");
        } catch {
          db.close();
          resolve(false);
          return;
        }
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
        tx.onabort = () => {
          db.close();
          resolve(false);
        };
      });

    const deadline = Date.now() + 20_000;
    for (;;) {
      const db = await openIfReady();
      if (db && (await put(db))) return;
      if (Date.now() > deadline) {
        throw new Error(`IndexedDB 시드 실패 — ${STORE} 스토어가 준비되지 않았다 (20초 초과)`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }, record);
}
