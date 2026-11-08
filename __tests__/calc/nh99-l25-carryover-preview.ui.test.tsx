/**
 * @vitest-environment jsdom
 *
 * 이월과세 주택 — Step4 미리보기 2곳(레인 L25). calc·route 단언은 `.anchor.test.ts` / `__tests__/api/…l25…`.
 *  G: 한시 유예 나·다목 보유 2년 게이트(`grace-period-preview`) — 수정 전 칸 없는 `acquisitionDate` 잔재를 읽어 엔진과 반대로 떴다.
 *  R: §154⑤ 단서 최종 1주택 재기산 미리보기(`final-house-restart-preview`) — 같은 원인.
 * 부정형(안 뜬다)에는 같은 렌더의 긍정 짝을 같은 파일에 둔다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { graceForm, restartForm } from "./_helpers/l25-carryover-preview-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const text = (f: TransferFormData) => {
  cleanup();
  render(<Step4 form={f} onChange={() => {}} />);
  return document.body.textContent ?? "";
};
const MET = "충족 — 중과 경과조치 배제 대상";
const GATE = "미충족 — 양도 주택 보유기간이 2년 미만입니다";
const graceState = (f: TransferFormData) => {
  const t = text(f);
  // «미충족 …»에도 «충족 …» 부분 문자열이 있어 미충족을 먼저 가른다.
  return t.includes(GATE) ? "gate" : t.includes(`미충족 — 현재 입력`) ? "unmet" : t.includes(MET) ? "met" : "none";
};
const restartState = (f: TransferFormData) => {
  cleanup();
  render(<Step4 form={f} onChange={() => {}} />);
  const el = document.querySelector('[data-testid="final-house-restart-preview"]');
  if (!el) return "none";
  return el.className.includes("rose") ? "applied" : "not-applied";
};

describe("한시 유예 나·다목 — 보유 2년 게이트는 증여 등기접수일로 판정", () => {
  it("🔑 G1 잔재 빔 · 등기 2025-03-01 → «보유기간 2년 미만» 안내, «충족» 아님 (수정 전: 충족)", () => {
    expect(graceState(graceForm("", "2025-03-01"))).toBe("gate");
  });
  it("🔑 G2 잔재 2015 · 등기 2025-03-01 → «보유기간 2년 미만» (수정 전: 충족)", () => {
    expect(graceState(graceForm("2015-01-01", "2025-03-01"))).toBe("gate");
  });
  it("🔑 G3 잔재 빔 · 등기 2020-01-01 → «충족» (다목 충족 · 일치 셀)", () => {
    expect(graceState(graceForm("", "2020-01-01"))).toBe("met");
  });
  it("🔑 G4 잔재 2025-03-01 · 등기 2020-01-01 → «충족» (수정 전: 보유 2년 미만)", () => {
    expect(graceState(graceForm("2025-03-01", "2020-01-01"))).toBe("met");
  });
  it("미완 입력 — 등기접수일 빔 → 게이트 미적용: «보유기간 2년 미만»을 단정하지 않는다 (잔재가 있어도)", () => {
    expect(graceState(graceForm("2025-03-01", ""))).not.toBe("gate");
    expect(graceState(graceForm("", ""))).not.toBe("gate");
  });
  it("대조(불변) — 일반 매매 주택: 취득일 2025-03-01 → 보유 2년 미만 · 2020-01-01 → 충족", () => {
    expect(graceState(graceForm("2025-03-01", "", "purchase"))).toBe("gate");
    expect(graceState(graceForm("2020-01-01", "", "purchase"))).toBe("met");
  });
});

describe("§154⑤ 단서 재기산 미리보기 — 증여 등기접수일로 판정", () => {
  it("🔑 R1 잔재 빔 · 등기 2019-01-01 → 재기산 고지 (수정 전: 미리보기 없음)", () => {
    expect(restartState(restartForm("", "2019-01-01"))).toBe("applied");
  });
  it("🔑 R4 잔재 2021-09-01 · 등기 2019-01-01 → 재기산 (수정 전: 재기산 아님)", () => {
    expect(restartState(restartForm("2021-09-01", "2019-01-01"))).toBe("applied");
  });
  it("🔑 R2 잔재 빔 · 등기 2021-09-01 → 재기산 아님 (미리보기는 «재기산일이 되지 않습니다» 쪽)", () => {
    expect(restartState(restartForm("", "2021-09-01"))).toBe("not-applied");
  });
  it("🔑 R3 잔재 2015-03-01 · 등기 2021-09-01 → 재기산 아님 (수정 전: 재기산)", () => {
    expect(restartState(restartForm("2015-03-01", "2021-09-01"))).toBe("not-applied");
  });
  it("미완 입력 — 등기접수일 빔 → 미리보기 없음 (잔재가 있어도 — ⑧이 칸을 막는다)", () => {
    expect(restartState(restartForm("2019-01-01", ""))).toBe("none");
    expect(restartState(restartForm("", ""))).toBe("none");
  });
  it("대조(불변) — 일반 매매 주택: 취득일 2019 → 재기산 · 2021-09 → 아님", () => {
    expect(restartState(restartForm("2019-01-01", "", "purchase"))).toBe("applied");
    expect(restartState(restartForm("2021-09-01", "", "purchase"))).toBe("not-applied");
  });
});
