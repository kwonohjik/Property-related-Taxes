/**
 * anchor: 신고서 ③ 세율구분 코드 — 정본 「과세대상자산 및 세율」 표 매핑
 *
 * 정본: 「소득세법 시행규칙」 [별지 제84호서식] 작성방법 3~4쪽 (사용자 제공 정본 실측 2026-09-02).
 * 발견 COV-10 (docs/reviews/nbl-code-review-2026-09.md) — 신고서 표에 세율·세율구분 행이 없었다.
 *
 * ## 단일 소스
 *
 * 적용 호는 **엔진의 `rateClause`**를 쓴다. 표시 쪽에서 자산종류·보유기간으로 다시 유도하면
 * 이중 진실이 된다 — §104① 후단·§104⑦ 후단 비교의 **승자**는 엔진만 알기 때문이다.
 *
 * ## 정본 대응 (국내자산 1. 「소득세법」 §94①1호·2호)
 *
 * | 정본 | 코드 | 구분 |
 * |---|---|---|
 * | ① | 1-10 | 일반세율 토지·건물·부동산에 관한 권리 |
 * | ② ③ | 1-15 / 1-20 | 1~2년 / 1년 미만 (주택·조합원입주권 **제외**) |
 * | ④ ⑤ ⑥ | 1-40 / 1-39 / 1-46 | 주택·입주권 단기 (’21.6.1. 경계) |
 * | ⑦ | 1-23 | 1년 이상 보유 분양권(’21.6.1. 이후) |
 * | ⑧ | 1-30 | 미등기 양도 |
 * | ⑨ | 1-11 | 일반세율 +10% 비사업용토지 |
 * | ⑮ | **1-10** | 비사업용토지 **’09.3.16.~’12.12.31. 취득**하여 양도분 |
 * | ⑱ | 1-21 | 조정대상지역 내 분양권(’18.1.1.~’21.5.31.) |
 * | ⑲ ㉗ | 1-51 / 1-47 | 조정대상지역 1세대2주택 (’21.6.1. 경계) |
 * | ㉓ ㉝ | 1-55 / 1-49 | 조정대상지역 1세대3주택 이상 (’21.6.1. 경계) |
 *
 * ## 다루지 않는 코드
 *
 * 지정지역 계열(1-31·1-37·1-38·1-71·1-73)은 엔진 중과율 테이블에 항목 자체가 없고
 * 「소득세법」 §104의2 지정지역으로 **지정된 사실이 없다**(2026-09-02 확인) — N/A.
 * 주식·파생·신탁·국외전출세·국외자산은 이 표(부동산 신고서)의 대상이 아니다.
 */
import { describe, it, expect } from "vitest";
import { resolveFilingRateCode } from "@/components/calc/results/transfer/filing-rate-code";
import type { RateClause } from "@/lib/tax-engine/transfer-tax-rate-clause";

const code = (
  rateClause: RateClause | undefined,
  assetKind: string | undefined,
  transferDate: string,
  nblSurchargeExcluded?: boolean,
) =>
  resolveFilingRateCode({
    rateClause,
    assetKind: assetKind as never,
    transferDate,
    nblSurchargeExcluded,
  });

describe("[정본 ③] 비사업용 토지", () => {
  it("🔴 ⑨ 일반세율 +10% 비사업용토지 → 1-11", () => {
    expect(code("104-1-8", "land", "2024-06-01")).toBe("1-11");
  });

  it("🔴 ⑮ ’09.3.16.~’12.12.31. 취득분은 일반세율 코드 1-10", () => {
    // 부칙 <제9270호> §14①로 +10%p가 배제되면 「해당 호 자체가 §104①1호」다.
    expect(code("104-1-8", "land", "2024-06-01", true)).toBe("1-10");
  });
});

describe("[정본 ③] 일반·단기·미등기", () => {
  it("① 일반세율 토지 → 1-10", () => {
    expect(code("104-1-1", "land", "2024-06-01")).toBe("1-10");
  });

  it("② ③ 주택·입주권 제외 단기 → 1-15 / 1-20", () => {
    expect(code("104-1-2", "land", "2024-06-01")).toBe("1-15");
    expect(code("104-1-3", "land", "2024-06-01")).toBe("1-20");
    expect(code("104-1-3", "commercial_building", "2024-06-01")).toBe("1-20");
  });

  it("🔴 ④ ⑥ 주택·입주권 1년 미만 — ’21.6.1. 경계에서 1-40 → 1-46", () => {
    expect(code("104-1-3", "housing", "2021-05-31")).toBe("1-40");
    expect(code("104-1-3", "housing", "2021-06-01")).toBe("1-46");
    expect(code("104-1-3", "right_to_move_in", "2021-06-01")).toBe("1-46");
  });

  it("⑤ 주택·입주권 1~2년(’21.6.1. 이후) → 1-39", () => {
    expect(code("104-1-2", "housing", "2021-06-01")).toBe("1-39");
  });

  it("⑦ 1년 이상 보유 분양권(’21.6.1. 이후) → 1-23", () => {
    expect(code("104-1-1", "presale_right", "2021-06-01")).toBe("1-23");
  });

  it("⑧ 미등기 양도 → 1-30 (자산종류·시기 무관)", () => {
    expect(code("104-1-10", "land", "2024-06-01")).toBe("1-30");
    expect(code("104-1-10", "housing", "2010-01-01")).toBe("1-30");
  });
});

describe("[정본 ③] 조정대상지역 다주택 중과", () => {
  it("🔴 ⑲ ㉗ 1세대2주택 — ’21.6.1. 경계에서 1-51 → 1-47", () => {
    expect(code("104-7-1", "housing", "2021-05-31")).toBe("1-51");
    expect(code("104-7-1", "housing", "2021-06-01")).toBe("1-47");
  });

  it("🔴 ㉓ ㉝ 1세대3주택 이상 — ’21.6.1. 경계에서 1-55 → 1-49", () => {
    expect(code("104-7-3", "housing", "2021-05-31")).toBe("1-55");
    expect(code("104-7-3", "housing", "2021-06-01")).toBe("1-49");
  });

  it("⑱ 조정대상지역 내 분양권 → 1-21", () => {
    expect(code("104-1-4", "presale_right", "2020-06-01")).toBe("1-21");
  });
});

describe("[정본 ③] 단정할 수 없으면 비운다 (틀린 코드보다 「-」)", () => {
  it("호를 모르면 undefined", () => {
    expect(code(undefined, "land", "2024-06-01")).toBeUndefined();
  });

  it("정본에 대응 행이 없는 조합은 undefined", () => {
    // 분양권 1~2년은 ⑦(1년 이상 전체)이 덮으므로 2호 코드가 따로 없다.
    expect(code("104-1-2", "presale_right", "2021-06-01")).toBeUndefined();
    // 주택·입주권 1~2년은 ’21.6.1. 전 정본에 행이 없다(당시 2년 이상 = 일반세율).
    expect(code("104-1-2", "housing", "2021-05-31")).toBeUndefined();
    // 분양권 1년 미만도 ’21.6.1. 전에는 ⑱(조정대상지역) 외 행이 없다.
    expect(code("104-1-3", "presale_right", "2021-05-31")).toBeUndefined();
  });

  it("양도일이 없으면 ’21.6.1. 이후로 추정하지 않는다", () => {
    expect(
      resolveFilingRateCode({ rateClause: "104-1-3", assetKind: "housing", transferDate: undefined }),
    ).toBe("1-40");
  });
});
