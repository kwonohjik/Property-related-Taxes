/**
 * 국외 부동산 — 국외 폼이 **국내 계산 경로로 새지 않는다**(U1 가드 · U2에서도 유지).
 * 단건 `callTransferTaxAPI`(국내 전용)는 국외 폼이면 던지고(국외는 `callForeignRealEstateAPI`), 다건 합산은 건별 차단 문구를 낸다.
 * 국외 건도 입력·검증은 다건 목록에서 받지만(사용자 결정 C-1) 합산 계산은 막는다 — 국외 자산 여러 개는 한 건 계산 안에서(사용자 결정 D-M).
 */
import { describe, it, expect, vi } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { FOREIGN_DOMESTIC_PATH_GUARD_MESSAGE, MULTI_FOREIGN_UNSUPPORTED_MESSAGE } from "@/lib/calc/transfer-foreign-messages";
import {
  calcPropertyCompletion,
  isPropertyReady,
  validateMultiSettings,
  validateMultiSupportedMode,
} from "@/lib/calc/multi-transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { foreignForm } from "./_foreign-form-fixture";

const item = (form: PropertyItem["form"]): PropertyItem => ({ propertyId: "p1", propertyLabel: "양도 1번", form, completionPercent: 0 });

describe("단건 — callTransferTaxAPI 가드", () => {
  it("국외 폼은 fetch 없이 던진다(빈 국내 자산이 조용히 계산되지 않는다)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(callTransferTaxAPI(foreignForm())).rejects.toThrow(FOREIGN_DOMESTIC_PATH_GUARD_MESSAGE);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("국내 폼은 가드에 걸리지 않는다(자산 입력 오류 등 종전 경로로 간다)", async () => {
    const f = { ...createDefaultTransferFormData(), assets: [] };
    await expect(callTransferTaxAPI(f)).rejects.toThrow("자산이 없습니다.");
  });
});

describe("다건 — 국외 건", () => {
  it("국외 건은 입력·검증을 통과하면 «준비됨»이다(⑧이 국외 규칙으로 본다)", () => {
    expect(isPropertyReady(item(foreignForm()))).toBe(true);
    expect(isPropertyReady(item(foreignForm({ foreignResidenceYears: "" })))).toBe(false);
  });

  it("완성도는 국외 입력 칸 기준 — 빈 건 낮고 채운 건 100", () => {
    expect(calcPropertyCompletion(foreignForm())).toBe(100);
    expect(calcPropertyCompletion(foreignForm({ foreignResidenceYears: "" }, [{ ...foreignForm().foreignAssets[0], transferAmount: "" }]))).toBeLessThan(100);
  });

  it("D-M: 차단 문구는 «한 건 계산 안에서 여러 개를 추가하세요» 안내다", () => {
    expect(MULTI_FOREIGN_UNSUPPORTED_MESSAGE).toContain("국외 자산은 한 건 계산 안에서 여러 개를 추가하세요");
  });

  it("합산 계산은 국외 건을 국내 합산 엔진으로 보내지 않고 막는다", () => {
    expect(validateMultiSupportedMode(foreignForm())).toBe(MULTI_FOREIGN_UNSUPPORTED_MESSAGE);
    const multi = {
      taxYear: 2026,
      properties: [item(foreignForm())],
      annualBasicDeductionUsed: "0",
      amendmentMode: false,
    } as unknown as MultiTransferFormData;
    expect(validateMultiSettings(multi)).toContain(MULTI_FOREIGN_UNSUPPORTED_MESSAGE);
  });

  it("국내 건은 종전대로(차단 없음)", () => {
    expect(validateMultiSupportedMode(createDefaultTransferFormData())).toBeNull();
  });
});
