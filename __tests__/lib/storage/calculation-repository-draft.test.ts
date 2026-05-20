import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createCalculationRepository,
  resetLocalDB,
  MAX_CALCULATIONS_PER_USER,
  HISTORY_WARNING_THRESHOLD,
} from "@/lib/storage";
import { computeInputHash, computeContentHash } from "@/lib/storage/content-hash";

const UID = "user-draft";

function makeDraftInput(
  overrides: Partial<{
    title: string;
    inputData: Record<string, unknown>;
    clientId: string | null;
    taxType: "gift" | "transfer";
  }> = {}
) {
  return {
    taxType: overrides.taxType ?? ("gift" as const),
    title: overrides.title ?? "임시 작업",
    inputData: overrides.inputData ?? { giftDate: "2026-05-21" },
    resultData: {}, // 빈 객체 = draft
    taxLawVersion: "2026-05-21",
    linkedCalculationId: null,
    clientId: overrides.clientId ?? null,
  };
}

function makeFinalInput(
  overrides: Partial<{
    inputData: Record<string, unknown>;
    resultData: Record<string, unknown>;
    clientId: string | null;
  }> = {}
) {
  return {
    taxType: "gift" as const,
    title: "최종",
    inputData: overrides.inputData ?? { giftDate: "2026-05-21" },
    resultData: overrides.resultData ?? { tax: 100 },
    taxLawVersion: "2026-05-21",
    linkedCalculationId: null,
    clientId: overrides.clientId ?? null,
  };
}

describe("HISTORY_WARNING_THRESHOLD", () => {
  it("190으로 정의되고 MAX_CALCULATIONS_PER_USER(200) 미만", () => {
    expect(HISTORY_WARNING_THRESHOLD).toBe(190);
    expect(HISTORY_WARNING_THRESHOLD).toBeLessThan(MAX_CALCULATIONS_PER_USER);
  });
});

describe("computeInputHash vs computeContentHash", () => {
  it("같은 input·빈 result 조합에서도 두 해시는 다른 값 (v4 §1.2 P1 정정 검증)", async () => {
    const input = { giftDate: "2026-05-21", amount: 1000 };
    const inputHash = await computeInputHash(input);
    const contentHash = await computeContentHash(input, {});
    expect(inputHash).not.toBe(contentHash);
    expect(inputHash).toHaveLength(16);
    expect(contentHash).toHaveLength(16);
  });

  it("동일 input은 동일 inputHash 보장 (키 순서 무관)", async () => {
    const h1 = await computeInputHash({ a: 1, b: 2 });
    const h2 = await computeInputHash({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });
});

describe("saveDraftByContent — draft 전용 저장", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("Anchor 1: 신규 draft 추가 — created=true, inputHash 부여, contentHash 부재", async () => {
    const repo = createCalculationRepository(UID);
    const { id, created } = await repo.saveDraftByContent(makeDraftInput());
    expect(created).toBe(true);

    const rec = await repo.get(id);
    expect(rec).not.toBeNull();
    expect(rec!.inputHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec!.contentHash).toBeUndefined();
    expect(rec!.resultData).toEqual({});
  });

  it("Anchor 2: 동일 input draft 반복 호출 → 1건 유지 + updatedAt 갱신 + created=false", async () => {
    const repo = createCalculationRepository(UID);
    const r1 = await repo.saveDraftByContent(makeDraftInput());
    const rec1 = await repo.get(r1.id);
    const firstUpdatedAt = rec1!.updatedAt;

    await new Promise((res) => setTimeout(res, 5));
    const r2 = await repo.saveDraftByContent(makeDraftInput({ title: "갱신된 타이틀" }));
    expect(r2.created).toBe(false);
    expect(r2.id).toBe(r1.id);

    const all = await repo.list();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("갱신된 타이틀");
    expect(all[0].updatedAt).not.toBe(firstUpdatedAt);
  });

  it("Anchor 3: 다른 input → 별개 draft (count +1)", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveDraftByContent(makeDraftInput({ inputData: { a: 1 } }));
    const r2 = await repo.saveDraftByContent(makeDraftInput({ inputData: { a: 2 } }));
    expect(r2.created).toBe(true);
    expect((await repo.list())).toHaveLength(2);
  });

  it("Anchor 4: 동일 input의 final이 이미 있어도 draft는 신규 추가 (draft 한정 dedup)", async () => {
    const repo = createCalculationRepository(UID);
    // 먼저 final 저장
    await repo.saveOrUpdateByContent(makeFinalInput());
    // 같은 input으로 draft 저장 — final과 별개로 추가
    const r = await repo.saveDraftByContent(makeDraftInput());
    expect(r.created).toBe(true);
    expect((await repo.list())).toHaveLength(2);
  });

  it("Anchor 5: 의뢰인 분리 — A·B 동일 input draft → 2건", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveDraftByContent(makeDraftInput({ clientId: "client-A" }));
    const r2 = await repo.saveDraftByContent(makeDraftInput({ clientId: "client-B" }));
    expect(r2.created).toBe(true);
    expect((await repo.list())).toHaveLength(2);
  });
});

