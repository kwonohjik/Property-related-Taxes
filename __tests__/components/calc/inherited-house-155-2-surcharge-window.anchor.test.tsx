/**
 * §155②③ — 다주택 중과 한시배제 창에서 **상속주택 선언 경로**가 사라졌다.
 *
 * 「소득세법 시행령」 §155②·③은 「제154조제1항을 적용할 때 … 국내에 1개의 주택을 소유하고
 * 있는 것으로 본다」로 **§89①3호 비과세** 판정을 바꾼다. §104⑦ 중과와는 층위가 다르다.
 * 그런데 `houses[]`의 **유일한 입력 위젯**인 `HousesListSection`이 Step4 ④ 「주택수·중과
 * 판정」 섹션 안에 있었고, 그 섹션이 `!surchargeSuspended` 게이트를 달고 있었다.
 *
 * ⇒ 양도일이 한시배제 창(2022-05-10 ~ 2026-05-09) 안이고 보유 2년 이상이면 `isInherited`를
 *   켤 칸 자체가 없었다 → 유효 주택수 2 유지 → 12억 비과세 상실.
 *
 * 같은 게이트가 `presaleRights`도 가둔다 — 「소득세법」 §89②(주택 + 조합원입주권·분양권을
 * 보유하다가 그 주택을 양도 → §89①3호 배제) 역시 **비과세 축**이다. ② 섹션은
 * `householdHousingCount < 2`에서만 권리 목록을 열므로, 2채 이상 + 한시배제에서는
 * 선언 경로가 없었다.
 *
 * 세액 실측(`makeMockRates()` 기준, 양도 10억·취득 5억·2014-01-01 취득·2025-06-01 양도·
 * 1세대·세대 2주택·상속주택 1채): 선언 시 `isExempt=true` 세액 **0** ↔ 미선언 시
 * **141,966,000원**. 창은 이미 닫혔지만 창 안에 양도일이 있는 건(확정신고·경정청구 포함)에는
 * 그대로 발현한다.
 *
 * ⑧ 비대칭도 함께 고쳤다 — `transfer-tax-validate.ts`가 창 안에서는 `houses`·`presaleRights`
 * 검증을 건너뛰는데 `transfer-tax-api.ts:582`는 `housesPayload`를 억제 없이 전송해, 창 밖에서
 * 입력한 뒤 양도일을 창 안으로 옮기면 **무검증 통과**가 됐다. D4-03이 `specialHouseExclusions`
 * 축에서 걷어낸 것과 같은 비대칭이 형제 두 축에 남아 있었다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput, makeHouseInfo } from "../../tax-engine/_helpers/mock-rates";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { isMultiHouseSurchargeSuppressed } from "@/lib/calc/transfer-tax-api-helpers";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

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

function houseEntry(over: Partial<HouseEntry> = {}): HouseEntry {
  return {
    id: "h1",
    region: "capital",
    acquisitionDate: "2010-01-01",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  };
}

function makeForm(
  w: { transferDate: string; acquisitionDate: string },
  over: Partial<TransferFormData> = {},
): TransferFormData {
  const base = createDefaultTransferFormData();
  return {
    ...base,
    assets: base.assets.map((a, i) =>
      i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: w.acquisitionDate } : a,
    ),
    transferDate: w.transferDate,
    isOneHousehold: true,
    householdHousingCount: "2",
    ...over,
  };
}

function renderStep4(
  w: { transferDate: string; acquisitionDate: string },
  over: Partial<TransferFormData> = {},
) {
  render(<Step4 form={makeForm(w, over)} onChange={() => {}} />);
}

/** `HousesListSection`의 머리글 — houses[] 입력 경로의 존재 표지. */
const HOUSES_LIST_TITLE = /다른 보유 주택 목록/;
/** §155② 2년내 증여분 게이트 토글 — 상속주택이 목록에 있을 때만 뜬다. */
const GIFTED_2YR_TITLE = /양도주택이 상속개시 2년내 피상속인 증여분/;
/** 중과 경과조치(§167의3①12의2 나·다목) 섹션 — 중과 전용이라 창 안에서는 계속 닫힌다. */
const GRACE_PERIOD_TITLE = /중과 경과조치 조건 입력/;

