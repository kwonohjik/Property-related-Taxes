/**
 * B-6 — 스냅샷 **생산자 표식**(`origin`).
 * 계획서: docs/00-pm/building-std-snapshot-key-namespace.plan.md (B-6)
 *
 * 배치 모달과 단일시점 모달은 **같은 키**를 쓴다(`bsp-{id}-gb-acq` 등 5개 충돌).
 * 담는 것은 다르다 — 배치는 계산서 재구성용 valuation 1시점(`val*` 트랙),
 * 단일시점은 정정용 transfer 2시점(`acq*`/`trans*` 트랙).
 *
 * #1270이 「세목이 다르면 복원하지 않는다」로 오작동을 막았지만, `taxType`은 **세목이지
 * 생산자가 아니다** — 배치가 transfer 모드를 쓰게 되는 날 조용히 깨진다. 표식을 명시한다.
 */
import { describe, it, expect } from "vitest";
import { phdBatchToSnapshots } from "@/lib/calc/phd-batch-snapshots";
import {
  initialBuildingStdPriceForm,
  isRestorableSnapshot,
} from "@/lib/calc/building-std-price-form";

const PT = { structureKey: "rc", usageNo: 2 };
const BATCH_INPUT = {
  building: {
    builtYear: 2010,
    parts: [
      {
        floorArea: 84.9,
        category: "housing" as const,
        transfer: PT,
        acquisition: PT,
        firstDisclosure: PT,
      },
    ],
  },
  acquisition: { year: 2015, landPricePerM2: 2_000_000 },
  firstDisclosure: { year: 2018, landPricePerM2: 2_500_000 },
  transfer: { year: 2024, landPricePerM2: 3_000_000 },
};

describe("배치 스냅샷은 생산자를 밝힌다", () => {
  it("phdBatchToSnapshots가 만든 모든 스냅샷에 origin='batch' (≥2001 valuation 분기)", () => {
    const snaps = phdBatchToSnapshots(BATCH_INPUT, "bsp-a1-gb");
    const keys = Object.keys(snaps);
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) {
      expect(snaps[k].origin).toBe("batch");
    }
  });

  /**
   * 🔴 **취득 ≤2000(acqBase) 분기가 더 위험하다.**
   *
   * 그쪽은 `buildTransferAcqSnapshot`으로 **`taxType: "transfer"`** 를 낸다 — 즉 #1270의
   * taxType 가드가 **막지 못하는 유일한 배치 출력**이다(valuation 모드는 이미 막혔다).
   * 게다가 `transferYear`가 **2001 더미**라, 복원되면 「양도시 적용」이 더미 데이터로 계산한
   * 값을 폼에 밀어넣는다(`MixedUseLegacyStdPrice.tsx:193`는 2시점 모달이라 그 버튼이 뜬다).
   *
   * ⚠️ 이 케이스가 없으면 그 분기의 `origin` 표식은 **어떤 테스트도 지키지 않는다**
   *    (2026-08-24 리뷰 실측: 태그를 지워도 1,733건 전건 통과했다).
   */
  it("🔴 취득 ≤2000 acqBase 분기도 origin='batch' — taxType 가드가 못 막는 쪽", () => {
    const pre2001 = {
      ...BATCH_INPUT,
      acquisition: { year: 1999, landPricePerM2: 900_000 },
      firstDisclosure: { year: 2000, landPricePerM2: 950_000 },
      landPrice2001PerM2: 1_000_000,
    };
    const snaps = phdBatchToSnapshots(pre2001, "bsp-a1-phd");
    const acqKeys = Object.keys(snaps).filter((k) => /-(acq|first)(-commercial)?$/.test(k));
    expect(acqKeys.length).toBeGreaterThan(0);
    for (const k of acqKeys) {
      // transfer 모드로 나오는 것이 이 분기의 특징 — 그래서 taxType 가드로는 못 막는다
      expect(snaps[k].taxType).toBe("transfer");
      expect(snaps[k].origin).toBe("batch");
    }
  });
});

