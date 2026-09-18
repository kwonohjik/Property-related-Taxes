/**
 * 발견 단위 폐쇄 감사 A군 4건 — 「닫혔다」고 분류됐지만 실제로는 절반만 닫혀 있던 축들.
 *
 * 종전 판정은 「커밋 메시지에 그 클러스터 ID가 있다」였고, 그 방식이 여기서 네 번 틀렸다.
 * 네 건의 공통 형태는 **한 층만 고쳐졌다**는 것이다 — ⑧만, 또는 행 단위만, 또는 화면만.
 *
 *   RC-3-f  행 단위 동치 검사는 같은 법인주주를 가리키는 **두 번째 행**을 못 본다.
 *   SC-7-g  ⑧(클라이언트)만 지분율 상한을 보고 ⑫(서버)는 상한 자체가 없었다.
 *   SC-6-h  ⑧은 닫혔으나 ⑫ optional + 엔진 `?? {0,1}`이 남아 **틀린 사유**를 만들었다.
 *   SC-5-c  화면의 거짓 등식은 지웠으나 그 원인인 엔진 `gain: 0`은 그대로였다.
 */
import { describe, it, expect } from "vitest";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcSpecificCorpGift, calcSpecificCorpGiftMulti } from "@/lib/tax-engine/gift-deemed/specific-corp";
import { calcRelatedCorpGift } from "@/lib/tax-engine/gift-deemed/related-corp";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { RelatedCorpInput, SpecificCorpInput } from "@/lib/tax-engine/gift-deemed/types";

// ─────────────────────────────────────────────────────────────────────────────
// RC-3-f — 간접출자법인 행 중복으로 간접보유비율이 행 수에 선형으로 배가된다
// ─────────────────────────────────────────────────────────────────────────────

function rcForm(intermediaries: DeemedFormState["rcIntermediaryCorps"]): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    giftDate: "2025-12-31",
    rcEnterpriseSize: "small",
    rcTotalSalesStr: "100000000000",
    rcPreTaxAdjOperatingIncomeStr: "10000000000",
    rcTaxableIncomeStr: "10000000000",
    rcCorporateTaxNetStr: "2000000000",
    rcShareholders: [
      { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false, dividendFromBeneficiaryStr: "" },
      { id: "A", name: "A법인", relation: "other", directRatioPctStr: "50", isCorporate: true, dividendFromBeneficiaryStr: "" },
      { id: "byung", name: "병", relation: "other", directRatioPctStr: "30", isCorporate: false, dividendFromBeneficiaryStr: "" },
    ],
    rcIntermediaryCorps: intermediaries,
    rcSalesPartners: [
      { id: "sD", name: "D법인", salesAmountStr: "80000000000", isRelated: true,
        exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
      { id: "sE", name: "기타", salesAmountStr: "20000000000", isRelated: false,
        exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
    ],
  } as unknown as DeemedFormState;
}

const iRow = (id: string, pct: string) => ({
  id,
  corpShareholderId: "A",
  stakeInBeneficiaryPctStr: pct,
  distributableProfitStr: "",
  owners: [{ individualId: "gap", ratioPctStr: "80", dividendIncomeStr: "" }],
});

