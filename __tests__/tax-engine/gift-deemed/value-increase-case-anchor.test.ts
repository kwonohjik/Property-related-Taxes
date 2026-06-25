import { describe, it, expect } from "vitest";
import { calcValueIncreaseGift } from "@/lib/tax-engine/gift-deemed/value-increase";

// §42의3 재산취득 후 가치증가 — 국세청 2004 개정세법 해설 pp.197~200 계산사례 1~4 재현.
// Pre-Do anchor: VI-CASE1·VI-CASE4 우선(현재 4필드 엔진이 PDF 증여재산가액을 그대로 산출하는지 실증).
// echo 필드(사유·5년)는 보강 전 — deemedGiftValue·thresholdEcho·applied만 검증.

describe("§42의3 계산사례 anchor (시행령 §32의3)", () => {
  it("[VI-CASE1] 형질변경: 20억 − 1억 − 0.1억 − 0.2억 = 18.7억 (PDF 사례1)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 2_000_000_000, // 형질변경 후 토지가액 20억
      acquisitionCost: 100_000_000, // 임야 증여시 과세가액 1억
      normalIncrease: 10_000_000, // 3년 평균지가상승 누계 1천만
      contribution: 20_000_000, // 형질변경 소요비용 2천만
    });
    expect(r.deemedGiftValue).toBe(1_870_000_000);
    expect(r.applied).toBe(true);
    expect(r.thresholdEcho?.gain).toBe(1_870_000_000);
    expect(r.thresholdEcho?.threshold).toBe(39_000_000); // min(1.3억×30%, 3억)
  });

  it("[VI-CASE4] 사업 인허가(지하수개발권): 50억 − 1억 − 0.5억 − 0.5억 = 48억 (PDF 사례4)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 5_000_000_000, // 사유발생일 현재 재산가액 50억
      acquisitionCost: 100_000_000, // 당초 증여받은 재산가액 1억
      normalIncrease: 50_000_000, // 보유기간 평균지가상승분 5천만
      contribution: 50_000_000, // 지하수개발권 허가 소요비용 5천만
    });
    expect(r.deemedGiftValue).toBe(4_800_000_000);
    expect(r.applied).toBe(true);
    expect(r.thresholdEcho?.gain).toBe(4_800_000_000);
    expect(r.thresholdEcho?.threshold).toBe(60_000_000); // min(2억×30%, 3억)
  });

  it("[VI-CASE2] 공유물분할: 분할후 75억 − 분할전 50억 = 25억 (PDF 사례2)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 7_500_000_000, // 분할 후 子 소유 토지가액 75억
      acquisitionCost: 5_000_000_000, // 분할 전 子 지분가액 50억
      normalIncrease: 0,
      contribution: 0,
      valueIncreaseReason: "partition",
    });
    expect(r.deemedGiftValue).toBe(2_500_000_000);
    expect(r.applied).toBe(true);
    expect(r.thresholdEcho?.threshold).toBe(300_000_000); // min(50억×30%=15억, 3억)=3억
    expect(r.valueIncreaseDetail?.reasonLabel).toContain("공유물 분할");
  });

  it("[VI-CASE3] 비상장주식 상장: 100억 − 10억 = 90억 (PDF 사례3, 현행 §41의3 경계)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 10_000_000_000, // 상장 후 주가 100억
      acquisitionCost: 1_000_000_000, // 차입자금 취득 10억
      normalIncrease: 0,
      contribution: 0,
      acquisitionCause: "borrowed_funds",
      valueIncreaseReason: "similar", // 거래소 상장 — 현행 §42의3①4호 단서상 §41의3 영역
    });
    expect(r.deemedGiftValue).toBe(9_000_000_000);
    expect(r.applied).toBe(true);
    expect(r.thresholdEcho?.threshold).toBe(300_000_000); // min(10억×30%=3억, 3억)=3억
    // 현행법 경계: similar 선택 시 §41의3 안내 트리거 echo
    expect(r.valueIncreaseDetail?.isExchangeListingNotice).toBe(true);
  });

  it("[VI-REASON-ECHO] 사례1 취득사유·가치증가사유 라벨 echo", () => {
    const r = calcValueIncreaseGift({
      currentValue: 2_000_000_000,
      acquisitionCost: 100_000_000,
      normalIncrease: 10_000_000,
      contribution: 20_000_000,
      acquisitionCause: "gift",
      valueIncreaseReason: "form_change",
    });
    expect(r.valueIncreaseDetail?.acquisitionCauseLabel).toContain("특수관계인 증여");
    expect(r.valueIncreaseDetail?.reasonLabel).toContain("형질변경");
    expect(r.deemedGiftValue).toBe(1_870_000_000); // 산식 불변
  });

  it("[VI-5YR] 취득~사유발생 3년 → 5년 이내 echo (사례1)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 2_000_000_000,
      acquisitionCost: 100_000_000,
      normalIncrease: 10_000_000,
      contribution: 20_000_000,
      acquisitionDate: "2021-06-01",
      eventDate: "2024-06-01",
    });
    expect(r.valueIncreaseDetail?.holdingYears).toBe(3);
    expect(r.valueIncreaseDetail?.withinFiveYears).toBe(true);
  });

  it("[VI-5YR-OVER] 취득~사유발생 6년 → 5년 초과 echo (deemedGiftValue·applied 불변)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 2_000_000_000,
      acquisitionCost: 100_000_000,
      normalIncrease: 10_000_000,
      contribution: 20_000_000,
      acquisitionDate: "2018-06-01",
      eventDate: "2024-06-01",
    });
    expect(r.valueIncreaseDetail?.holdingYears).toBe(6);
    expect(r.valueIncreaseDetail?.withinFiveYears).toBe(false);
    expect(r.deemedGiftValue).toBe(1_870_000_000); // 5년 초과여도 산식·applied 차단 안 함(echo만)
    expect(r.applied).toBe(true);
  });

  it("[VI-NO-ECHO] 사유·날짜 미입력 → valueIncreaseDetail undefined (기존 동작 보존)", () => {
    const r = calcValueIncreaseGift({
      currentValue: 2_000_000_000,
      acquisitionCost: 100_000_000,
      normalIncrease: 10_000_000,
      contribution: 20_000_000,
    });
    expect(r.valueIncreaseDetail).toBeUndefined();
    expect(r.deemedGiftValue).toBe(1_870_000_000);
  });
});
