// B4 회귀 — §99의3 감면(new_99_3) 구 세션 복원 시 exclusiveAreaSqm993 등 backfill.
//
// exclusiveAreaSqm993 배선(B4) 이전에 저장된 세션은 해당 필드가 없어,
// validate의 `exclusiveAreaSqm993 > 0` 강제에 걸려 계산이 차단되고
// DecimalInput이 undefined를 받아 controlled input 경고가 발생한다.
// migrateAsset가 누락 필드를 ""로 backfill하는지 검증한다.
import { describe, it, expect } from "vitest";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";

describe("[B4] migrateAsset new_99_3 backfill", () => {
  it("구 세션(exclusiveAreaSqm993 없음) → 누락 필드가 빈 문자열로 backfill", () => {
    const stale = {
      assetKind: "housing",
      reductions: [
        {
          type: "new_99_3",
          // 면적기준 배선 전 저장분 — exclusiveAreaSqm993 · standardPriceAtTransfer993 없음
          contractDate993: "2002-06-01",
          standardPriceAt5Years: "300000000",
          standardPriceAtAcquisition993: "200000000",
          region993: "outside_speculation",
          acquisitionType993: "from_builder",
          isResident993: true,
          isHousingConstructionBusiness993: false,
        },
      ],
    };
    const migrated = migrateAsset(stale) as unknown as {
      reductions: Array<Record<string, unknown>>;
    };
    const r = migrated.reductions[0];
    expect(r.exclusiveAreaSqm993).toBe("");
    expect(r.standardPriceAtTransfer993).toBe("");
    expect(r.usageApprovalDate993).toBe("");
    expect(r.hasOccupancyAtContract).toBe(false);
  });

  it("기존 입력값은 backfill이 덮어쓰지 않음", () => {
    const withValues = {
      assetKind: "housing",
      reductions: [
        {
          type: "new_99_3",
          exclusiveAreaSqm993: "140",
          standardPriceAt5Years: "300000000",
          standardPriceAtAcquisition993: "200000000",
          region993: "speculation",
          acquisitionType993: "self_built",
          isResident993: false,
          isHousingConstructionBusiness993: true,
        },
      ],
    };
    const migrated = migrateAsset(withValues) as unknown as {
      reductions: Array<Record<string, unknown>>;
    };
    const r = migrated.reductions[0];
    expect(r.exclusiveAreaSqm993).toBe("140");
    expect(r.region993).toBe("speculation");
    expect(r.acquisitionType993).toBe("self_built");
    expect(r.isResident993).toBe(false);
    expect(r.isHousingConstructionBusiness993).toBe(true);
  });
});