describe("§155②③ 한시배제 창 × 상속주택 입력 경로", () => {
  it("H155-1: 전제 확인 — 창 안은 한시배제가 발동하고, 창 밖은 발동하지 않는다", () => {
    expect(isMultiHouseSurchargeSuppressed(IN_WINDOW.transferDate, IN_WINDOW.acquisitionDate)).toBe(true);
    expect(isMultiHouseSurchargeSuppressed(OUT_WINDOW.transferDate, OUT_WINDOW.acquisitionDate)).toBe(false);
  });

  it("H155-2: 🔴 창 **안**에서도 세대 보유 주택 목록이 있다 (종전에는 사라졌다)", () => {
    renderStep4(IN_WINDOW);
    expect(screen.getAllByText(HOUSES_LIST_TITLE).length).toBeGreaterThan(0);
  });

  it("H155-3: 창 밖에서는 종전대로 ④ 중과 트랙 안에 있다", () => {
    renderStep4(OUT_WINDOW);
    expect(screen.getAllByText(HOUSES_LIST_TITLE).length).toBeGreaterThan(0);
  });

  it("H155-4: 🔑 어느 쪽이든 **정확히 1벌만** 뜬다 — 두 벌이면 같은 배열을 각각 patch해 마지막이 이긴다", () => {
    renderStep4(IN_WINDOW);
    expect(screen.getAllByText(HOUSES_LIST_TITLE)).toHaveLength(1);
    cleanup();
    renderStep4(OUT_WINDOW);
    expect(screen.getAllByText(HOUSES_LIST_TITLE)).toHaveLength(1);
  });

  it("H155-5: 🔴 창 **안**에서 목록에 상속주택이 있으면 §155② 2년내 증여분 게이트가 열린다", () => {
    renderStep4(IN_WINDOW, {
      houses: [houseEntry({ id: "inh", isInherited: true, inheritedDate: "2023-01-01" })],
    });
    expect(screen.getAllByText(GIFTED_2YR_TITLE)).toHaveLength(1);
  });

  it("H155-6: 상속주택이 없으면 창 안에서도 그 토글은 뜨지 않는다 (조건부 유지)", () => {
    renderStep4(IN_WINDOW, { houses: [houseEntry()] });
    expect(screen.queryAllByText(GIFTED_2YR_TITLE)).toHaveLength(0);
  });

  it("H155-7: 중과 전용 입력(양도일 기준 조정대상지역)은 창 안에서 여전히 숨는다", () => {
    renderStep4(IN_WINDOW);
    expect(screen.queryAllByRole("switch", { name: /양도일 기준 조정대상지역/ })).toHaveLength(0);
    cleanup();
    renderStep4(OUT_WINDOW);
    expect(screen.getAllByRole("switch", { name: /양도일 기준 조정대상지역/ }).length).toBeGreaterThan(0);
  });

  it("H155-8: 🔴 ⑧ — 창 **안**에서도 상속주택 상속개시일 미입력이 차단된다 (종전 무검증 통과)", () => {
    const form = makeForm(IN_WINDOW, {
      houses: [houseEntry({ id: "inh", isInherited: true, inheritedDate: "" })],
    });
    const issues = collectStepIssues(1, form);
    expect(issues.some((i) => i.message.includes("상속개시일을 입력하세요"))).toBe(true);
  });

  it("H155-9: 🔴 ⑧ — 창 안에서도 주택 행 기준시가 미입력이 차단된다", () => {
    const form = makeForm(IN_WINDOW, { houses: [houseEntry({ officialPrice: "" })] });
    const issues = collectStepIssues(1, form);
    expect(issues.some((i) => i.message.includes("기준시가(공시가격)를 입력하세요"))).toBe(true);
  });

  it("H155-10: 🔴 ⑧ — 창 안에서도 분양권 취득일 미입력이 차단된다 (§89② 축)", () => {
    const form = makeForm(IN_WINDOW, {
      presaleRights: [{ id: "r1", kind: "presale", acquisitionDate: "" }] as never,
    });
    const issues = collectStepIssues(1, form);
    expect(issues.some((i) => i.message.includes("분양권·입주권 1: 취득일"))).toBe(true);
  });

  it("H155-11: 세액 스테이크 — 상속주택을 선언하면 비과세, 못 하면 141,966,000원", () => {
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
        sellingHouseId: "selling",
        houses: [
          makeHouseInfo("selling", {}),
          makeHouseInfo("inh", { isInherited: true, inheritedDate: D("2023-01-01") }),
        ],
      },
      rates,
    );
    const notDeclared = calculateTransferTax(base, rates);
    expect(declared.isExempt).toBe(true);
    expect(declared.totalTax).toBe(0);
    expect(notDeclared.isExempt).toBe(false);
    expect(notDeclared.totalTax).toBe(141_966_000);
  });

  it("H155-12: §155② 게이트 — 2년내 피상속인 증여분이면 선언해도 과세로 돌아온다", () => {
    const base = baseTransferInput({
      transferDate: D("2025-06-01"),
      acquisitionDate: D("2014-01-01"),
      transferPrice: 1_000_000_000,
      acquisitionPrice: 500_000_000,
      isOneHousehold: true,
      householdHousingCount: 2,
      propertyType: "housing",
      residencePeriodMonths: 36,
      sellingHouseId: "selling",
      houses: [
        makeHouseInfo("selling", {}),
        makeHouseInfo("inh", { isInherited: true, inheritedDate: D("2023-01-01") }),
      ],
    });
    const gated = calculateTransferTax(
      { ...base, generalHouseGiftedFromDecedentWithin2yr: true },
      rates,
    );
    expect(gated.isExempt).toBe(false);
    expect(gated.totalTax).toBe(141_966_000);
  });

  it("H155-13: 중과 경과조치(§167의3①12의2 나·다목) 섹션은 창 **안**에서만 숨는다", () => {
    /**
     * 창 안에서는 `checkGracePeriodExemption`의 가목 우선 게이트가 `gracePeriod` 내용과
     * 무관하게 `suspended: true`를 내므로 이 입력은 **증명 가능한 no-op**이다
     * (`multi-house-surcharge-exclusion.ts:156` · `GRACE_PERIOD_A_DEADLINE`은
     *  `SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end` 단일 출처).
     * 목록은 비과세 축이라 열지만 이 섹션만 계속 닫는다.
     */
    const houses = [houseEntry(), houseEntry({ id: "h2" })];
    renderStep4(IN_WINDOW, { houses });
    expect(screen.queryAllByText(GRACE_PERIOD_TITLE)).toHaveLength(0);
    cleanup();
    renderStep4(OUT_WINDOW, { houses });
    expect(screen.getAllByText(GRACE_PERIOD_TITLE).length).toBeGreaterThan(0);
  });

  it("H155-14: ⑧ — 위젯이 닫힌 창 안에서는 gracePeriod 미완성을 차단하지 않는다 (짝 맞춤)", () => {
    const houses = [houseEntry()];
    const grace = { contractDate: "", isLandPermitTarget: true, permitApplicationDate: "" };
    const inWindow = collectStepIssues(1, makeForm(IN_WINDOW, { houses, gracePeriod: grace as never }));
    const outWindow = collectStepIssues(1, makeForm(OUT_WINDOW, { houses, gracePeriod: grace as never }));
    expect(inWindow.some((i) => i.message.includes("매매계약 체결일"))).toBe(false);
    expect(outWindow.some((i) => i.message.includes("매매계약 체결일"))).toBe(true);
  });
});
