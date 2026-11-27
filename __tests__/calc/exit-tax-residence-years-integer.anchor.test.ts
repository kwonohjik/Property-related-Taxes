/**
 * 국외전출세 거주 연수(`etYearsResidentLast10`) — ⑧ ↔ ⑫ 패리티 (14지점 점검 F3)
 *
 * Zod(⑫)는 `z.number().int().min(0)`인데 ⑧은 0 미만·빈값만 막아 5.5를 통과시켰다 → 서버 400.
 * 소득세법 §118의9①1호는 «국내에 주소나 거소를 둔 기간의 합계가 5년 이상일 것» — 판정 임계가 5년뿐이고
 * 세액은 거주 연수와 무관하므로 «만 년(정수, 절사)»이면 충분하다(4년 11개월 → 4 → 5년 미만 동일).
 * 소수는 ⑧이 막는다(조용한 절사 금지).
 */
import { describe, it, expect } from "vitest";
import { validateAllSteps } from "@/lib/calc/stock-transfer-tax-validate";
import { buildExitTaxApiBody } from "@/lib/calc/stock-transfer-tax-api-foreign-exit";
import { exitTaxInputSchema } from "@/lib/api/stock-transfer-exit-tax-schema";
import { exitForm } from "../_helpers/exit-tax-2027-form";

const client = (years: string) =>
  validateAllSteps(exitForm({ etYearsResidentLast10: years })).filter((e) => e.severity === "error");
const server = (years: string) =>
  exitTaxInputSchema.safeParse(buildExitTaxApiBody(exitForm({ etYearsResidentLast10: years })));

describe("F3 거주 연수 정수 — ⑧ = ⑫", () => {
  for (const [years, blocked] of [
    ["10", false],
    ["5", false],
    ["4", false], // 5년 미만(납세의무 없음 — warning) 이지만 입력은 유효
    ["0", false],
    ["5.5", true],
    ["4.9", true],
    ["0.5", true],
  ] as const) {
    it(`거주 ${years} → ${blocked ? "차단" : "통과"} (⑧·⑫ 동일)`, () => {
      expect(client(years).length > 0, `⑧ ${JSON.stringify(client(years).map((e) => e.message))}`).toBe(blocked);
      expect(!server(years).success).toBe(blocked);
    });
  }

  it("소수 입력 ⑧ 오류는 거주 연수 칸을 가리키고 정수·절사 방법을 안내한다", () => {
    const errs = client("5.5").filter((e) => e.field === "etYearsResidentLast10");
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toContain("정수");
  });

  it("'5.' 처럼 입력 도중 소수점만 남은 값은 정수 5로 본다(⑫도 5)", () => {
    expect(client("5.").length).toBe(0);
    expect(server("5.").success).toBe(true);
  });
});
