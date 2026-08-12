/**
 * anchor: 증축분(건물2) 기준시가 **계산서 출력** — 스냅샷 키 규약 편입
 *
 * ## 무엇을 잡는가 (2026-08-12 사용자 지적: "증축분 계산서가 출력되지 않는다")
 *
 * `idOfSnapshotKey`는 접두를 **전수 열거**한다. 증축분 계산기가 저장하는
 * `bsp-{assetId}-gb-ext-{acq|transfer}`가 목록에 없으면 id가 `{assetId}-gb-ext`로
 * **잘못 환원**되고, `BuildingStdPriceReportSection`의 `inputStr.includes(id)` 매칭이
 * 실패해 그 계산서가 **조용히 미출력**된다(파일 주석이 경고하던 그 상황 — 2026-07-29에
 * split·cbinh 3종이 같은 상태였다).
 *
 * 🪤 **정규식 순서가 계약이다**: `gb-ext`가 `gb`보다 뒤에 오면 짧은 쪽이 먼저 매칭돼
 *    `-ext-acq`가 남는다. 이 파일은 그 순서까지 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  idOfSnapshotKey,
  snapshotKeyTimepoint,
  isExtensionSnapshotKey,
  phdTimepointLabel,
} from "@/lib/calc/building-std-snapshot-keys";

const ID = "asset-1";

describe("idOfSnapshotKey — 증축분 키가 자산 id로 환원된다", () => {
  it("증축시·양도시 둘 다", () => {
    expect(idOfSnapshotKey(`bsp-${ID}-gb-ext-acq`)).toBe(ID);
    expect(idOfSnapshotKey(`bsp-${ID}-gb-ext-transfer`)).toBe(ID);
  });

  it("🔴 구별력 — 접두가 누락되면 `-gb-ext`가 남는다 (미출력의 원인)", () => {
    // 순서가 뒤집히거나 목록에서 빠지면 이 단언이 깨진다.
    expect(idOfSnapshotKey(`bsp-${ID}-gb-ext-acq`)).not.toBe(`${ID}-gb-ext`);
  });

  it("원건물 키는 종전 그대로 (대조군)", () => {
    expect(idOfSnapshotKey(`bsp-${ID}-gb-acq`)).toBe(ID);
    expect(idOfSnapshotKey(`bsp-${ID}-gb-transfer`)).toBe(ID);
  });
});

describe("snapshotKeyTimepoint — 반대 시점 인스턴스 필터가 증축분에도 걸린다", () => {
  it("증축분 2시점", () => {
    expect(snapshotKeyTimepoint(`bsp-${ID}-gb-ext-acq`)).toBe("acquisition");
    expect(snapshotKeyTimepoint(`bsp-${ID}-gb-ext-transfer`)).toBe("transfer");
  });

  /**
   * 필터가 없으면 한 스냅샷이 취득·양도 2벌을 내 계산서가 **중복 출력**된다
   * (`building-std-snapshot-keys.ts` 주석의 2026-07-30 실측 사례와 같은 구조).
   */
  it("🔴 구별력 — null이면 필터가 통째로 비활성이다", () => {
    expect(snapshotKeyTimepoint(`bsp-${ID}-gb-ext-acq`)).not.toBeNull();
  });
});

describe("isExtensionSnapshotKey — 제목 구별(원건물 계산서와 나란히 뜬다)", () => {
  it("증축분 키만 true", () => {
    expect(isExtensionSnapshotKey(`bsp-${ID}-gb-ext-acq`)).toBe(true);
    expect(isExtensionSnapshotKey(`bsp-${ID}-gb-ext-transfer`)).toBe(true);
  });

  it("원건물·타 자산 키는 false (대조군)", () => {
    expect(isExtensionSnapshotKey(`bsp-${ID}-gb-acq`)).toBe(false);
    expect(isExtensionSnapshotKey(`bsp-${ID}-cb-transfer`)).toBe(false);
    expect(isExtensionSnapshotKey(`bsp-estate-${ID}`)).toBe(false);
  });
});

/**
 * 부담부증여 ④ 「증여재산 평가」 상속·증여 계산기 키(`-bggift`) — 2026-08-12 편입.
 *
 * 상증 1시점이라 시점 세그먼트가 없다(`bsp-estate-*`와 같은 구조). 두 방향이 모두 계약이다:
 *   · `idOfSnapshotKey`   에 **넣어야** 계산서가 출력된다.
 *   · `snapshotKeyTimepoint`에 **넣으면 안 된다** — 증여 계산서가 양도 계산서로 둔갑한다.
 */
describe("-bggift — 부담부증여 증여재산 평가 계산기 키", () => {
  it("K-1 idOfSnapshotKey가 자산 id로 환원한다", () => {
    expect(idOfSnapshotKey(`bsp-${ID}-bggift`)).toBe(ID);
  });

  it("🔴 K-1 구별력 — 미등록이면 `-bggift`가 남아 계산서가 조용히 미출력된다", () => {
    expect(idOfSnapshotKey(`bsp-${ID}-bggift`)).not.toBe(`${ID}-bggift`);
  });

  /**
   * 🛑 PDF 경로(`building-std-pdf-data.ts:48-49`)는 `snap.taxType !== "transfer"`일 때도
   * 이 함수를 불러 **양도 배치가 재구성한 상증 스냅샷**을 양도 맥락으로 되돌린다.
   * `-bggift`는 진짜 상속·증여 계산이므로 null이어야 상속·증여 맥락 그대로 간다.
   */
  it("K-2 snapshotKeyTimepoint는 null이어야 한다 (상속·증여 맥락 보존)", () => {
    expect(snapshotKeyTimepoint(`bsp-${ID}-bggift`)).toBeNull();
  });

  it("K-3 증축분·배치 라벨 대상이 아니다", () => {
    expect(isExtensionSnapshotKey(`bsp-${ID}-bggift`)).toBe(false);
    expect(phdTimepointLabel(`bsp-${ID}-bggift`)).toBeNull();
  });

  it("🪤 `gb`를 부분문자열로 포함하지만 `-gb-` 접두 규칙에 걸리지 않는다", () => {
    expect(idOfSnapshotKey(`bsp-${ID}-gb-transfer`)).toBe(ID);
    expect(idOfSnapshotKey(`bsp-${ID}-bggift`)).toBe(ID);
  });
});
