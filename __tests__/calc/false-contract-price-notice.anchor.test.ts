/**
 * anchor: 소득세법 §91② 「매매계약서 거래가액 허위기재」 차감 — 범위 밖 고지의 노출 술어 (결정 #48 A).
 *
 * 조문 원문 (KoreanLaw MST 280405, 시행 2026-01-01 · 2026-10-11 직독):
 *   §91② 「제94조제1항제1호 및 제2호의 자산을 매매하는 거래당사자가 매매계약서의 거래가액을 실지거래가액과 다르게 적은
 *         경우에는 … 비과세 또는 감면받았거나 받을 세액에서 다음 각 호의 구분에 따른 금액을 뺀다.」
 *         1호 비과세 / 2호 감면.
 *
 * 노출 조건(결정 #48 조건):
 *   · 비과세·부분 비과세·감면 결과만 — 받은 혜택이 없으면 뺄 세액도 없다.
 *   · 양도일 2011.7.1. 이후 — 그 전이면 §91②가 적용될 수 없어 고지가 법령상 거짓이 된다.
 *   · 양도일을 모르면 띄운다 — 확인된 과거 양도만 거둔다.
 *
 * 🔑 긍정/부정 짝: 뜨는 격자와 안 뜨는 격자를 같은 입력 모양에서 한 축씩만 뒤집는다.
 */
import { describe, it, expect } from "vitest";
import {
  FALSE_CONTRACT_PRICE_EFFECTIVE_DATE,
  FALSE_CONTRACT_PRICE_NOTICE_DETAIL,
  FALSE_CONTRACT_PRICE_NOTICE_LEAD,
  hasBenefitSubjectToFalseContractPrice,
  shouldShowFalseContractPriceNotice,
} from "@/lib/calc/false-contract-price-notice";
import { TRANSFER } from "@/lib/tax-engine/legal-codes/transfer";

const AFTER = "2024-06-01";

describe("§91② 고지 — 어떤 결과에 뜨는가 (혜택 보유 축)", () => {
  it("N-1 전액 비과세 → 뜬다", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: AFTER, isExempt: true })).toBe(true);
  });
  it("N-2 부분 비과세(고가주택, isExempt:false) → 뜬다", () => {
    expect(
      shouldShowFalseContractPriceNotice({ transferDate: AFTER, isExempt: false, isPartialExempt: true }),
    ).toBe(true);
  });
  it("N-3 감면 결과(2호) → 뜬다 (하위 결정 1)", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: AFTER, reductionAmount: 1 })).toBe(true);
  });
  it("N-4 혜택 없음(과세·감면 0) → 안 뜬다 (결론을 가를 때만)", () => {
    expect(
      shouldShowFalseContractPriceNotice({
        transferDate: AFTER,
        isExempt: false,
        isPartialExempt: false,
        reductionAmount: 0,
      }),
    ).toBe(false);
    expect(shouldShowFalseContractPriceNotice({ transferDate: AFTER })).toBe(false);
    expect(hasBenefitSubjectToFalseContractPrice({})).toBe(false);
  });
});

describe("§91② 고지 — 시행일 게이트 (법률 제10408호 부칙: 2011.7.1.)", () => {
  it("D-1 시행일 상수는 2011-07-01이다 (2011-01-01이 아니다)", () => {
    expect(FALSE_CONTRACT_PRICE_EFFECTIVE_DATE).toBe("2011-07-01");
  });
  it("D-2 경계: 2011-06-30은 안 뜨고 2011-07-01은 뜬다", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2011-06-30", isExempt: true })).toBe(false);
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2011-07-01", isExempt: true })).toBe(true);
  });
  it("D-3 2011-01-01 양도는 안 뜬다 (공포·법 전체 시행일과 ②항 시행일은 다르다)", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2011-01-01", isExempt: true })).toBe(false);
  });
  it("D-4 Date·ISO 문자열 입력도 같은 날짜로 읽는다", () => {
    expect(shouldShowFalseContractPriceNotice({ transferDate: new Date(2011, 5, 30), isExempt: true })).toBe(false);
    expect(shouldShowFalseContractPriceNotice({ transferDate: new Date(2011, 6, 1), isExempt: true })).toBe(true);
    expect(shouldShowFalseContractPriceNotice({ transferDate: "2011-06-30T00:00:00.000Z", isExempt: true })).toBe(false);
  });
  it("D-5 양도일을 모르면(미입력·파싱 불가) 띄운다 — 모르는 날짜로 고지를 거두지 않는다", () => {
    expect(shouldShowFalseContractPriceNotice({ isExempt: true })).toBe(true);
    expect(shouldShowFalseContractPriceNotice({ transferDate: "", isExempt: true })).toBe(true);
    expect(shouldShowFalseContractPriceNotice({ transferDate: "미정", isExempt: true })).toBe(true);
    // 단, 혜택이 없으면 날짜를 몰라도 안 뜬다.
    expect(shouldShowFalseContractPriceNotice({})).toBe(false);
  });
});

describe("§91② 고지 — 문구", () => {
  const text = `${FALSE_CONTRACT_PRICE_NOTICE_LEAD} ${FALSE_CONTRACT_PRICE_NOTICE_DETAIL}`;
  it("T-1 법문 표현을 쓰고 반영하지 않았음을 밝힌다", () => {
    expect(text).toContain("매매계약서의 거래가액을 실지거래가액과 다르게 적은");
    expect(text).toContain("거래당사자");
    expect(text).toContain("이 계산에는 반영하지 않았습니다");
    expect(text).toContain(TRANSFER.EXEMPTION_FALSE_CONTRACT_PRICE);
  });
  it("T-2 1호(비과세)·2호(감면) 차감 기준을 모두 말한다", () => {
    expect(text).toContain("비과세를 적용하지 않았을 때의 산출세액");
    expect(text).toContain("해당 감면세액");
    expect(text).toContain("차액 중 적은 금액");
  });
  it("T-3 산식 기호·함수 표기가 없다 (결과 화면 한국어 풀어쓰기)", () => {
    expect(text).not.toMatch(/min\(|max\(|floor\(|Math\./);
  });
  it("T-4 「실지거래가액으로 신고하면 상관없다」로 읽히는 문구가 없다 (신고 방식은 말하지 않는다)", () => {
    expect(text).not.toMatch(/신고하(면|더라도)/);
    expect(text).not.toMatch(/해당하지 않/);
  });
  it("T-5 조문 상수가 §91②이다 (①이 아니다)", () => {
    expect(TRANSFER.EXEMPTION_FALSE_CONTRACT_PRICE).toBe("소득세법 §91②");
    expect(TRANSFER.EXEMPTION_FALSE_CONTRACT_PRICE).not.toBe(TRANSFER.EXEMPTION_UNREGISTERED_EXCLUSION);
  });
});
