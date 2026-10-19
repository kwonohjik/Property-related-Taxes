/**
 * P1 주택 split 파트 이월과세 — leaf(`collectSplitPartCauseIssues`) S0~S9 규칙별 발동·긍정 짝 (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md §6
 * 엔진·⑫·⑧이 같은 leaf를 공유한다 — 이 파일은 leaf를 **직접** 잠근다(겹친 방어는 mutation에서 서로를 가린다).
 */
import { describe, it, expect } from "vitest";
import {
  collectSplitPartCauseIssues,
  PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE,
  PART_CARRYOVER_COMPANION_MESSAGE,
  PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE,
  PART_CARRYOVER_INPUT_REQUIRED_MESSAGE,
  PART_CARRYOVER_STRAY_MESSAGE,
  PART_CARRYOVER_DATE_MISMATCH_MESSAGE,
  PART_CARRYOVER_LEGACY_EXPENSES_MESSAGE,
  PART_CARRYOVER_ONE_HOUSE_MESSAGE,
  PART_CARRYOVER_LAND_VALUATION_REQUIRED_MESSAGE,
  PART_CARRYOVER_BUILDING_VALUATION_REQUIRED_MESSAGE,
  BUILDING_CAUSE_ESTIMATION_MESSAGE,
  BUILDING_CAUSE_BURDENED_GIFT_MESSAGE,
  BUILDING_CAUSE_BURDENED_OVERLAY_MESSAGE,
  LAND_INHERITED_ESTIMATION_MESSAGE,
  LAND_CAUSE_BUILDING_CAUSE_MESSAGE,
  LAND_CAUSE_ABSENT_MESSAGE,
  LAND_CAUSE_DATE_REQUIRED_MESSAGE,
  LAND_CAUSE_OWNER_SPLIT_MESSAGE,
  type SplitPartCauseFacts,
} from "@/lib/tax-engine/transfer-split-part-cause";

const GIFT = "2023-03-01";

/** A — 토지만 이월과세 (건물은 매매) */
const A: SplitPartCauseFacts = {
  isSplitable: true,
  isHousing: true,
  hasLandAcquisitionDate: true,
  landAcquisitionCause: "carryover_gift",
  hasLandDecedentAcquisitionDate: false,
  landMode: "actual",
  landAcquisitionDate: GIFT,
  buildingAcquisitionCause: "purchase",
  buildingAcquisitionDate: "2021-03-01",
  buildingMode: "actual",
  selfOwns: "both",
  hasLandCarryover: true,
  carryoverGiftDate: GIFT,
  hasLandAcquisitionPrice: true,
  hasBuildingAcquisitionPrice: true,
};
/** B — 건물만 이월과세 (토지는 매매 overlay) */
const B: SplitPartCauseFacts = {
  ...A,
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2008-01-01",
  buildingAcquisitionCause: "carryover_gift",
  buildingAcquisitionDate: GIFT,
  hasLandCarryover: false,
  hasBuildingCarryover: true,
};
/** C — 둘 다 이월과세 */
const C: SplitPartCauseFacts = {
  ...A,
  buildingAcquisitionCause: "carryover_gift",
  buildingAcquisitionDate: GIFT,
  hasBuildingCarryover: true,
};
const msgs = (f: SplitPartCauseFacts) => collectSplitPartCauseIssues(f).map((i) => i.message);
const fields = (f: SplitPartCauseFacts) => collectSplitPartCauseIssues(f).map((i) => i.field);

describe("긍정 짝 — A·B·C 서브객체가 있으면 통과", () => {
  it("A·B·C 기준 사실은 이슈 0건", () => {
    expect(msgs(A)).toEqual([]);
    expect(msgs(B)).toEqual([]);
    expect(msgs(C)).toEqual([]);
  });
  it("호스트 명시 지원(true)·생략은 같다", () => {
    expect(msgs({ ...A, partCarryoverSupported: true })).toEqual([]);
  });
});

