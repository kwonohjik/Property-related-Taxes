/**
 * S02-4 (보류) — 2003.11.20.~2011.6.2. 양도분 「서울·과천·5개 신도시 거주 2년」의 부천시 범위는 **종전 동작 그대로**다.
 *
 * 「소득세법 시행령」 제154조제1항 괄호(2009.6.9. 시행본 MST 94701)의 대상은 「택지개발예정지구로 지정ㆍ고시된 … 중동 신도시지역」이지
 * 부천시 전역이 아니다. 다른 신도시는 구 단위인데 부천만 시 단위(4119)라는 리뷰 지적은 맞지만, 오정구·소사구가 지구 밖인지는
 * 법령·결정례(재산46014-394는 상동지구만 다룬다)에서 근거를 찾지 못했다. 근거 없이 판정을 비과세 쪽으로 바꾸지 않는다 —
 * 미확인 = 현행 유지 + 확인 필요(고지가 이미 있다). 근거(지구 지정·고시 도면)를 확보하면 `NEW_TOWN_PREFIXES`를 구 단위로 좁힌다.
 * 이 anchor는 그때까지 부천 전 코드가 「안일 수 있음」(요건 적용 + 확인 필요 고지)임을 고정한다.
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

describe("S02-4 보류 — 부천 전 코드는 현행(maybe) 유지", () => {
  it.each(["4119610100", "4119910100", "4119210100", "4119510100", "4119410100", "4119710100", "4119010100"])(
    "부천(%s)은 안일 수 있음 — 요건 적용 · 과세 + 확인 필요 고지",
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
