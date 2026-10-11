/**
 * S02-4 anchor — 2003.11.20.~2011.6.2. 양도분 「서울·과천·5개 신도시 거주 2년」에서 부천시 전체를 신도시로 묶지 않는다.
 *
 * 「소득세법 시행령」 제154조제1항 괄호(2009.6.9. 시행본 MST 94701): 「서울특별시, 과천시 및 「택지개발촉진법」 제3조의 규정에
 * 의하여 택지개발예정지구로 지정ㆍ고시된 분당ㆍ일산ㆍ평촌ㆍ산본ㆍ중동 신도시지역에 소재하는 주택」 — 대상은 지정·고시된 지구다.
 * 다른 신도시는 구 단위(41135·41285·41287·41173)로 좁혔는데 부천만 시 단위(4119)였다.
 * 오정구(41196 현행 · 41199 폐지 전)는 중동 지구 밖(사용자 지시 2026-10-11 — 지리 사실, 고시 원문 미확인)이라 거주요건이 없다.
 * 소사구·원미구·단일시 코드는 지구 소재 가능성이 남아 「안일 수 있음」(확인 필요)로 둔다 — 단언하지 않고 현행을 고정한다.
 * 2009-06-15 양도 · 2005-01-10 취득 · 거주 6개월 — 보유 3년은 충족, 거주 2년은 미충족.
 */
import { describe, it, expect } from "vitest";
import { capitalNewTownLocation } from "@/lib/tax-engine/data/one-house-holding-residence-era";
import { observeCase, type RulingCase } from "../../calc/one-house-rulings/harness";

const mc = (code: string): RulingCase => ({
  id: "S02-4",
  docNo: "-",
  docDate: "-",
  basis: "current",
  today: "2009-06-15",
  summary: "",
  bucket: "match",
  form: {
    isOneHousehold: true,
    transferDate: "2009-06-15",
    contractTotalPrice: "300000000",
    asset: {
      assetKind: "housing",
      acquisitionDate: "2005-01-10",
      regionCode: code,
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "6",
    },
  } as RulingCase["form"],
});

describe("S02-4 — 부천 신도시 범위", () => {
  it.each(["4119610100", "4119910100"])("오정구(%s)는 지구 밖 — leaf out · 거주요건 없이 비과세 · 신도시 소재 보류 고지 없음", async (code) => {
    expect(capitalNewTownLocation(code)).toBe("out");
    const o = await observeCase(mc(code));
    expect(o.status).toBe(200);
    expect(o.isExempt).toBe(true);
    expect(o.undetermined).not.toContain("154-1-capital-newtown-location-unverified");
  });

  it.each(["4119210100", "4119510100", "4119410100", "4119710100", "4119010100"])(
    "(긍정 짝) 원미·소사·단일시(%s)는 안일 수 있음 — 요건 적용 · 과세 + 확인 필요 고지",
    async (code) => {
      expect(capitalNewTownLocation(code)).toBe("maybe");
      const o = await observeCase(mc(code));
      expect(o.isExempt).toBe(false);
      expect(o.undetermined).toContain("154-1-capital-newtown-location-unverified");
    },
  );

  it("서울·과천은 in, 분당은 maybe, 지구 없는 시·구(고양 덕양)는 out — 회귀 0", () => {
    expect(capitalNewTownLocation("1168010100")).toBe("in");
    expect(capitalNewTownLocation("4129010100")).toBe("in");
    expect(capitalNewTownLocation("4113510300")).toBe("maybe");
    expect(capitalNewTownLocation("4128110100")).toBe("out");
  });
});