describe("RC-3-f — 같은 법인주주를 가리키는 간접출자 행이 중복되면 간접보유비율이 배가된다", () => {
  it("[A1-0] ⑧ — 행 2개(각 50%)는 합계 100% ≠ 섹션2 직접지분 50% 로 차단된다", () => {
    // 🔴 행 단위 동치 검사는 **둘 다 통과시킨다**(각 행 50% = 섹션2 50%).
    //    합계 대조만이 이 경로를 잡는다.
    const msg = validateDeemedInput(rcForm([iRow("i1", "50"), iRow("i2", "50")]));
    expect(msg).toContain("합계");
    expect(msg).toContain("다릅니다");
  });

  it("[A1-1] 긍정 짝 — 행 1개(50%)는 통과한다", () => {
    expect(validateDeemedInput(rcForm([iRow("i1", "50")]))).toBeNull();
  });

  it("[A1-2] 두 가드는 **겹치게** 둔다 — 쪼갠 행(25+25)은 행 단위 가드가 먼저 막는다", () => {
    // 합계 가드만 두면 25+25=50이 통과한다. 그런데 한 법인주주의 수혜법인 직접지분을 여러 행에
    // 나눠 적는 것은 지금 데이터 모델에서 의미가 없다(경유 법인은 반드시 섹션2의 법인주주여야
    // 하므로 상증령 §34의3⑱3호의 다단계는 어차피 표현되지 않는다). 기존 행 단위 동치 검사를
    // **지우지 않고** 합계 검사를 더했다 — 좁히는 방향의 변경이 아니라 더하는 방향이다.
    const msg = validateDeemedInput(rcForm([iRow("i1", "25"), iRow("i2", "25")]));
    expect(msg).toContain("다릅니다");
  });

  it("[A1-3] ⑫ — 같은 술어가 **서버측**에도 있다 (⑧은 클라이언트다)", () => {
    const base = {
      type: "related_corp" as const,
      giftDate: "2025-12-31",
      enterpriseSize: "small" as const,
      totalSales: 100_000_000_000,
      preTaxAdjOperatingIncome: 10_000_000_000,
      taxableIncome: 10_000_000_000,
      corporateTaxNet: 2_000_000_000,
      shareholders: [
        { id: "gap", name: "갑", relation: "self" as const, directRatio: { numer: 2000, denom: 10_000 }, isCorporate: false },
        { id: "A", name: "A법인", relation: "other" as const, directRatio: { numer: 5000, denom: 10_000 }, isCorporate: true },
        { id: "byung", name: "병", relation: "other" as const, directRatio: { numer: 3000, denom: 10_000 }, isCorporate: false },
      ],
      salesPartners: [
        { id: "sD", name: "D법인", salesAmount: 80_000_000_000, isRelated: true },
        { id: "sE", name: "기타", salesAmount: 20_000_000_000, isRelated: false },
      ],
    };
    const corp = (n: number) => ({
      corpShareholderId: "A",
      stakeInBeneficiary: { numer: 5000, denom: 10_000 },
      owners: [{ individualId: "gap", ratio: { numer: 8000, denom: 10_000 } }],
      _n: n,
    });
    const dup = deemedGiftInputSchema.safeParse({ ...base, intermediaryCorps: [corp(1), corp(2)] });
    expect(dup.success).toBe(false);
    // 긍정 짝 — 1개면 통과한다
    expect(deemedGiftInputSchema.safeParse({ ...base, intermediaryCorps: [corp(1)] }).success).toBe(true);
  });

  it("[A1-4] 가드가 없으면 무슨 일이 나는가 — 엔진은 행마다 출자관계를 만든다 (선형 배가)", () => {
    // 이 단언은 **엔진의 현재 동작**을 고정한다. 엔진 자신은 중복을 모르므로(§34의3⑬은
    // 「출자관계별로 각각 구분하여 계산」을 요구한다) 차단은 ⑧·⑫의 몫이다.
    // 가드를 지우면 이 값이 그대로 사용자에게 나간다.
    const engineInput = (rows: number): RelatedCorpInput =>
      ({
        enterpriseSize: "large",
        totalSales: 20_000_000_000,
        preTaxAdjOperatingIncome: 2_500_000_000,
        taxableIncome: 1_800_000_000,
        corporateTaxNet: 340_000_000,
        shareholders: [
          { id: "gap", name: "갑", relation: "self", directRatio: { numer: 0, denom: 100 }, isCorporate: false },
          { id: "co", name: "법인주주", relation: "other", directRatio: { numer: 30, denom: 100 }, isCorporate: true },
          { id: "etc", name: "기타", relation: "other", directRatio: { numer: 70, denom: 100 }, isCorporate: false },
        ],
        intermediaryCorps: Array.from({ length: rows }, () => ({
          corpShareholderId: "co",
          stakeInBeneficiary: { numer: 30, denom: 100 },
          owners: [{ individualId: "gap", ratio: { numer: 100, denom: 100 } }],
        })),
        salesPartners: [
          { id: "s1", name: "특수법인", salesAmount: 14_000_000_000, isRelated: true },
          { id: "s2", name: "기타매출", salesAmount: 6_000_000_000, isRelated: false },
        ],
      }) as unknown as RelatedCorpInput;
    expect(calcRelatedCorpGift(engineInput(1)).deemedGiftValue).toBe(421_200_000);
    expect(calcRelatedCorpGift(engineInput(2)).deemedGiftValue).toBe(842_400_000); // 정확히 2배
    expect(calcRelatedCorpGift(engineInput(3)).deemedGiftValue).toBe(1_263_600_000); // 정확히 3배
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-7-g — ⑫ 지분율 상한 부재 (⑧만 막고 있었다)
// ─────────────────────────────────────────────────────────────────────────────

const scBase = {
  type: "specific_corp" as const,
  giftDate: "2025-12-31",
  transactionBenefit: 1_000_000_000,
};

describe("SC-7-g — ⑫ ratioSchema에 상한이 없어 200% 지분율이 서버를 통과했다", () => {
  it("[A2-0] ⑫ — ownershipRatio 200%(`{20000,10000}`)는 거부된다", () => {
    const r = deemedGiftInputSchema.safeParse({ ...scBase, ownershipRatio: { numer: 20_000, denom: 10_000 } });
    expect(r.success).toBe(false);
  });

  it("[A2-1] 긍정 짝 — 50%는 통과한다 (경계 100%도 통과한다: 「초과」만 막는다)", () => {
    expect(deemedGiftInputSchema.safeParse({ ...scBase, ownershipRatio: { numer: 5_000, denom: 10_000 } }).success).toBe(true);
    expect(deemedGiftInputSchema.safeParse({ ...scBase, ownershipRatio: { numer: 10_000, denom: 10_000 } }).success).toBe(true);
  });

  it("[A2-2] 같은 상한이 controllingGroupRatio에도 걸린다 — 단일 소스라 한쪽만 열리지 않는다", () => {
    const r = deemedGiftInputSchema.safeParse({
      ...scBase,
      ownershipRatio: { numer: 5_000, denom: 10_000 },
      controllingGroupRatio: { numer: 15_000, denom: 10_000 },
    });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-6-h — single 지분율 미입력이 「1억원 미만」이라는 틀린 사유를 만든다
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-6-h — single 지분율 미입력의 조용한 0과 틀린 사유", () => {
  it("[A3-0] ⑫ — single 모드에서 ownershipRatio가 없으면 거부된다", () => {
    expect(deemedGiftInputSchema.safeParse(scBase).success).toBe(false);
  });

  it("[A3-1] ⑫ — 0%를 «명시 전송»해도 거부된다 (④는 미입력 칸도 `{0, 10000}`을 보낸다)", () => {
    // 「존재」만 보는 가드였다면 이 경로가 그대로 통과한다 — no-op 가드가 되는 형태다.
    expect(deemedGiftInputSchema.safeParse({ ...scBase, ownershipRatio: { numer: 0, denom: 10_000 } }).success).toBe(false);
  });

  it("[A3-2] 긍정 짝 — roster 모드는 ownershipRatio 없이도 통과한다 (지분은 주주 행이 담는다)", () => {
    const r = deemedGiftInputSchema.safeParse({
      ...scBase,
      shareholders: [
        { id: "1", name: "갑", relation: "lineal_descendant", shares: 30_000, totalShares: 50_000, isDonor: false, isRelated: true },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("[A3-3] 엔진 — 지분율 미전달 시 사유가 「1억원 미만」이 **아니다**", () => {
    // 🔴 §34의5⑤은 이 사안에 대해 아무 말도 하지 않았다. 그 조문을 사유로 돌려주면
    //    사용자는 «지분율을 안 넣었다»가 아니라 «금액이 작다»로 읽는다.
    const r = calcSpecificCorpGift({
      transactionDate: "2025-12-31",
      counterparty: "ruling_shareholder",
      transactionType: "gratuitous",
      transactionBenefit: 3_000_000_000,
      corporateTax: 0,
    } as unknown as SpecificCorpInput);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("지분율");
    expect(r.exclusionReason).not.toContain("1억원 미만");
  });

  it("[A3-4] 긍정 짝 — 지분율이 있으면 사유가 조문 임계로 돌아간다", () => {
    const r = calcSpecificCorpGift({
      transactionDate: "2025-12-31",
      counterparty: "ruling_shareholder",
      transactionType: "gratuitous",
      transactionBenefit: 100_000_000,
      corporateTax: 0,
      ownershipRatio: { numer: 1, denom: 100 }, // 1% → 1,000,000원 < 1억
    } as unknown as SpecificCorpInput);
    expect(r.exclusionReason).toContain("1억원 미만");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SC-5-c — 증여자 본인 행만 gain을 0으로 덮던 단일 이상치
// ─────────────────────────────────────────────────────────────────────────────

describe("SC-5-c — 개인주주 제외 3종은 모두 안분액을 보존한다 (세액은 isTaxable이 가른다)", () => {
  const SC = {
    transactionDate: "2025-12-31",
    counterparty: "ruling_shareholder",
    transactionType: "gratuitous",
    transactionBenefit: 3_000_000_000,
    corporateTaxComputed: 780_000_000,
    corporateTaxCredit: 0,
    annualIncome: 4_000_000_000,
    totalShares: 100,
    shareholders: [
      { id: "bu", name: "부", relation: "lineal_ascendant", shares: 20, totalShares: 100, isDonor: true, isRelated: true },
      { id: "gap", name: "갑", relation: "lineal_descendant", shares: 60, totalShares: 100, isDonor: false, isRelated: true },
      { id: "eul", name: "을", relation: "sibling", shares: 3, totalShares: 100, isDonor: false, isRelated: true },
      { id: "byung", name: "병", relation: "other", shares: 17, totalShares: 100, isDonor: false, isRelated: false },
    ],
  } as unknown as SpecificCorpInput;

  const m = calcSpecificCorpGiftMulti(SC).specificCorpMulti!;
  const by = (n: string) => m.donees.find((d) => d.name === n)!;

  it("[A4-0] 제외 3종(donor_self·below_threshold·non_related)이 **같은 형태**다 — gain 보존", () => {
    // 종전에는 donor_self만 0으로 덮여, 설계 mock·형제 분기 양쪽과 어긋나는 단일 이상치였다.
    expect(by("부").gain).toBe(483_000_000);
    expect(by("을").gain).toBe(72_450_000);
    expect(by("병").gain).toBe(410_550_000);
    expect([by("부"), by("을"), by("병")].map((d) => d.isTaxable)).toEqual([false, false, false]);
    expect(by("부").nonTaxableReason).toBe("donor_self");
  });

  it("[A4-1] 세액 불변 — 증여재산가액은 `isTaxable` 행만 합산한다", () => {
    // gain 보존이 세액을 늘리지 않는다는 것이 이 수정의 안전 조건이다.
    expect(m.donees.filter((d) => d.isTaxable).map((d) => d.name)).toEqual(["갑"]);
    expect(calcSpecificCorpGiftMulti(SC).deemedGiftValue).toBe(by("갑").gain);
  });
});
