/**
 * 상속·증여 UI 리뷰 — G5 배치(공용컴포넌트·인쇄·저장) 순수 anchor.
 *
 * 이 배치의 공통 형태: **저장소에 이미 확립된 공용 수단이 있는데 그것을 안 쓴 곳**이다.
 * 그래서 anchor도 「공용 수단과 동일한가」를 잰다 — 로컬 재구현을 다시 만들면 깨진다.
 */

import { describe, it, expect } from "vitest";
import {
  formatGiftSaveMessage,
  buildGiftAutoSaveToast,
  isGiftFormEmpty,
  runGiftManualSave,
} from "@/components/calc/gift-tax-save-handler";
import {
  formatSaveMessage,
  buildAutoSaveToast,
  EMPTY_FORM_SENTINEL,
} from "@/components/calc/shared/save-handler-builders";

describe("IG-162 · IG-163 — 증여세 저장이 6세목 공통 헬퍼에 위임된다", () => {
  it("S-1: 토스트 포매터가 공용 구현과 «같은 함수»다 (로컬 재구현 아님)", () => {
    expect(formatGiftSaveMessage).toBe(formatSaveMessage);
    expect(buildGiftAutoSaveToast).toBe(buildAutoSaveToast);
  });

  it("S-2 (IG-162 양성): 결과가 없어도 «미결(draft)» 분기 문구가 나온다", () => {
    const msg = formatGiftSaveMessage({ id: "abcdef0123", created: true, isDraft: true });
    expect(msg.kind).toBe("info");
    expect(msg.text).toMatch(/임시저장/);
    // 종전 로컬 구현은 「결과를 먼저 계산하시면」으로 저장 자체를 거부했다
    expect(msg.text).not.toMatch(/결과를 먼저 계산/);
  });

  it("S-3 (IG-162 대조군): 빈 폼은 여전히 차단한다 — 무조건 저장이 아니다", () => {
    const msg = formatGiftSaveMessage(new Error(EMPTY_FORM_SENTINEL));
    expect(msg.kind).toBe("info");
    expect(msg.text).toMatch(/저장할 입력이 없습니다/);
  });

  it("S-4 (IG-163 양성): 190건 이상이면 한도 경고 라인이 붙는다", () => {
    const msg = formatGiftSaveMessage({ id: "abcdef0123", created: true, isDraft: false }, 195);
    expect(msg.text).toMatch(/저장 한도 195\/200건/);
  });

  it("S-5 (IG-163 음성·대조군): 190 미만이면 경고가 붙지 않는다", () => {
    const msg = formatGiftSaveMessage({ id: "abcdef0123", created: true, isDraft: false }, 10);
    expect(msg.text).not.toMatch(/저장 한도/);
  });

  it("S-6: 빈 폼 판정 — 증여일·재산·주식이 모두 없을 때만 빈 폼", () => {
    expect(isGiftFormEmpty({})).toBe(true);
    expect(isGiftFormEmpty({ giftDate: "" , giftItems: [], stockItems: [] })).toBe(true);
    expect(isGiftFormEmpty({ giftDate: "2024-01-01" })).toBe(false);
    expect(isGiftFormEmpty({ giftItems: [{}] })).toBe(false);
    expect(isGiftFormEmpty({ stockItems: [{}] })).toBe(false);
  });

  it("S-7: 빈 폼이면 EMPTY_FORM sentinel을 던진다 (NO_RESULT 아님)", async () => {
    await expect(
      runGiftManualSave({ form: {}, result: null, clientId: null }),
    ).rejects.toThrow(EMPTY_FORM_SENTINEL);
  });
});

// ════════════════════════════════════════════════
// 소스 구조 anchor — 렌더 픽스처가 과도하게 큰 지점
//
// IG-090은 위 렌더 anchor가 실제 DOM으로 증명한다. IG-071·IG-148·IG-128은 렌더에
// 결과 객체 전체(`deductionDetail` 등) 픽스처가 필요해 비용이 크므로, 「그 줄이
// 되돌려졌는가」를 소스에서 직접 잰다. 저장소에 이미 있는 정책 테스트 방식이다
// (`__tests__/components/minmax-function-notation-policy.test.ts`).
// ════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf-8");

describe("IG-071 · IG-148 — 접힘이 언마운트가 아니다 (소스 구조)", () => {
  it("S-8: 재산 평가 내역 — `{showValuation && (` 대신 hidden print:block", () => {
    const src = read("components/calc/results/InheritanceTaxResultView.tsx");
    expect(src).not.toMatch(/\{showValuation && \(/);
    expect(src).toMatch(/showValuation \? "" : "hidden print:block"/);
  });

  it("S-9: 상속공제 상세 내역 — `{showBreakdown && (` 대신 hidden print:block", () => {
    const src = read("components/calc/results/deduction-breakdown/DeductionBreakdownSection.tsx");
    expect(src).not.toMatch(/\{showBreakdown && \(/);
    expect(src).toMatch(/showBreakdown \? "" : "hidden print:block"/);
  });
});

describe("IG-128 · IG-093 — native 대신 공용 컴포넌트 (소스 구조)", () => {
  it("S-10: 전후 2개월 종가 평균은 CurrencyInput이다 (native 금액 input 금지)", () => {
    const src = read("components/calc/inheritance/stock/StockItemEditor.tsx");
    expect(src).toMatch(/<CurrencyInput[\s\S]{0,400}data-testid="ls-avg-price"/);
    expect(src).not.toMatch(/<input[\s\S]{0,400}data-testid="ls-avg-price"/);
  });

  it("S-11: 가업 사후관리 최대주주 유지 토글은 ToggleCard다 (native checkbox 금지)", () => {
    const src = read("app/calc/inheritance-postmgmt/page.tsx");
    expect(src).not.toMatch(/type="checkbox"/);
    expect(src).toMatch(/data-testid="fp-maintains-major-shareholder"/);
  });
});
