/**
 * 갭 3b — §168조의14①·§83조의5① 사유별 법정기간 자동산정 anchor
 *
 * resolveGraceIntervals: 사유코드 + 기산일 → 법정 종료일 자동 산정.
 * KoreanLaw 본문 검증(mst 286211 §168의14① · 286379 §83의5①).
 */
import { describe, it, expect } from "vitest";
import { resolveGraceIntervals } from "@/lib/tax-engine/non-business-land/grace-reason-period";

const d = (iso: string) => new Date(iso);
const ctx = (over: Partial<{ transferDate: Date; acquisitionDate: Date; isRealEstateDealerMatter: boolean }> = {}) => ({
  transferDate: d("2026-06-01"),
  acquisitionDate: d("2020-01-01"),
  isRealEstateDealerMatter: false,
  ...over,
});

describe("갭 3b — resolveGraceIntervals 사유별 법정기간", () => {
  it("9호 멸실 — 멸실일 + 5년 자동산정", () => {
    const r = resolveGraceIntervals("demolition", d("2021-06-01"), undefined, undefined, ctx());
    expect(r).toEqual([{ start: d("2021-06-01"), end: d("2026-06-01") }]);
  });

  it("6호 저당권 — 취득일 + 2년 (취득일 자동, 사용자 기산 불요)", () => {
    const r = resolveGraceIntervals("mortgage_or_liquidation", undefined, undefined, undefined, ctx({ acquisitionDate: d("2020-01-01") }));
    expect(r).toEqual([{ start: d("2020-01-01"), end: d("2022-01-01") }]);
  });

  it("8호 도시개발 건축가능 — 건축가능일 + 2년", () => {
    const r = resolveGraceIntervals("urban_dev_buildable", d("2022-03-10"), undefined, undefined, ctx());
    expect(r).toEqual([{ start: d("2022-03-10"), end: d("2024-03-10") }]);
  });

  it("1·7·12호 event_window — 개시·종료 입력 그대로", () => {
    const r = resolveGraceIntervals("ownership_litigation", d("2021-01-01"), d("2023-01-01"), undefined, ctx());
    expect(r).toEqual([{ start: d("2021-01-01"), end: d("2023-01-01") }]);
  });

  it("event_window — 종료일 미입력 시 빈 배열 (자동 안분 fallback 금지)", () => {
    const r = resolveGraceIntervals("ownership_litigation", d("2021-01-01"), undefined, undefined, ctx());
    expect(r).toEqual([]);
  });

  it("5호 건설착공 — [취득일,취득+2년] ∪ [착공일,건설진행종료] 두 구간", () => {
    const r = resolveGraceIntervals(
      "construction_in_progress",
      undefined,
      d("2025-06-01"), // 건설진행종료
      d("2020-03-01"), // 착공일(secondary)
      ctx({ acquisitionDate: d("2020-01-01") }),
    );
    expect(r).toEqual([
      { start: d("2020-01-01"), end: d("2022-01-01") },
      { start: d("2020-03-01"), end: d("2025-06-01") },
    ]);
  });

  it("5호 — 건설진행종료 미입력 시 양도일까지 진행 가정", () => {
    const r = resolveGraceIntervals(
      "construction_in_progress",
      undefined,
      undefined,
      d("2020-03-01"),
      ctx({ acquisitionDate: d("2020-01-01"), transferDate: d("2026-06-01") }),
    );
    expect(r[1]).toEqual({ start: d("2020-03-01"), end: d("2026-06-01") });
  });

  it("단서 — 매매업 매매용부동산은 1·2호 배제(빈 배열)", () => {
    const r = resolveGraceIntervals("building_permit_restricted", d("2021-01-01"), d("2023-01-01"), undefined, ctx({ isRealEstateDealerMatter: true }));
    expect(r).toEqual([]);
  });

  it("단서 — 매매업이어도 3~12호는 정상 가산", () => {
    const r = resolveGraceIntervals("access_road", d("2021-01-01"), d("2023-01-01"), undefined, ctx({ isRealEstateDealerMatter: true }));
    expect(r).toEqual([{ start: d("2021-01-01"), end: d("2023-01-01") }]);
  });
});
