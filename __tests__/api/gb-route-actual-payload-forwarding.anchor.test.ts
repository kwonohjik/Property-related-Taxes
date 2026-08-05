/**
 * Pre-Do anchor — 실가 경로 payload 전달을 **구조적으로** 보장한다 (2026-08-06)
 *
 * 계획서: `docs/02-design/features/general-building-part-major-acquisition.plan.md` §12
 *
 * ## 왜 소스 텍스트를 검사하는가
 *
 * `dispatchGeneralBuilding`의 실가 경로 호출부는 payload 필드를 **하나씩 나열**하고 있었다.
 * 그래서 새 필드를 추가할 때 그 목록에 넣는 것을 잊으면 Zod·타입·테스트 어디에도 걸리지 않고
 * **조용히 사라진다**(메모리 `feedback_explicit_prop_mapping_strip`).
 *
 * 이 결함은 **두 번** 났고 둘 다 과대과세였다:
 *   · 파트 취득가액 2필드 누락 → 분리 ON + 두 파트 실가에서 취득가액 0 (139,033,991원)
 *   · 파트 자본적지출 2필드 누락 → P5 직접 귀속이 한 번도 적용되지 않음
 *
 * 값 단언(P-1~P-4)은 **이미 아는 필드**만 지킨다. 다음에 추가될 필드는 지켜주지 못한다.
 * 그래서 전달 **방식**을 고정한다 — 스프레드면 새 필드가 자동으로 흐르고, 나열로 되돌아가면
 * 이 테스트가 깨진다. (선례: 「Pick 목록 계약 개수 가드」 소스 텍스트 검사)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve(process.cwd(), "app/api/calc/transfer/general-building-route-helper.ts");

describe("실가 경로 payload는 스프레드로 전달한다", () => {
  const src = readFileSync(SRC, "utf8");

  it("🔴 실가 경로 호출부가 `coercedGbRaw`를 **스프레드**한다 (필드 나열 금지)", () => {
    // dispatch의 actualPriceMode 분기만 잘라낸다.
    const start = src.indexOf("actualPriceMode === true");
    expect(start).toBeGreaterThan(-1);
    const branch = src.slice(start, src.indexOf("taxYear, annualBasicDeductionUsed", start));
    expect(branch).toMatch(/\.\.\.\(coercedGbRaw as/);
  });

  it("파트 취득가액·자본적지출을 **개별 나열하지 않는다** — 스프레드가 덮으므로 불필요하다", () => {
    const start = src.indexOf("actualPriceMode === true");
    const branch = src.slice(start, src.indexOf("taxYear, annualBasicDeductionUsed", start));
    // 나열이 남아 있으면 「빠뜨릴 수 있는 목록」이 그대로 존재한다는 뜻이다.
    expect(branch).not.toMatch(/landAcquisitionPrice:\s*coercedGbRaw/);
    expect(branch).not.toMatch(/landDirectExpenses:\s*coercedGbRaw/);
  });

  it("함수 인자·Date 변환값은 스프레드 **뒤에** 명시 override한다 (덮어쓰기 순서)", () => {
    const start = src.indexOf("actualPriceMode === true");
    const branch = src.slice(start, src.indexOf("taxYear, annualBasicDeductionUsed", start));
    const spreadAt = branch.search(/\.\.\.\(coercedGbRaw as/);
    // 함수 파라미터에서 오는 값들은 payload에 없거나 raw 상태라 반드시 나중에 덮어써야 한다.
    for (const key of ["totalTransferPrice", "actualAcquisitionPrice", "landAcquisitionDate"]) {
      const at = branch.indexOf(`${key}`, spreadAt);
      expect(at, `${key}가 스프레드 뒤에 없다`).toBeGreaterThan(spreadAt);
    }
  });
});

describe("파일 크기 정책", () => {
  it("분리 후 ≤700줄 (트리거 800 · 착지 목표 700)", () => {
    expect(readFileSync(SRC, "utf8").split("\n").length).toBeLessThanOrEqual(700);
  });
});