describe("S0 — 파트 이월과세를 받지 않는 자리(컴패니언, 명시 false)", () => {
  it("입력 칸마다 짚는다: 원인·사건·파트", () => {
    const issues = collectSplitPartCauseIssues({ ...A, partCarryoverSupported: false });
    expect(issues.map((i) => i.field)).toEqual(["landAcquisitionCause", "carryoverGiftEvent", "landCarryoverPart"]);
    for (const i of issues) expect(i.message).toBe(PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE);
  });
  it("원인만 있어도(서브객체 없음) 짚는다 — 컴패니언 `landAcquisitionCause: carryover_gift`", () => {
    const issues = collectSplitPartCauseIssues({ ...A, partCarryoverSupported: false, hasLandCarryover: false, carryoverGiftDate: undefined });
    expect(issues[0]).toEqual({ field: "landAcquisitionCause", message: PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE });
  });
  it("파트 이월과세와 무관한 입력은 건드리지 않는다", () => {
    expect(msgs({ ...A, landAcquisitionCause: "purchase", buildingAcquisitionCause: "purchase", hasLandCarryover: false, carryoverGiftDate: undefined, partCarryoverSupported: false })).toEqual([]);
  });
});

describe("S2′ — 주 자산 파트 이월과세 + 함께 양도 자산", () => {
  it("A·B", () => {
    expect(collectSplitPartCauseIssues({ ...A, hasCompanions: true })).toEqual([{ field: "landCarryoverPart", message: PART_CARRYOVER_COMPANION_MESSAGE }]);
    expect(collectSplitPartCauseIssues({ ...B, hasCompanions: true })).toEqual([{ field: "buildingCarryoverPart", message: PART_CARRYOVER_COMPANION_MESSAGE }]);
  });
  it("파트 이월과세가 없으면(일반 split) 컴패니언이 있어도 무영향", () => {
    expect(msgs({ ...A, landAcquisitionCause: "purchase", hasLandCarryover: false, carryoverGiftDate: undefined, hasCompanions: true })).toEqual([]);
  });
});

describe("S3 — 자산 단위 이월과세와 상호배제", () => {
  it("파트 서브객체 + 자산 단위 → carryoverTaxation (S1 필수 누락은 S3가 가린다)", () => {
    expect(collectSplitPartCauseIssues({ ...C, hasTopLevelCarryover: true })).toEqual([
      { field: "carryoverTaxation", message: PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE },
    ]);
    // 서브객체 없이 건물 이월과세 호스트 + 토지 overlay 이월과세 + 자산 단위 병용(SPCO-0k) — S3만, S1 필수 누락은 가린다
    expect(
      collectSplitPartCauseIssues({
        ...A, buildingAcquisitionCause: "carryover_gift", buildingAcquisitionDate: GIFT, hasLandCarryover: false, carryoverGiftDate: undefined, hasTopLevelCarryover: true,
      }),
    ).toEqual([{ field: "carryoverTaxation", message: PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE }]);
    // 건물 원인이 이월과세가 아니면 자산 단위 객체는 stale — 토지 overlay의 서브객체 누락은 그대로 S1
    expect(
      collectSplitPartCauseIssues({ ...A, hasLandCarryover: false, carryoverGiftDate: undefined, hasTopLevelCarryover: true }),
    ).toEqual([{ field: "landCarryoverPart", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE }]);
  });
  it("서브객체 없는 자산 단위 이월과세는 종전에 막히던 결합만 닫는다: 토지 overlay purchase(종전 `:249`)·이월과세(종전 G-1)", () => {
    const f: SplitPartCauseFacts = {
      ...A, landAcquisitionCause: "purchase", landAcquisitionDate: "2008-01-01", buildingAcquisitionCause: "carryover_gift", buildingAcquisitionDate: GIFT,
      hasLandCarryover: false, carryoverGiftDate: undefined, hasTopLevelCarryover: true,
    };
    expect(collectSplitPartCauseIssues(f)[0]).toEqual({ field: "carryoverTaxation", message: PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE });
    expect(fields({ ...f, hasLandAcquisitionDate: false, landAcquisitionDate: undefined })).toContain("carryoverTaxation"); // 종전 `:249`는 토지 취득일과 무관했다
  });
  it("토지 원인이 없는 자산 단위 이월과세 + 토지 취득일 분리 입력(소유자 분리·PHD 후퇴 송신 포함)은 여기서 닫지 않는다 — 종전 200/엔진 재귀(Y8) 경로 그대로 (회귀 격자)", () => {
    const f: SplitPartCauseFacts = {
      ...A, landAcquisitionCause: undefined, landAcquisitionDate: "2023-03-01", buildingAcquisitionCause: "carryover_gift",
      buildingAcquisitionDate: "2023-03-01", hasLandCarryover: false, carryoverGiftDate: undefined, hasTopLevelCarryover: true,
    };
    expect(collectSplitPartCauseIssues(f)).toEqual([]);
    expect(collectSplitPartCauseIssues({ ...f, selfOwns: "building_only" })).toEqual([]);
    expect(collectSplitPartCauseIssues({ ...f, landAcquisitionDate: "1995-03-01" })).toEqual([]);
  });
  it("서브객체·사건·토지 취득일이 모두 없는 원인만의 토지 이월과세는 종전처럼 통과(엔진이 읽지 않는다) · 토지 취득일이 있으면 S1", () => {
    const f: SplitPartCauseFacts = { ...A, hasLandCarryover: false, carryoverGiftDate: undefined, hasLandAcquisitionDate: false, landAcquisitionDate: undefined };
    expect(collectSplitPartCauseIssues(f)).toEqual([]);
    expect(collectSplitPartCauseIssues({ ...f, partCarryoverSupported: false })).toEqual([]);
    expect(fields({ ...f, hasLandAcquisitionDate: true, landAcquisitionDate: GIFT })).toContain("landCarryoverPart");
  });
  it("stale 자산 단위 객체 — 건물 원인이 이월과세가 아니고 파트 입력도 없으면 무영향(종전 경로 회귀 0)", () => {
    expect(msgs({ ...A, landAcquisitionCause: "purchase", hasLandCarryover: false, carryoverGiftDate: undefined, hasTopLevelCarryover: true })).toEqual([]);
  });
});

