/**
 * B-4 — 감면 PHD 스냅샷 키가 **조문을 구분**한다.
 * 계획서: docs/00-pm/red-phd-snapshot-followups.plan.md (B-4)
 *
 * 종전 키는 `bsp-${assetId}-red-phd` 하나였다. 조문별 폼이 서로 다른 `snapshotKeyPrefix`
 * (red993·red99·red988…)를 넘기고 있었는데 `assetId`가 있으면 그 prefix가 **무시됐다**.
 *
 * 감면 그룹 라디오는 **같은 category 안에서만** 배타이고(`toggleGroupRadio`), PHD를 가진
 * 8개 조문은 `new_housing`(2) · `unsold_housing`(6) **두 category에 걸쳐** 있다(실측).
 * ⇒ 두 조문의 PHD를 동시에 입력할 수 있고, 그때 스냅샷이 서로를 덮어썼다.
 */
import { describe, it, expect } from "vitest";
import {
  idOfSnapshotKey,
  snapshotKeyTimepoint,
  redPhdArticleLabel,
} from "@/lib/calc/building-std-snapshot-keys";

describe("idOfSnapshotKey — 조문별 감면 PHD 키", () => {
  it("조문 세그먼트가 붙은 키에서 assetId를 환원한다", () => {
    for (const p of ["red99", "red992", "red993", "red983", "red985", "red986", "red987", "red988"]) {
      expect(idOfSnapshotKey(`bsp-a1-${p}-phd`)).toBe("a1");
    }
  });

  it("UUID assetId도 환원", () => {
    const id = "3f9a1c2e-7b40-4d55-9f11-8ac2e6d0b7aa";
    expect(idOfSnapshotKey(`bsp-${id}-red993-phd`)).toBe(id);
  });

  it("🔑 구 키(`-red-phd`)도 계속 환원한다 — 이미 저장된 이력·세션 호환", () => {
    expect(idOfSnapshotKey("bsp-a1-red-phd")).toBe("a1");
  });

  it("재개발 키(`-redev-phd`)와 섞이지 않는다", () => {
    expect(idOfSnapshotKey("bsp-a1-redev-phd")).toBe("a1");
  });

  it("2시점 통합이므로 시점 필터는 null (구 키·신 키 모두)", () => {
    expect(snapshotKeyTimepoint("bsp-a1-red-phd")).toBeNull();
    expect(snapshotKeyTimepoint("bsp-a1-red993-phd")).toBeNull();
  });
});

describe("redPhdArticleLabel — 계산서 제목의 조문 구별", () => {
  it("등록된 8개 조문 prefix를 라벨로 환원", () => {
    const expected: Record<string, string> = {
      red99: "§99", red992: "§99의2", red993: "§99의3",
      red983: "§98의3", red985: "§98의5", red986: "§98의6",
      red987: "§98의7", red988: "§98의8",
    };
    for (const [p, label] of Object.entries(expected)) {
      expect(redPhdArticleLabel(`bsp-a1-${p}-phd`)).toBe(label);
    }
  });

  it("구 키·재개발 키·비대상 키는 null (제목 override 없음)", () => {
    expect(redPhdArticleLabel("bsp-a1-red-phd")).toBeNull();
    expect(redPhdArticleLabel("bsp-a1-redev-phd")).toBeNull();
    expect(redPhdArticleLabel("bsp-a1-gb-acq")).toBeNull();
  });

  it("미등록 조문 prefix는 null — 규칙 추론으로 틀린 조문명을 찍지 않는다", () => {
    expect(redPhdArticleLabel("bsp-a1-red9999-phd")).toBeNull();
  });
});
