/**
 * anchor(RC-3-i): 영 §34의3⑩ 후단 「이 경우 다음 각 호에 **동시에 해당하는 경우에는 더 큰
 * 금액으로 한다**」 — 한 매출액이 여러 호에 동시 해당하는 경우.
 *
 * 종전에는 `exclusionType`이 **스칼라**라 「동시 해당」을 표현할 자료구조도 입력 경로도 없었고,
 * 엔진의 `Math.max`는 행 id(`crypto.randomUUID()`)로 키잉돼 비교 대상이 영원히 하나였다.
 * 주석은 「§⑩ 후단 구현」을 단언하는데 안전망 구별력은 0이었다.
 *
 * ⚠️ 후단의 단위는 «호»다. 매출처 «사이»는 영 §34의3⑪이 「각각의 매출액을 모두 합하여
 *    계산한다」고 합산을 명령하므로 max로 묶지 않는다(엔진 쪽 고정은 `[B3-3d]`).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { validateDeemedInput } from "@/lib/calc/gift-deemed-validate";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed";
import { RelatedCorpFields } from "@/components/calc/deemed-gift/related-corp-form";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";

afterEach(cleanup);

function form(types: string[]): DeemedFormState {
  return {
    ...INITIAL_DEEMED, type: "related_corp", giftDate: "2025-12-31",
    rcEnterpriseSize: "small",
    rcTotalSalesStr: "20000000000", rcPreTaxAdjOperatingIncomeStr: "2500000000",
    rcTaxableIncomeStr: "1800000000", rcCorporateTaxNetStr: "340000000",
    rcShareholders: [
      { id: "gap", name: "갑", relation: "self", directRatioPctStr: "20", isCorporate: false },
      { id: "eul", name: "을", relation: "relative", directRatioPctStr: "10", isCorporate: false },
      { id: "byung", name: "병", relation: "other", directRatioPctStr: "70", isCorporate: false },
    ],
    rcIntermediaryCorps: [],
    rcSalesPartners: [
      { id: "sD", name: "D법인", salesAmountStr: "14000000000", isRelated: true,
        exclusionTypes: types, beneficiaryStakePctStr: "30", intermediaryCorpShareholderId: "", rulingStakes: [] },
      { id: "etc", name: "기타", salesAmountStr: "6000000000", isRelated: false,
        exclusionTypes: [], beneficiaryStakePctStr: "", intermediaryCorpShareholderId: "", rulingStakes: [] },
    ],
  } as unknown as DeemedFormState;
}

const sent = (t: string[]) =>
  ((buildDeemedGiftInput(form(t)) as unknown as { salesPartners: Record<string, unknown>[] })
    .salesPartners[0] as Record<string, unknown>).exclusionTypes;

function giftOf(t: string[]): number {
  const r = deemedGiftInputSchema.safeParse(buildDeemedGiftInput(form(t)));
  if (!r.success) throw new Error("zod blocked");
  return (calcDeemedGift(r.data as never) as { deemedGiftValue: number }).deemedGiftValue;
}

describe("엔진 — 「더 큰 금액」이 세액을 바꾼다", () => {
  // 이 차액이 이 축의 존재 이유다. 종전 모델에서는 사용자가 ⑩3호를 고르는 순간
  // 5호(전액)를 표현할 방법이 없어 **법이 명하는 것보다 적게 제외**됐다(납세자 불리).
  it("[CC-0] ⑩3호 단독 20,520,000 → ⑩3호+⑩5호 동시 해당이면 0", () => {
    expect(giftOf(["sec10_3"])).toBe(20_520_000);
    expect(giftOf(["sec10_3", "sec10_5"])).toBe(0);
  });

  it("[CC-0b] 호의 순서가 결과를 바꾸지 않는다", () => {
    expect(giftOf(["sec10_5", "sec10_3"])).toBe(0);
  });

  it("[CC-0c] 대조군 — 과세제외 없음 43,200,000 / ⑩5호 단독 0", () => {
    expect(giftOf([])).toBe(43_200_000);
    expect(giftOf(["sec10_5"])).toBe(0);
  });
});

describe("④ — 배열이 그대로 전송된다", () => {
  it("[CC-1] 두 호를 고르면 둘 다 간다", () => {
    expect(sent(["sec10_3", "sec10_5"])).toEqual(["sec10_3", "sec10_5"]);
  });

  it("[CC-1b] 빈 슬롯(«없음»)은 걸러진다 — 호가 아니다", () => {
    expect(sent(["sec10_5", ""])).toEqual(["sec10_5"]);
    expect(sent(["", ""])).toBeUndefined();
  });

  it("[CC-1c] 중복은 «정규화하지 않는다» — 조용히 지우면 ⑧·⑫ 중복 가드가 발화하지 못한다", () => {
    expect(sent(["sec10_5", "sec10_5"])).toEqual(["sec10_5", "sec10_5"]);
  });

  // ⚠️ 이 축은 **세액으로 잴 수 없다**. 3호 이외의 9개 호는 전액 제외라, 3호와 짝지으면
  //    전액 쪽이 언제나 max를 먹어 보유비율이 빠져도 금액이 같다(`rowTypes[0] === "sec10_3"`
  //    뮤테이션이 실제로 세액 anchor를 전부 통과했다). ④의 **출력을 직접** 본다.
  it("[CC-1d] ⑩3호가 둘째 슬롯이어도 ④가 보유비율을 함께 보낸다 — 첫 슬롯만 보지 않는다", () => {
    const p = (t: string[]) =>
      ((buildDeemedGiftInput(form(t)) as unknown as { salesPartners: Record<string, unknown>[] })
        .salesPartners[0] as Record<string, unknown>).beneficiaryStakeInPartner;
    expect(p(["sec10_3", "sec10_5"])).toEqual({ numer: 3000, denom: 10_000 });
    expect(p(["sec10_5", "sec10_3"])).toEqual({ numer: 3000, denom: 10_000 });
    // 긍정 짝 — 3호가 없으면 보내지 않는다(곱할 비율이 없는 호에 값을 주면 오독된다)
    expect(p(["sec10_5"])).toBeUndefined();
  });
});

describe("⑧·⑫ — 논리적으로 불가능한 조합은 막는다", () => {
  it("[CC-2] ⑩2호(50% 이상)와 ⑩3호(50% 미만)는 동시에 해당할 수 없다", () => {
    expect(validateDeemedInput(form(["sec10_2", "sec10_3"]))).toContain("동시에 해당할 수 없습니다");
  });

  it("[CC-2b] ⑫도 같은 술어로 막는다", () => {
    const r = deemedGiftInputSchema.safeParse(buildDeemedGiftInput(form(["sec10_2", "sec10_3"])));
    expect(r.success).toBe(false);
    const i = r.success ? undefined : r.error.issues.find((x) => x.message.includes("동시에 해당할 수 없습니다"));
    expect(i?.path).toEqual(["salesPartners", 0, "exclusionTypes"]);
  });

  it("[CC-3] 같은 호 중복 선택을 막는다", () => {
    expect(validateDeemedInput(form(["sec10_5", "sec10_5"]))).toContain("두 번 선택했습니다");
    expect(deemedGiftInputSchema.safeParse(buildDeemedGiftInput(form(["sec10_5", "sec10_5"]))).success).toBe(false);
  });

  it("[CC-3b] 긍정 짝 — 서로 다른 두 호는 통과한다 (가드가 동시 선택을 통째로 막은 게 아니다)", () => {
    expect(validateDeemedInput(form(["sec10_3", "sec10_5"]))).toBeNull();
    expect(deemedGiftInputSchema.safeParse(buildDeemedGiftInput(form(["sec10_3", "sec10_5"]))).success).toBe(true);
  });

  it("[CC-4] ⑩3호가 «둘째 슬롯»에 있어도 보유비율을 요구한다 — 첫 슬롯만 보지 않는다", () => {
    const f = form(["sec10_5", "sec10_3"]);
    (f.rcSalesPartners[0] as { beneficiaryStakePctStr: string }).beneficiaryStakePctStr = "";
    expect(validateDeemedInput(f)).toContain("주식보유비율");
  });
});

describe("⑤ — 동시 해당 슬롯", () => {
  const view = (t: string[]) => {
    const set = vi.fn();
    const u = render(<RelatedCorpFields form={form(t)} set={set} />);
    return { ...u, set };
  };

  it("[CC-5] 첫 호를 고르기 전에는 둘째 select가 없다", () => {
    expect(view([]).queryByLabelText("매출처 1 동시 해당 과세제외유형")).toBeNull();
  });

  it("[CC-5b] 첫 호를 고르면 둘째 select가 나타난다", () => {
    expect(view(["sec10_3"]).queryByLabelText("매출처 1 동시 해당 과세제외유형")).not.toBeNull();
  });

  it("[CC-6] 둘째 select에는 첫 호가 «빠져 있다» — 같은 호를 두 번 고를 수 없다", () => {
    const sel = view(["sec10_3"]).getByLabelText("매출처 1 동시 해당 과세제외유형") as HTMLSelectElement;
    expect([...sel.options].map((o) => o.value)).not.toContain("sec10_3");
    expect([...sel.options].map((o) => o.value)).toContain("sec10_5");
  });

  it("[CC-7] ⑩1호 규모 게이트는 둘째 select에도 걸린다", () => {
    const f = { ...form(["sec10_3"]), rcEnterpriseSize: "large" } as DeemedFormState;
    const { getByLabelText } = render(<RelatedCorpFields form={f} set={vi.fn()} />);
    const sel = getByLabelText("매출처 1 동시 해당 과세제외유형") as HTMLSelectElement;
    expect([...sel.options].find((o) => o.value === "sec10_1")!.disabled).toBe(true);
  });

  it("[CC-8] 첫 슬롯을 «없음»으로 되돌리면 둘째 호가 당겨온다 — 빈 구멍을 남기지 않는다", () => {
    const { getByLabelText, set } = view(["sec10_3", "sec10_5"]);
    fireEvent.change(getByLabelText("매출처 1 과세제외유형"), { target: { value: "" } });
    const patch = set.mock.calls.at(-1)![0] as { rcSalesPartners: { exclusionTypes: string[] }[] };
    expect(patch.rcSalesPartners[0]!.exclusionTypes).toEqual(["sec10_5"]);
  });

  it("[CC-9] 첫 슬롯을 둘째와 같은 호로 바꾸면 중복이 «폼에 남는다» — ⑧이 차단한다", () => {
    const { getByLabelText, set } = view(["sec10_3", "sec10_5"]);
    fireEvent.change(getByLabelText("매출처 1 과세제외유형"), { target: { value: "sec10_5" } });
    const patch = set.mock.calls.at(-1)![0] as { rcSalesPartners: { exclusionTypes: string[] }[] };
    expect(patch.rcSalesPartners[0]!.exclusionTypes).toEqual(["sec10_5", "sec10_5"]);
  });
});