describe("deleteDraftsByInput — draft 한정 일괄 삭제", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("Anchor 6: 동일 input의 draft만 삭제, final은 보존 (P3 — 핵심 안전성 회귀)", async () => {
    const repo = createCalculationRepository(UID);
    const input = { giftDate: "2026-05-21" };

    // draft 1건 + final 1건 (같은 input)
    await repo.saveDraftByContent(makeDraftInput({ inputData: input }));
    const finalRes = await repo.saveOrUpdateByContent(
      makeFinalInput({ inputData: input })
    );
    expect(await repo.count()).toBe(2);

    // draft만 삭제되어야 함
    const deleted = await repo.deleteDraftsByInput(input, null, "gift");
    expect(deleted).toBe(1);

    const remaining = await repo.list();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(finalRes.id);
    expect(remaining[0].resultData).toEqual({ tax: 100 });
  });

  it("Anchor 7: 동일 input의 draft 여러 건도 모두 삭제", async () => {
    const repo = createCalculationRepository(UID);
    const input = { giftDate: "2026-05-21" };

    // 동일 input draft는 dedup으로 1건 → 다른 input으로 별개 draft 추가
    await repo.saveDraftByContent(makeDraftInput({ inputData: input, clientId: "A" }));
    await repo.saveDraftByContent(makeDraftInput({ inputData: input, clientId: "B" }));
    // 다른 input draft (삭제 대상 아님)
    await repo.saveDraftByContent(makeDraftInput({ inputData: { other: 1 } }));

    // clientId A 한정 삭제
    const deletedA = await repo.deleteDraftsByInput(input, "A", "gift");
    expect(deletedA).toBe(1);
    expect(await repo.count()).toBe(2);

    // clientId B 한정 삭제
    const deletedB = await repo.deleteDraftsByInput(input, "B", "gift");
    expect(deletedB).toBe(1);
    expect(await repo.count()).toBe(1);
  });

  it("Anchor 8: 매칭 draft 없으면 0 반환, 상태 변경 없음", async () => {
    const repo = createCalculationRepository(UID);
    await repo.saveOrUpdateByContent(makeFinalInput());

    const deleted = await repo.deleteDraftsByInput({ unmatched: true }, null, "gift");
    expect(deleted).toBe(0);
    expect(await repo.count()).toBe(1);
  });

  it("Anchor 9: 다른 세목의 draft는 영향 없음", async () => {
    const repo = createCalculationRepository(UID);
    const input = { common: "value" };
    await repo.saveDraftByContent(makeDraftInput({ inputData: input, taxType: "gift" }));
    await repo.saveDraftByContent(makeDraftInput({ inputData: input, taxType: "transfer" }));

    const deleted = await repo.deleteDraftsByInput(input, null, "gift");
    expect(deleted).toBe(1);
    expect(await repo.count()).toBe(1);
    const remaining = (await repo.list())[0];
    expect(remaining.taxType).toBe("transfer");
  });
});

describe("saveOrUpdateByContent v4 — inputHash 함께 부여", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("Anchor 10: final 저장 시 record에 inputHash + contentHash 양쪽 모두 부여", async () => {
    const repo = createCalculationRepository(UID);
    const { id } = await repo.saveOrUpdateByContent(makeFinalInput());
    const rec = await repo.get(id);
    expect(rec!.inputHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec!.contentHash).toMatch(/^[0-9a-f]{16}$/);
    expect(rec!.inputHash).not.toBe(rec!.contentHash);
  });
});

describe("200건 상한 — draft 포함 회귀", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("Anchor 11: draft만으로 200건 채워도 oldest 삭제 정책 동일 적용", async () => {
    const repo = createCalculationRepository(UID);
    for (let i = 0; i < MAX_CALCULATIONS_PER_USER; i++) {
      await repo.saveDraftByContent(makeDraftInput({ inputData: { idx: i } }));
    }
    expect(await repo.count()).toBe(MAX_CALCULATIONS_PER_USER);

    // 신규 draft 추가 — oldest 삭제 + 새 추가
    const r = await repo.saveDraftByContent(makeDraftInput({ inputData: { idx: "new" } }));
    expect(r.created).toBe(true);
    expect(await repo.count()).toBe(MAX_CALCULATIONS_PER_USER);
  });
});
