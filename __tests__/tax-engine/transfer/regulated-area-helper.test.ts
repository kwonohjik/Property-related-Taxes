/**
 * 조정대상지역 판정 헬퍼 anchor (P1 — 데이터 무관 로직 검증)
 *
 * 계획서: docs/02-design/features/regulated-area-bjd-history.plan.md
 * 케이스 매트릭스 C1~C18 + 변환 함수.
 *
 * ⚠️ FIXTURE의 법정동코드(특히 읍면/택지 접두)는 **로직 검증용 가상값**이다.
 *    실제 시군구/읍면 코드·시점은 사용자 확정 데이터 수령 시 REGULATED_REGIONS에 입력한다.
 *    (단 서울 전역/강남 갭·시점 경계는 교재 표 기준 실제값에 맞춤)
 */

import { describe, it, expect } from "vitest";
import {
  isRegulatedByBjdCodeIn,
  toRegulatedAreaHistoryFrom,
  type RegulatedRegion,
} from "@/lib/tax-engine/data/regulated-areas";

// 로직 검증용 fixture (지방 읍면/택지 접두는 가상값 — 코드 형태만 현실적)
const FIXTURE: RegulatedRegion[] = [
  // 예외 없는 시군구 (강남구 11680) — 2017-08-03부터 현재까지 개별 지정 유지
  {
    code: "11680",
    name: "서울특별시 강남구",
    designations: [{ designatedDate: "2017-08-03", releasedDate: null }],
  },
  // 읍면 제외 있는 시군구 (김포시 41570) — 한시 지정 + 통진읍 제외
  {
    code: "41570",
    name: "경기도 김포시",
    designations: [{ designatedDate: "2020-11-20", releasedDate: "2022-09-26" }],
    excludedSubCodes: [{ codePrefix: "4157025", name: "통진읍(가상 접두)" }],
  },
  // 재지정 케이스 (지정 → 해제 → 재지정)
  {
    code: "41460",
    name: "경기도 용인시(재지정 테스트)",
    designations: [
      { designatedDate: "2018-12-31", releasedDate: "2019-11-08" },
      { designatedDate: "2020-06-19", releasedDate: "2022-09-26" },
    ],
  },
  // 서울특별시 전역 (시도코드 "11") — 전역 지정 2구간. 그 외 구는 이 엔트리로 폴백.
  {
    code: "11",
    name: "서울특별시(전역)",
    designations: [
      { designatedDate: "2017-08-03", releasedDate: "2023-01-04" },
      { designatedDate: "2025-10-16", releasedDate: null },
    ],
  },
  // 포함 목록(택지지구) — 화성 동탄2: 화성(41590) 중 이 지구만 (가상 접두)
  {
    code: "41590",
    name: "경기도 화성시",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [{ codePrefix: "4159010", name: "동탄2택지(가상)" }],
  },
  // 고양: 2019-11-08~2020-06-18만 택지지구, 그 외 기간 전역 (포함규칙 기간 토글)
  {
    code: "41281",
    name: "경기도 고양시 덕양구(가상)",
    designations: [{ designatedDate: "2017-08-03", releasedDate: "2022-11-13" }],
    includedSubCodes: [
      { codePrefix: "4128110", name: "삼송택지(가상)", appliesFrom: "2019-11-08", appliesTo: "2020-06-18" },
    ],
  },
];

const judge = (bjdCode: string, date: string) => isRegulatedByBjdCodeIn(FIXTURE, bjdCode, date);

