import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

import { createUserRepository, resetLocalDB } from "@/lib/storage";

describe("user-repository", () => {
  beforeEach(async () => {
    await resetLocalDB();
  });

  it("getProfile() — 미등록 시 null", async () => {
    const repo = createUserRepository("user-a");
    expect(await repo.getProfile()).toBeNull();
  });

  it("upsertProfile() — 신규 생성", async () => {
    const repo = createUserRepository("user-a");
    const profile = await repo.upsertProfile({ displayName: "홍길동", birthDate: "1970-01-01" });
    expect(profile.id).toBe("user-a");
    expect(profile.displayName).toBe("홍길동");
    expect(profile.birthDate).toBe("1970-01-01");
    expect(profile.createdAt).toBeTruthy();
  });

  it("upsertProfile() — 기존 갱신 시 createdAt 보존, updatedAt 갱신", async () => {
    const repo = createUserRepository("user-a");
    const first = await repo.upsertProfile({ displayName: "홍길동", birthDate: null });
    await new Promise((r) => setTimeout(r, 5));
    const second = await repo.upsertProfile({ displayName: "임꺽정", birthDate: "1980-05-15" });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).not.toBe(first.updatedAt);
    expect(second.displayName).toBe("임꺽정");
  });

  it("uid 격리 — 다른 uid 프로필은 별도 저장", async () => {
    const repoA = createUserRepository("user-a");
    const repoB = createUserRepository("user-b");
    await repoA.upsertProfile({ displayName: "A", birthDate: null });
    await repoB.upsertProfile({ displayName: "B", birthDate: null });
    expect((await repoA.getProfile())!.displayName).toBe("A");
    expect((await repoB.getProfile())!.displayName).toBe("B");
  });

  it("clearProfile() — 자기 것만 삭제", async () => {
    const repoA = createUserRepository("user-a");
    const repoB = createUserRepository("user-b");
    await repoA.upsertProfile({ displayName: "A", birthDate: null });
    await repoB.upsertProfile({ displayName: "B", birthDate: null });
    await repoA.clearProfile();
    expect(await repoA.getProfile()).toBeNull();
    expect(await repoB.getProfile()).not.toBeNull();
  });
});
