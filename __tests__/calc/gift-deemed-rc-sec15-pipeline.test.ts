/**
 * §34의3⑮ 배당공제 — ④API변환 ↔ ⑤고급 토글 ↔ ⑧validate ↔ ⑫Zod 정합 (W11 · RC-D).
 *
 * §⑮ 입력은 **엔진 타입에도 ⑫Zod에도 폼에도 없었다** — 「좁은 경로」가 아니라 경로 0이었다.
 * 새로 뚫은 경로가 네 층에서 같은 술어를 쓰는지, 그리고 ⑫가 값을 조용히 strip하지 않는지
 * (⑫⑬⑭는 TypeScript가 못 잡는다) 여기서 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

function form(patch: Partial<DeemedFormState> = {}): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    giftDate: "2025-12-31",
    rcEnterpriseSize: "small",
    rcTotalSalesStr: "100000000000",
    rcPreTaxAdjOperatingIncomeStr: "10000000000",
    rcTaxableIncomeStr: "10000000000",
    rcCorporateTaxNetStr: "2000000000",
    rcShowDividendDeduction: true,
    rcDistributableProfitStr: "5000000000",
    rcShareholders: [
      { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false,
        dividendFromBeneficiaryStr: "300000000" },
      { id: "A", name: "A법인", relation: "other", directRatioPctStr: "50", isCorporate: true,
        dividendFromBeneficiaryStr: "" },
      { id: "byung", name: "병", relation: "other", directRatioPctStr: "30", isCorporate: false,
        dividendFromBeneficiaryStr: "" },
    ],
    rcIntermediaryCorps: [
      { id: "i1", corpShareholderId: "A", stakeInBeneficiaryPctStr: "50",
        distributableProfitStr: "2000000000",
        owners: [{ individualId: "gap", ratioPctStr: "80", dividendIncomeStr: "400000000" }] },
    ],
    rcSalesPartners: [
      { id: "sD", name: "D법인", salesAmountStr: "80000000000", isRelated: true,
        exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
      { id: "sE", name: "기타", salesAmountStr: "20000000000", isRelated: false,
        exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
    ],
    ...patch,
  } as unknown as DeemedFormState;
}

const built = (f: DeemedFormState) => buildDeemedGiftInput(f) as unknown as Record<string, unknown>;

describe("④ 변환이 ⑤ 고급 토글을 미러링한다", () => {
  it("[PS-0] 토글 OFF면 배당값이 하나도 전송되지 않는다 (화면에 없는 값 차단)", () => {
    const out = built(form({ rcShowDividendDeduction: false }));
    expect(out.distributableProfit).toBeUndefined();
    const sh = out.shareholders as Record<string, unknown>[];
    expect(sh[0]!.dividendFromBeneficiary).toBeUndefined();
    const corps = out.intermediaryCorps as Record<string, unknown>[];
    expect(corps[0]!.distributableProfit).toBeUndefined();
    expect((corps[0]!.owners as Record<string, unknown>[])[0]!.dividendIncome).toBeUndefined();
  });

  it("[PS-1] 긍정 짝 — 토글 ON이면 네 값이 모두 전송된다", () => {
    const out = built(form());
    expect(out.distributableProfit).toBe(5_000_000_000);
    const sh = out.shareholders as Record<string, unknown>[];
    expect(sh[0]!.dividendFromBeneficiary).toBe(300_000_000);
    const corps = out.intermediaryCorps as Record<string, unknown>[];
    expect(corps[0]!.distributableProfit).toBe(2_000_000_000);
    expect((corps[0]!.owners as Record<string, unknown>[])[0]!.dividendIncome).toBe(400_000_000);
  });

  it("[PS-2] §⑮는 「지배주주등」(개인)만 대상이다 — 법인주주 행의 배당은 보내지 않는다", () => {
    const f = form();
    (f.rcShareholders[1] as unknown as Record<string, string>).dividendFromBeneficiaryStr = "999000000";
    const sh = built(f).shareholders as Record<string, unknown>[];
    expect(sh[1]!.dividendFromBeneficiary).toBeUndefined();
  });
});

describe("⑫ Zod가 §⑮ 필드를 strip하지 않는다", () => {
  it("[PS-3] 네 값이 파싱 결과까지 살아남는다 (⑫는 TypeScript 미감지 층이다)", () => {
    const parsed = deemedGiftInputSchema.safeParse(built(form()));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const d = parsed.data as unknown as Record<string, unknown>;
    expect(d.distributableProfit).toBe(5_000_000_000);
    expect((d.shareholders as Record<string, unknown>[])[0]!.dividendFromBeneficiary).toBe(300_000_000);
    const corp = (d.intermediaryCorps as Record<string, unknown>[])[0]!;
    expect(corp.distributableProfit).toBe(2_000_000_000);
    expect((corp.owners as Record<string, unknown>[])[0]!.dividendIncome).toBe(400_000_000);
  });
});

describe("⑧ validate — 분모 미입력 차단 (자동 안분 fallback 금지)", () => {
  it("[PS-4] 수혜법인 배당소득만 있고 배당가능이익이 없으면 차단한다", () => {
    const msg = validateDeemedInput(form({ rcDistributableProfitStr: "" }));
    expect(msg).toContain("배당가능이익");
    expect(msg).toContain("§34의3⑮1호");
  });

  it("[PS-5] 간접출자법인 배당소득만 있고 그 법인의 배당가능이익이 없으면 차단한다", () => {
    const f = form({ rcDistributableProfitStr: "5000000000" });
    (f.rcShareholders[0] as unknown as Record<string, string>).dividendFromBeneficiaryStr = "";
    (f.rcIntermediaryCorps[0] as unknown as Record<string, string>).distributableProfitStr = "";
    const msg = validateDeemedInput(f);
    expect(msg).toContain("§34의3⑮2호");
  });

  it("[PS-6] 토글 OFF면 분모가 비어 있어도 차단하지 않는다 (⑤와 같은 술어)", () => {
    expect(
      validateDeemedInput(form({ rcShowDividendDeduction: false, rcDistributableProfitStr: "" })),
    ).toBeNull();
  });

  it("[PS-7] 긍정 짝 — 분모가 모두 있으면 통과한다", () => {
    expect(validateDeemedInput(form())).toBeNull();
  });
});
