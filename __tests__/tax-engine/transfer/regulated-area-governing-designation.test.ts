/**
 * `governingDesignationStart` — 양도일이 속한 **연속 지정 구간의 시작 효력일** (계획서
 * `docs/00-pm/regulated-area-region-code-match.plan.md` §5.1 M-C · §6.2 RC-9).
 *
 * 지역 해석은 `isRegulatedByBjdCodeIn`과 **같은 함수**다(별칭 → 5자리 → 서울 "11" 폴백 → 10자리 하위 규칙) —
 * 두 번째 매처를 두지 않는다(종전 `getFirstDesignatedDate`는 `r.code === regionCode` 정확 일치라
 * 10자리 법정동코드가 명부와 한 번도 맞지 않았다 — 결함 D-1·D-4).
 */
import { describe, it, expect } from "vitest";
import {
  REGULATED_REGIONS,
  governingDesignationStart,
  governingDesignationStartIn,
  isRegulatedByBjdCode,
  type RegulatedRegion,
} from "@/lib/tax-engine/data/regulated-areas";
import { PRE_DESIGNATION_CONTRACT_EXCLUSION } from "@/lib/tax-engine/legal-codes";

describe("RC-9 governingDesignationStart", () => {
  it.each([
    ["마포(서울 \"11\" 폴백)", "1144010100", "2019-06-01", "2017-08-03"],
    ["마포 5자리", "11440", "2019-06-01", "2017-08-03"],
    ["마포 · 2025.10.16. 재지정 후", "1144010100", "2026-08-01", "2025-10-16"],
    ["강남 10자리(명부 5자리)", "1168010100", "2019-06-01", "2017-08-03"],
    ["강남 · 서울 전역 해제 뒤에도 연속", "1168010100", "2024-01-01", "2017-08-03"],
    ["영통 · 광교 4개 동 밖(2020-02-21 편입)", "4111710500", "2020-07-01", "2020-02-21"],
    ["영통 · 광교택지 매탄동(2018-08-28부터 연속)", "4111710100", "2020-07-01", "2018-08-28"],
    ["팔달 · 광교 우만동 밖(2018-12-31 구 전역 확대 — 명부 날짜 아님)", "4111510100", "2019-06-01", "2018-12-31"],
    ["과천 · 재지정 구간", "4129010100", "2026-08-01", "2025-10-16"],
    ["광주 동구 통합 코드 12(명부는 구 코드 29)", "1221010100", "2021-06-01", "2020-12-18"],
    ["광주 동구 구 코드 29", "2911010100", "2021-06-01", "2020-12-18"],
  ])("%s %s @%s → %s", (_n, code, date, expected) => {
    expect(governingDesignationStart(code, date)).toBe(expected);
  });

  it.each([
    ["과천 · 해제 기간", "4129010100", "2024-01-01"],
    ["팔달 · 2018-12-30(광교 우만동 밖은 아직 미지정)", "4111510100", "2018-12-30"],
    ["영통 · 2020-02-20(광교 4개 동 밖)", "4111710500", "2020-02-20"],
    ["청주 · 2020-06-19 지정 전", "4311110100", "2020-06-18"],
    ["빈 코드", "", "2021-06-01"],
  ])("%s %s @%s → null(양도일에 비조정)", (_n, code, date) => {
    expect(governingDesignationStart(code, date)).toBeNull();
  });

  it("시작일의 전날은 비조정 · 시작일부터 양도일까지는 조정 (구간 정의 자체)", () => {
    expect(isRegulatedByBjdCode("4111510100", "2018-12-30").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("4111510100", "2018-12-31").isRegulated).toBe(true);
    expect(isRegulatedByBjdCode("4111710500", "2020-02-20").isRegulated).toBe(false);
    expect(isRegulatedByBjdCode("4111710500", "2020-02-21").isRegulated).toBe(true);
  });
});