describe("isRegulatedByBjdCodeIn — 케이스 매트릭스", () => {
  it("C1: 10자리 지정 시군구, 예외 아님 → 지정(high)", () => {
    const r = judge("1168010100", "2024-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("C2: 10자리 지정 시군구, 제외 읍면 → 미지정(high)", () => {
    const r = judge("4157025300", "2021-01-01"); // 김포 통진읍(가상 접두 4157025)
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.basis).toContain("제외");
  });

  it("C3: 미지정 시군구 → 미지정(high)", () => {
    const r = judge("4111010100", "2024-01-01"); // 수원 장안구(fixture 없음)
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("C4: 5자리만, 제외 있는 시군구 → 지정(medium, 동 판정 불가)", () => {
    const r = judge("41570", "2021-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("medium");
  });

  it("C5: 5자리만, 예외 없는 시군구 → 지정(high)", () => {
    const r = judge("11680", "2024-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("C6: 코드 없음 → low (상위에서 boolean fallback 처리 대상)", () => {
    const r = judge("", "2024-01-01");
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("low");
  });

  it("C7: 지정 전 날짜 → 미지정(high)", () => {
    const r = judge("1168010100", "2017-01-01");
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("C8: 해제 후 날짜 → 미지정(high)", () => {
    const r = judge("41570", "2022-10-01");
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("high");
  });

  describe("C9: 재지정 구간 (지정→해제→재지정)", () => {
    it("1차 지정 구간 내 → 지정", () => {
      expect(judge("41460", "2019-01-01").isRegulated).toBe(true);
    });
    it("해제~재지정 사이 공백 → 미지정", () => {
      expect(judge("41460", "2020-01-01").isRegulated).toBe(false);
    });
    it("2차 지정 구간 내 → 지정", () => {
      expect(judge("41460", "2021-01-01").isRegulated).toBe(true);
    });
  });

  it("C10: 취득일/양도일 시점별 상이 — 같은 코드 다른 판정", () => {
    const code = "41570";
    expect(judge(code, "2021-06-01").isRegulated).toBe(true); // 취득=지정
    expect(judge(code, "2023-06-01").isRegulated).toBe(false); // 양도=미지정
  });

  it("경계: 지정일 당일·해제일 당일은 지정으로 본다", () => {
    expect(judge("41570", "2020-11-20").isRegulated).toBe(true);
    expect(judge("41570", "2022-09-26").isRegulated).toBe(true);
  });
});

describe("서울 시도 전역(코드 11) 폴백 — 시군구 우선", () => {
  it("C11: 전역 지정기간, 개별 엔트리 없는 구(마포) → 시도 폴백으로 지정(high)", () => {
    const r = judge("1144010100", "2020-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("C12: 전역 해제기간, 개별 엔트리 없는 구(마포) → 미지정(high)", () => {
    const r = judge("1144010100", "2024-01-01"); // 2023-01-05~2025-10-15 전역 해제
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("high");
  });

  it("C13: 전역 해제기간이라도 개별 지정 유지 구(강남) → 시군구 엔트리 우선, 지정", () => {
    expect(judge("1168010100", "2024-01-01").isRegulated).toBe(true);
  });

  it("C14: 전역 재지정(2025-10-16~) 후 마포 → 지정(high)", () => {
    const r = judge("1144010100", "2026-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });
});

describe("includedSubCodes — 포함 목록(택지지구만 지정)", () => {
  it("C15: 포함 지구 동 → 지정(high)", () => {
    const r = judge("4159010100", "2020-01-01"); // 화성 동탄2(가상 4159010)
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("C16: 포함 지구 외 동 → 미지정(high)", () => {
    const r = judge("4159020100", "2020-01-01"); // 화성 비지구
    expect(r.isRegulated).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.basis).toContain("지구 외");
  });

  describe("C17: 포함 기간 토글 (고양 — 택지기간만 지구, 그 외 전역)", () => {
    it("택지기간 내, 택지 동 → 지정", () => {
      expect(judge("4128110100", "2020-01-01").isRegulated).toBe(true);
    });
    it("택지기간 내, 비택지 동 → 미지정(지구 외)", () => {
      expect(judge("4128120100", "2020-01-01").isRegulated).toBe(false);
    });
    it("택지기간 밖(전역기간), 비택지 동 → 지정(전역)", () => {
      expect(judge("4128120100", "2018-06-01").isRegulated).toBe(true);
    });
  });

  it("C18: 5자리 + 포함 목록 → medium", () => {
    const r = judge("41590", "2020-01-01");
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("medium");
  });
});

describe("toRegulatedAreaHistoryFrom — 엔진 주입 변환", () => {
  it("type·regions 구조 + code/name/designations만 추출(하위규칙 제외)", () => {
    const history = toRegulatedAreaHistoryFrom(FIXTURE);
    expect(history.type).toBe("regulated_area_history");
    expect(history.regions).toHaveLength(6);

    const gimpo = history.regions.find((r) => r.code === "41570");
    expect(gimpo).toBeDefined();
    expect(gimpo!.designations).toEqual([
      { designatedDate: "2020-11-20", releasedDate: "2022-09-26" },
    ]);
    // 하위규칙(excluded/included)은 엔진 스키마에 없으므로 변환 결과에 없어야 함 (키 3개만)
    expect(Object.keys(gimpo!).sort()).toEqual(["code", "designations", "name"]);

    const hwaseong = history.regions.find((r) => r.code === "41590");
    expect(Object.keys(hwaseong!).sort()).toEqual(["code", "designations", "name"]);
  });

  it("빈 입력 → 빈 regions", () => {
    expect(toRegulatedAreaHistoryFrom([])).toEqual({
      type: "regulated_area_history",
      regions: [],
    });
  });
});
