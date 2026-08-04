/**
 * P1 — 건물 기준시가 배치(N시점 일괄) 사용 가능 판정 게이트
 *
 * 계획서: docs/02-design/features/building-std-price-modal-multipoint.plan.md §4.2 · §5 P1
 *
 * 이 게이트는 **사전 판정 가능한 3조건**만 다룬다. 기계식주차·공동주택 환산은 모달 내부
 * state라 런처를 그리는 시점에 알 수 없어(실측) 게이트 밖이며, 종전 1시점 런처를 보조로
 * 상시 유지하는 것으로 대응한다(§4.2).
 */
import { describe, it, expect } from "vitest";
import {
  canUseMultiPointStdPrice,
  multiPointBlockReason,
  MULTI_POINT_BLOCK_MESSAGE,
} from "@/lib/calc/building-std-multipoint-gate";
import { BUILDING_STD_FIRST_YEAR } from "@/lib/calc/phd-building-std-batch";

describe("배치 가능 — 정상 경로", () => {
  it("C-1 상가 §164⑥ 3시점(취득 2000 · 양도 2026) → 사용 가능", () => {
    expect(canUseMultiPointStdPrice({ acquisitionYear: 2000, transferYear: 2026 })).toBe(true);
    expect(multiPointBlockReason({ acquisitionYear: 2000, transferYear: 2026 })).toBeNull();
  });

  it("C-2 취득연도 미상 → 차단하지 않는다 (배치가 그 시점만 제외)", () => {
    expect(canUseMultiPointStdPrice({ transferYear: 2026 })).toBe(true);
  });

  it("C-3 양도연도 미상 → 차단하지 않는다 (동상)", () => {
    expect(canUseMultiPointStdPrice({ acquisitionYear: 2000 })).toBe(true);
  });
});

describe("배치 불가 — 차단 사유", () => {
  it("C-4 취득연도 == 양도연도 → §164⑧ 동일연도 환산", () => {
    expect(multiPointBlockReason({ acquisitionYear: 2024, transferYear: 2024 })).toBe(
      "same_year_164_8",
    );
    expect(canUseMultiPointStdPrice({ acquisitionYear: 2024, transferYear: 2024 })).toBe(false);
  });

  it("C-5 양도연도 ≤2000 → 고시 이전", () => {
    expect(multiPointBlockReason({ acquisitionYear: 1995, transferYear: 2000 })).toBe(
      "transfer_year_pre_2001",
    );
  });

  it("C-6 상속·증여 평가 맥락 → 조정률 미지원", () => {
    expect(
      multiPointBlockReason({ acquisitionYear: 2010, transferYear: 2026, taxType: "inheritance_gift" }),
    ).toBe("tax_type_unsupported");
  });
});

describe("경계·결정성", () => {
  it("C-7 양도 2001(고시 최초연도)은 차단하지 않는다 — 경계는 미만", () => {
    expect(canUseMultiPointStdPrice({ acquisitionYear: 1998, transferYear: 2001 })).toBe(true);
    expect(BUILDING_STD_FIRST_YEAR).toBe(2001);
  });

  it("C-8 조건이 겹치면 순서는 결정적 — 세목 > 동일연도 > 양도 ≤2000", () => {
    // 상증 + 동일연도 + 양도 ≤2000 동시 → 세목이 먼저
    expect(
      multiPointBlockReason({ acquisitionYear: 1999, transferYear: 1999, taxType: "inheritance_gift" }),
    ).toBe("tax_type_unsupported");
    // 동일연도 + 양도 ≤2000 → 동일연도가 먼저
    expect(multiPointBlockReason({ acquisitionYear: 1999, transferYear: 1999 })).toBe(
      "same_year_164_8",
    );
  });

  it("C-9 모든 사유에 안내 문구가 있다 (UI 폴백 표시용)", () => {
    const reasons = ["tax_type_unsupported", "same_year_164_8", "transfer_year_pre_2001"] as const;
    for (const r of reasons) {
      expect(MULTI_POINT_BLOCK_MESSAGE[r]).toBeTruthy();
      expect(MULTI_POINT_BLOCK_MESSAGE[r].length).toBeGreaterThan(10);
    }
  });
});