/**
 * 하위 규칙 **종료 다음 날**이 편입일인 경우 — 실데이터에서는 그 날(2018-12-31·2020-02-21)이 우연히 다른 지역의
 * 지정일·해제 다음 날과 겹쳐 경계 집합에 들어온다(뮤테이션 probe: `appliesTo + 1` 경계를 빼도 실데이터 단언은
 * 전부 통과했다). 그 우연에 기대지 않도록 fixture로 고정한다.
 */
describe("fixture — 하위 규칙 경계만으로 생기는 편입일", () => {
  const regions: RegulatedRegion[] = [
    {
      code: "99001",
      name: "가상시 포함구",
      designations: [{ designatedDate: "2020-01-01", releasedDate: null }],
      includedSubCodes: [{ codePrefix: "9900110", name: "택지", appliesFrom: "2020-01-01", appliesTo: "2020-05-31" }],
    },
    {
      code: "99002",
      name: "가상시 제외구",
      designations: [{ designatedDate: "2020-01-01", releasedDate: null }],
      excludedSubCodes: [{ codePrefix: "9900230", name: "제외면", appliesTo: "2020-08-31" }],
    },
  ];
  it("포함 지구 한정 규칙이 끝난 다음 날(2020-06-01)부터 지구 밖도 지정 → 그날이 시작", () => {
    expect(governingDesignationStartIn(regions, "9900120000", "2020-05-31")).toBeNull();
    expect(governingDesignationStartIn(regions, "9900120000", "2020-07-01")).toBe("2020-06-01");
    expect(governingDesignationStartIn(regions, "9900110000", "2020-07-01")).toBe("2020-01-01");
  });
  it("읍면 제외가 끝난 다음 날(2020-09-01)부터 그 면도 지정 → 그날이 시작", () => {
    expect(governingDesignationStartIn(regions, "9900230000", "2020-08-31")).toBeNull();
    expect(governingDesignationStartIn(regions, "9900230000", "2020-10-01")).toBe("2020-09-01");
  });
});

/**
 * 공고일 표가 명부의 **모든 가능한 구간 시작일**을 덮는가 — 명부에 새 차수를 append하고 표를 갱신하지
 * 않으면 엔진은 그 차수에서 배제를 열지 않고 경고만 한다(근거 없이 유리하게 적용하지 않는다). 그 누락을
 * 여기서 먼저 잡는다.
 */
describe("공고일 표 커버리지", () => {
  const boundaries = new Set<string>();
  for (const r of REGULATED_REGIONS) {
    for (const d of r.designations) boundaries.add(d.designatedDate);
    for (const s of [...(r.excludedSubCodes ?? []), ...(r.includedSubCodes ?? [])]) {
      if (s.appliesFrom) boundaries.add(s.appliesFrom);
    }
  }
  // 시도 전역 "11"은 5자리 엔트리가 없는 서울 구로 대표한다(마포).
  const codesOf = (code: string, subs: string[]) =>
    code.length === 2
      ? ["1144010100"]
      : [code, `${code}99999`, ...subs.map((p) => p.padEnd(10, "0"))];

  it("가능한 모든 시작일이 PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES에 있다", () => {
    const starts = new Set<string>();
    const dates = [...boundaries, "2018-12-31", "2020-02-21", "2022-11-14", "2026-09-29"];
    for (const r of REGULATED_REGIONS) {
      const subs = [...(r.excludedSubCodes ?? []), ...(r.includedSubCodes ?? [])].map((s) => s.codePrefix);
      for (const code of codesOf(r.code, subs)) {
        for (const d of dates) {
          const s = governingDesignationStart(code, d);
          if (s) starts.add(s);
        }
      }
    }
    const missing = [...starts].filter((s) => !(s in PRE_DESIGNATION_CONTRACT_EXCLUSION.ANNOUNCEMENT_DATES)).sort();
    expect(missing).toEqual([]);
    expect(starts.size).toBeGreaterThanOrEqual(9);
  });
});
