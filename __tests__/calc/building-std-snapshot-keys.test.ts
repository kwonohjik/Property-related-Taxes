/**
 * 건물 기준시가 스냅샷 키 유틸 — 소속 판정(idOfSnapshotKey)·PHD 라벨(phdTimepointLabel).
 *
 * 계획서: docs/02-design/features/mixed-use-commercial-stdprice-modal-landprice-prefill.plan.md (§7 B2)
 *
 * B2: asset-major 겸용 상가 통합 모달 키(시점 세그먼트 없음)가 idOfSnapshotKey 정규식에
 * 매칭되지 않아 결과탭 계산서(BuildingStdPriceReportSection:55 `!inputStr.includes(id)` → continue)에
 * 노출되지 않던 버그. 유입 = e62c95d0(#541) — 정규식(48fdc629 #525)이 먼저 확정됐는데 키만 규약 이탈.
 */
import { describe, it, expect } from "vitest";
import { idOfSnapshotKey, phdTimepointLabel } from "@/lib/calc/building-std-snapshot-keys";

describe("idOfSnapshotKey — 소속 자산/재산 id 환원", () => {
  it("B2: 겸용 asset-major 상가 통합 모달 키 → assetId 환원 (결과탭 계산서 노출 조건)", () => {
    expect(idOfSnapshotKey("bsp-a1-mx-commercial")).toBe("a1");
  });

  it("기존 키 규약 — 회귀 방어", () => {
    // 상증
    expect(idOfSnapshotKey("bsp-estate-item-7")).toBe("item-7");
    // 양도 자산별 (gb/cb)
    // 시점 접미 전수 — 누락 시 id가 잘리지 않아 그 자산 계산서가 조용히 미출력된다(2026-07-29 실측)
    expect(idOfSnapshotKey("bsp-a1-split-acq")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-split-transfer")).toBe("a1");
    // 별개취득 건물분 취득·양도 통합 모달(2026-07-30) — 시점 세그먼트 없음
    expect(idOfSnapshotKey("bsp-a1-split-both")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-cbinh-acq")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-cb-acq")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-cb-transfer")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-gb-acq")).toBe("a1");
    // PHD 3시점
    expect(idOfSnapshotKey("bsp-a1-phd-acq")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-phd-first")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-phd-transfer")).toBe("a1");
    // PHD split 상가 (legacy/Case A — 규약 정상, 미변경 대상)
    expect(idOfSnapshotKey("bsp-a1-phd-acq-commercial")).toBe("a1");
    expect(idOfSnapshotKey("bsp-a1-phd-transfer-commercial")).toBe("a1");
  });

  it("UUID 형태 assetId도 환원 (하이픈 포함 id 방어)", () => {
    const id = "3f9a1c2e-7b40-4d55-9f11-8ac2e6d0b7aa";
    expect(idOfSnapshotKey(`bsp-${id}-mx-commercial`)).toBe(id);
    expect(idOfSnapshotKey(`bsp-${id}-phd-acq`)).toBe(id);
  });

  it("감면 PHD 환산 통합 모달 키(-red-phd) → assetId 환원 (결과탭 계산서 노출 조건)", () => {
    // 감면 조문(§99·§99의2·§98의3/5/6/7/8·§99의3) PHD 환산 시 취득시+최초공시시 2시점을
    // 한 모달에서 계산하는 단일 스냅샷. 규약 편입 전 `red993-bsp`는 소속 판정 탈락 → 계산서 미출력.
    expect(idOfSnapshotKey("bsp-a1-red-phd")).toBe("a1");
    const id = "3f9a1c2e-7b40-4d55-9f11-8ac2e6d0b7aa";
    expect(idOfSnapshotKey(`bsp-${id}-red-phd`)).toBe(id);
  });
});

