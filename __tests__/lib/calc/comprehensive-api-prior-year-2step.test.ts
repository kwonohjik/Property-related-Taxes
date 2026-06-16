/**
 * Phase B 통합 anchor — comprehensive-api 변환: 직전공시 단일 입력원 파생
 *
 * 설계: docs/02-design/features/comprehensive-prior-year-2step.engine.design.md
 * auto 모드 + 전 주택 priorAssessedValue 입력 시 변환이 previousYearAuto.priorHouseValues를
 * 파생(엔진 무변경)하는지 fetch mock으로 body 캡처해 검증.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callComprehensiveApi } from "../../../lib/calc/comprehensive-api";
import {
  defaultFormData,
  makeProperty,
} from "../../../lib/stores/comprehensive-wizard-store";

describe("Phase B — 변환 priorAssessedValue → previousYearAuto 파생", () => {
  let capturedBody: Record<string, unknown> | undefined;

  beforeEach(() => {
    capturedBody = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: { body: string }) => {
        capturedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ data: {} }) };
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("B-1: auto + 전 주택 priorAssessedValue → previousYearAuto.priorHouseValues 파생", async () => {
    const formData = {
      ...defaultFormData,
      assessmentYear: "2022",
      previousYearCapMode: "auto" as const,
      previousYearAutoIsOneHouse: false,
      properties: [
        { ...makeProperty(), assessedValue: "1300000000", priorAssessedValue: "1200000000" },
        { ...makeProperty(), assessedValue: "1400000000", priorAssessedValue: "1300000000" },
      ],
    };
    await callComprehensiveApi(formData);
    const auto = (capturedBody?.previousYearAuto ?? {}) as Record<string, unknown>;
    expect(auto.priorHouseValues).toEqual([1_200_000_000, 1_300_000_000]);
    expect(auto.assessedValue).toBe(2_500_000_000); // priorSum 단일 원천
  });

  it("B-2: 혼재(일부 미입력) → 통합 파생 안 함 (⑧ validation 차단 대상)", async () => {
    const formData = {
      ...defaultFormData,
      assessmentYear: "2022",
      previousYearCapMode: "auto" as const,
      properties: [
        { ...makeProperty(), assessedValue: "1300000000", priorAssessedValue: "1200000000" },
        { ...makeProperty(), assessedValue: "1400000000", priorAssessedValue: "" }, // 미입력
      ],
    };
    await callComprehensiveApi(formData);
    // allPriorAssessed=false(일부 미입력) → priorSum undefined → previousYearAuto 미생성 (⑧ validation 차단 대상)
    expect(capturedBody?.previousYearAuto).toBeUndefined();
  });

  it("B-3: none 모드 → previousYearAuto·priorAssessedValue 모두 미전송 (세부담상한 미적용)", async () => {
    const formData = {
      ...defaultFormData,
      assessmentYear: "2022",
      previousYearCapMode: "none" as const,
      properties: [
        { ...makeProperty(), assessedValue: "1300000000", priorAssessedValue: "1200000000" },
      ],
    };
    await callComprehensiveApi(formData);
    expect(capturedBody?.previousYearAuto).toBeUndefined();
    // none 모드: priorAssessedValue 입력돼 있어도 §122 layer-1 strip (모드가 전송 일괄 제어)
    const props = capturedBody?.properties as Array<Record<string, unknown>> | undefined;
    expect(props?.[0]?.priorAssessedValue).toBeUndefined();
  });
});
