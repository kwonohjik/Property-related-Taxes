/**
 * Pre-Do anchor — 이력 백업(Export/Import) 핵심 로직.
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §8
 * 검증 초점: 백업 대상(캐시 제외)·악성 JSON 방어·복원 참조 무결성
 *   (id 보존·linkedCalculationId 재매핑·orphan null·200건 상한).
 */

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createCalculationRepository,
  createClientRepository,
  createUserRepository,
  resetLocalDB,
  db,
  MAX_CALCULATIONS_PER_USER,
} from "@/lib/storage";
import {
  buildBackup,
  BACKUP_FORMAT,
  BACKUP_VERSION,
} from "@/lib/storage/backup-export";
import { validateBackup } from "@/lib/storage/backup-validate";
import { importBackup } from "@/lib/storage/backup-import";

const UID = "user-a";

const calcRepo = createCalculationRepository(UID);
const clientRepo = createClientRepository(UID);
const userRepo = createUserRepository(UID);

function makeCalc(overrides: Record<string, unknown> = {}) {
  return {
    taxType: "transfer" as const,
    title: "테스트 계산",
    inputData: { addr: "서울", amount: 100 },
    resultData: { totalTax: 50 },
    taxLawVersion: "2025-01-01",
    linkedCalculationId: null,
    clientId: null,
    ...overrides,
  };
}

beforeEach(async () => {
  await resetLocalDB();
});

// ─────────────────────────────────────────────
// buildBackup — 백업 대상
// ─────────────────────────────────────────────
describe("buildBackup", () => {
  it("calculations·clients·userProfile 포함, 메타 스탬프 부여", async () => {
    await userRepo.upsertProfile({ displayName: "권코리아", birthDate: null, mode: "professional" });
    await clientRepo.create({ name: "의뢰인A", birthDate: null, phone: null, email: null, memo: null });
    await calcRepo.saveOrUpdateByBusinessKey(makeCalc());

    const backup = await buildBackup(UID);
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.dbVersion).toBeGreaterThanOrEqual(6);
    expect(typeof backup.exportedAt).toBe("string");
    expect(backup.calculations).toHaveLength(1);
    expect(backup.clients).toHaveLength(1);
    expect(backup.userProfile?.displayName).toBe("권코리아");
  });

  it("캐시 테이블(reverseGeocodeCache·rtmsSalesCache)은 제외 — BackupFile에 해당 키 없음", async () => {
    await db.reverseGeocodeCache.put({
      id: "37.1,127.1", sigunguCode: "1100000000", address: "x",
      sidoName: "서울", sigunguName: "강남", expiresAt: 9e15, createdAt: 0,
    });
    const backup = await buildBackup(UID);
    expect(backup).not.toHaveProperty("reverseGeocodeCache");
    expect(backup).not.toHaveProperty("rtmsSalesCache");
    expect(Object.keys(backup).sort()).toEqual(
      ["calculations", "clients", "dbVersion", "exportedAt", "format", "userProfile", "version"],
    );
  });

  it("타 사용자 레코드는 제외 (userId 필터)", async () => {
    const otherRepo = createCalculationRepository("user-b");
    await otherRepo.saveOrUpdateByBusinessKey(makeCalc({ title: "남의 계산" }));
    await calcRepo.saveOrUpdateByBusinessKey(makeCalc({ title: "내 계산" }));
    const backup = await buildBackup(UID);
    expect(backup.calculations).toHaveLength(1);
    expect(backup.calculations[0].title).toBe("내 계산");
  });
});

