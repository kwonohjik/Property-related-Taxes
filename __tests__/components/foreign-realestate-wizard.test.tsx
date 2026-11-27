/** @vitest-environment jsdom */
/**
 * 국외 부동산 U1 — 마법사 배선 (FRE-1·FRE-3·FRE-4 · 계산 버튼 거동 · 다건 임베드)
 *
 * - 「자산 소재」 라디오(폼 전역)로 국외를 고르면 국내 자산 카드·판정 불러오기·함께 양도 토글이 **마운트되지 않는다**(값은 남는다).
 * - 국외 단계는 1개 — 스테퍼·제목·`totalSteps`가 같은 배열을 쓴다(`STEPS_SINGLE` 직접 사용 회귀 가드).
 * - 「세금 계산하기」는 ⑧ 검증을 먼저 하고, 통과하면 **국외 전용 API**(`/api/calc/transfer/foreign`)만 부른다(국내 계산 API로 가지 않는다).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const nav = vi.hoisted(() => ({ pathname: "/calc/transfer-tax" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import TransferTaxCalculator from "@/app/calc/transfer-tax/TransferTaxCalculator";
import { foreignWizardMeta, STEPS_FOREIGN } from "@/app/calc/transfer-tax/transfer-foreign-wizard-meta";
import { STEPS_SINGLE } from "@/app/calc/transfer-tax/transfer-calculator-meta";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { FX_RATE_HINT } from "@/components/calc/transfer/foreign/foreign-ui-shared";
import { checkedRadioValue, radioValues } from "./_helpers/radio-values";
import { foreignForm, k1Asset } from "../calc/_foreign-form-fixture";

afterEach(cleanup);
beforeEach(() => {
  nav.pathname = "/calc/transfer-tax";
  useCalcWizardStore.getState().reset();
});

const seed = (patch: Parameters<typeof foreignForm>[0] = {}, assets = [k1Asset()]) =>
  useCalcWizardStore.setState({ formData: foreignForm(patch, assets), result: null, currentStep: 0 });

describe("자산 소재 라디오", () => {
  it("국내(기본)로 시작하고 값은 domestic·foreign 둘이다", () => {
    const { container } = render(<TransferTaxCalculator />);
    expect(radioValues(container, "assetLocation")).toEqual(["domestic", "foreign"]);
    expect(checkedRadioValue(container, "assetLocation")).toBe("domestic");
  });

  it("FRE-1: 국외를 고르면 국내 입력(판정 불러오기·자산 카드)이 DOM에서 사라지고 국외 입력이 나타난다", () => {
    const { container } = render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("open-one-house-judgment-load")).not.toBeNull();
    fireEvent.click(screen.getByTestId("asset-location-foreign"));
    expect(useCalcWizardStore.getState().formData.assetLocation).toBe("foreign");
    expect(screen.queryByTestId("open-one-house-judgment-load")).toBeNull();
    expect(container.querySelector('[data-testid="foreign-real-estate-step"]')).not.toBeNull();
    expect(screen.getByTestId("foreign-asset-card-0")).toBeTruthy();
  });

  it("국내로 되돌려도 국외 입력은 지워지지 않는다 · 국내 자산도 그대로다(D-4)", () => {
    seed();
    render(<TransferTaxCalculator />);
    fireEvent.click(screen.getByTestId("asset-location-domestic"));
    const f = useCalcWizardStore.getState().formData;
    expect(f.assetLocation).toBe("domestic");
    expect(f.foreignAssets[0].transferAmount).toBe("900000");
    expect(f.assets).toHaveLength(1);
    expect(screen.queryByTestId("foreign-real-estate-step")).toBeNull();
    expect(screen.queryByTestId("open-one-house-judgment-load")).not.toBeNull();
  });

  it("다건 임베드(/multi)에도 라디오가 보인다 — 국외 건도 입력을 받는다(사용자 결정 C-1)", () => {
    nav.pathname = "/calc/transfer-tax/multi";
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("asset-location-block")).not.toBeNull();
    fireEvent.click(screen.getByTestId("asset-location-foreign"));
    expect(screen.queryByTestId("foreign-real-estate-step")).not.toBeNull();
  });
});

describe("FRE-3 단계 라벨 — 국외 1개 · 국내 4개", () => {
  it("메타는 국외 1단계 · 국내 4단계", () => {
    expect(foreignWizardMeta({ assetLocation: "foreign" }).steps).toEqual([...STEPS_FOREIGN]);
    expect(foreignWizardMeta({ assetLocation: "foreign" }).steps).toHaveLength(1);
    expect(foreignWizardMeta({ assetLocation: "domestic" }).steps).toEqual([...STEPS_SINGLE]);
    expect(foreignWizardMeta({}).steps).toHaveLength(4);
  });

  it("스테퍼·사이드바 단계가 국외에서 1개다(국내 «보유 상황»·«감면·공제»·«가산세»가 나오지 않는다)", () => {
    seed();
    render(<TransferTaxCalculator />);
    expect(screen.queryAllByText("보유 상황")).toHaveLength(0);
    expect(screen.queryAllByText("감면·공제")).toHaveLength(0);
    expect(screen.queryAllByText("가산세")).toHaveLength(0);
    expect(screen.queryAllByText("국외자산").length).toBeGreaterThan(0);
  });

  it("FRE-4 회귀 가드 — 국내는 4단계 스테퍼 그대로", () => {
    render(<TransferTaxCalculator />);
    expect(screen.queryAllByText("보유 상황").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("가산세").length).toBeGreaterThan(0);
  });

  it("소스 가드 — TransferTaxCalculator는 STEPS_SINGLE을 직접 쓰지 않는다(스테퍼·사이드바가 국내 4단계로 되돌아가는 회귀)", () => {
    const src = readFileSync(join(process.cwd(), "app/calc/transfer-tax/TransferTaxCalculator.tsx"), "utf8");
    expect(src).not.toMatch(/\bSTEPS_SINGLE\b/);
  });
});

describe("계산 버튼 — 국외 전용 API로만 간다", () => {
  it("입력이 비어 있으면 ⑧ 오류 목록을 보이고 fetch하지 않는다", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    seed({ foreignResidenceYears: "" });
    render(<TransferTaxCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "세금 계산하기" }));
    await waitFor(() => expect(screen.queryAllByText(/국내 거주 연수를 입력하세요/).length).toBeGreaterThan(0));
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("국외 입력 화면에는 국내 «가산세 계산하기» 버튼이 없다(enablePenalty가 남아 있어도)", () => {
    seed({ enablePenalty: true });
    render(<TransferTaxCalculator />);
    expect(screen.queryByRole("button", { name: "가산세 계산하기" })).toBeNull();
  });
});

describe("국외 입력 화면 — 안내·힌트·카드 관리", () => {
  it("환율 hint가 기준환율 ↔ 대고객 매입률·매도율을 구별한다(3종 함정)", () => {
    seed();
    render(<TransferTaxCalculator />);
    expect(FX_RATE_HINT).toContain("대고객 매입률·매도율이 아닙니다");
    expect(screen.queryAllByText(FX_RATE_HINT).length).toBeGreaterThanOrEqual(2); // 양도일·취득일 환율 칸
  });

  it("5년 미만 경고(비차단) · 미등기 안내는 칸 없이 카드 1장", () => {
    seed({ foreignResidenceYears: "3" });
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("foreign-residence-under-min")).not.toBeNull();
    expect(screen.queryByTestId("foreign-unregistered-notice")).not.toBeNull();
    cleanup();
    seed({ foreignResidenceYears: "7" });
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("foreign-residence-under-min")).toBeNull();
  });

  it("카드 추가·삭제 — 1건이면 삭제 버튼이 없고 20건이면 추가 버튼이 막힌다", () => {
    seed();
    render(<TransferTaxCalculator />);
    expect(screen.queryByRole("button", { name: "국외자산 1 삭제" })).toBeNull();
    fireEvent.click(screen.getByTestId("foreign-add-asset"));
    expect(useCalcWizardStore.getState().formData.foreignAssets).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "국외자산 2 삭제" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "국외자산 2 삭제" }));
    expect(useCalcWizardStore.getState().formData.foreignAssets).toHaveLength(1);

    cleanup();
    seed({}, Array.from({ length: 20 }, () => k1Asset()));
    render(<TransferTaxCalculator />);
    expect((screen.getByTestId("foreign-add-asset") as HTMLButtonElement).disabled).toBe(true);
  });

  it("필요경비 행의 입력칸에 data-field 앵커가 달리고 «양도일 환율과 같음»은 환율을 한 번 써 넣는다", () => {
    seed({}, [k1Asset({ capitalRows: [{ date: "2026-07-10", amountForeign: "10000", exchangeRate: "" }] })]);
    const { container } = render(<TransferTaxCalculator />);
    for (const cell of ["date", "amount", "rate"]) {
      expect(container.querySelector(`[data-field="foreignAsset.capitalRows.0.${cell}"]`)).not.toBeNull();
    }
    const cap = screen.getByTestId("foreign-capitalRows-0");
    fireEvent.click(within(cap).getByRole("button", { name: "양도일 환율과 같음" }));
    expect(useCalcWizardStore.getState().formData.foreignAssets[0].capitalRows[0].exchangeRate).toBe("1100");
  });

  it("U5: 국외 1단계 맨 위에 «지원하지 않는 경우» 안내 카드가 있다(국내 합산 안 함 · 상속·증여 · 환차익 · 장기할부 · 시가 · 비과세)", () => {
    seed();
    render(<TransferTaxCalculator />);
    const card = screen.getByTestId("foreign-unsupported-notice");
    const step = screen.getByTestId("foreign-real-estate-step");
    expect(step.firstElementChild).toBe(card);
    expect(card.textContent).toContain("이 계산이 지원하지 않는 경우");
    for (const id of ["domestic", "inherited", "fxBorrow", "installment", "market", "exemption"]) {
      expect(within(card).getByTestId(`foreign-unsupported-${id}`)).toBeTruthy();
    }
    expect(within(card).getByTestId("foreign-unsupported-domestic").textContent).toContain("국내 양도소득과 합산하지 않습니다");
    expect(within(card).getByTestId("foreign-unsupported-exemption").textContent).toContain("국내에 1주택");
  });

  it("L4: 외국납부세액 행에는 «양도일 환율과 같음»이 없고(납부일 기준) 필요경비 행에는 있다", () => {
    seed({ foreignTaxEnabled: true }, [
      k1Asset({
        capitalRows: [{ date: "2026-07-10", amountForeign: "10000", exchangeRate: "" }],
        taxRows: [{ date: "2026-08-01", amountForeign: "5000", exchangeRate: "" }],
      }),
    ]);
    render(<TransferTaxCalculator />);
    const tax = screen.getByTestId("foreign-tax-rows-0");
    expect(within(tax).queryByRole("button", { name: "양도일 환율과 같음" })).toBeNull();
    expect(within(screen.getByTestId("foreign-capitalRows-0")).getByRole("button", { name: "양도일 환율과 같음" })).toBeTruthy();
  });

  it("L7: 통화 «기타» 코드 입력에는 placeholder가 없다(hint가 안내)", () => {
    seed();
    render(<TransferTaxCalculator />);
    fireEvent.change(screen.getByTestId("foreign-currency-select"), { target: { value: "OTHER" } });
    expect(screen.getByTestId("foreign-currency-code").getAttribute("placeholder")).toBeNull();
  });

  it("통화 «기타»를 고르면 3자리 코드 입력이 나타나고 대문자로 저장한다", () => {
    seed();
    render(<TransferTaxCalculator />);
    fireEvent.change(screen.getByTestId("foreign-currency-select"), { target: { value: "OTHER" } });
    expect(useCalcWizardStore.getState().formData.foreignAssets[0].currency).toBe("");
    fireEvent.change(screen.getByTestId("foreign-currency-code"), { target: { value: "vnd" } });
    expect(useCalcWizardStore.getState().formData.foreignAssets[0].currency).toBe("VND");
  });

  it("외국납부세액 토글을 켜면 처리 방법 라디오(세액공제·필요경비 산입)와 자산별 납부 내역 행이 나온다", () => {
    seed();
    const { container } = render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("foreign-tax-rows-0")).toBeNull();
    fireEvent.click(within(screen.getByTestId("foreign-tax-toggle")).getByRole("switch"));
    expect(useCalcWizardStore.getState().formData.foreignTaxEnabled).toBe(true);
    expect(radioValues(container, "foreignTaxMethod")).toEqual(["credit", "expense"]);
    expect(checkedRadioValue(container, "foreignTaxMethod")).toBe("credit");
    expect(screen.queryByTestId("foreign-tax-rows-0")).not.toBeNull();
  });
});
