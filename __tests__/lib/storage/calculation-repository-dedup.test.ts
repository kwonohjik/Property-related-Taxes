import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCalculationRepository,
  resetLocalDB,
  MAX_CALCULATIONS_PER_USER,
} from "@/lib/storage";

const UID = "user-dedup";

function makeInput(
  overrides: Partial<{
    title: string;
    inputData: Record<string, unknown>;
    resultData: Record<string, unknown>;
    clientId: string | null;
  }> = {}
) {
  return {
    taxType: "gift" as const,
    title: overrides.title ?? "테스트",
    inputData: overrides.inputData ?? { giftDate: "2026-05-21", amount: 1000 },
    resultData: overrides.resultData ?? { tax: 100 },
    taxLawVersion: "2026-05-21",
    linkedCalculationId: null,
    clientId: overrides.clientId ?? null,
  };
}

describe("saveOrUpdateByContent — dedup 정책", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("4-1: 동일 입력+결과 반복 호출 → record 1건 + updatedAt 갱신 + created=false", async () => {
    const repo = createCalculationRepository(UID);
    const r1 = await repo.saveOrUpdateByContent(makeInput());
    expect(r1.created).toBe(true);

    const rec1 = await repo.get(r1.id);
    const firstUpdatedAt = rec1!.updatedAt;

    // 1ms 이상 차이를 보장하기 위해 짧은 sleep
    await new Promise((res) => setTimeout(res, 5));

    const r2 = await repo.saveOrUpdateByContent(makeInput({ title: "변경된 타이틀" }));
    expect(r2.created).toBe(false);
    expect(r2.id).toBe(r1.id);

    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("변경된 타이틀");
    expect(all[0].updatedAt).not.toBe(firstUpdatedAt);
  });

  it("4-2: 입력 변경 시 새 record (count +1)", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByContent(makeInput({ inputData: { a: 1 } }));
    const r2 = await repo.saveOrUpdateByContent(makeInput({ inputData: { a: 2 } }));
    expect(r2.created).toBe(true);
    const all = await repo.list();
    expect(all).toHaveLength(2);
  });

  it("4-3: 의뢰인 A/B 동일 입력 → 별도 record 2건", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByContent(makeInput({ clientId: "client-A" }));
    const r2 = await repo.saveOrUpdateByContent(makeInput({ clientId: "client-B" }));
    expect(r2.created).toBe(true);
    const all = await repo.list();
    expect(all).toHaveLength(2);
  });

  it("4-3b: 본인(null) vs 의뢰인 → 별도 record", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByContent(makeInput({ clientId: null }));
    const r2 = await repo.saveOrUpdateByContent(makeInput({ clientId: "client-X" }));
    expect(r2.created).toBe(true);
    expect((await repo.list())).toHaveLength(2);
  });

  it("객체 키 순서가 달라도 dedup (stableStringify 효과)", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByContent(
      makeInput({ inputData: { a: 1, b: 2 }, resultData: { tax: 100, base: 1000 } })
    );
    const r2 = await repo.saveOrUpdateByContent(
      makeInput({ inputData: { b: 2, a: 1 }, resultData: { base: 1000, tax: 100 } })
    );
    expect(r2.created).toBe(false);
    expect((await repo.list())).toHaveLength(1);
  });

  it("contentHash 필드가 record에 부여됨", async () => {
    const repo = createCalculationRepository(UID);
    const { id } = await repo.saveOrUpdateByContent(makeInput());
    const rec = await repo.get(id);
    expect(rec!.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("4-7: 200건 상한 회귀 — saveOrUpdateByContent에서도 oldest 삭제", async () => {
    const repo = createCalculationRepository(UID);
    // MAX 만큼 서로 다른 입력으로 채움
    for (let i = 0; i < MAX_CALCULATIONS_PER_USER; i++) {
      await repo.saveOrUpdateByContent(makeInput({ inputData: { idx: i } }));
    }
    expect(await repo.count()).toBe(MAX_CALCULATIONS_PER_USER);

    // 새 입력 추가 → 가장 오래된 1건 삭제 후 신규 add
    const r = await repo.saveOrUpdateByContent(makeInput({ inputData: { idx: "new" } }));
    expect(r.created).toBe(true);
    expect(await repo.count()).toBe(MAX_CALCULATIONS_PER_USER);
  });

  it("기존 save() 로 만든 record(contentHash undefined)는 dedup 후보에서 제외", async () => {
    const repo = createCalculationRepository(UID);
    // legacy 경로
    await repo.save(makeInput());
    // 동일 입력으로 saveOrUpdate → 신규 record 생성 (contentHash 부여)
    const r = await repo.saveOrUpdateByContent(makeInput());
    expect(r.created).toBe(true);
    expect((await repo.list())).toHaveLength(2);
  });

  it("D-8: 휘발성 항목 id만 다른 동일 계산 반복 → record 1건 (id 정규화)", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByContent(
      makeInput({ inputData: { heirs: [{ id: "heir-111-1", name: "A" }], amount: 1000 } })
    );
    // 새 세션·폼 리셋 후 같은 내용을 다시 입력하면 항목 id가 Date.now() 기반으로 달라진다.
    const r2 = await repo.saveOrUpdateByContent(
      makeInput({ inputData: { heirs: [{ id: "heir-999-1", name: "A" }], amount: 1000 } })
    );
    expect(r2.created).toBe(false);
    expect(await repo.list()).toHaveLength(1);
  });
});
