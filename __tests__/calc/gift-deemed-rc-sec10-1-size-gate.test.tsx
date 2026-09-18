/**
 * anchor(RC-3-h): 상증령 §34의3⑩1호 「**중소기업인 수혜법인이** 중소기업인 특수관계법인과
 * 거래한 매출액」 — 수혜법인 측 요건을 ⑤·⑧·⑫가 **같은 술어**로 막는다.
 *
 * 종전에는 어느 층도 `enterpriseSize`를 보지 않아, 일반기업이 ⑩1호를 골라도 매출액이 전액
 * 과세제외됐다. 실측(이 파일 [S1-E]가 고정): 일반기업 421,200,000원 → 0원.
 *
 * ⚠️ 이 게이트는 **필요조건 검사**다. ⑥이 중소기업을 「조특법 §6① 중소기업 으로서
 *    공시대상기업집단에 소속되지 아니하는 기업」으로 정의하므로 `small`이 ⑩1호 요건을
 *    보증하지 않고, **특수관계법인 측** 규모는 입력 자체가 없다. 확실히 틀린 쪽만 막는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { RelatedCorpFields } from "@/components/calc/deemed-gift/related-corp-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

afterEach(cleanup);

type Size = "small" | "medium" | "large";

function form(size: Size, excl: string): DeemedFormState {
  return {
    ...INITIAL_DEEMED,
    type: "related_corp",
    giftDate: "2025-12-31",
    rcEnterpriseSize: size,
    rcTotalSalesStr: "20000000000",
    rcPreTaxAdjOperatingIncomeStr: "2500000000",
    rcTaxableIncomeStr: "1800000000",
    rcCorporateTaxNetStr: "340000000",
    rcShareholders: [
      { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false },
      { id: "eul", name: "을", relation: "relative", directRatioPctStr: "10", isCorporate: false },
      { id: "byung", name: "병", relation: "other", directRatioPctStr: "70", isCorporate: false },
    ],
    rcIntermediaryCorps: [],
    rcSalesPartners: [
      {
        id: "sD", name: "D법인", salesAmountStr: "14000000000", isRelated: true,
        exclusionTypes: [excl], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [],
      },
      {
        id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: false,
        exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [],
      },
    ],
  } as unknown as DeemedFormState;
}

function giftOf(f: DeemedFormState): number {
  const parsed = deemedGiftInputSchema.safeParse(buildDeemedGiftInput(f));
  if (!parsed.success) throw new Error("zod blocked");
  return (calcDeemedGift(parsed.data as never) as { deemedGiftValue: number }).deemedGiftValue;
}

describe("⑧ — ⑩1호는 수혜법인이 중소기업일 때만", () => {
  it("[S1-0] 일반기업이 ⑩1호를 고르면 차단한다", () => {
    expect(validateDeemedInput(form("large", "sec10_1"))).toBe(
      "1번째 매출처: ⑩1호는 수혜법인이 중소기업인 경우에만 적용됩니다 (현재 일반기업 — 상증령 §34의3⑩1호) — 다시 선택하세요",
    );
  });

  it("[S1-1] 중견기업도 차단한다 — ⑥·⑦이 중견을 중소와 따로 정의한다", () => {
    expect(validateDeemedInput(form("medium", "sec10_1"))).toContain("현재 중견기업");
  });

  it("[S1-0b] 긍정 짝 — 중소기업이면 통과한다 (게이트가 ⑩1호를 통째로 막은 게 아니다)", () => {
    expect(validateDeemedInput(form("small", "sec10_1"))).toBeNull();
  });

  it("[S1-2] 긍정 짝 — 규모 무관한 호(⑩5호 수출목적)는 일반기업도 통과한다", () => {
    expect(validateDeemedInput(form("large", "sec10_5"))).toBeNull();
  });
});

describe("⑫ — 서버측 관문도 같은 술어", () => {
  it("[S1-3] 일반기업 + ⑩1호는 Zod가 해당 매출처 path로 막는다", () => {
    const r = deemedGiftInputSchema.safeParse(buildDeemedGiftInput(form("large", "sec10_1")));
    expect(r.success).toBe(false);
    const issue = r.success ? undefined : r.error.issues.find((i) => i.message.includes("⑩1호"));
    expect(issue?.path).toEqual(["salesPartners", 0, "exclusionTypes"]);
  });

  it("[S1-3b] 긍정 짝 — 중소기업이면 Zod를 통과한다", () => {
    expect(deemedGiftInputSchema.safeParse(buildDeemedGiftInput(form("small", "sec10_1"))).success).toBe(true);
  });
});

describe("⑤ — 화면도 같은 술어", () => {
  const opt = (size: Size) => {
    const { getByLabelText } = render(
      <RelatedCorpFields form={form(size, "")} set={vi.fn()} />,
    );
    const sel = getByLabelText("매출처 1 과세제외유형") as HTMLSelectElement;
    return [...sel.options].find((o) => o.value === "sec10_1")!;
  };

  it("[S1-4] 일반기업에서는 ⑩1호 option이 비활성이다", () => {
    expect(opt("large").disabled).toBe(true);
  });

  it("[S1-4b] 긍정 짝 — 중소기업에서는 고를 수 있다", () => {
    expect(opt("small").disabled).toBe(false);
  });

  // ⚠️ large·small만 재면 `!== "large"`(중견 누수) 뮤테이션이 살아남는다 — 실제로 살아남았다.
  //    ⑥·⑦이 중견을 중소와 «따로» 정의하므로 세 값이 모두 축이다.
  it("[S1-4c] 중견기업도 비활성이다 — 중소가 아닌 값이 둘이다", () => {
    expect(opt("medium").disabled).toBe(true);
  });

  it("[S1-5] 목록에서 지우지는 않는다 — stale 값이 화면과 어긋나면 ⑧이 «화면에 없는 값»으로 차단하게 된다", () => {
    expect(opt("large").textContent).toContain("⑩1호");
  });
});

describe("엔진 — 게이트가 지키는 금액", () => {
  it("[S1-E] ⑩1호가 걸리면 특수관계매출 전액이 제외돼 증여의제이익이 0이 된다", () => {
    // 이 세 값이 게이트의 존재 이유다. ⑧·⑫를 우회해 엔진에 직접 넣으면 종전 동작이 재현된다.
    expect(giftOf(form("large", ""))).toBe(421_200_000);
    expect(giftOf(form("medium", ""))).toBe(162_000_000);
    expect(giftOf(form("small", ""))).toBe(43_200_000);
    expect(giftOf(form("small", "sec10_1"))).toBe(0);
  });
});
