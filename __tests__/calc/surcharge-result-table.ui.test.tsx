/**
 * anchor(⑦) — 다주택 중과 판정 결과 뷰(계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.5 · §7.3 · P7).
 *
 * 실제 route 응답을 렌더한다 — 손으로 만든 응답은 엔진과 어긋나도 초록이 된다.
 * - RV-1 행 순서: 양도 예정 주택(강조) → 명부 순서 → 권리 → 양도일 현재 미보유
 * - RV-2 금액 칸: 정렬·고정폭 숫자 클래스 · 「원」 없음 · 미입력 「—」
 * - RV-3 ③ 산입 ○/× + 불산입 사유 · RV-4 ④ 주소 미입력 · RV-5 ⑤ 다른 행은 「(간이)」
 * - RV-6 상세: 단계 번호 · 결론 단계 표시 · 문장에 내부 id 없음
 * - RV-7 세율 영향: 3주택 이상 +30%p · 장특 배제 / 한시 유예 가목
 * - RV-8 범위 밖: 사유 + 비과세 요약만(표 없음) · RV-9 계산기 넘기기 버튼
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { MultiHouseSurchargeResultView } from "@/components/calc/results/MultiHouseSurchargeResultView";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { HouseEntry, PresaleRightEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { makeHouse } from "./one-house-rulings/harness";

vi.mock("@/components/ui/law-article-modal", () => ({ LawArticleModal: ({ label }: { label: string }) => <span>{label}</span> }));
afterEach(cleanup);

const GANGNAM = "1168010100";
const ASAN = "4420010100";
const row = (id: string, over: Partial<HouseEntry>) =>
  makeHouse(id, { acquisitionDate: "2010-01-01", regionCode: GANGNAM, officialPrice: "500000000", acquisitionOrigin: "general", ...over });

function form(transferDate: string, houses: HouseEntry[], rights: PresaleRightEntry[] = [], sellingPrice = ""): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate,
    contractTotalPrice: "500000000",
    assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: GANGNAM, standardPriceAtTransfer: sellingPrice, residenceInputMode: "direct", residencePeriods: [] }],
    houses,
    presaleRights: rights,
  } as OneHouseJudgmentFormData;
}
async function judge(f: OneHouseJudgmentFormData): Promise<MultiHouseSurchargeJudgmentResponse> {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildMultiHouseSurchargeApiBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json.error)).toBe(200);
  return json.data;
}
async function show(f: OneHouseJudgmentFormData, onCalculateTax?: () => void) {
  const result = await judge(f);
  render(
    <MultiHouseSurchargeResultView
      result={result}
      formHouses={f.houses}
      formRights={f.presaleRights}
      sellingStdPrice={f.assets[0].standardPriceAtTransfer}
      onCalculateTax={onCalculateTax}
    />,
  );
  return result;
}

// 3주택(강남 둘 + 아산 2억) + 양도일 뒤 취득한 행 + 입주권 1
const RIGHT = { id: "r1", type: "redevelopment_right", acquisitionDate: "2019-01-01", region: "capital", rightValue: "" } as unknown as PresaleRightEntry;
const threeHouse = () =>
  form("2021-06-01", [
    row("h1", {}),
    row("h2", { regionCode: ASAN, region: "non_capital", officialPrice: "200000000" }),
    row("h3", { regionCode: "", region: "capital", officialPrice: "" }),
    row("h9", { acquisitionDate: "2022-01-01" }),
  ], [RIGHT], "900000000");

describe("RV-1~5 — 표", () => {
  it("[RV-1] 행 순서와 양도 예정 주택 강조", async () => {
    await show(threeHouse());
    const ids = within(screen.getByTestId("surcharge-table"))
      .getAllByRole("row")
      .map((r) => r.getAttribute("data-testid"))
      .filter(Boolean);
    expect(ids).toEqual(["surcharge-row-selling", "surcharge-row-h1", "surcharge-row-h2", "surcharge-row-h3", "surcharge-row-r1", "surcharge-row-h9"]);
    expect(screen.getByTestId("surcharge-row-selling").className).toMatch(/bg-violet-50/);
    expect(screen.getByTestId("surcharge-row-h9").textContent).toMatch(/양도일 현재 보유하지 않음/);
  });

  it("[RV-2] 금액 칸 — 오른쪽 정렬·고정폭 숫자 · 「원」 없음 · 미입력 「—」", async () => {
    await show(threeHouse());
    const sell = screen.getByTestId("surcharge-cell-price-selling");
    expect(sell.className).toMatch(/text-right/);
    expect(sell.className).toMatch(/font-mono/);
    expect(sell.className).toMatch(/tabular-nums/);
    expect(sell.className).toMatch(/whitespace-nowrap/);
    expect(sell.textContent).toBe("900,000,000");
    expect(screen.getByTestId("surcharge-cell-price-h3").textContent).toBe("—");
    expect(screen.getByTestId("surcharge-table").textContent).not.toMatch(/\d원/);
  });

  it("[RV-3] ③ 산입 ○ / 불산입 × + 사유", async () => {
    await show(threeHouse());
    expect(within(screen.getByTestId("surcharge-cell-counted-h1")).getByLabelText("산입")).toBeTruthy();
    const h2 = screen.getByTestId("surcharge-cell-counted-h2");
    expect(within(h2).getByLabelText("불산입")).toBeTruthy();
    expect(h2.textContent).toMatch(/지방 공시가 3억 이하/);
  });

  it("[RV-4] ④ 소재지 코드 없는 행 — 「주소 미입력 · 확인 필요」 · ① 수동 지역 구분", async () => {
    await show(threeHouse());
    expect(screen.getByTestId("surcharge-cell-regulated-h3").textContent).toMatch(/주소 미입력 · 확인 필요/);
    expect(screen.getByTestId("surcharge-cell-criteria-h3").textContent).toMatch(/지역기준 · 주소 미입력/);
    expect(within(screen.getByTestId("surcharge-cell-regulated-h1")).getByLabelText("조정대상지역")).toBeTruthy();
  });

  it("[RV-5] ⑤ 양도 예정 주택은 정밀, 다른 행은 「(간이)」 · 요약은 응답의 중과 주택 수", async () => {
    const r = await show(threeHouse());
    expect(screen.getByTestId("surcharge-cell-ifSold-selling").textContent).not.toMatch(/간이/);
    expect(screen.getByTestId("surcharge-cell-ifSold-h1").textContent).toMatch(/\(간이\)/);
    expect(screen.getByTestId("surcharge-count-summary").textContent).toContain(String(r.headline!.result.effectiveHouseCount));
  });

  it("[RV-5 짝] 요약은 표의 행 수가 아니라 응답 값이다 — 아산 2억 불산입: 행 3 · 중과 주택 수 2", async () => {
    const r = await show(form("2021-06-01", [row("h1", {}), row("h2", { regionCode: ASAN, region: "non_capital", officialPrice: "200000000" })]));
    expect([r.rows!.houses.length, r.headline!.result.effectiveHouseCount]).toEqual([3, 2]);
    expect(screen.getByTestId("surcharge-count-summary").textContent).toMatch(/포함\) 2$/);
  });
});

describe("RV-6·7 — 상세 · 세율 영향", () => {
  it("[RV-6] 단계 번호 · 결론 단계 표시 · 내부 id 없음", async () => {
    await show(threeHouse());
    const detail = screen.getByTestId("surcharge-selling-detail");
    expect(detail.textContent).toMatch(/①/);
    expect(detail.textContent).toMatch(/여기서 결론/);
    expect(detail.textContent).not.toMatch(/\bh[0-9]\b|selling/);
  });
  it("[RV-7] 3주택 이상 중과 — 기본세율 +30%p · 장특 배제", async () => {
    await show(threeHouse());
    expect(screen.getByTestId("surcharge-conclusion-label").textContent).toBe("3주택 이상 중과");
    expect(screen.getByTestId("surcharge-rate-line").textContent).toBe("기본세율 + 30%p");
    expect(screen.getByTestId("surcharge-rate-lthd").textContent).toMatch(/적용하지 않습니다/);
  });
  it("[RV-7 짝] 한시 유예(2024 양도) — 이론상 유형 + 유예 근거 가목 · 장특 일반", async () => {
    await show(form("2024-06-01", [row("h1", {}), row("h2", {})]));
    expect(screen.getByTestId("surcharge-conclusion-label").textContent).toBe("3주택 이상 중과 — 한시 유예");
    expect(screen.getByTestId("surcharge-rate-suspension").textContent).toMatch(/가목/);
    expect(screen.getByTestId("surcharge-rate-lthd").textContent).toMatch(/일반 요건대로/);
  });
});

describe("RV-8·9", () => {
  it("[RV-8] 2018.4.1. 전 양도 — 범위 밖 사유와 비과세 요약만", async () => {
    await show(form("2018-03-31", [row("h1", {})]));
    expect(screen.getByTestId("surcharge-scope-unsupported").textContent).toMatch(/2018년 4월 1일 전/);
    expect(screen.queryByTestId("surcharge-table")).toBeNull();
    expect(screen.getByTestId("surcharge-exemption-summary")).toBeTruthy();
  });
  it("[RV-9] 「이 사실로 양도세 계산」은 넘겨받은 동작을 부른다 · 없으면 버튼도 없다", async () => {
    const onCalc = vi.fn();
    await show(form("2021-06-01", [row("h1", {})]), onCalc);
    fireEvent.click(screen.getByTestId("surcharge-calculate-tax"));
    expect(onCalc).toHaveBeenCalledTimes(1);
    cleanup();
    await show(form("2021-06-01", [row("h1", {})]));
    expect(screen.queryByTestId("surcharge-calculate-tax")).toBeNull();
  });
});

describe("RV-10·11 조합원입주권 양도 표 (V-5)", () => {
  // 구미(가액기준) 입주권 · 종전 주택의 가격 2.5억 + 강남 주택 2채
  const rightSale = (value: string) => {
    const f = form("2021-06-01", [row("h1", {}), row("h2", {})]);
    return {
      ...f,
      assets: [{ ...f.assets[0], assetKind: "right_to_move_in", regionCode: "4719010100" }],
      surchargeSellingRightValue: value,
    } as OneHouseJudgmentFormData;
  };
  async function showRightSale(f: OneHouseJudgmentFormData, edit?: (r: MultiHouseSurchargeJudgmentResponse) => MultiHouseSurchargeJudgmentResponse) {
    const result = await judge(f);
    render(
      <MultiHouseSurchargeResultView
        result={edit ? edit(result) : result}
        formHouses={f.houses}
        formRights={f.presaleRights}
        sellingStdPrice={undefined}
        sellingRightValue={f.surchargeSellingRightValue}
        onSwapSelling={() => {}}
      />,
    );
  }

  it("[RV-10] 범위 밖 사유 + 표 — 양도 예정 입주권 행이 맨 위 · 주택은 모두 간이 · 전환 버튼 없음 · 주택 수 2", async () => {
    await showRightSale(rightSale("250000000"));
    expect(screen.getByTestId("surcharge-scope-unsupported").textContent).toMatch(/조합원입주권/);
    expect(screen.queryByTestId("surcharge-conclusion")).toBeNull();
    const rows = within(screen.getByTestId("surcharge-table")).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual(["surcharge-row-selling-right", "surcharge-row-h1", "surcharge-row-h2"]);
    expect(rows[0].textContent).toContain("양도 예정 조합원입주권");
    expect(rows[0].textContent).toContain("250,000,000");
    expect(screen.getByTestId("surcharge-cell-counted-selling-right").textContent).toMatch(/불산입/);
    expect(screen.getByTestId("surcharge-cell-ifSold-h1").textContent).toMatch(/\(간이\)/);
    expect(screen.queryByTestId("surcharge-swap-h1")).toBeNull();
    expect(screen.getByTestId("surcharge-table").textContent).toMatch(/양도 대상이 조합원입주권이라/);
    expect(screen.getByTestId("surcharge-count-summary").textContent).toMatch(/2$/);
  });

  it("[RV-11] 응답에 주택 수가 없으면(행마다 다름) 요약 줄을 그리지 않는다", async () => {
    await showRightSale(rightSale(""), (r) => ({ ...r, rightSaleHouseCount: undefined }));
    expect(screen.getByTestId("surcharge-table")).toBeTruthy();
    expect(screen.queryByTestId("surcharge-count-summary")).toBeNull();
  });
});
