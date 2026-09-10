/**
 * 판례·결정례 검색 «고급 옵션» 이 법제처에 실제로 반영되는 형태로 나가는지 고정.
 *
 * 배경: 2026-09-11 전수 차등 실측(동일 쿼리 × 옵션 유/무 totalCnt 비교)에서 종전 20개
 * 옵션 키 중 **16개가 법제처에서 조용히 무시**됐다. 무시되는 필터는 없느니만 못하다 —
 * UI 가 "필터 적용 중" 배지를 띄우므로 사용자는 걸리지 않은 필터를 걸렸다고 믿는다.
 *
 * 이 anchor 는 두 가지를 못박는다:
 *   ① 살아남은 옵션이 **DRF 파라미터명**으로 변환돼 나간다 (caseNumber→nb, from/to→prncYd)
 *   ② 무시되는 옵션은 **아예 나가지 않는다**
 *
 * 정책: [[feedback_api_trigger_without_input_path_is_noop]] · [[feedback_negative_anchor_needs_positive_twin]]
 */
import { describe, it, expect } from "vitest";
import { buildDomainParams, buildPrncYd } from "@/lib/korean-law/client-decisions-search";
import { domainSearchOptionsSchema } from "@/lib/korean-law/types";
import type { DecisionDomain } from "@/lib/korean-law/types";

/** 법제처가 반영한다고 실측된 DRF 파라미터명 전체 */
const LIVE_DRF_PARAMS = ["curt", "nb", "prncYd"];

describe("OPT — prec 옵션은 DRF 파라미터명으로 변환돼 나간다", () => {
  it("OPT-1: caseNumber → nb (종전엔 caseNumber 그대로 보내 무시됐다)", () => {
    const p = buildDomainParams("prec", { caseNumber: "2018두56077" });
    expect(p).toEqual({ nb: "2018두56077" });
    expect(p).not.toHaveProperty("caseNumber");
  });

  it("OPT-1b: 화면에 보이는 출처별 표기를 넣어도 평문으로 정규화된다", () => {
    // 🔴 실측: nb=2025누972 → 1건 / nb=수원고등법원-2025-누-972 → **0건**.
    //    검색 결과 목록이 후자를 그대로 보여주므로, 정규화가 없으면 복붙이 항상 0건이다.
    expect(buildDomainParams("prec", { caseNumber: "수원고등법원-2025-누-972" })).toEqual({ nb: "2025누972" });
    expect(buildDomainParams("prec", { caseNumber: "대법원-2025-두-35727" })).toEqual({ nb: "2025두35727" });
    expect(buildDomainParams("prec", { caseNumber: "2025두35727" })).toEqual({ nb: "2025두35727" });
  });

  it("OPT-2: fromDate+toDate → prncYd 범위 하나 (종전엔 두 키를 따로 보내 무시됐다)", () => {
    const p = buildDomainParams("prec", { fromDate: "20200101", toDate: "20201231" });
    expect(p).toEqual({ prncYd: "20200101~20201231" });
    expect(p).not.toHaveProperty("fromDate");
    expect(p).not.toHaveProperty("toDate");
  });

  it("OPT-3: 시작만 지정 → 열린 끝이 아니라 원거리 종료값으로 닫는다", () => {
    // 🔴 `20200101~` 는 실측 **0건**을 돌려준다(조용한 전멸). 절대 그 형태로 보내면 안 된다.
    const p = buildDomainParams("prec", { fromDate: "20200101" });
    expect(p.prncYd).toBe("20200101~99991231");
    expect(p.prncYd.endsWith("~")).toBe(false);
  });

  it("OPT-4: 종료만 지정 → '~종료' (실측 동작)", () => {
    expect(buildDomainParams("prec", { toDate: "20201231" })).toEqual({ prncYd: "~20201231" });
  });

  it("OPT-5: 날짜 미지정이면 prncYd 자체를 보내지 않는다", () => {
    expect(buildDomainParams("prec", { curt: "대법원" })).toEqual({ curt: "대법원" });
  });

  it("OPT-6(긍정 짝): 실측 작동 옵션은 그대로 통과 — 전부 막는 게 아니다", () => {
    expect(buildDomainParams("prec", { curt: "대법원", caseNumber: "2018두1", fromDate: "20200101", toDate: "20201231" }))
      .toEqual({ curt: "대법원", nb: "2018두1", prncYd: "20200101~20201231" });
  });

  it("OPT-7: 단일 날짜는 법제처가 무시하므로 buildPrncYd 가 범위로 만든다", () => {
    expect(buildPrncYd("20200101", undefined)).toBe("20200101~99991231");
    expect(buildPrncYd(undefined, undefined)).toBeNull();
    // 하이픈·점 표기도 흡수
    expect(buildPrncYd("2020-01-01", "2020.12.31")).toBe("20200101~20201231");
  });
});

describe("OPT — 무시되는 옵션은 더 이상 나가지 않는다", () => {
  it("OPT-8: 타입에서 제거된 옵션은 런타임으로 흘러들어와도 나가지 않는다", () => {
    const p = buildDomainParams("prec", {
      curt: "대법원",
      // @ts-expect-error — 제거된 키. 구 클라이언트가 보내와도 DRF 로 새지 않아야 한다.
      cls: "양도", dpaYd: "20240101", rslYd: "20240101", gana: "ga", locGov: "서울",
    });
    expect(p).toEqual({ curt: "대법원" });
  });

  it("OPT-9: 옵션이 전부 무시되던 도메인은 빈 파라미터를 낸다", () => {
    for (const d of ["detc", "expc", "admrul", "trty", "ordin"] as DecisionDomain[]) {
      expect(buildDomainParams(d, {
        curt: "대법원", caseNumber: "2018두1", fromDate: "20200101", toDate: "20201231",
      })).toEqual({});
    }
  });

  it("OPT-10: 어떤 도메인·입력이 와도 DRF 파라미터는 실측 작동 4종을 넘지 않는다", () => {
    const all = new Set<string>();
    const domains: DecisionDomain[] = ["prec", "detc", "expc", "admrul", "trty", "ordin", "fsc"];
    for (const d of domains) {
      Object.keys(buildDomainParams(d, {
        curt: "대법원", caseNumber: "2018두1", fromDate: "20200101", toDate: "20201231",
      })).forEach((k) => all.add(k));
    }
    expect([...all].sort()).toEqual([...LIVE_DRF_PARAMS].sort());
  });
});

describe("OPT — 스키마가 옵션 키의 단일 소스다", () => {
  it("OPT-11: Zod 스키마 키가 실측 통과 옵션과 정확히 일치 (route 의 OPTION_KEYS 는 여기서 파생)", () => {
    expect(Object.keys(domainSearchOptionsSchema.shape).sort())
      .toEqual(["caseNumber", "curt", "fromDate", "toDate"]);
  });

  it("OPT-12: 제거된 키는 스키마를 통과해도 조용히 버려진다 (구 클라이언트 400 금지)", () => {
    expect(domainSearchOptionsSchema.parse({ cls: "양도", locGov: "서울", gana: "ga" })).toEqual({});
    expect(domainSearchOptionsSchema.parse({ curt: "대법원", cls: "양도" })).toEqual({ curt: "대법원" });
  });
});
