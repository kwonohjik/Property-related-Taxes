/** @vitest-environment jsdom */
/**
 * 국외 부동산 U2 — 계산 흐름 배선: 「세금 계산하기」 → 국외 전용 API → 결과 화면 · 사이드바 · 서버 오류 칸 이동 · 이력 보류 · 다건 안내
 *
 * route 핸들러를 fetch 뒤에 붙여 폼 → body → Zod → 엔진 → 결과 화면까지 한 번에 확인한다(교재 K-1).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ pathname: "/calc/transfer-tax" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
const rateLimitMock = vi.hoisted(() => ({ checkRateLimit: vi.fn(), getClientIp: vi.fn(), shouldBypassRateLimit: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => rateLimitMock);
rateLimitMock.checkRateLimit.mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 });
rateLimitMock.getClientIp.mockReturnValue("127.0.0.1");
rateLimitMock.shouldBypassRateLimit.mockReturnValue(false);

import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/foreign/route";
import TransferTaxCalculator from "@/app/calc/transfer-tax/TransferTaxCalculator";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { calculationRepository } from "@/lib/storage/calculation-repository";
import { FOREIGN_API_PATH } from "@/lib/calc/transfer-foreign-call";
import { FOREIGN_HISTORY_SAVE_DEFERRED_MESSAGE, MULTI_FOREIGN_UNSUPPORTED_MESSAGE } from "@/lib/calc/transfer-foreign-messages";
import { StepList } from "@/app/calc/transfer-tax/multi/MultiTransferSteps";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { foreignForm, k1Asset } from "../calc/_foreign-form-fixture";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
beforeEach(() => {
  nav.pathname = "/calc/transfer-tax";
  useCalcWizardStore.getState().reset();
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});

const seed = (patch: Parameters<typeof foreignForm>[0] = {}, assets = [k1Asset()]) =>
  useCalcWizardStore.setState({ formData: foreignForm({ foreignResidenceYears: "5", ...patch }, assets), result: null, currentStep: 0 });

function routeFetch() {
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    urls.push(String(input));
    return POST(new NextRequest(`http://localhost${String(input)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: String(init?.body) }));
  });
  return urls;
}

const calculate = () => fireEvent.click(screen.getByRole("button", { name: "세금 계산하기" }));

describe("K-1 — 계산 → 결과 화면", () => {
  it("국외 전용 API만 부르고(국내 /api/calc/transfer 아님) 결과 화면에 교재 숫자가 보인다", async () => {
    const urls = routeFetch();
    const save = vi.spyOn(calculationRepository, "saveOrUpdateByBusinessKey");
    seed();
    render(<TransferTaxCalculator />);
    calculate();
    await waitFor(() => expect(screen.queryByTestId("foreign-result-view")).not.toBeNull());
    expect(urls).toEqual([FOREIGN_API_PATH]);
    const st = useCalcWizardStore.getState();
    expect(st.result?.mode).toBe("foreign");
    expect(st.currentStep).toBe(1);
    expect(screen.getByTestId("foreign-income-total").textContent).toContain("437,000,000");
    expect(screen.getByTestId("foreign-tax-base").textContent).toContain("434,500,000");
    expect(screen.getByTestId("foreign-calculated-tax").textContent).toContain("147,860,000");
    expect(screen.getByTestId("foreign-local-tax").textContent).toContain("14,786,000");
    // 이력: 국외 결과는 U3까지 자동 저장하지 않는다(제목·dedup·복원 경로가 국외를 모른다)
    expect(save).not.toHaveBeenCalled();
  });

  it("결과 화면에서 «이전»으로 돌아가면 입력 화면이 다시 보이고 결과는 입력을 고치면 사라진다", async () => {
    routeFetch();
    seed();
    render(<TransferTaxCalculator />);
    calculate();
    await waitFor(() => expect(screen.queryByTestId("foreign-result-view")).not.toBeNull());
    fireEvent.click(screen.getAllByRole("button", { name: "이전" })[0]);
    await waitFor(() => expect(screen.queryByTestId("foreign-result-view")).toBeNull());
    expect(screen.queryByTestId("foreign-real-estate-step")).not.toBeNull();
    // 돌아온 직후엔 결과가 남아 사이드바가 엔진 값을 보인다
    expect(screen.getByTestId("foreign-sidebar-total-tax").textContent).toContain("162,646,000");
    fireEvent.click(screen.getByTestId("foreign-add-asset"));
    expect(useCalcWizardStore.getState().result).toBeNull();
  });

  it("거주 5년 미만이면 납세의무 없음 카드를 보인다(오류가 아니다)", async () => {
    routeFetch();
    seed({ foreignResidenceYears: "3" });
    render(<TransferTaxCalculator />);
    calculate();
    await waitFor(() => expect(screen.queryByTestId("foreign-not-liable")).not.toBeNull());
    expect(screen.getByTestId("foreign-result-total").textContent).toBe("0");
  });
});

describe("⑥ 사이드바", () => {
  it("계산 전: 입력으로 계산되는 환산액만 — 양도가액 990,000,000 · 취득가액 520,000,000 · 필요경비 33,000,000, 세액 항목 없음", () => {
    seed();
    render(<TransferTaxCalculator />);
    const box = screen.getByTestId("foreign-sidebar-summary");
    expect(box.textContent).toContain("990,000,000");
    expect(box.textContent).toContain("520,000,000");
    expect(box.textContent).toContain("33,000,000");
    expect(box.textContent).not.toContain("총 납부세액");
    expect(screen.queryByText("자산 1 —", { exact: false })).toBeNull(); // 국내 «자산 1» 행이 새지 않는다
  });

  it("입력이 비면 안내 한 줄", () => {
    useCalcWizardStore.setState({ formData: foreignForm({}, [{ ...k1Asset(), transferAmount: "", acquisitionAmount: "", costRows: [] }]), result: null, currentStep: 0 });
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("foreign-sidebar-summary")).toBeNull();
    expect(screen.queryByText(/원화 환산액이 표시됩니다/)).not.toBeNull();
  });
});

describe("서버 오류 — 입력칸으로 이동 · 확인 필요", () => {
  it("400 fieldErrors가 가리킨 칸이 오류 목록에 뜨고 눌러서 그 칸으로 간다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ error: { code: "INVALID_INPUT", message: "입력값이 올바르지 않습니다", fieldErrors: { "assets.0.transfer.exchangeRate": ["assets[0].transfer.exchangeRate: 환율은 0보다 커야 합니다"] } } }),
        { status: 400 },
      ),
    );
    seed();
    const { container } = render(<TransferTaxCalculator />);
    calculate();
    const panel = await screen.findByTestId("validation-issues");
    const issueBtn = within(panel).getByRole("button", { name: /양도일 기준환율/ });
    expect(container.querySelector('[data-field="foreignAsset.transferRate"]')).not.toBeNull();
    fireEvent.click(issueBtn);
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(useCalcWizardStore.getState().result).toBeNull();
  });

  it("차손 혼재 코드는 «확인 필요» 문구로 보인다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { code: "FOREIGN_LOSS_NETTING_UNRESOLVED", message: "입력값이 올바르지 않습니다", fieldErrors: { assets: ["확인 필요: 같은 과세기간에 양도차손 자산과 양도차익 자산이 함께 있습니다."] } } }), { status: 400 }),
    );
    seed();
    render(<TransferTaxCalculator />);
    calculate();
    const panel = await screen.findByTestId("validation-issues");
    expect(panel.textContent).toContain("확인 필요: 같은 과세기간에 양도차손 자산과 양도차익 자산이 함께 있습니다.");
  });
});

describe("이력 보류 — 국외 결과는 저장하지 않는다(U3)", () => {
  it("수동 «저장하기»는 보류 안내만 보이고 이력에 쓰지 않는다", async () => {
    const save = vi.spyOn(calculationRepository, "saveOrUpdateByBusinessKey");
    seed();
    render(<TransferTaxCalculator />);
    fireEvent.click(screen.getByRole("button", { name: "현재 입력 저장" }));
    await waitFor(() => expect(screen.queryByText(FOREIGN_HISTORY_SAVE_DEFERRED_MESSAGE)).not.toBeNull());
    expect(save).not.toHaveBeenCalled();
  });
});

describe("D-M — 다건(/multi)에서 국외 건 차단 안내", () => {
  it("연간 합산 편집 화면에서 국외를 고르면 «한 건 계산 안에서 여러 개를 추가하세요» 안내가 그 자리에 뜬다", () => {
    nav.pathname = "/calc/transfer-tax/multi";
    render(<TransferTaxCalculator />);
    expect(screen.queryByTestId("multi-foreign-notice")).toBeNull();
    fireEvent.click(screen.getByTestId("asset-location-foreign"));
    expect(screen.getByTestId("multi-foreign-notice").textContent).toContain(MULTI_FOREIGN_UNSUPPORTED_MESSAGE);
    expect(MULTI_FOREIGN_UNSUPPORTED_MESSAGE).toContain("국외 자산은 한 건 계산 안에서 여러 개를 추가하세요");
  });

  it("건 목록에서도 국외 건 옆에 같은 안내가 보이고 국내 건에는 없다", () => {
    const item = (id: string, form: PropertyItem["form"]): PropertyItem => ({ propertyId: id, propertyLabel: `양도 ${id}번`, form, completionPercent: 100 });
    const fn = vi.fn();
    render(
      <StepList
        properties={[item("1", foreignForm()), item("2", createDefaultTransferFormData())]}
        onAdd={fn} onLoad={fn} onEdit={fn} onRemove={fn} onNext={fn} onReset={fn}
      />,
    );
    const notices = screen.getAllByTestId("multi-foreign-list-notice");
    expect(notices).toHaveLength(1);
    expect(notices[0].textContent).toBe(MULTI_FOREIGN_UNSUPPORTED_MESSAGE);
  });

  it("단건 화면에서는 이 안내가 없다", () => {
    render(<TransferTaxCalculator />);
    fireEvent.click(screen.getByTestId("asset-location-foreign"));
    expect(screen.queryByTestId("multi-foreign-notice")).toBeNull();
  });
});
