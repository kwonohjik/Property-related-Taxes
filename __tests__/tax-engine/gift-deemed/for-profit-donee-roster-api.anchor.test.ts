/**
 * ④ 명부형 행별 축 — API 변환 층 (7-13).
 *
 * 행 표지는 **수증자 행에만** 실린다. 폼 상태는 모드를 바꿔도 남는다 — §39의3 고가에서 켠 행을
 * 저가로 바꾸면 그 명부는 **증여자** 명부가 되는데 표지는 그대로 남아 있다. UI가 저가에서
 * 토글을 숨기는 것과 같은 술어로 여기서도 거른다(3중 패턴).
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

type Row = Record<string, unknown>;
const build = (f: Partial<DeemedFormState>) =>
  buildDeemedGiftInput({ ...INITIAL_DEEMED, ...f } as DeemedFormState) as unknown as Record<string, unknown>;

const mergerForm = (overFlag: boolean, underFlag = false): Partial<DeemedFormState> => ({
  type: "merger",
  mrgUseShareholders: true,
  mrgOverShareholders: [
    { name: "갑", shares: "140000", ...(overFlag && { isForProfitCorp: true }) },
    { name: "병", shares: "60000" },
  ],
  mrgUnderShareholders: [{ name: "을", shares: "100000", ...(underFlag && { isForProfitCorp: true }) }],
});

const cdForm = (flag: boolean): Partial<DeemedFormState> => ({
  type: "capital_decrease",
  cdMode: "multi",
  cdShareholders: [
    { id: "a", name: "갑", preShares: "100000", redeemedShares: "100000", redemptionPrice: "10000", relationGroup: "A" },
    { id: "b", name: "병", preShares: "60000", redeemedShares: "0", redemptionPrice: "", relationGroup: "A", ...(flag && { isForProfitCorp: true }) },
  ],
});

const conForm = (caseType: "low" | "high", flag: boolean): Partial<DeemedFormState> => ({
  type: "contribution",
  conCaseType: caseType,
  conParties: [{ name: "을", shares: "10000", relation: "", ...(flag && { isForProfitCorp: true }) }],
});

describe("④ API 변환 — 명부형 수증자 행의 영리법인 표지", () => {
  it("[RFA-1] §38 과대평가 행 — 켜면 그 행에 실린다", () => {
    const over = (build(mergerForm(true)).shareholders as { overvalued: Row[] }).overvalued;
    expect(over[0].isForProfitCorp).toBe(true);
    expect(over[1]).not.toHaveProperty("isForProfitCorp");
  });

  it("[RFA-2] 긍정 짝: §38 과소평가(증여자) 행 — 표지가 있어도 실리지 않는다", () => {
    const under = (build(mergerForm(false, true)).shareholders as { undervalued: Row[] }).undervalued;
    expect(under[0]).not.toHaveProperty("isForProfitCorp");
  });

  it("[RFA-3] 긍정 짝: §38 매트릭스를 끄면(단일 모드) 행 표지는 어디에도 실리지 않는다", () => {
    const p = build({ ...mergerForm(true), mrgUseShareholders: false });
    expect(JSON.stringify(p)).not.toContain("isForProfitCorp");
  });

  it("[RFA-4] §39의2 멀티 행 — 켜면 실리고, 끄면 실리지 않는다", () => {
    const on = build(cdForm(true)).shareholders as Row[];
    expect(on[1].isForProfitCorp).toBe(true);
    const off = build(cdForm(false)).shareholders as Row[];
    expect(off.every((r) => !("isForProfitCorp" in r))).toBe(true);
  });

  it("[RFA-5] 긍정 짝: §39의2 단일 모드로 바꾸면 stale 행 표지는 실리지 않는다", () => {
    const p = build({ ...cdForm(true), cdMode: "single" });
    expect(JSON.stringify(p)).not.toContain("isForProfitCorp");
  });

  it("[RFA-6] §39의3 고가 명부 행 — 켜면 실린다", () => {
    const parties = build(conForm("high", true)).parties as Row[];
    expect(parties[0].isForProfitCorp).toBe(true);
  });

  it("[RFA-7] 긍정 짝: §39의3 저가로 바꾸면(증여자 명부) stale 표지는 실리지 않는다", () => {
    const parties = build(conForm("low", true)).parties as Row[];
    expect(parties[0]).not.toHaveProperty("isForProfitCorp");
  });
});
