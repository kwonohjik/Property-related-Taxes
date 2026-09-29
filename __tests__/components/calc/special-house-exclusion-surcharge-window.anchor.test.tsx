/**
 * D4-03 — 다주택 중과 한시배제 창에서 감면주택 주택수 제외의 **유일한 입력 경로**가 사라졌다.
 *
 * 조특법 §98의2④·§98의3③·§98의5②·§98의6②·§98의7②·§98의8②·§99②·§99의2②는 모두
 * 「**소득세법 제89조제1항제3호를 적용할 때** … 소유주택으로 보지 아니한다」로, §104⑦
 * 중과가 아니라 **1세대1주택 비과세** 판정을 바꾼다. 그런데 이 입력 위젯
 * (`SpecialHouseExclusionSection`)의 유일한 사용처가 Step4의 ④ 「주택수·중과 판정」
 * 섹션 안에 있었고, 그 섹션이 `!surchargeSuspended` 게이트를 달고 있었다.
 *
 * ⇒ 양도일이 한시배제 창(2022-05-10 ~ 2026-05-09) 안이고 보유 2년 이상이면 섹션 전체가
 *   안내 카드로 대체되어 **선언할 위젯이 없어졌다** → 유효 주택수 2 유지 → 12억 비과세 상실.
 *
 * 세액 실측(`makeMockRates()` 기준, 양도 10억·취득 5억·2014-01-01 취득·2025-06-01 양도·
 * 1세대·세대 2주택·§98의3 감면주택 1채): 선언 시 `isExempt=true` 세액 **0** ↔
 * 미선언 시 **141,966,000원**. 창은 이미 닫혔지만 창 안에 양도일이 있는 건(확정신고·
 * 경정청구 포함)에는 그대로 발현한다.
 *
 * 바로 위 §89②(분양권 축) 주석이 같은 문제를 이미 인정하고 그 축만 ②로 옮겼는데,
 * 형제인 감면주택 제외는 남아 있었다.
 *
 * ⑧ 비대칭도 함께 고쳤다 — `transfer-tax-validate.ts`가 창 안에서는 검증을 건너뛰는데
 * `transfer-tax-api.ts`는 값을 그대로 전송해, 창 밖에서 입력한 뒤 양도일을 창 안으로
 * 옮기면 **무검증 통과**가 됐다.
 *
 * 🔄 2026-09-30 — 주택·재개발 아파트 양도에서는 입력 경로가 **명부 행 ⑥**으로 옮겨졌다
 * (`transfer-calc-count-exclusion-row-link.plan.md`). 폼 전역 섹션은 그 게이트 밖(권리 양도)에만
 * 남는다. 이 파일이 지키는 사실 — 「창 안에서도 입력 경로가 **정확히 1벌** 있고 ⑧이 막는다」 — 은
 * 두 경로 각각에 대해 그대로 단언한다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates } from "../../tax-engine/_helpers/mock-rates";
import { baseTransferInput } from "../../tax-engine/_helpers/mock-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { isMultiHouseSurchargeSuppressed } from "@/lib/calc/transfer-tax-api-helpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRates();

/** 창 안 = 한시배제 발동 (양도 2025-06-01 · 취득 2014-01-01 → 보유 2년 이상) */
const IN_WINDOW = { transferDate: "2025-06-01", acquisitionDate: "2014-01-01" };
/** 창 밖 = 종전에도 ④가 그려지던 조건 */
const OUT_WINDOW = { transferDate: "2026-08-01", acquisitionDate: "2014-01-01" };

function makeForm(
  w: { transferDate: string; acquisitionDate: string },
  assetKind: "housing" | "right_to_move_in" = "housing",
): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind, acquisitionDate: w.acquisitionDate } : a,
    ),
    transferDate: w.transferDate,
    isOneHousehold: true,
    householdHousingCount: "2",
    specialHouseExclusions: [],
  };
}

function renderStep4(
  w: { transferDate: string; acquisitionDate: string },
  assetKind: "housing" | "right_to_move_in" = "housing",
) {
  render(<Step4 form={makeForm(w, assetKind)} onChange={() => {}} />);
}

/** 폼 전역 섹션 — 게이트 밖(권리 양도)의 입력 경로 */
const EXCLUSION_TITLE = /조특법 감면주택 보유 — 주택 수 제외/;
/** 명부 — 게이트 안(주택 양도)의 입력 경로. 행 편집 ⑥이 감면주택을 받는다. */
const ROSTER_ADD = { name: "+ 주택 추가" } as const;