describe("initial 폼은 단일시점 생산자", () => {
  it("기본값은 origin='single' — 모달이 저장하는 정정용 스냅샷", () => {
    expect(initialBuildingStdPriceForm.origin).toBe("single");
  });
});

describe("isRestorableSnapshot — 복원 가능 판정 (두 조건은 다른 위험을 막는다)", () => {
  const single = { ...initialBuildingStdPriceForm, taxType: "transfer" as const };

  it("같은 생산자·같은 세목이면 복원한다 (정정 경로 보존)", () => {
    expect(isRestorableSnapshot(single, "transfer")).toBe(true);
  });

  it("🔑 배치 산출물은 세목이 같아도 복원하지 않는다 — 필드 트랙이 다르다", () => {
    expect(
      isRestorableSnapshot({ ...single, origin: "batch" as const }, "transfer"),
    ).toBe(false);
  });

  it("세목이 다르면 복원하지 않는다 (라디오 시절 저장분)", () => {
    expect(
      isRestorableSnapshot({ ...single, taxType: "inheritance_gift" as const }, "transfer"),
    ).toBe(false);
  });

  it("구버전 저장분(origin 없음)은 taxType만으로 판정한다", () => {
    const legacy = { ...single, origin: undefined };
    expect(isRestorableSnapshot(legacy, "transfer")).toBe(true);
    expect(isRestorableSnapshot({ ...legacy, taxType: "inheritance_gift" as const }, "transfer")).toBe(false);
  });

  it("lockedTaxType이 없으면(독립 페이지) 세목은 보지 않는다 — 배치 판정만 남는다", () => {
    expect(isRestorableSnapshot({ ...single, taxType: "inheritance_gift" as const })).toBe(true);
    expect(isRestorableSnapshot({ ...single, origin: "batch" as const })).toBe(false);
  });

  it("복원분이 없으면 false", () => {
    expect(isRestorableSnapshot(undefined, "transfer")).toBe(false);
  });
});

/**
 * 🔴 구버전 저장분(`origin` 없음) 보정 — 배치 전용 키는 키로 생산자를 알 수 있다.
 *
 * 이력(`input_data.buildingStdSnapshots`)에서 재수화된 분에는 `origin`이 없다. 그중
 * `-phd-{acq|first|transfer}`·`-cb-first`는 **배치만 만드는 키**라(`phdTimepointLabel`),
 * 그대로 두면 ≤2000 배치 저장분이 더미 2001 시점을 안고 복원된다(2026-08-24 리뷰 지적).
 */
describe("구버전 저장분 — 배치 전용 키 보정", () => {
  const legacyTransferBatch = {
    ...initialBuildingStdPriceForm,
    origin: undefined,
    taxType: "transfer" as const,
  };

  it("배치 전용 키면 origin이 없어도 복원하지 않는다", () => {
    for (const k of [
      "bsp-a1-phd-acq",
      "bsp-a1-phd-first",
      "bsp-a1-phd-transfer",
      "bsp-a1-phd-acq-commercial",
      "bsp-a1-cb-first",
    ]) {
      expect(isRestorableSnapshot(legacyTransferBatch, "transfer", k)).toBe(false);
    }
  });

  it("단일시점 모달과 공유하는 키는 그대로 복원한다 — 과잉 차단 방지", () => {
    // `-gb-acq`·`-cb-acq`는 배치와 1시점 모달이 **공유**하므로 키로는 생산자를 못 가른다.
    for (const k of ["bsp-a1-gb-acq", "bsp-a1-cb-acq", "bsp-a1-cb-transfer", "bsp-a1-red993-phd"]) {
      expect(isRestorableSnapshot(legacyTransferBatch, "transfer", k)).toBe(true);
    }
  });

  it("origin이 명시돼 있으면 키 보정보다 우선한다", () => {
    expect(
      isRestorableSnapshot({ ...legacyTransferBatch, origin: "single" }, "transfer", "bsp-a1-phd-acq"),
    ).toBe(true);
  });

  it("키를 안 주면 종전대로 origin·taxType만 본다", () => {
    expect(isRestorableSnapshot(legacyTransferBatch, "transfer")).toBe(true);
  });
});
