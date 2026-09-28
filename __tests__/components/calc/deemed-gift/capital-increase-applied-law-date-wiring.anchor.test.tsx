/**
 * anchor: #37·#94 배선 — cap-table ④·⑫ 증여일 · 결과뷰 적용 법령 기준일 표시(§39 3경로)
 *
 * 결과뷰의 기준일 블록은 §45의3·§45의5 두 유형만 가정한 삼항 라벨이라, §39를 그대로 흘리면
 * 「거래한 날 — 상증법 §45의5①」이라는 **틀린 라벨**이 붙는다(유형별로 갈라 적어야 한다).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { buildDeemedGiftInput } from "@/lib/calc/gift-deemed-api";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";
import { DeemedGiftResultView } from "@/components/calc/results/DeemedGiftResultView";
import { INITIAL_DEEMED, type DeemedFormState } from "@/components/calc/deemed-gift/shared";
import type { CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

afterEach(cleanup);

type Row = DeemedFormState["ciAllocRows"][number];
const row = (o: Partial<Row> & { id: string; name: string }): Row => ({
  preShares: "", entitledShares: "", subscribedShares: "", reallocatedShares: "", relatedTo: [], allocationMethod: "normal", ...o,
});
const allocForm = (giftDate: string, method: Row["allocationMethod"] = "normal"): DeemedFormState => ({
  ...INITIAL_DEEMED,
  type: "capital_increase_allocation",
  giftDate,
  ciAllocIsListed: true,
  ciAllocPrePrice: "20,000",
  ciAllocNewPrice: "10,000",
  ciAllocRows: [
    row({ id: "sh-1", name: "A", preShares: "60,000", entitledShares: "60,000", subscribedShares: "0", relatedTo: ["sh-2"] }),
    row({ id: "sh-2", name: "B", preShares: "40,000", entitledShares: "40,000", subscribedShares: "100,000", reallocatedShares: "60,000", relatedTo: ["sh-1"], allocationMethod: method }),
  ],
});

function capViaPipeline(form: DeemedFormState) {
  const parsed = deemedGiftInputSchema.safeParse(JSON.parse(JSON.stringify(buildDeemedGiftInput(form))));
  if (!parsed.success) throw new Error(parsed.error.message);
  return calcCapitalIncreaseAllocation(parsed.data as unknown as CapitalIncreaseAllocationInput);
}

describe("[ALW] cap-table ④⑫⑭ — 증여일이 엔진까지 닿는다", () => {
  it("[ALW-1] 🔴 증여일 echo", () => {
    expect(capViaPipeline(allocForm("2025-03-15")).appliedLawDate).toBe("2025-03-15");
  });

  it("[ALW-2] 🔴 2016-02-04 간주모집 행 → 제외 유지(0)", () => {
    const r = capViaPipeline(allocForm("2016-02-04", "deemed_public_offering"));
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "sh-2")?.total).toBe(0);
  });

  it("[ALW-3] 긍정 짝 — 2016-02-05 간주모집 행 → 과세 300,000,000", () => {
    const r = capViaPipeline(allocForm("2016-02-05", "deemed_public_offering"));
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "sh-2")?.total).toBe(300_000_000);
  });
});

describe("[ALV] 결과뷰 — 적용 법령 기준일", () => {
  const noop = () => {};

  it("[ALV-1] 🔴 단건 §39 — §29① 라벨(§45의5 라벨이 아님)", () => {
    const result = calcDeemedGift({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
      issuedShares: 50_000, forfeitedShares: 10_000, giftDate: new Date("2025-03-15T00:00:00.000Z"),
    });
    render(<DeemedGiftResultView result={result} onToGiftTax={noop} />);
    const box = screen.getByTestId("deemed-applied-law-date");
    expect(box).toHaveTextContent("2025-03-15");
    expect(box).toHaveTextContent("상증령 §29①");
    expect(box).not.toHaveTextContent("§45의5");
    expect(box).not.toHaveTextContent("§45의3");
    // 2017.2.7. 이후 → 「현행과 같다」 문구. 시점 고지(「현행 산식으로」)와 **문구로** 갈라야 한다 —
    //   두 문구 모두 「2017.2.7.」을 담고 있어 날짜로 단언하면 구별력이 0이다(M15 SURVIVED 실측).
    expect(box).toHaveTextContent("현행이 같습니다");
    expect(box).not.toHaveTextContent("현행 산식으로");
  });

  it("[ALV-2] 🔴 단건 §39 — 2017.2.7. 전이면 시점 고지", () => {
    const result = calcDeemedGift({
      type: "capital_increase", preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: 5_000,
      issuedShares: 50_000, forfeitedShares: 10_000, giftDate: new Date("2016-06-01T00:00:00.000Z"),
    });
    render(<DeemedGiftResultView result={result} onToGiftTax={noop} />);
    const box = screen.getByTestId("deemed-applied-law-date");
    expect(box).toHaveTextContent("현행 산식으로");
    expect(box).not.toHaveTextContent("현행이 같습니다");
  });

  it("[ALV-3] 🔴 전환주식 — 전환한 날 라벨(§29①2호)", () => {
    const at = (price: number, d: string) => ({
      preIssuePrice: 10_000, preIssueShares: 100_000, newSharePrice: price, issuedShares: 50_000,
      forfeitedShares: 10_000, giftDate: new Date(`${d}T00:00:00.000Z`),
    });
    const result = calcDeemedGift({ type: "convertible_stock", atConversion: at(5_000, "2025-03-15"), atIssuance: at(7_000, "2020-06-01") });
    render(<DeemedGiftResultView result={result} onToGiftTax={noop} />);
    const box = screen.getByTestId("deemed-applied-law-date");
    expect(box).toHaveTextContent("2025-03-15");
    expect(box).toHaveTextContent("§29①2호");
  });

  it("[ALV-4] 🔴 cap-table — 결과뷰에 기준일·시점 고지", () => {
    const result = capViaPipeline(allocForm("2016-06-01"));
    render(<DeemedGiftResultView result={result} onToGiftTax={noop} />);
    const box = screen.getByTestId("deemed-applied-law-date");
    expect(box).toHaveTextContent("2016-06-01");
    expect(box).toHaveTextContent("현행 산식으로");
  });
});
