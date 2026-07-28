/**
 * anchor — getBrExposPubuseAreaInfo 서버 필터 파라미터 형식 (R6 실 API 실측 고정).
 *
 * ## 배경
 *
 * PR #737(집합건물 세대 전유+공용 연면적 자동조회)의 유일한 블로커는
 * "`dongNm`/`hoNm` 실 응답 형식 미검증"이었다(`docs/00-pm/transfer-open-items.plan.md` R6).
 * 2026-07-28 로컬 `MOLIT_RTMS_API_KEY`로 실 호출해 확정했다.
 *
 * ## 실측 (은마아파트 PNU 1168010600 / bun=0316 / ji=0000)
 *
 * | 쿼리 | totalCount |
 * |---|---|
 * | `dongNm=1` + `hoNm=1410호` | **5** (전유 1행 95.18 + 공용 4행 7.32 = 102.5㎡) |
 * | `hoNm=1410` (접미사 없음) | 0 |
 * | `hoNm=제1410호` | 0 |
 * | `dongNm=1동` | 0 |
 * | `dongNm=제1동` | 0 |
 * | 필터 없음 | 24,066 (그중 **100건만** 반환 — numOfRows 캡) |
 *
 * ⇒ 서버 필터는 **정확 문자열 일치**이고, 응답 `hoNm`은 "1410호"·"21호"처럼 접미사를 포함한다.
 *   폼은 `unitDong="201동"`·`unitHo="3204"`를 주므로 **둘 다 그대로 보내면 영구 0건**이었다.
 *   (= 배포해도 항상 수동 fallback으로 떨어지는 상태였다.)
 *
 * 실 네트워크는 테스트에서 호출하지 않는다(E2E mock 원칙 — memory
 * `feedback_gov_site_lookup_weak_tls_pnu_params`). 위 실측을 **변환 규칙으로** 고정한다.
 */
import { describe, it, expect } from "vitest";
import {
  toExposQueryDong,
  toExposQueryHo,
} from "@/lib/tax-engine/data/building-standard-price/building-register-map";

describe("toExposQueryHo — hoNm은 접미 '호'를 반드시 붙인다", () => {
  it("폼 입력 '3204'(접미사 없음) → '3204호'", () => {
    // 종전 구현은 '3204'를 그대로 보내 서버가 0건을 돌려줬다.
    expect(toExposQueryHo("3204")).toBe("3204호");
  });

  it("이미 '호'가 붙어 있으면 중복하지 않는다", () => {
    expect(toExposQueryHo("1410호")).toBe("1410호");
  });

  it("접두 '제'는 제거한다 — 'hoNm=제1410호'는 실측 0건", () => {
    expect(toExposQueryHo("제1410호")).toBe("1410호");
  });

  it("공백 제거", () => {
    expect(toExposQueryHo(" 21 호 ")).toBe("21호");
  });

  it("빈 값 → 빈 문자열 (호 없으면 세대 특정 불가 → 조회 자체를 하지 않는다)", () => {
    expect(toExposQueryHo("")).toBe("");
    expect(toExposQueryHo(undefined)).toBe("");
  });
});

describe("toExposQueryDong — dongNm은 접미 '동' 없이 보낸다", () => {
  it("폼 입력 '201동' → '201'", () => {
    // 종전 구현은 '201동'을 그대로 보냈다 — 실측 0건.
    expect(toExposQueryDong("201동")).toBe("201");
  });

  it("'제13동' → '13' (응답 bldNm은 '은마아파트 제13동'이지만 dongNm은 '13')", () => {
    expect(toExposQueryDong("제13동")).toBe("13");
  });

  it("접미사가 이미 없으면 그대로", () => {
    expect(toExposQueryDong("1")).toBe("1");
  });

  it("상가처럼 한글 동명도 통과 — 실측 dongNm='비'", () => {
    expect(toExposQueryDong("비")).toBe("비");
  });

  it("빈 값 → 빈 문자열 (단동 건물: dongNm 필터 생략)", () => {
    expect(toExposQueryDong("")).toBe("");
    expect(toExposQueryDong(undefined)).toBe("");
  });
});

describe("두 변환의 비대칭이 의도된 것임을 고정", () => {
  it("호는 접미사를 붙이고, 동은 뗀다 — 같은 규칙이 아니다", () => {
    // 이 비대칭이 실 API의 사실이다. 한쪽으로 통일하면 반드시 한쪽이 0건이 된다.
    expect(toExposQueryHo("1410")).toBe("1410호");
    expect(toExposQueryDong("1410동")).toBe("1410");
  });
});