describe("D4-03 한시배제 창 × 감면주택 주택수 제외", () => {
  it("D4-03-1: 전제 확인 — 창 안은 한시배제가 발동하고, 창 밖은 발동하지 않는다", () => {
    expect(isMultiHouseSurchargeSuppressed(IN_WINDOW.transferDate, IN_WINDOW.acquisitionDate)).toBe(true);
    expect(isMultiHouseSurchargeSuppressed(OUT_WINDOW.transferDate, OUT_WINDOW.acquisitionDate)).toBe(false);
  });

  it("D4-03-2: 🔴 창 **안**에서도 입력 경로가 있다 — 주택 양도는 명부(행 ⑥), 권리 양도는 폼 전역 섹션", () => {
    renderStep4(IN_WINDOW);
    expect(screen.getAllByRole("button", ROSTER_ADD).length).toBeGreaterThan(0);
    cleanup();
    renderStep4(IN_WINDOW, "right_to_move_in");
    expect(screen.getAllByText(EXCLUSION_TITLE).length).toBeGreaterThan(0);
  });

  it("D4-03-3: 창 밖에서도 같다", () => {
    renderStep4(OUT_WINDOW);
    expect(screen.getAllByRole("button", ROSTER_ADD).length).toBeGreaterThan(0);
    cleanup();
    renderStep4(OUT_WINDOW, "right_to_move_in");
    expect(screen.getAllByText(EXCLUSION_TITLE).length).toBeGreaterThan(0);
  });

  it("D4-03-4: 🔑 어느 쪽이든 **정확히 1벌만** 뜬다 — 주택 양도에서는 폼 전역 섹션이 사라지고 명부만 남는다", () => {
    for (const w of [IN_WINDOW, OUT_WINDOW]) {
      renderStep4(w);
      expect(screen.getAllByRole("button", ROSTER_ADD)).toHaveLength(1);
      expect(screen.queryAllByText(EXCLUSION_TITLE)).toHaveLength(0);
      cleanup();
      renderStep4(w, "right_to_move_in");
      expect(screen.getAllByText(EXCLUSION_TITLE)).toHaveLength(1);
      cleanup();
    }
  });

  it("D4-03-5: 창 안에서도 안내 카드는 그대로 뜬다 (중과 입력 생략은 여전히 사실)", () => {
    renderStep4(IN_WINDOW);
    const notice = screen.getByTestId("surcharge-suspended-notice");
    // <b> 태그로 쪼개져 있어 getByText가 아니라 textContent로 본다.
    // 2026-09-02 문구 정정 — 「생략되는 것」이 중과 전용 입력 하나로 좁혀졌다(§155②③ 트랙 참조).
    expect(notice.textContent).toMatch(/중과 전용 입력.*계산에 영향이 없어 생략됩니다/);
    expect(notice.textContent).toMatch(/비과세 판정.*이 기간에도 아래에 그대로 제공됩니다/);
    expect(notice.textContent).toMatch(/감면주택 주택수 제외/);
  });

  it("D4-03-6: 🔴 ⑧ — 창 **안**에서도 미완성 감면주택이 차단된다 (주택 양도 = 행 ⑥)", () => {
    const form = makeForm(IN_WINDOW);
    form.houses = [
      {
        id: "s",
        region: "non_capital",
        acquisitionDate: "2009-06-01",
        officialPrice: "150000000",
        countExclusion: {
          kind: "special",
          special: { article: "", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false },
        },
      },
    ] as never;
    const issues = collectStepIssues(1, form);
    expect(issues.some((i) => i.message.includes("감면주택의 적용 조문을 선택하세요"))).toBe(true);
  });

  it("D4-03-6r: ⑧ — 권리 양도(폼 전역 섹션)도 창 안에서 미완성 행을 막는다", () => {
    const form = makeForm(IN_WINDOW, "right_to_move_in");
    form.specialHouseExclusions = [
      { article: "", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false },
    ] as never;
    const issues = collectStepIssues(1, form);
    expect(issues.some((i) => i.message.includes("적용 조문을 선택하세요"))).toBe(true);
  });

  it("D4-03-7: ⑧ — 조문만 있고 날짜가 없으면 취득일·매매계약일을 요구한다 (창 안 · 폼 전역 섹션)", () => {
    const form = makeForm(IN_WINDOW, "right_to_move_in");
    form.specialHouseExclusions = [
      { article: "unsold_98_3", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false },
    ] as never;
    const issues = collectStepIssues(1, form);
    expect(issues.some((i) => i.message.includes("취득일(또는 매매계약일)"))).toBe(true);
  });

  it("D4-03-8: 세액 스테이크 — 선언하면 비과세, 못 하면 141,966,000원", () => {
    const base = baseTransferInput({
      transferDate: D("2025-06-01"),
      acquisitionDate: D("2014-01-01"),
      transferPrice: 1_000_000_000,
      acquisitionPrice: 500_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      propertyType: "housing",
      residencePeriodMonths: 36,
    });
    const declared = calculateTransferTax(
      {
        ...base,
        specialHouseExclusions: [
          { article: "unsold_98_3", houseAcquisitionDate: D("2009-06-01"), requirementsConfirmed: true },
        ],
      } as never,
      rates,
    );
    const notDeclared = calculateTransferTax(base, rates);
    expect(declared.isExempt).toBe(true);
    expect(declared.totalTax).toBe(0);
    expect(notDeclared.isExempt).toBe(false);
    expect(notDeclared.totalTax).toBe(141_966_000);
  });
});
