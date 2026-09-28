/**
 * anchor #72 — 증여의제(증여이익) 계산을 로컬 이력 세목 `gift_deemed`로 등록한다.
 *
 * 설계: docs/00-pm/gift39-72-100-103-deemed-history.plan.md (PR ①)
 * 종전: `DeemedGiftCalculator`가 `useState`만 써서 입력·결과가 어느 계층에도 남지 않았다.
 *   이관된 증여세 record에는 금액 1개(`giftItems[0]`)와 증여일만 남아, §29②1호 인자·산출근거가
 *   전량 소실됐다(리뷰 I-gift-tax-handoff.md:145 실측).
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
const saveSpy = vi.fn(async () => ({ id: "rec-1", created: true }));
vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { saveOrUpdateByBusinessKey: (...a: unknown[]) => saveSpy(...(a as [])) },
}));

import { LOCAL_TAX_TYPES } from "@/lib/storage/types";
import { TAX_TYPE_ROUTES } from "@/lib/storage/tax-type-routes";
import { TAX_LABEL, generateTitle } from "@/lib/storage/title-generator";
import { extractBusinessKey } from "@/lib/storage/business-key";
import { resumeCalculationRecord } from "@/lib/calc/history-resume-entry";
import { deemedGiftHeadline } from "@/lib/calc/gift-deemed-history";
import { DeemedGiftCalculator } from "@/components/calc/deemed-gift/DeemedGiftCalculator";
import { INITIAL_DEEMED } from "@/components/calc/deemed-gift/deemed-form-state";
import type { CalculationRecord } from "@/lib/storage/types";

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  push.mockClear();
  saveSpy.mockClear();
  vi.unstubAllGlobals();
});

const CI_FORM = {
  ...INITIAL_DEEMED,
  type: "capital_increase" as const,
  giftDate: "2026-03-02",
  ciPrePrice: "10,000",
  ciPreShares: "100,000",
  ciNewPrice: "5,000",
  ciIssuedShares: "100,000",
  ciForfeitedShares: "40,000",
};

describe("#72 gift_deemed 세목 등록", () => {
  it("[GD-1] 세목·라우트·라벨이 등록돼 있다", () => {
    expect(LOCAL_TAX_TYPES).toContain("gift_deemed");
    expect(TAX_TYPE_ROUTES.gift_deemed).toBe("/calc/gift-deemed");
    expect(TAX_LABEL.gift_deemed).toBe("증여이익");
  });

  it("[GD-2] 제목이 유형과 증여일을 드러낸다 — 날짜가 없으면 유형만", () => {
    expect(generateTitle("gift_deemed", { type: "capital_increase", giftDate: "2026-03-02" }, "2026-09-28T00:00:00Z"))
      .toBe("증여이익 — 증자에 따른 이익 (증여 2026.03.02)");
    expect(generateTitle("gift_deemed", { type: "merger", giftDate: "" }, "2026-09-28T00:00:00Z"))
      .toBe("증여이익 — 합병에 따른 이익");
  });

  it("[GD-3] businessKey는 만들지 않는다 — 인적 식별 필드가 없어 content 폴백(증여세와 같음)", () => {
    expect(extractBusinessKey("gift_deemed", { type: "capital_increase", giftDate: "2026-03-02" })).toBeNull();
  });

  it("[GD-4] 이력 재개는 폼을 넘기고 계산기로 이동한다 — 결과는 넘기지 않는다", async () => {
    const record = {
      id: "r1", userId: "u", taxType: "gift_deemed", title: "t",
      inputData: CI_FORM, resultData: { deemedGiftValue: 100_000_000 },
      taxLawVersion: "2026-03-02", linkedCalculationId: null, clientId: null,
      createdAt: "2026-09-28T00:00:00Z", updatedAt: "2026-09-28T00:00:00Z",
    } as unknown as CalculationRecord;
    const blocked = await resumeCalculationRecord(record, { push } as never);
    expect(blocked).toBeNull();
    expect(push).toHaveBeenCalledWith("/calc/gift-deemed");
    expect(JSON.parse(sessionStorage.getItem("giftDeemedResumeInput")!)).toEqual(CI_FORM);
  });

  it("[GD-5] 이력 헤드라인 — 단건은 증여이익, cap-table은 수증자 합계, 없으면 -", () => {
    expect(deemedGiftHeadline({ deemedGiftValue: 100_000_000 })).toBe("100,000,000");
    expect(deemedGiftHeadline({ perBeneficiary: [{ total: 300_000_000 }, { total: 100_000_000 }] })).toBe("400,000,000");
    expect(deemedGiftHeadline({})).toBe("-");
  });
});

describe("#72 DeemedGiftCalculator 배선", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { type: "capital_increase", applied: true, deemedGiftValue: 100_000_000, breakdown: [], legalBasis: "상증법 §39" } }),
    })));
  });

  it("[GDV-1] 재개 payload를 마운트 때 한 번 소비해 폼을 복원한다", async () => {
    sessionStorage.setItem("giftDeemedResumeInput", JSON.stringify(CI_FORM));
    render(<DeemedGiftCalculator />);
    await waitFor(() => expect(screen.getByTestId("deemed-summary-card")).toHaveTextContent("증자에 따른 이익"));
    expect(sessionStorage.getItem("giftDeemedResumeInput")).toBeNull();
  });

  it("[GDV-2] 계산 결과가 나오면 gift_deemed로 자동저장된다 — 입력은 폼, 기준일은 증여일", async () => {
    sessionStorage.setItem("giftDeemedResumeInput", JSON.stringify(CI_FORM));
    render(<DeemedGiftCalculator />);
    await waitFor(() => expect(screen.getByTestId("deemed-summary-card")).toBeInTheDocument());
    expect(saveSpy).not.toHaveBeenCalled(); // 결과 전에는 저장하지 않는다 — 짝
    fireEvent.click(screen.getByTestId("deemed-calc-btn"));
    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const arg = (saveSpy.mock.calls[0] as unknown[])[0] as { taxType: string; inputData: { type: string }; taxLawVersion: string };
    expect(arg.taxType).toBe("gift_deemed");
    expect(arg.inputData.type).toBe("capital_increase");
    expect(arg.taxLawVersion).toBe("2026-03-02");
  });
});
