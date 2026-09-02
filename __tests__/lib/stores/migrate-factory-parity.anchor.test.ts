/**
 * anchor: `migrateAsset`이 factory의 모든 필드를 채운다 — 신규 필드 두 파일 규약 폐지
 *
 * ## 배경
 *
 * `migrateAsset`은 이력·sessionStorage 복원의 **유일한 정규화 지점**인데
 * (persist merge · 레거시 이관 · 이력 상세 드로어) `makeDefaultAsset`과 병합하지 않았다.
 * 그래서 명시적으로 세우지 않은 필드가 복원 자산에서 `undefined`로 남았고 **두 번 물렸다**:
 *
 *   · NBL 리뷰 **COV-6** — §168의11②·③ 수입금액비율 16필드가 통째로 비었다.
 *   · **`assetId`** — 중복 판정 `other.assetId !== a.assetId`가 `undefined !== undefined`로
 *     false가 되어 **서로 다른 자산을 같은 자산으로** 취급했다. 일괄 안분 매칭도 어긋났다.
 *
 * 이제 `migrateAsset`이 마지막에 factory 기본값으로 **빈 칸만** 채운다. 이 테스트가 그 계약을
 * 고정한다 — factory에 필드를 추가하고 migrate 쪽을 잊어도 여기서 잡힌다.
 *
 * ## 제외 3필드 — factory가 `index`로 만든다
 *
 * 복원 시점에는 그 index가 없어 채우면 전 자산이 같은 값을 갖는다(라벨 `자산 0` · id 충돌 ·
 * 대표자산 플래그 소실). `assetId`는 전용 시퀀스 가드가 따로 있다.
 */
import { describe, it, expect } from "vitest";
import { migrateAsset, makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

/** factory가 `index`에 의존해 만드는 필드 — 복원 경로에서는 채우지 않는다 */
const INDEX_DEPENDENT = ["assetLabel", "isPrimaryForHouseholdFlags"];

const factory = () => makeDefaultAsset(1) as unknown as Record<string, unknown>;
const restored = (raw: unknown = {}) => migrateAsset(raw) as unknown as Record<string, unknown>;

describe("[parity] migrateAsset ↔ makeDefaultAsset", () => {
  it("🔴 factory의 모든 키가 복원 결과에 존재한다 (index 의존 3필드 제외)", () => {
    const f = factory();
    const m = restored();
    const missing = Object.keys(f).filter(
      (k) => m[k] === undefined && f[k] !== undefined && !INDEX_DEPENDENT.includes(k),
    );
    expect(missing).toEqual([]);
  });

  it("🔴 assetId는 별도 가드로 채워진다 (factory 값을 그대로 쓰면 자산 간 충돌)", () => {
    expect(typeof restored().assetId).toBe("string");
    expect(restored({}).assetId).not.toBe(restored({}).assetId);
  });

  it("index 의존 필드는 채우지 않는다 — 전 자산이 같은 값이 되는 것을 막는다", () => {
    const m = restored();
    for (const k of INDEX_DEPENDENT) expect(m[k]).toBeUndefined();
  });

  it("🔴 기존 값은 절대 덮어쓰지 않는다", () => {
    const m = restored({
      acquisitionDate: "2015-03-01",
      actualSalePrice: "1,000,000,000",
      isOneHousehold: false,
      nblRevenueBusinessType: "manufacturing",
    });
    expect(m.acquisitionDate).toBe("2015-03-01");
    expect(m.actualSalePrice).toBe("1,000,000,000");
    expect(m.isOneHousehold).toBe(false);
    expect(m.nblRevenueBusinessType).toBe("manufacturing");
  });

  it("🔴 배열은 자산마다 새 인스턴스 (공유 참조 금지)", () => {
    const a = restored();
    const b = restored();
    expect(a.reductions).not.toBe(b.reductions);
    expect(a.parcels).not.toBe(b.parcels);
    expect(a.nblGracePeriods).not.toBe(b.nblGracePeriods);
  });

  it("COV-6 회귀 — 수입금액비율 클러스터가 채워진다", () => {
    const m = restored();
    expect(m.nblRevenueBusinessType).toBe("");
    expect(m.nblRevenueCommonApportion).toBe(false);
  });

  it("factory 자산을 다시 복원해도 값이 보존된다 (멱등)", () => {
    const f = factory();
    const m = restored({ ...f });
    for (const k of Object.keys(f)) {
      if (k === "assetId") continue; // 자체 가드가 유지한다 — 아래에서 따로 확인
      expect([k, m[k]]).toEqual([k, f[k]]);
    }
    expect(m.assetId).toBe(f.assetId);
  });
});