describe("phdTimepointLabel — 배치 시점 라벨", () => {
  it("mx-commercial은 배치 키가 아님 → null (기본 렌더로 위임)", () => {
    expect(phdTimepointLabel("bsp-a1-mx-commercial")).toBeNull();
  });

  it("PHD 키 라벨 — 회귀 방어", () => {
    expect(phdTimepointLabel("bsp-a1-phd-acq")).toEqual({
      timepoint: "취득시",
      category: "housing",
      categoryLabel: "주택분",
      order: 0,
    });
    expect(phdTimepointLabel("bsp-a1-phd-first")).toEqual({
      timepoint: "최초공시일",
      category: "housing",
      categoryLabel: "주택분",
      order: 1,
    });
    expect(phdTimepointLabel("bsp-a1-phd-transfer-commercial")).toEqual({
      timepoint: "양도시",
      category: "commercial",
      categoryLabel: "상가분",
      order: 2,
    });
  });

  /**
   * 상가 §164⑥ 배치(2026-08-04 P3) — 같은 `first`가 PHD와 **다른 제도**다.
   *   phd = 「소득세법 시행령」 제164조 제5항 주택 최초공시일
   *   cb  = 같은 영 제164조 제6항 상업용건물·오피스텔 호별 최초고시(2005)
   * 카테고리 구분이 없어 `housing` 슬롯을 재사용하므로 표기는 "건물"이어야 한다
   * (그대로 두면 계산서에 "주택분"으로 오표시).
   */
  it("cb-first — 최초고시(2005) 라벨 + 구분 표기는 '건물'", () => {
    expect(phdTimepointLabel("bsp-a1-cb-first")).toEqual({
      timepoint: "최초고시(2005)",
      category: "housing",
      categoryLabel: "건물",
      order: 1,
    });
  });

  /**
   * 🔴 대상은 **배치 전용 키**뿐이다(2026-08-04 P4 실측).
   * `-cb-acq`·`-cb-transfer`·`-gb-acq`·`-gb-transfer`는 시점별 1시점 모달과 키를 공유하므로
   * 라벨을 붙이면 배치를 쓰지 않은 기존 스냅샷의 계산서 제목까지 바뀐다.
   */
  it("1시점 모달과 공유하는 키(cb-acq·cb-transfer·gb-*)는 null", () => {
    expect(phdTimepointLabel("bsp-a1-cb-acq")).toBeNull();
    expect(phdTimepointLabel("bsp-a1-cb-transfer")).toBeNull();
    expect(phdTimepointLabel("bsp-a1-gb-acq")).toBeNull();
    expect(phdTimepointLabel("bsp-a1-gb-transfer")).toBeNull();
  });

  it("정렬 order는 라벨 문자열이 아니라 시점 세그먼트로 결정된다", () => {
    // "최초고시(2005)"는 종전 라벨 매칭표({최초공시일:1})에 없어 0으로 떨어졌다 — order로 방어.
    expect(phdTimepointLabel("bsp-a1-cb-first")?.order).toBe(1);
    expect(phdTimepointLabel("bsp-a1-phd-first")?.order).toBe(1);
    expect(phdTimepointLabel("bsp-a1-phd-first")?.timepoint).toBe("최초공시일");
    expect(phdTimepointLabel("bsp-a1-cb-first")?.timepoint).toBe("최초고시(2005)");
  });
});

describe("B1 — 배치 모달 replaceSnapshotsByPrefix 삭제 범위", () => {
  // building-std-snapshot-store.ts:38 `!k.startsWith(`${prefix}-`)` 규칙 재현.
  // 배치 모달 prefix = `bsp-{id}-phd` (MixedUsePreHousingDisclosureSection:205).
  const survivesBatchReapply = (key: string) => !key.startsWith("bsp-a1-phd-");

  it("B1: 상가 통합 모달 스냅샷이 배치 재적용에 삭제되지 않는다", () => {
    expect(survivesBatchReapply("bsp-a1-mx-commercial")).toBe(true);
  });

  it("배치가 재생성하는 PHD 3시점 키는 종전대로 교체 대상 — 회귀 방어", () => {
    expect(survivesBatchReapply("bsp-a1-phd-acq")).toBe(false);
    expect(survivesBatchReapply("bsp-a1-phd-first")).toBe(false);
    expect(survivesBatchReapply("bsp-a1-phd-transfer")).toBe(false);
    // legacy/Case A 상가 — 배치가 재생성하므로 삭제 대상 유지가 의도된 동작
    expect(survivesBatchReapply("bsp-a1-phd-acq-commercial")).toBe(false);
  });

  it("다른 자산·다른 모달 스냅샷은 영향 없음 — 회귀 방어", () => {
    expect(survivesBatchReapply("bsp-a1-cb-acq")).toBe(true);
    expect(survivesBatchReapply("bsp-a2-phd-acq")).toBe(true);
  });

  it("감면 PHD 통합 모달 키(-red-phd)는 자산-PHD 배치 삭제 대상이 아니다 — 충돌 방지", () => {
    // `bsp-a1-red-phd`는 `bsp-a1-phd-` 접두 불일치 → 배치 재적용 시 생존(자산-수준 PHD와 독립).
    expect(survivesBatchReapply("bsp-a1-red-phd")).toBe(true);
  });
});
