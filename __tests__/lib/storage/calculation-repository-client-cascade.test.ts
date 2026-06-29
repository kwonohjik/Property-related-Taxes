/**
 * Anchor — 의뢰인 ↔ 계산 이력 생명주기 연동 (cascade delete + restore).
 *
 * 계획서: docs/00-pm/client-calc-cascade-delete-restore.plan.md §6
 * 결정: D1(마지막 1건일 때만 의뢰인 삭제) · D2(복원=Import) · D3(연결 계산 있으면 단독 삭제 차단).
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createCalculationRepository,
  createClientRepository,
  resetLocalDB,
} from "@/lib/storage";
import { buildBackup } from "@/lib/storage/backup-export";
import { importBackup } from "@/lib/storage/backup-import";

const UID = "user-a";
const calcRepo = createCalculationRepository(UID);
const clientRepo = createClientRepository(UID);

function makeInput(clientId: string | null, n: number) {
  return {
    taxType: "transfer" as const,
    title: `계산 ${n}`,
    inputData: { foo: n }, // n으로 구분 → content dedup 회피
    resultData: { tax: 100 * n },
    taxLawVersion: "2025-01-01",
    linkedCalculationId: null,
    clientId,
  };
}

beforeEach(async () => {
  await resetLocalDB();
});

describe("계산 삭제 → 의뢰인 cascade (D1)", () => {
  it("A: 의뢰인에 계산 2건 → 1건 삭제 시 의뢰인 유지, 잔여 1건", async () => {
    const c = await clientRepo.create({
      name: "X", birthDate: null, phone: null, email: null, memo: null,
    });
    const id1 = await calcRepo.save(makeInput(c.id, 1));
    await calcRepo.save(makeInput(c.id, 2));

    await calcRepo.remove(id1);

    expect(await clientRepo.get(c.id)).not.toBeNull();
    expect(await clientRepo.countCalculations(c.id)).toBe(1);
  });

  it("B: 의뢰인에 계산 1건 → 그 1건 삭제 시 의뢰인도 삭제", async () => {
    const c = await clientRepo.create({
      name: "X", birthDate: null, phone: null, email: null, memo: null,
    });
    const id1 = await calcRepo.save(makeInput(c.id, 1));

    await calcRepo.remove(id1);

    expect(await clientRepo.get(c.id)).toBeNull();
    expect(await calcRepo.list()).toHaveLength(0);
  });

  it("clientId=null 계산 삭제는 cascade no-op", async () => {
    const id1 = await calcRepo.save(makeInput(null, 1));
    await calcRepo.remove(id1); // throw 없이 통과
    expect(await calcRepo.list()).toHaveLength(0);
  });

  it("C: clearAll → 계산 참조 의뢰인 삭제, 계산 0건 등록 의뢰인 유지", async () => {
    const x = await clientRepo.create({
      name: "X", birthDate: null, phone: null, email: null, memo: null,
    });
    const y = await clientRepo.create({
      name: "Y", birthDate: null, phone: null, email: null, memo: null,
    });
    await calcRepo.save(makeInput(x.id, 1));
    await calcRepo.save(makeInput(x.id, 2));
    // Y는 계산 0건 (등록만)

    await calcRepo.clearAll();

    expect(await calcRepo.list()).toHaveLength(0);
    expect(await clientRepo.get(x.id)).toBeNull(); // X 삭제
    expect(await clientRepo.get(y.id)).not.toBeNull(); // Y 유지
  });
});

describe("의뢰인 단독 삭제 가드 (D3)", () => {
  it("D1: 연결 계산 1건이면 countCalculations > 0", async () => {
    const c = await clientRepo.create({
      name: "X", birthDate: null, phone: null, email: null, memo: null,
    });
    await calcRepo.save(makeInput(c.id, 1));
    expect(await clientRepo.countCalculations(c.id)).toBe(1);
  });

  it("D2: 계산 0건이면 countCalculations === 0 (단독 삭제 허용)", async () => {
    const c = await clientRepo.create({
      name: "Y", birthDate: null, phone: null, email: null, memo: null,
    });
    expect(await clientRepo.countCalculations(c.id)).toBe(0);
    await clientRepo.remove(c.id);
    expect(await clientRepo.get(c.id)).toBeNull();
  });
});

describe("복원 round-trip (D2 — 백업 Import)", () => {
  it("E: export → 계산 삭제(의뢰인 cascade) → import 시 의뢰인·계산 모두 복원", async () => {
    const c = await clientRepo.create({
      name: "X", birthDate: null, phone: "010", email: null, memo: null,
    });
    const id1 = await calcRepo.save(makeInput(c.id, 1));

    const backup = await buildBackup(UID);
    expect(backup.clients).toHaveLength(1);
    expect(backup.calculations).toHaveLength(1);

    // 삭제 — 의뢰인까지 cascade 사라짐
    await calcRepo.remove(id1);
    expect(await clientRepo.get(c.id)).toBeNull();
    expect(await calcRepo.list()).toHaveLength(0);

    // 복원 (uid 명시 — 미지정 시 getCurrentUserId() 폴백)
    await importBackup(backup, "merge", UID);

    const restoredClient = await clientRepo.get(c.id);
    expect(restoredClient).not.toBeNull();
    expect(restoredClient!.name).toBe("X");
    const calcs = await calcRepo.list();
    expect(calcs).toHaveLength(1);
    expect(calcs[0].clientId).toBe(c.id);
  });
});
