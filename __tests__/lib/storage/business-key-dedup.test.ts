/**
 * business-key-dedup — 세목 업무 식별 키 dedup anchor
 *
 * Design: docs/02-design/features/calc-history-business-key-dedup.engine.design.md
 *
 * 배경: content 해시 dedup은 입력이 한 글자만 달라도 새 record 생성(중간 저장 중복).
 *   세목 업무 키(피상속인 주민번호/이름+상속개시일, 물건 주소, 종목)로 1건 유지.
 *
 * 검증 (B-1~B-7):
 *   B-1 extractBusinessKey 세목별 키/null
 *   B-2 (C1) 같은 RRN13 ×3 → 1건
 *   B-3 (C3) 부분 RRN → nd 키, ×3 → 1건 (churn 방지)
 *   B-4 (C4) draft→final→draft → 1건, final 결과 보존
 *   B-5 (C5) 다른 RRN 2종 → 2건
 *   B-6 (C6) 같은 키·다른 clientId → 2건
 *   B-7 (C7/C8) 키 null(증여) → content 폴백
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { createCalculationRepository, resetLocalDB } from "@/lib/storage";
import { extractBusinessKey } from "@/lib/storage/business-key";

const UID = "user-bk-dedup";
const RRN = "800101-1000000";
const RRN_DIGITS = "8001011000000";

function inhInput(over: Record<string, unknown> = {}) {
  return { decedentResidentNumber: RRN, decedentName: "김코리아", deathDate: "2023-07-01", ...over };
}

function rec(taxType: "inheritance" | "gift", inputData: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return {
    taxType,
    title: "테스트",
    inputData,
    resultData: {},
    taxLawVersion: "2023-07-01",
    linkedCalculationId: null,
    clientId: null,
    ...over,
  };
}

describe("[B-1] extractBusinessKey 세목별 키", () => {
  it("상속: RRN13 → rrn:, 부분/무 → nd:이름|날짜, 전무 → null", () => {
    expect(extractBusinessKey("inheritance", inhInput())).toBe(`rrn:${RRN_DIGITS}`);
    expect(extractBusinessKey("inheritance", { decedentResidentNumber: "8001", decedentName: "김", deathDate: "2023-07-01" })).toBe("nd:김|2023.07.01");
    expect(extractBusinessKey("inheritance", { decedentName: "이", deathDate: "" })).toBe("nd:이|");
    expect(extractBusinessKey("inheritance", {})).toBeNull();
  });
  it("양도: addr|양도일", () => {
    expect(extractBusinessKey("transfer", { assets: [{ addressRoad: "서울로1" }], transferDate: "2024-05-01" })).toBe("addr:서울로1|2024.05.01");
  });
  it("취득: addr|취득일(acquisitionDate)", () => {
    expect(extractBusinessKey("acquisition", { road: "취득로", acquisitionDate: "2024-03-01" })).toBe("addr:취득로|2024.03.01");
  });
  it("재산: addr만(연도 필드 없음)", () => {
    expect(extractBusinessKey("property", { jibun: "재산123" })).toBe("addr:재산123");
  });
  it("주식: sec|양도일", () => {
    expect(extractBusinessKey("stock_transfer", { securityName: "삼성전자", transferDate: "2024-06-01" })).toBe("sec:삼성전자|2024.06.01");
  });
  it("증여·종부 → null(폴백)", () => {
    expect(extractBusinessKey("gift", { giftDate: "2024-01-01" })).toBeNull();
    expect(extractBusinessKey("comprehensive_property", {})).toBeNull();
  });
});

describe("[비즈니스 키 dedup] 저장", () => {
  beforeEach(async () => { await resetLocalDB(); });

  it("B-2 (C1): 같은 RRN13 중간 저장 ×3 → 1건, 마지막 input 반영", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput()));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput({ estateItems: [{ id: "a" }] })));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput({ estateItems: [{ id: "a" }], debts: "500" })));
    const list = await repo.list({ taxType: "inheritance" });
    expect(list.length).toBe(1);
    expect(list[0].inputData).toMatchObject({ debts: "500" });
    expect(list[0].businessKey).toBe(`rrn:${RRN_DIGITS}`);
  });

  it("B-3 (C3): 부분 RRN → nd 키, ×3 → 1건(churn 방지)", async () => {
    const repo = createCalculationRepository(UID);
    const partial = { decedentResidentNumber: "8001", decedentName: "김코리아", deathDate: "2023-07-01" };
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", { ...partial }));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", { ...partial, x: 1 }));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", { ...partial, x: 2 }));
    const list = await repo.list({ taxType: "inheritance" });
    expect(list.length).toBe(1);
    expect(list[0].businessKey).toBe("nd:김코리아|2023.07.01");
  });

  it("B-4 (C4): draft→final→draft → 1건, final 결과 보존", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput()));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput({ e: 1 }), { resultData: { finalTax: 12345 } }));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput({ e: 2 })));
    const list = await repo.list({ taxType: "inheritance" });
    expect(list.length).toBe(1);
    expect(list[0].resultData).toMatchObject({ finalTax: 12345 });
  });

  it("B-5 (C5): 다른 RRN 2종 → 2건", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput()));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput({ decedentResidentNumber: "900202-2000000" })));
    expect((await repo.list({ taxType: "inheritance" })).length).toBe(2);
  });

  it("B-6 (C6): 같은 키·다른 clientId → 2건", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput(), { clientId: "client-A" }));
    await repo.saveOrUpdateByBusinessKey(rec("inheritance", inhInput(), { clientId: "client-B" }));
    expect((await repo.list({ taxType: "inheritance" })).length).toBe(2);
  });

  it("B-7 (C8): 증여세 키 null → content 폴백(같은 input draft dedup)", async () => {
    const repo = createCalculationRepository(UID);
    const g = { giftDate: "2024-01-01", amount: 1000 };
    await repo.saveOrUpdateByBusinessKey(rec("gift", g));
    await repo.saveOrUpdateByBusinessKey(rec("gift", g)); // 동일 input → draft dedup 1건
    const list = await repo.list({ taxType: "gift" });
    expect(list.length).toBe(1);
    expect(list[0].businessKey).toBeUndefined(); // 키 미부여(폴백)
  });
});
