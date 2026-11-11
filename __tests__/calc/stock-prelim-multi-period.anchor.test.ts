/**
 * 주식 «예정신고 + 다반기 합산» 안내 판정 anchor (V-10 · Q-1 a)
 *
 * 계획서: docs/00-pm/stock-prelim-multihalf-v10.plan.md
 *
 * 합산 계산의 합계는 신고 유형·반기와 무관하게 **과세기간 누계**다(V-9). 신고 유형이 예정이고 합산된 국내 종목이
 * 서로 다른 반기(§105①2호)에 걸칠 때만 안내한다. 세액·전송 판정은 건드리지 않는다.
 */
import { describe, it, expect } from "vitest";
import { judgePrelimMultiPeriod } from "@/lib/calc/stock-prelim-multi-period";

const it1 = (transferDate: string, marketType = "unlisted") => ({ transferDate, marketType });

describe("PM-1 안내가 필요한 입력", () => {
  it("PM-1-1 예정 + 상반기·하반기 → 두 반기를 돌려준다", () => {
    const r = judgePrelimMultiPeriod("preliminary", [it1("2025-03-01"), it1("2025-09-01")]);
    expect(r?.periods).toEqual(["2025년 상반기", "2025년 하반기"]);
  });

  it("PM-1-2 반기 경계 — 6/30은 상반기, 7/1은 하반기", () => {
    const r = judgePrelimMultiPeriod("preliminary", [it1("2025-06-30"), it1("2025-07-01")]);
    expect(r?.periods).toEqual(["2025년 상반기", "2025년 하반기"]);
  });

  it("PM-1-3 3종목이 세 반기·두 연도에 걸쳐도 중복 없이 시간순", () => {
    const r = judgePrelimMultiPeriod("preliminary", [
      it1("2025-09-01"),
      it1("2025-03-01"),
      it1("2026-02-01"),
      it1("2025-04-01"),
    ]);
    expect(r?.periods).toEqual(["2025년 상반기", "2025년 하반기", "2026년 상반기"]);
  });
});

describe("PM-2 안내하지 않는 입력", () => {
  it("PM-2-1 같은 반기 다종목 — 한 신고서(§105①2호)", () => {
    expect(judgePrelimMultiPeriod("preliminary", [it1("2025-03-01"), it1("2025-05-10")])).toBeUndefined();
  });

  it("PM-2-2 확정·수정 신고는 과세기간 전체를 합산하는 유형이라 해당 없다", () => {
    expect(judgePrelimMultiPeriod("final", [it1("2025-03-01"), it1("2025-09-01")])).toBeUndefined();
    expect(judgePrelimMultiPeriod("revised", [it1("2025-03-01"), it1("2025-09-01")])).toBeUndefined();
  });

  it("PM-2-3 종목 1건 — 합산이 아니다", () => {
    expect(judgePrelimMultiPeriod("preliminary", [it1("2025-03-01")])).toBeUndefined();
  });

  it("PM-2-4 국외주식은 예정신고 대상이 아니라 기간 판정에서 뺀다(§105① 본문 괄호)", () => {
    expect(
      judgePrelimMultiPeriod("preliminary", [it1("2025-03-01"), it1("2025-09-01", "foreign_stock")]),
    ).toBeUndefined();
  });

  it("PM-2-5 기타자산(달 단위 §105①1호)은 이 안내의 범위 밖이다 — 반기 판정에서 뺀다", () => {
    expect(
      judgePrelimMultiPeriod("preliminary", [it1("2025-03-01"), it1("2025-09-01", "other_asset")]),
    ).toBeUndefined();
  });

  it("PM-2-6 양도일이 비었거나 형식이 덜 찬 종목은 무시한다", () => {
    expect(judgePrelimMultiPeriod("preliminary", [it1("2025-03-01"), it1(""), it1("2025-9-1")])).toBeUndefined();
  });

  it("PM-2-7 신고 유형 미지정은 예정(3중 패턴 default)으로 본다", () => {
    expect(judgePrelimMultiPeriod(undefined, [it1("2025-03-01"), it1("2025-09-01")])?.periods).toHaveLength(2);
  });
});
