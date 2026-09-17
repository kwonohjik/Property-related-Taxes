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
import { computeInputHash } from "../../lib/storage/content-hash";

/**
 * Dexie `calculations` 스토어에 이력 record 1건을 넣는다.
 * 스토어가 아직 없으면 준비될 때까지 재시도한다 — 호출 전 별도 대기가 필요 없다.
 */
export async function putCalculationRecord(page: Page, record: unknown): Promise<void> {
  /**
   * 🔑 **`inputHash`를 실제 저장 경로와 똑같이 붙인다.**
   *
   * `calculationRepository`의 저장 경로는 **항상** `computeInputHash(inputData)`를 부여한다
   * (`calculation-repository.ts` — create·update 양쪽). 시드에만 없으면 그 필드를 읽는 기능이
   * **테스트에서만 다르게 동작**한다 — 실제로 다건 합산의 「원본 변경 감지」가 모든 시드 자산을
   * 「판정 불가」로 보고 배너를 띄워, 그 배너 DOM이 기존 spec의 `getByText("양도 1번")`을
   * **strict mode 위반**으로 만들었다(2026-09-16 실측 2건).
   *
   * 값을 손으로 적지 않고 **같은 leaf**를 쓴다(dual truth 방지). 이미 들고 있으면 존중한다 —
   * 레거시(해시 없는 구 record) 경로를 일부러 태우는 spec이 있을 수 있다.
   */
  const withHash =
    record && typeof record === "object" && "inputData" in record && !("inputHash" in record)
      ? {
          ...(record as Record<string, unknown>),
          inputHash: await computeInputHash(
            (record as { inputData: Record<string, unknown> }).inputData ?? {},
          ),
        }
      : record;
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
  }, withHash);
}

/**
 * 이력 record가 **IndexedDB에 실제로 들어갈 때까지** 기다린다.
 *
 * ## 왜 필요한가 — 「계산 응답」은 「저장 완료」가 아니다
 *
 * 이력 저장은 **결과 화면 마운트 시 `useEffect`**가 시작하는 비동기 write다
 * (`lib/storage/use-auto-save-calculation.ts`의 `saveOrUpdateByBusinessKey`).
 * 즉 `POST /api/calc/*` 응답 → React 렌더 → effect 발화 → IndexedDB write 순서라,
 * **응답만 기다리고 곧바로 `page.goto()` 하면 셋 다 선점된다**.
 *
 * 실측(2026-09-17 · PR #1660 CI 샤드 5): `stock-multi-history-record.spec.ts` SH-3이
 * 계산 응답 직후 다른 페이지로 이동했고, 뒤이어 연 `/history`는 **「전체 0건 — 저장된 계산
 * 이력이 없습니다」**였다. 같은 테스트가 직전 PR 런에서는 10.0초에 통과했으므로
 * **부하에 따라 갈리는 경합**이지 제품 결함이 아니다(로컬 11.5초 3건 통과).
 *
 * ⇒ 저장을 관측하는 UI 앵커가 없는 화면(주식 결과 화면은 저장 상태 토스트를 렌더하지 않는다)
 *   에서는 **저장소를 직접 본다**.
 *
 * @param needle record 전체를 JSON 직렬화했을 때 포함돼야 할 문자열(예: 종목명).
 */
export async function waitForCalculationSaved(
  page: Page,
  needle: string,
  timeoutMs = 30_000,
): Promise<void> {
  await page.evaluate(
    async ({ needle, timeoutMs }) => {
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
          req.onblocked = () => resolve(null);
        });

      const hasMatch = (db: IDBDatabase) =>
        new Promise<boolean>((resolve) => {
          let tx: IDBTransaction;
          try {
            // ⚠️ 시드 경로와 같은 이유로 NotFoundError가 **동기적으로** 던져질 수 있다.
            tx = db.transaction(STORE, "readonly");
          } catch {
            db.close();
            resolve(false);
            return;
          }
          const req = tx.objectStore(STORE).getAll();
          req.onsuccess = () => {
            const found = (req.result ?? []).some((r) => JSON.stringify(r).includes(needle));
            db.close();
            resolve(found);
          };
          req.onerror = () => {
            db.close();
            resolve(false);
          };
        });

      const deadline = Date.now() + timeoutMs;
      for (;;) {
        const db = await openIfReady();
        if (db && (await hasMatch(db))) return;
        if (Date.now() > deadline) {
          throw new Error(
            `이력 저장 대기 실패 — «${needle}»를 담은 record가 ${timeoutMs}ms 안에 저장되지 않았다`,
          );
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    },
    { needle, timeoutMs },
  );
}