// ─────────────────────────────────────────────
// validateBackup — 형식·악성 JSON 방어
// ─────────────────────────────────────────────
describe("validateBackup", () => {
  function validFile() {
    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      dbVersion: 6,
      exportedAt: "2026-06-25T00:00:00.000Z",
      userProfile: null,
      clients: [],
      calculations: [
        {
          id: "id-1", userId: UID, taxType: "transfer", title: "t",
          inputData: {}, resultData: {}, taxLawVersion: "2025-01-01",
          linkedCalculationId: null, clientId: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
  }

  it("정상 파일 통과", () => {
    const r = validateBackup(validFile());
    expect(r.ok).toBe(true);
  });

  it("format 누락/오류 차단", () => {
    const bad = { ...validFile(), format: "wrong" };
    expect(validateBackup(bad).ok).toBe(false);
  });

  it("version 불일치 차단", () => {
    const bad = { ...validFile(), version: 99 };
    expect(validateBackup(bad).ok).toBe(false);
  });

  it("미래 dbVersion(>6) 차단", () => {
    const bad = { ...validFile(), dbVersion: 7 };
    expect(validateBackup(bad).ok).toBe(false);
  });

  it("calculations 레코드 taxType 오류 차단", () => {
    const bad = validFile();
    (bad.calculations[0] as Record<string, unknown>).taxType = "unknown_tax";
    expect(validateBackup(bad).ok).toBe(false);
  });

  it("__proto__ 오염 키는 결과에서 제거(프로토타입 미오염)", () => {
    const raw = JSON.parse('{"format":"' + BACKUP_FORMAT + '","version":' + BACKUP_VERSION +
      ',"dbVersion":6,"exportedAt":"2026-06-25T00:00:00.000Z","userProfile":null,"clients":[],' +
      '"calculations":[{"id":"id-1","userId":"' + UID + '","taxType":"transfer","title":"t",' +
      '"inputData":{"__proto__":{"polluted":true}},"resultData":{},"taxLawVersion":"2025-01-01",' +
      '"linkedCalculationId":null,"clientId":null,"createdAt":"2026-01-01T00:00:00.000Z",' +
      '"updatedAt":"2026-01-01T00:00:00.000Z"}]}');
    const r = validateBackup(raw);
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined(); // 전역 오염 없음
  });

  it("calculations 1만건 초과 차단", () => {
    const bad = validFile();
    const one = bad.calculations[0];
    bad.calculations = Array.from({ length: 10001 }, (_, i) => ({ ...one, id: `id-${i}` }));
    expect(validateBackup(bad).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────
// importBackup — 복원 + 참조 무결성
// ─────────────────────────────────────────────
describe("importBackup", () => {
  it("overwrite round-trip — id·linkedCalculationId 보존, list 원본 동일", async () => {
    const a = await calcRepo.saveOrUpdateByBusinessKey(makeCalc({ title: "A", taxType: "property" }));
    await calcRepo.update(a.id, { linkedCalculationId: null });
    // B가 A를 링크 (재산세↔종부세 모사)
    const b = await calcRepo.saveOrUpdateByBusinessKey(
      makeCalc({ title: "B", taxType: "comprehensive_property", linkedCalculationId: a.id }),
    );

    const backup = await buildBackup(UID);
    await resetLocalDB();
    const res = await importBackup(backup, "overwrite", UID);

    expect(res.added).toBe(2);
    const list = await calcRepo.list();
    const restoredB = list.find((r) => r.id === b.id);
    expect(restoredB).toBeDefined();
    expect(restoredB!.linkedCalculationId).toBe(a.id); // 링크 보존
  });

  it("merge — 동일 contentHash 중복 스킵", async () => {
    await calcRepo.saveOrUpdateByBusinessKey(makeCalc());
    const backup = await buildBackup(UID);
    // 같은 백업을 병합 → 이미 존재 → 스킵
    const res = await importBackup(backup, "merge", UID);
    expect(res.added).toBe(0);
    expect(res.skipped).toBe(1);
    expect(await calcRepo.count()).toBe(1);
  });

  it("merge — id 충돌 + 다른 내용 → 신규 id 부여 + linkedCalculationId 재매핑", async () => {
    // 현재 DB: 레코드 X
    const x = await calcRepo.saveOrUpdateByBusinessKey(makeCalc({ title: "현재X", inputData: { v: 1 } }));
    // 백업: 같은 id를 가지지만 내용이 다른 레코드 + 그 id를 링크하는 레코드
    const backup = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, dbVersion: 6,
      exportedAt: "2026-06-25T00:00:00.000Z", userProfile: null, clients: [],
      calculations: [
        {
          id: x.id, userId: UID, taxType: "transfer" as const, title: "백업X(다른내용)",
          inputData: { v: 999 }, resultData: { totalTax: 7 }, taxLawVersion: "2025-01-01",
          linkedCalculationId: null, clientId: null,
          contentHash: "different00000000",
          createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
        },
        {
          id: "link-holder", userId: UID, taxType: "comprehensive_property" as const, title: "링커",
          inputData: { v: 2 }, resultData: { grandTotal: 9 }, taxLawVersion: "2025-01-01",
          linkedCalculationId: x.id, clientId: null,
          createdAt: "2026-01-02T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    };
    const res = await importBackup(backup, "merge", UID);
    expect(res.added).toBe(2); // 둘 다 신규(내용 다름)
    const list = await calcRepo.list();
    // 백업X는 새 id로 삽입(x.id는 현재X가 점유) → 링커의 link가 새 id로 재매핑
    const linker = list.find((r) => r.title === "링커");
    const backupX = list.find((r) => r.title === "백업X(다른내용)");
    expect(backupX).toBeDefined();
    expect(backupX!.id).not.toBe(x.id); // 신규 id 부여
    expect(linker!.linkedCalculationId).toBe(backupX!.id); // 재매핑됨
  });

  it("orphan linkedCalculationId(참조 대상 없음) → null 정규화 + linksCleared 카운트", async () => {
    const backup = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, dbVersion: 6,
      exportedAt: "2026-06-25T00:00:00.000Z", userProfile: null, clients: [],
      calculations: [
        {
          id: "lonely", userId: UID, taxType: "property" as const, title: "고아링크",
          inputData: {}, resultData: { totalPayable: 1 }, taxLawVersion: "2025-01-01",
          linkedCalculationId: "does-not-exist", clientId: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    const res = await importBackup(backup, "overwrite", UID);
    expect(res.linksCleared).toBe(1);
    const list = await calcRepo.list();
    expect(list[0].linkedCalculationId).toBeNull();
  });

  it("clients 참조 무결성 — clientId가 복원된 client를 가리킴", async () => {
    const client = await clientRepo.create({ name: "의뢰인A", birthDate: null, phone: null, email: null, memo: null });
    await calcRepo.saveOrUpdateByBusinessKey(makeCalc({ clientId: client.id }));
    const backup = await buildBackup(UID);
    await resetLocalDB();
    await importBackup(backup, "overwrite", UID);

    const clients = await clientRepo.list();
    const list = await calcRepo.list();
    expect(clients).toHaveLength(1);
    expect(list[0].clientId).toBe(clients[0].id);
  });

  it("userId 재태깅 — 백업의 다른 userId가 현재 uid로 치환", async () => {
    const backup = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, dbVersion: 6,
      exportedAt: "2026-06-25T00:00:00.000Z", userProfile: null, clients: [],
      calculations: [
        {
          id: "foreign", userId: "someone-else", taxType: "gift" as const, title: "외부",
          inputData: {}, resultData: { finalTax: 1 }, taxLawVersion: "2025-01-01",
          linkedCalculationId: null, clientId: null,
          createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    await importBackup(backup, "overwrite", UID);
    const list = await calcRepo.list(); // calcRepo는 UID로 필터
    expect(list).toHaveLength(1);
    expect(list[0].userId).toBe(UID);
  });

  it("200건 상한 — 기존 200 full + import 시 상한 유지", async () => {
    for (let i = 0; i < MAX_CALCULATIONS_PER_USER; i++) {
      await calcRepo.saveOrUpdateByBusinessKey(makeCalc({ title: `기존${i}`, inputData: { i } }));
    }
    expect(await calcRepo.count()).toBe(MAX_CALCULATIONS_PER_USER);
    const backup = {
      format: BACKUP_FORMAT, version: BACKUP_VERSION, dbVersion: 6,
      exportedAt: "2026-06-25T00:00:00.000Z", userProfile: null, clients: [],
      calculations: Array.from({ length: 10 }, (_, i) => ({
        id: `new-${i}`, userId: UID, taxType: "transfer" as const, title: `신규${i}`,
        inputData: { fresh: i }, resultData: { totalTax: i }, taxLawVersion: "2025-01-01",
        linkedCalculationId: null, clientId: null,
        createdAt: "2026-06-25T00:00:00.000Z", updatedAt: "2026-06-25T00:00:00.000Z",
      })),
    };
    await importBackup(backup, "merge", UID);
    expect(await calcRepo.count()).toBeLessThanOrEqual(MAX_CALCULATIONS_PER_USER);
  });
});
