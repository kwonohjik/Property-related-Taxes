import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createCalculationRepository,
  resetLocalDB,
  MAX_CALCULATIONS_PER_USER,
} from "@/lib/storage";

const UID_A = "user-a";
const UID_B = "user-b";

function makeInput(taxType: "transfer" | "acquisition" = "transfer", title = "테스트") {
  return {
    taxType,
    title,
    inputData: { foo: 1 },
    resultData: { tax: 100 },
    taxLawVersion: "2025-01-01",
    linkedCalculationId: null,
    clientId: null,
  } as const;
}

describe("calculation-repository", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("save() — userId 자동 주입 + id·createdAt 생성", async () => {
    const repo = createCalculationRepository(UID_A);
    const id = await repo.save(makeInput());
    const rec = await repo.get(id);
    expect(rec).not.toBeNull();
    expect(rec!.userId).toBe(UID_A);
    expect(rec!.id).toBe(id);
    expect(rec!.createdAt).toBeTruthy();
  });

  it("list() — uid 필터 격리: 타 uid 레코드는 보이지 않음", async () => {
    const repoA = createCalculationRepository(UID_A);
    const repoB = createCalculationRepository(UID_B);
    await repoA.save(makeInput("transfer", "A의 양도세"));
    await repoB.save(makeInput("transfer", "B의 양도세"));
    await repoB.save(makeInput("acquisition", "B의 취득세"));

    const aList = await repoA.list();
    const bList = await repoB.list();

    expect(aList).toHaveLength(1);
    expect(aList[0].title).toBe("A의 양도세");
    expect(bList).toHaveLength(2);
    expect(bList.every((r) => r.userId === UID_B)).toBe(true);
  });

  it("list({ taxType }) — 복합 인덱스 [userId+taxType+createdAt] 활용", async () => {
    const repo = createCalculationRepository(UID_A);
    await repo.save(makeInput("transfer", "양도1"));
    await repo.save(makeInput("acquisition", "취득1"));
    await repo.save(makeInput("transfer", "양도2"));

    const transfers = await repo.list({ taxType: "transfer" });
    expect(transfers).toHaveLength(2);
    expect(transfers.every((r) => r.taxType === "transfer")).toBe(true);
  });

  it("list() — 최신순 정렬 (reverse)", async () => {
    const repo = createCalculationRepository(UID_A);
    const id1 = await repo.save(makeInput("transfer", "첫번째"));
    await new Promise((r) => setTimeout(r, 5));
    const id2 = await repo.save(makeInput("transfer", "두번째"));

    const list = await repo.list();
    expect(list[0].id).toBe(id2);
    expect(list[1].id).toBe(id1);
  });

  it("get/update/remove — 타 uid 레코드는 접근/수정/삭제 불가", async () => {
    const repoA = createCalculationRepository(UID_A);
    const repoB = createCalculationRepository(UID_B);
    const idA = await repoA.save(makeInput("transfer", "A의 것"));

    expect(await repoB.get(idA)).toBeNull();
    await repoB.update(idA, { title: "탈취 시도" });
    await repoB.remove(idA);

    const stillThere = await repoA.get(idA);
    expect(stillThere).not.toBeNull();
    expect(stillThere!.title).toBe("A의 것");
  });

  it("update() — updatedAt 자동 갱신", async () => {
    const repo = createCalculationRepository(UID_A);
    const id = await repo.save(makeInput());
    const before = await repo.get(id);
    await new Promise((r) => setTimeout(r, 5));
    await repo.update(id, { title: "수정됨" });
    const after = await repo.get(id);
    expect(after!.title).toBe("수정됨");
    expect(after!.updatedAt).not.toBe(before!.updatedAt);
    expect(after!.createdAt).toBe(before!.createdAt);
  });

  it("clearAll() — uid 격리: 타 uid는 보존", async () => {
    const repoA = createCalculationRepository(UID_A);
    const repoB = createCalculationRepository(UID_B);
    await repoA.save(makeInput());
    await repoB.save(makeInput());
    await repoA.clearAll();
    expect(await repoA.count()).toBe(0);
    expect(await repoB.count()).toBe(1);
  });

  it("save() — 200건 상한 도달 시 가장 오래된 1건 자동 삭제", async () => {
    const repo = createCalculationRepository(UID_A);
    const firstId = await repo.save(makeInput("transfer", "첫번째"));
    // firstId의 createdAt이 후속 레코드보다 확실히 빠르도록 짧은 지연
    await new Promise((r) => setTimeout(r, 5));
    // MAX-1 건 추가하여 상한 도달
    for (let i = 0; i < MAX_CALCULATIONS_PER_USER - 1; i++) {
      await repo.save(makeInput("transfer", `bulk-${i}`));
    }
    expect(await repo.count()).toBe(MAX_CALCULATIONS_PER_USER);

    // 한 건 더 추가 → 가장 오래된 firstId가 삭제되어야 함
    await repo.save(makeInput("transfer", "신규"));
    expect(await repo.count()).toBe(MAX_CALCULATIONS_PER_USER);
    expect(await repo.get(firstId)).toBeNull();
  }, 30000);
});