describe("S1 — 취득원인 ⇔ 서브객체 (필수 누락·stray·사건 짝)", () => {
  it("토지 이월과세 원인인데 서브객체 없음 → landCarryoverPart (G-1 대체)", () => {
    expect(collectSplitPartCauseIssues({ ...A, hasLandCarryover: false, carryoverGiftDate: undefined })).toEqual([
      { field: "landCarryoverPart", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE },
    ]);
  });
  it("건물 이월과세 원인(토지 overlay 매매)인데 서브객체 없음 → buildingCarryoverPart", () => {
    expect(collectSplitPartCauseIssues({ ...B, hasBuildingCarryover: false, carryoverGiftDate: undefined })).toEqual([
      { field: "buildingCarryoverPart", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE },
    ]);
  });
  it("stray — 원인이 이월과세가 아닌 파트에 서브객체", () => {
    expect(collectSplitPartCauseIssues({ ...A, landAcquisitionCause: "gift" }).map((i) => i.field)).toContain("landCarryoverPart");
    expect(collectSplitPartCauseIssues({ ...A, hasBuildingCarryover: true }).map((i) => [i.field, i.message])).toContainEqual([
      "buildingCarryoverPart",
      PART_CARRYOVER_STRAY_MESSAGE,
    ]);
  });
  it("서브객체는 있는데 사건 없음 / 사건만 있고 서브객체 없음", () => {
    expect(collectSplitPartCauseIssues({ ...A, carryoverGiftDate: undefined })).toEqual([
      { field: "carryoverGiftEvent", message: PART_CARRYOVER_INPUT_REQUIRED_MESSAGE },
    ]);
    expect(
      collectSplitPartCauseIssues({ ...A, landAcquisitionCause: "purchase", hasLandCarryover: false }),
    ).toEqual([{ field: "carryoverGiftEvent", message: PART_CARRYOVER_STRAY_MESSAGE }]);
  });
  it("토지·건물을 나눠 계산하지 않는 자산(isSplitable false)에 실린 파트 이월과세는 stray", () => {
    expect(
      collectSplitPartCauseIssues({ ...A, isSplitable: false }).map((i) => i.field),
    ).toEqual(["landCarryoverPart", "carryoverGiftEvent"]);
    expect(collectSplitPartCauseIssues({ ...A, isSplitable: false, hasLandCarryover: false, carryoverGiftDate: undefined })).toEqual([]);
  });
});

