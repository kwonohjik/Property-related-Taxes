/**
 * anchor: 인천 자치구 재편(2026-07-01) 후에도 조정대상지역 이력이 매칭되는가 — D-5.
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md §6-F.2
 *
 * [법령 — 「인천광역시 제물포구ㆍ영종구 및 검단구 설치 등에 관한 법률」
 *  법령ID 014604 · 공포 2025-12-30 · **시행 2026-07-01** · 법제처 실측 2026-08-01]
 *   §2① 인천광역시 **중구 및 동구를 각각 폐지**한다.
 *   §2② 제물포구 = 종전 중구의 열거 법정동 + **종전 동구 전역**
 *        영종구   = 종전 중구 중 **제물포구 관할을 제외한 지역**
 *        검단구   = 종전 서구의 백석동·마전동 등 + 시천·검암·오류동 북부
 *   (서구 → **서해구** 개칭도 같은 날 시행 — 자치법규 642건 시행일 2026-07-01로 확인)
 *
 * 🔴 결함이었던 것: 지정 이력이 구 코드(중구 28110·동구 28140·서구 28260)로만 있어
 *    현행 PNU(28125·28155·28275·28290)가 **매칭되지 않았다**. 게다가 인천(`28`)이
 *    수록 시도라 `confidence: "high"`로 「진짜 미지정」이라 **단정**했다 — 안내조차 없었다.
 *
 * ⚠️ 전남·광주(코드만 바뀐 1:1)와 달리 **구역이 N:M으로 분할·병합**돼 별칭으로 풀 수 없다.
 *    특히 조정지역에서 빠졌던 4개 동(을왕·남북·덕교·무의)이 **영종구로 이동**해
 *    법정동(10자리) 단위 판정이 필요하다: `28110149~152` → `28155105~108`(Vworld 실측).
 */
import { describe, it, expect } from "vitest";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";

/** 인천 조정대상지역 지정 기간 중 하루 */
const DURING = "2021-06-01";
/** 4개 동 제외가 적용되기 **전** */
const BEFORE_EXCLUSION = "2020-09-01";
/** 해제 후 */
const AFTER_RELEASE = "2023-01-01";

describe("[D-5] 인천 자치구 재편 — 조정대상지역 이력 매칭", () => {
  it.each([
    ["2812510100", "제물포구 (구 중구 도심 + 동구 전역)"],
    ["2827510100", "서해구 (구 서구)"],
    ["2829010100", "검단구 (구 서구 북부)"],
  ])("🔴 %s %s → 지정 (2021-06-01)", (code) => {
    const r = isRegulatedByBjdCode(code, DURING);
    expect(r.isRegulated).toBe(true);
    expect(r.confidence).toBe("high");
  });

  it("🔴 영종구 — 조정지역이었던 동은 지정", () => {
    // 중산동(28155101)·운남동·운서동·운북동은 제외 목록에 없었다.
    expect(isRegulatedByBjdCode("2815510100", DURING).isRegulated).toBe(true);
    expect(isRegulatedByBjdCode("2815510300", DURING).isRegulated).toBe(true); // 운서동
  });

  it("🔴 영종구 — 제외됐던 4개 동은 미지정 (구역 재편으로 이동한 예외)", () => {
    // 구 28110149~152(을왕·남북·덕교·무의) → 현행 28155105~108
    for (const code of ["2815510500", "2815510600", "2815510700", "2815510800"]) {
      expect(isRegulatedByBjdCode(code, DURING).isRegulated, code).toBe(false);
    }
  });

  it("제외 적용일(2020-12-18) 전에는 4개 동도 지정이었다 (시점 경계)", () => {
    expect(isRegulatedByBjdCode("2815510500", BEFORE_EXCLUSION).isRegulated).toBe(true);
  });

  it("해제 후에는 전부 미지정 (기간 판정이 흐려지지 않는다)", () => {
    for (const code of ["2812510100", "2815510100", "2827510100", "2829010100"]) {
      expect(isRegulatedByBjdCode(code, AFTER_RELEASE).isRegulated, code).toBe(false);
    }
  });

  it("구 코드도 종전대로 (회귀 — 저장된 이력·수동 입력)", () => {
    expect(isRegulatedByBjdCode("2811010100", DURING).isRegulated).toBe(true); // 중구
    expect(isRegulatedByBjdCode("2814010100", DURING).isRegulated).toBe(true); // 동구
    expect(isRegulatedByBjdCode("2826010100", DURING).isRegulated).toBe(true); // 서구
    expect(isRegulatedByBjdCode("2811014900", DURING).isRegulated).toBe(false); // 구 을왕동
  });

  it("인천 내 미지정 지역은 그대로 (무차별 지정 아님)", () => {
    expect(isRegulatedByBjdCode("2871010100", DURING).isRegulated).toBe(false); // 강화군
    expect(isRegulatedByBjdCode("2872010100", DURING).isRegulated).toBe(false); // 옹진군
  });
});
