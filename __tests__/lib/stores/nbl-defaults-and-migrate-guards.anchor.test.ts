/**
 * anchor: NBL 폼 초기값의 단일 소스 + 이력 복원 가드
 *
 * 발견 COV-5·COV-6 (docs/reviews/nbl-code-review-2026-09.md)
 *
 * COV-5 — `NBL_DEFAULTS`의 주석은 「makeDefaultAsset에서 spread 사용」이라 선언하지만 저장소
 * 전체에서 이 심볼을 참조하는 곳이 정의 1곳뿐이고, 실제 초기값은 `makeDefaultAsset`이 인라인으로
 * 다시 나열한다. 두 목록은 이미 15필드(공장·복합용도 클러스터 전체) 벌어져 있었다.
 *
 * ⚠️ **spread로 단일화하지 않는다** — `NBL_DEFAULTS`는 모듈 상수라 `nblOtherParcels: []`·
 * `nblFactorySegments: []` 같은 배열 필드를 spread하면 **모든 자산이 같은 배열 인스턴스를 공유**한다.
 * 대신 두 목록의 일치를 이 테스트가 강제하고, 배열이 호출마다 새로 만들어지는 것도 함께 고정한다.
 *
 * COV-6 — 이력·sessionStorage 복원의 유일한 정규화 지점 `migrateAsset`이 `makeDefaultAsset`과
 * 병합하지 않아, 명시적으로 채우지 않은 신규 필드가 `undefined`로 남는다. 같은 파일이
 * `nblFactory*`·`nblOtherMixedUse*`·`nblVilla*`에는 가드를 붙여 놓았는데 §168의11②·③
 * 수입금액비율 클러스터(`nblRevenue*`)와 `nblGracePeriods`만 누락됐다.
 */
import { describe, it, expect } from "vitest";
import { NBL_DEFAULTS } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeDefaultAsset, migrateAsset } from "@/lib/stores/calc-wizard-asset-factory";

const nblKeys = (o: Record<string, unknown>) =>
  Object.keys(o).filter((k) => k.startsWith("nbl") || k === "isNonBusinessLand").sort();

describe("[COV-5] NBL_DEFAULTS ↔ makeDefaultAsset 이중진실 고정", () => {
  const factory = makeDefaultAsset(1) as unknown as Record<string, unknown>;

  it("🔴 키 집합이 정확히 일치한다", () => {
    expect(nblKeys(factory)).toEqual(nblKeys(NBL_DEFAULTS as unknown as Record<string, unknown>));
  });

  it("🔴 값도 전부 일치한다", () => {
    const d = NBL_DEFAULTS as unknown as Record<string, unknown>;
    const mismatched = nblKeys(d).filter(
      (k) => JSON.stringify(factory[k]) !== JSON.stringify(d[k]),
    );
    expect(mismatched).toEqual([]);
  });

  it("배열 초기값은 호출마다 새 인스턴스여야 한다 (spread 단일화 금지의 이유)", () => {
    const a = makeDefaultAsset(1) as unknown as Record<string, unknown>;
    const b = makeDefaultAsset(2) as unknown as Record<string, unknown>;
    expect(a.nblOtherParcels).not.toBe(b.nblOtherParcels);
    expect(a.nblFactorySegments).not.toBe(b.nblFactorySegments);
    expect(a.nblGracePeriods).not.toBe(b.nblGracePeriods);
    expect(a.nblBusinessUsePeriods).not.toBe(b.nblBusinessUsePeriods);
  });
});

describe("[COV-6] 이력 복원 — §168의11②·③ 수입금액비율 클러스터 가드", () => {
  const restored = migrateAsset({}) as unknown as Record<string, unknown>;

  const REVENUE_FIELDS = [
    "nblRevenueBusinessType",
    "nblRevenueCurrentRevenue",
    "nblRevenueCurrentLandValue",
    "nblRevenuePriorRevenue",
    "nblRevenuePriorLandValue",
    "nblRevenueCurrentBusinessStartDate",
    "nblRevenuePriorBusinessDays",
    "nblRevenueCurrentDeposit",
    "nblRevenueCurrentRentDays",
    "nblRevenuePriorDeposit",
    "nblRevenuePriorRentDays",
    "nblRevenueCommonApportion",
    "nblRevenueCommonRevenue",
    "nblRevenueOtherLandValue",
    "nblRevenuePriorCommonRevenue",
    "nblRevenuePriorOtherLandValue",
  ];

  it("🔴 옛 이력 레코드를 되살려도 nblRevenue* 16필드가 undefined로 남지 않는다", () => {
    const missing = REVENUE_FIELDS.filter((k) => restored[k] === undefined);
    expect(missing).toEqual([]);
  });

  it("🔴 nblGracePeriods도 배열로 채워진다", () => {
    expect(Array.isArray(restored.nblGracePeriods)).toBe(true);
  });

  it("기존 값은 덮어쓰지 않는다 (가드는 undefined일 때만)", () => {
    const kept = migrateAsset({
      nblRevenueBusinessType: "manufacturing",
      nblRevenueCurrentRevenue: "1,000,000",
      nblGracePeriods: [{ reasonCode: "other_justifiable" }],
    }) as unknown as Record<string, unknown>;
    expect(kept.nblRevenueBusinessType).toBe("manufacturing");
    expect(kept.nblRevenueCurrentRevenue).toBe("1,000,000");
    expect((kept.nblGracePeriods as unknown[]).length).toBe(1);
  });

  it("복원마다 새 배열 인스턴스 (공유 참조 금지)", () => {
    const a = migrateAsset({}) as unknown as Record<string, unknown>;
    const b = migrateAsset({}) as unknown as Record<string, unknown>;
    expect(a.nblGracePeriods).not.toBe(b.nblGracePeriods);
  });
});
