/**
 * Dexie v8 → v9 업그레이드 배선 (14지점 점검 F4) — 구 국외전출세 record의 businessKey가 새 규칙으로 재계산된다.
 * 코어(`recomputeRecordBusinessKey`)는 `exit-tax-business-key.anchor.test.ts`가 본다 — 여기는 db.ts 배선만.
 */
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { describe, it, expect } from "vitest";

const STORES = {
  userProfile: "id, updatedAt",
  calculations:
    "id, userId, taxType, createdAt, [userId+createdAt], [userId+taxType+createdAt], [userId+linkedCalculationId], [userId+clientId+createdAt]",
  clients: "id, userId, name, lastUsedAt, [userId+name], [userId+createdAt], [userId+lastUsedAt]",
  reverseGeocodeCache: "id, expiresAt",
  rtmsSalesCache: "id, expiresAt",
};

describe("db v9 — businessKey 재계산 배선", () => {
  it("v8에 저장된 국외전출세 record(`sec:이름|`)가 열 때 출국일 키로 바뀐다", async () => {
    const legacy = new Dexie("KoreanTaxCalcLocal");
    legacy.version(8).stores(STORES);
    await legacy.open();
    await legacy.table("calculations").bulkAdd([
      {
        id: "exit-1",
        userId: "u",
        taxType: "stock_transfer",
        createdAt: "2027-03-01T00:00:00.000Z",
        businessKey: "sec:갑 사례|",
        inputData: { marketType: "exit_tax", securityName: "갑 사례", etDepartureDate: "2027-03-10" },
      },
      {
        id: "plain-1",
        userId: "u",
        taxType: "stock_transfer",
        createdAt: "2027-03-02T00:00:00.000Z",
        businessKey: "sec:삼성전자|2026.02.20",
        inputData: { marketType: "kospi", securityName: "삼성전자", transferDate: "2026-02-20" },
      },
    ]);
    legacy.close();

    const { db } = await import("@/lib/storage/db");
    await db.open();
    expect(db.verno).toBe(9);
    expect((await db.calculations.get("exit-1"))?.businessKey).toBe("sec:갑 사례||exit:2027.03.10");
    expect((await db.calculations.get("plain-1"))?.businessKey).toBe("sec:삼성전자|2026.02.20");
    expect(await db.calculations.count()).toBe(2);
    db.close();
  });
});