describe("S4 — 구조(기존 D1/D2 목록 재사용, 이월과세도 같은 배열)", () => {
  it("C는 건물 이월과세와의 결합을 허용하되, 토지 이월과세 + 건물 상속·증여·부담부증여는 차단", () => {
    expect(msgs({ ...C })).toEqual([]);
    for (const buildingAcquisitionCause of ["inheritance", "gift", "burdened_gift"])
      expect(msgs({ ...A, buildingAcquisitionCause, hasBuildingCarryover: false })).toContain(LAND_CAUSE_BUILDING_CAUSE_MESSAGE);
    // 토지 상속·증여는 건물 이월과세도 종전대로 차단(D3)
    expect(msgs({ ...A, landAcquisitionCause: "inheritance", hasLandCarryover: false, carryoverGiftDate: undefined, hasLandDecedentAcquisitionDate: true, buildingAcquisitionCause: "carryover_gift" })).toContain(
      LAND_CAUSE_BUILDING_CAUSE_MESSAGE,
    );
  });
  it("B: 건물 부담부증여 + 토지 매매는 차단 유지(문구에서 이월과세 어휘 제거)", () => {
    expect(collectSplitPartCauseIssues({ ...B, buildingAcquisitionCause: "burdened_gift", hasBuildingCarryover: false, carryoverGiftDate: undefined })[0]).toEqual({
      field: "landAcquisitionCause",
      message: BUILDING_CAUSE_BURDENED_OVERLAY_MESSAGE,
    });
  });
  it("부담부증여·소유자 분리는 이월과세 파트도 같은 구조 목록으로 차단", () => {
    expect(msgs({ ...A, isBurdenedGift: true })).toContain("부담부증여로 양도하는 자산에는 토지 취득원인을 따로 지정할 수 없습니다 — 채무 인수분을 양도로 보는 안분(소득세법 시행령 §159)이 토지·건물 취득가액 구분과 함께 계산되지 않습니다");
    expect(msgs({ ...A, selfOwns: "land_only" })).toContain(LAND_CAUSE_OWNER_SPLIT_MESSAGE);
    expect(msgs({ ...B, isBurdenedGift: true })).toContain(BUILDING_CAUSE_BURDENED_GIFT_MESSAGE);
    expect(msgs({ ...B, selfOwns: "building_only" })).toContain(LAND_CAUSE_OWNER_SPLIT_MESSAGE);
  });
  it("토지 취득일이 없으면 분리 계산이 성립하지 않는다(A·B)", () => {
    expect(msgs({ ...A, hasLandAcquisitionDate: false, landAcquisitionDate: undefined })).toContain(LAND_CAUSE_DATE_REQUIRED_MESSAGE);
    expect(fields({ ...B, hasLandAcquisitionDate: false, landAcquisitionDate: undefined })).toContain("landAcquisitionDate");
  });
  it("Y8 — 건물 이월과세 + 토지 overlay 부재 + 취득일이 다르면 토지 원인 필수(호스트가 split을 켜면)", () => {
    const f: SplitPartCauseFacts = { ...B, landAcquisitionCause: undefined, hasBuildingCarryover: false, carryoverGiftDate: undefined };
    expect(msgs(f)).toContain(LAND_CAUSE_ABSENT_MESSAGE);
  });
});

describe("S5 — 파트 취득일 = 증여 등기접수일", () => {
  it("토지(A·C)·건물(B·C) 각각 짚는다", () => {
    expect(collectSplitPartCauseIssues({ ...A, landAcquisitionDate: "2023-04-01" })).toEqual([
      { field: "landAcquisitionDate", message: PART_CARRYOVER_DATE_MISMATCH_MESSAGE },
    ]);
    expect(collectSplitPartCauseIssues({ ...B, buildingAcquisitionDate: "2023-04-01" })).toEqual([
      { field: "acquisitionDate", message: PART_CARRYOVER_DATE_MISMATCH_MESSAGE },
    ]);
    expect(fields({ ...C, landAcquisitionDate: "2023-04-01", buildingAcquisitionDate: "2023-05-01" })).toEqual(["landAcquisitionDate", "acquisitionDate"]);
  });
  it("시각 꼬리·같은 날은 통과", () => {
    expect(msgs({ ...A, landAcquisitionDate: "2023-03-01T00:00:00.000Z" })).toEqual([]);
  });
});

