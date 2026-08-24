/**
 * B-7 — 배치 스냅샷 교체가 **접두를 삼키지 않는다**.
 * 계획서: docs/00-pm/building-std-snapshot-key-namespace.plan.md (B-7)
 *
 * 종전 `replaceSnapshotsByPrefix`는 `k.startsWith(prefix + "-")`로 지웠는데,
 * `bsp-a1-gb-ext-acq`가 `bsp-a1-gb-`로 **시작한다** ⇒ GB 본체 일괄 계산을 실행하면
 * 증축분(건물2) 계산서가 조용히 사라졌다(2026-08-24 probe 실측).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useBuildingStdSnapshotStore } from "@/lib/stores/building-std-snapshot-store";
import { initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import { batchSnapshotKeys } from "@/lib/calc/phd-batch-snapshots";

const S = { ...initialBuildingStdPriceForm };
const keysOf = () => Object.keys(useBuildingStdSnapshotStore.getState().snapshots).sort();

beforeEach(() => {
  useBuildingStdSnapshotStore.setState({ snapshots: {} });
});

describe("batchSnapshotKeys — 배치가 만들 수 있는 키 집합 (단일 소스)", () => {
  it("시점 3종 × 주택/상가 = 6종", () => {
    expect(batchSnapshotKeys("bsp-a1-gb").sort()).toEqual(
      [
        "bsp-a1-gb-acq",
        "bsp-a1-gb-acq-commercial",
        "bsp-a1-gb-first",
        "bsp-a1-gb-first-commercial",
        "bsp-a1-gb-transfer",
        "bsp-a1-gb-transfer-commercial",
      ].sort(),
    );
  });

  it("🔑 `-ext` 같은 추가 세그먼트 키는 집합에 없다 — 삭제 대상이 될 수 없다", () => {
    const set = new Set(batchSnapshotKeys("bsp-a1-gb"));
    expect(set.has("bsp-a1-gb-ext-acq")).toBe(false);
    expect(set.has("bsp-a1-gb-ext-transfer")).toBe(false);
  });
});

describe("replaceBatchSnapshots — 접두 겹침 방지", () => {
  it("🔴 GB 본체 배치가 증축분(gb-ext) 스냅샷을 보존한다", () => {
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-a1-gb-acq": S,
        "bsp-a1-gb-ext-acq": S,
        "bsp-a1-gb-ext-transfer": S,
        "bsp-a1-cb-acq": S,
      },
    });
    useBuildingStdSnapshotStore
      .getState()
      .replaceBatchSnapshots(batchSnapshotKeys("bsp-a1-gb"), {
        "bsp-a1-gb-acq": S,
        "bsp-a1-gb-transfer": S,
      });
    expect(keysOf()).toEqual([
      "bsp-a1-cb-acq",
      "bsp-a1-gb-acq",
      "bsp-a1-gb-ext-acq",
      "bsp-a1-gb-ext-transfer",
      "bsp-a1-gb-transfer",
    ]);
  });

  it("배치 재실행 시 **자기 시점 축소**는 그대로 정리된다 (원래 목적 보존)", () => {
    // 3시점 배치 → 2시점 배치로 줄이면 남은 1건이 지워져야 한다.
    useBuildingStdSnapshotStore.setState({
      snapshots: {
        "bsp-a1-gb-acq": S,
        "bsp-a1-gb-first": S,
        "bsp-a1-gb-transfer": S,
      },
    });
    useBuildingStdSnapshotStore
      .getState()
      .replaceBatchSnapshots(batchSnapshotKeys("bsp-a1-gb"), {
        "bsp-a1-gb-acq": S,
        "bsp-a1-gb-transfer": S,
      });
    expect(keysOf()).toEqual(["bsp-a1-gb-acq", "bsp-a1-gb-transfer"]);
  });

  it("상가 접미(-commercial)도 자기 집합이므로 정리된다", () => {
    useBuildingStdSnapshotStore.setState({
      snapshots: { "bsp-a1-cb-transfer-commercial": S, "bsp-a1-cbinh-acq": S },
    });
    useBuildingStdSnapshotStore.getState().replaceBatchSnapshots(batchSnapshotKeys("bsp-a1-cb"), {});
    // cbinh는 cb-로 시작하지 않으므로 애초에 무관 — 회귀 방어
    expect(keysOf()).toEqual(["bsp-a1-cbinh-acq"]);
  });

  it("다른 자산의 키는 건드리지 않는다", () => {
    useBuildingStdSnapshotStore.setState({
      snapshots: { "bsp-a1-gb-acq": S, "bsp-a2-gb-acq": S },
    });
    useBuildingStdSnapshotStore
      .getState()
      .replaceBatchSnapshots(batchSnapshotKeys("bsp-a1-gb"), { "bsp-a1-gb-acq": S });
    expect(keysOf()).toEqual(["bsp-a1-gb-acq", "bsp-a2-gb-acq"]);
  });
});
