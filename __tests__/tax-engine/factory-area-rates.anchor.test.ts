/**
 * anchor — 「공장입지 기준고시」 [별표 1] 데이터셋 + **버전 게이트**
 *
 * 계획: docs/02-design/features/factory-site-standard-area-nbl.plan.md §1.3·§4.4
 *
 * ## 버전 게이트가 이 파일의 핵심이다
 *
 * 2026-02-25 개정은 **「제11차 한국표준산업분류」 반영**이다(제개정이유 실측). 즉 분류번호
 * 체계가 10차 → 11차로 **교체**됐다. 그 이전 시점에는 2018-162호(10차)가 적용법이므로
 * 현행 표를 쓰면 **같은 5자리 코드가 다른 업종을 가리켜** 면적률이 조용히 틀어진다.
 *
 * ⇒ 기준일이 시행일보다 이르면 조회가 **값을 주지 않아야** 한다. 그래야 호출부가
 *   직접입력을 요구한다(추정 금지 · 자동 fallback 금지).
 */
import { describe, it, expect } from "vitest";
import {
  FACTORY_AREA_RATE_EFFECTIVE_DATE,
  KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT,
  allFactoryAreaRates,
  isCurrentFactoryAreaRateApplicable,
  lookupFactoryAreaRate,
  searchFactoryAreaRates,
} from "@/lib/tax-engine/data/factory-area-rates";
import { computeFactoryStandardArea } from "@/lib/tax-engine/non-business-land/factory-land-standard-area";

const AFTER = new Date("2026-06-01"); // 현행 고시 시행 후
const BEFORE = new Date("2026-01-01"); // 2018-162호(KSIC 10차) 구간

describe("데이터셋 — 법제처 별표1 전량", () => {
  it("DATA-1: 480행 · KSIC 5자리 · 코드 중복 없음", () => {
    const rows = allFactoryAreaRates();
    expect(rows).toHaveLength(480);
    expect(rows.every((r) => /^\d{5}$/.test(r.code))).toBe(true);
    expect(new Set(rows.map((r) => r.code)).size).toBe(480);
  });

  it("DATA-2: 면적률은 고시 별표1의 7종뿐이다", () => {
    const rates = [...new Set(allFactoryAreaRates().map((r) => r.ratePercent))].sort((a, b) => a - b);
    expect(rates).toEqual([3, 5, 7, 10, 12, 15, 20]);
  });

  it("DATA-3: 업종명이 표 줄바꿈에서 잘리지 않았다", () => {
    // 표가 고정폭이라 긴 이름이 다음 줄로 감긴다. 이어붙이지 않으면
    // "레이더, 항행용 무선 기기 및 측량"에서 끊겨 자동완성 검색이 새어나간다.
    const e = allFactoryAreaRates().find((r) => r.code === "27211");
    expect(e?.name).toBe("레이더, 항행용 무선 기기 및 측량기구 제조업");
    // 어느 이름도 조사·접속으로 끝나지 않는다(잘림 신호)
    expect(allFactoryAreaRates().filter((r) => /(및|또는|,)$/.test(r.name))).toEqual([]);
  });

  it("DATA-4: 조심 2025서2489가 인용한 화학섬유(합성섬유) 12%와 일치한다", () => {
    // 재결례가 독립적으로 인용한 값 — 파싱 정확성의 외부 기준점
    expect(lookupFactoryAreaRate("20501", AFTER)).toMatchObject({
      name: "합성섬유 제조업",
      ratePercent: 12,
    });
  });

  it("DATA-5: 그 값으로 산출한 기준면적이 재결례 수치와 일치한다", () => {
    const rate = lookupFactoryAreaRate("20501", AFTER)!.ratePercent;
    const std = computeFactoryStandardArea([{ floorArea: 89865.838, ratePercent: rate }], 199115);
    expect(std.baseArea).toBeCloseTo(748881.98, 2); // 조심 2025서2489 <표13>
  });
});

// ────────────────────────────────────────────────────────────
describe("🔴 버전 게이트 — KSIC 10차 구간에는 현행 표를 주지 않는다", () => {
  it("GATE-1: 시행일은 2026-02-25 (제2026-016호 — 공포한 날부터 시행)", () => {
    expect(FACTORY_AREA_RATE_EFFECTIVE_DATE).toEqual(new Date("2026-02-25"));
  });

  it("GATE-2: 시행일 이후면 조회된다", () => {
    expect(isCurrentFactoryAreaRateApplicable(AFTER)).toBe(true);
    expect(lookupFactoryAreaRate("20501", AFTER)).toBeDefined();
  });

  it("GATE-3: 시행일 **이전**이면 값을 주지 않는다 (2018-162호 = KSIC 10차 구간)", () => {
    expect(isCurrentFactoryAreaRateApplicable(BEFORE)).toBe(false);
    expect(lookupFactoryAreaRate("20501", BEFORE)).toBeUndefined();
  });

  it("GATE-4: 시행일 당일은 포함된다 (경계)", () => {
    expect(isCurrentFactoryAreaRateApplicable(new Date("2026-02-25"))).toBe(true);
    expect(isCurrentFactoryAreaRateApplicable(new Date("2026-02-24"))).toBe(false);
  });

  it("GATE-5: 기준일 미상이면 주지 않는다 (추정 금지)", () => {
    expect(isCurrentFactoryAreaRateApplicable(undefined)).toBe(false);
    expect(lookupFactoryAreaRate("20501", undefined)).toBeUndefined();
  });

  it("GATE-6: 미등재 코드도 주지 않는다 (추정 금지)", () => {
    expect(lookupFactoryAreaRate("99999", AFTER)).toBeUndefined();
  });
});

describe("검색 — 목록 열람은 게이트와 무관하다", () => {
  it("SEARCH-1: 업종명 부분일치", () => {
    const hits = searchFactoryAreaRates("합성섬유");
    expect(hits.some((h) => h.code === "20501")).toBe(true);
  });

  it("SEARCH-2: 코드 부분일치", () => {
    expect(searchFactoryAreaRates("20501").map((h) => h.code)).toContain("20501");
  });

  it("SEARCH-3: 공백을 무시한다 (「합성 섬유」로도 찾힌다)", () => {
    expect(searchFactoryAreaRates("합성 섬유").some((h) => h.code === "20501")).toBe(true);
  });

  it("SEARCH-4: 빈 질의는 아무것도 주지 않는다 (전량 렌더 방지)", () => {
    expect(searchFactoryAreaRates("")).toEqual([]);
    expect(searchFactoryAreaRates("   ")).toEqual([]);
  });

  it("SEARCH-5: 검색은 기준일을 보지 않는다 — 자기 업종 코드는 확인할 수 있어야 한다", () => {
    // 값을 **채우는** 시점에만 게이트가 걸린다(GATE-3).
    expect(searchFactoryAreaRates("합성섬유").length).toBeGreaterThan(0);
  });
});

describe("지식산업센터 — 별표1이 아니라 고시 §4", () => {
  it("KIC-1: 40% 고정이며 상수는 단일 소스다", () => {
    expect(KNOWLEDGE_INDUSTRY_CENTER_RATE_PERCENT).toBe(40);
    // 별표1에 40%인 행은 없다 — 별도 근거임을 확인
    expect(allFactoryAreaRates().some((r) => r.ratePercent === 40)).toBe(false);
  });
});