describe("S6·S7 — 파트 산정방식은 실가, 평가액 > 0", () => {
  it("토지 이월과세 환산·감정 → LAND_INHERITED_ESTIMATION (G-2 확장)", () => {
    for (const landMode of ["estimated", "appraisal", "salesCase"] as const)
      expect(collectSplitPartCauseIssues({ ...A, landMode })).toContainEqual({ field: "landAcqMode", message: LAND_INHERITED_ESTIMATION_MESSAGE });
  });
  it("건물 이월과세(B·C) 환산 → BUILDING_CAUSE_ESTIMATION", () => {
    expect(collectSplitPartCauseIssues({ ...B, buildingMode: "estimated" })).toContainEqual({ field: "buildingAcqMode", message: BUILDING_CAUSE_ESTIMATION_MESSAGE });
    expect(collectSplitPartCauseIssues({ ...C, buildingMode: "estimated" })).toContainEqual({ field: "buildingAcqMode", message: BUILDING_CAUSE_ESTIMATION_MESSAGE });
  });
  it("S7 — 이월과세 파트 평가액이 없으면 그 파트 칸을 짚는다(같은 날은 파트 완결 규칙이 꺼져 있어 0이 조용히 계산된다)", () => {
    expect(collectSplitPartCauseIssues({ ...A, hasLandAcquisitionPrice: false })).toEqual([
      { field: "landAcquisitionPrice", message: PART_CARRYOVER_LAND_VALUATION_REQUIRED_MESSAGE },
    ]);
    expect(collectSplitPartCauseIssues({ ...B, hasBuildingAcquisitionPrice: false })).toEqual([
      { field: "buildingAcquisitionPrice", message: PART_CARRYOVER_BUILDING_VALUATION_REQUIRED_MESSAGE },
    ]);
    expect(fields({ ...C, hasLandAcquisitionPrice: false, hasBuildingAcquisitionPrice: false })).toEqual(["buildingAcquisitionPrice", "landAcquisitionPrice"]);
  });
  it("B는 토지 매매 취득가액도 요구한다(D2 Y9) — 토지 파트는 실가", () => {
    expect(fields({ ...B, hasLandAcquisitionPrice: false })).toEqual(["landAcquisitionPrice"]);
  });
});

describe("S8 — 자산 단위 필요경비 총액 병용 금지", () => {
  it("파트 이월과세와 함께면 expenses 칸을 짚는다 / 파트 이월과세가 아니면 무영향", () => {
    expect(collectSplitPartCauseIssues({ ...A, hasLegacyExpenses: true })).toEqual([{ field: "expenses", message: PART_CARRYOVER_LEGACY_EXPENSES_MESSAGE }]);
    expect(msgs({ ...A, landAcquisitionCause: "purchase", hasLandCarryover: false, carryoverGiftDate: undefined, hasLegacyExpenses: true })).toEqual([]);
  });
});

describe("S9 — 1세대1주택 게이트 (isHousing ∧ isOneHousehold===true ∧ ¬미등기)", () => {
  it("겹치면 isOneHousehold 칸을 짚는다 — A·B·C", () => {
    for (const f of [A, B, C])
      expect(collectSplitPartCauseIssues({ ...f, isOneHousehold: true })).toEqual([{ field: "isOneHousehold", message: PART_CARRYOVER_ONE_HOUSE_MESSAGE }]);
  });
  it("비주택(building)·미등기·모름(생략)·1세대 아님은 닫지 않는다 — `checkExemptionCore`가 비과세 평가를 시작하는 조건과 같다", () => {
    expect(msgs({ ...A, isOneHousehold: true, isHousing: false })).toEqual([]);
    expect(msgs({ ...A, isOneHousehold: true, isUnregistered: true })).toEqual([]);
    expect(msgs({ ...A, isOneHousehold: undefined })).toEqual([]);
    expect(msgs({ ...A, isOneHousehold: false })).toEqual([]);
  });
  it("파트 이월과세가 없는 일반 split + 1세대1주택은 무영향(회귀 0)", () => {
    expect(msgs({ ...A, landAcquisitionCause: "purchase", hasLandCarryover: false, carryoverGiftDate: undefined, isOneHousehold: true })).toEqual([]);
  });
});

describe("순서 — 호스트 → 상호배제 → 입력 짝 → 구조 → … → 경비·1세대1주택 → 취득일 일치", () => {
  it("S0 → S2′ → S1 → S9 → S5", () => {
    const f: SplitPartCauseFacts = {
      ...A, partCarryoverSupported: false, hasCompanions: true, hasBuildingCarryover: true, isOneHousehold: true, landAcquisitionDate: "2023-04-01",
    };
    const order = collectSplitPartCauseIssues(f).map((i) => i.message);
    const idx = (m: string) => order.indexOf(m);
    expect(idx(PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE)).toBe(0);
    expect(idx(PART_CARRYOVER_COMPANION_MESSAGE)).toBeGreaterThan(idx(PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE));
    expect(idx(PART_CARRYOVER_STRAY_MESSAGE)).toBeGreaterThan(idx(PART_CARRYOVER_COMPANION_MESSAGE));
    expect(idx(PART_CARRYOVER_ONE_HOUSE_MESSAGE)).toBeGreaterThan(idx(PART_CARRYOVER_STRAY_MESSAGE));
    expect(idx(PART_CARRYOVER_DATE_MISMATCH_MESSAGE)).toBeGreaterThan(idx(PART_CARRYOVER_ONE_HOUSE_MESSAGE));
  });
});
