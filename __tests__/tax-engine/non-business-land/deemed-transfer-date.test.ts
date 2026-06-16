/**
 * F1 — 양도일 의제 (§168조의14②) anchor
 *
 * §168조의14②: 경매(최초 경매기일)·공매(최초 공매일)·§83의5②(캠코 위임일·신문공고 최초공고일)
 * 로 양도된 토지는 "해당 날을 양도일로 보아 §168조의6(기간기준)을 적용"하여 비사업용 판정.
 * → 의제일은 **§168조의6 기간기준에만** 작용. 지목·도시지역·편입유예·무조건의제는 실제 양도일.
 *
 * 핵심 anchor: 자경 6년(2013~2019) 후 5년 미경작 농지(도시지역밖).
 * - reason none: 실제 양도일 2024 → 보유 11년·직전5년 자경0 → 비사업용.
 * - reason auction·의제 2019: §168조의6 판정 양도일=2019 → 직전5년 자경 full → 사업용 (플립).
 * KoreanLaw 본문 실측(mst=286211 §168의14② · §168의6, 2026-06-17).
 */
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import {
  DEFAULT_NON_BUSINESS_LAND_RULES,
  type NonBusinessLandInput,
} from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

// 농지 도시지역밖(management), 재촌(거리 0 fallback) + 자경 6년(2013~2019) 후 미경작.
const baseFarmland = (overrides: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput => ({
  landType: "farmland",
  landArea: 1000,
  zoneType: "management", // 도시지역밖 (isUrbanForFarmland=false)
  acquisitionDate: d("2013-01-01"),
  transferDate: d("2024-01-01"),
  farmingSelf: true,
  farmerResidenceDistance: 0, // 재촌 fallback 전체기간
  businessUsePeriods: [{ startDate: d("2013-01-01"), endDate: d("2019-01-01"), usageType: "self" }],
  gracePeriods: [],
  ...overrides,
});

describe("F1 — 양도일 의제 (§168조의14②)", () => {
  // [Pre-Do 핵심] 경매 의제일(최초 경매기일 2019)을 §168조의6 판정 양도일로 대체 → 사업용 플립.
  it("AT-F1-1: 경매 의제일 2019 → §168조의6 기간기준 양도일 대체 → 사업용", () => {
    const none = judgeNonBusinessLand(baseFarmland(), R);
    const auction = judgeNonBusinessLand(
      baseFarmland({
        deemedTransferReason: "auction",
        deemedTransferDate: d("2019-01-01"),
      } as Partial<NonBusinessLandInput>),
      R,
    );
    expect(none.isNonBusinessLand).toBe(true); // 실제 양도일 2024 → 비사업용
    expect(auction.isNonBusinessLand).toBe(false); // 의제 2019 → 사업용
  });

  // 의제일이 §168조의6 보유기간(totalOwnershipDays)을 단축.
  it("AT-F1-3: 의제일이 §168조의6 보유기간을 단축", () => {
    const none = judgeNonBusinessLand(baseFarmland(), R);
    const auction = judgeNonBusinessLand(
      baseFarmland({
        deemedTransferReason: "auction",
        deemedTransferDate: d("2019-01-01"),
      } as Partial<NonBusinessLandInput>),
      R,
    );
    expect(auction.totalOwnershipDays).toBeLessThan(none.totalOwnershipDays);
  });

  // 회귀: reason 미지정(none)이면 deemedTransferDate가 있어도 무시(실제 양도일).
  it("AT-F1-2: reason none → 의제일 무시(실제 양도일)", () => {
    const a = judgeNonBusinessLand(baseFarmland(), R);
    const b = judgeNonBusinessLand(
      baseFarmland({
        deemedTransferDate: d("2019-01-01"), // reason 미지정
      } as Partial<NonBusinessLandInput>),
      R,
    );
    expect(b.totalOwnershipDays).toBe(a.totalOwnershipDays);
    expect(b.isNonBusinessLand).toBe(a.isNonBusinessLand);
  });
});
