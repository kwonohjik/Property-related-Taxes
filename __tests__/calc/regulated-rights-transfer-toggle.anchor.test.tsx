/** @vitest-environment jsdom */
/**
 * 양도일 «조정대상지역» 칸 — 재개발 완공 APT·분양권(§104①4호 구간) (A-3).
 * 계획서 `docs/00-pm/regulated-rights-transfer-toggle.plan.md` Q-1 a · Q-2 a · Q-3 a.
 *
 * 종전: 두 자산은 주소 문자열에서 자동 판정된 값을 고칠 칸이 없었다(양도일 칸은 `primaryKind === "housing"`에서만). 값이 세액을 바꾸는데 —
 *   재개발APT(세대 주택 2 · 양도 2026-08-01) 중과 ↔ 일반, 분양권(양도 2018-01-01~2021-05-31) §104①4호 50% ↔ 보유기간별.
 *   결과 화면 고지는 「보유 상황에서 직접 선택하세요」라고 했지만 그 자리에 칸이 없었다.
 *
 * 묶음: A 노출 술어 · B 세액(주소 문자열 + 직접 만짐 → 만짐 존중 · 구간 밖은 존중 안 함) · C Step4 화면(칸·리셋 effect) · D 고지.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { houseRow, redevAptForm, runCalc } from "./_helpers/redev-one-house-route";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { presaleRightClause4Era, regulatedAtTransferToggleApplies } from "@/lib/calc/regulated-transfer-toggle-scope";
import { calcStoredRegulatedFlags, regulatedAddressAssumptions } from "@/lib/calc/effective-regulated-at-acquisition";
import { regulatedAssumptionFooter } from "@/lib/calc/regulated-area-assumption-text";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

type F = TransferFormData;

/** 지정 지역(마포) · 미지정 지역(포항) — 법정동코드 없이 주소 문자열만 넣는다. */
const MAPO = "서울특별시 마포구 테스트동 1-1";
const POHANG = "경상북도 포항시 남구 테스트동 1"; // 2020-12-18 이전 미지정 — 2020-06-01 시료용
const CHUNCHEON = "강원특별자치도 춘천시 테스트동 1"; // 전 기간 미지정

/** 분양권 양도 — 양도가 9억 · 취득가 3억 · 거주 0 · 세대 주택 1(단서 구간 밖이라 단서 확인은 묻지 않는다). */
function presaleForm(acq: string, transfer: string, over: Partial<F> = {}, assetOver: Record<string, unknown> = {}): F {
  const f = createDefaultTransferFormData();
  return {
    ...f,
    transferDate: transfer,
    filingDate: "2099-12-31",
    contractTotalPrice: "900000000",
    totalTransferExpense: "0",
    isOneHousehold: true,
    householdHousingCount: "1",
    householdNoOtherHousesConfirmed: true,
    householdNoPresaleRightsConfirmed: true,
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "presale_right",
        acquisitionCause: "purchase",
        acquisitionDate: acq,
        actualSalePrice: "900000000",
        fixedAcquisitionPrice: "300000000",
        useEstimatedAcquisition: false,
        addressJibun: POHANG,
        ...assetOver,
      } as unknown as AssetForm,
    ],
    ...over,
  } as F;
}

/** 직접 선택한 «양도일 조정대상지역» — 토글 onChange가 쓰는 두 값. */
const picked = (v: boolean): Partial<F> => ({ isRegulatedArea: v, isRegulatedAreaTouched: true });

describe("A. 노출 술어 — 칸이 있는 자산·양도일", () => {
  it("분양권 구간 = 엔진 단계표의 §104①4호 존재 구간(2018-01-01~2021-05-31) — 경계 포함·밖은 없음", () => {
    expect(presaleRightClause4Era("2018-01-01")).toBe(true);
    expect(presaleRightClause4Era("2021-05-31")).toBe(true);
    expect(presaleRightClause4Era("2017-12-31")).toBe(false);
    expect(presaleRightClause4Era("2021-06-01")).toBe(false);
    expect(presaleRightClause4Era("2026-08-01")).toBe(false);
    expect(presaleRightClause4Era("")).toBe(false);
    expect(presaleRightClause4Era(undefined)).toBe(false);
  });

  it("K-5/K-8/K-9 — 주택·재개발APT는 양도일과 무관하게 있고, 분양권은 구간 안만, 입주권·토지는 없다", () => {
    for (const d of ["2017-12-31", "2020-06-01", "2026-08-01"]) {
      expect(regulatedAtTransferToggleApplies("housing", d)).toBe(true);
      expect(regulatedAtTransferToggleApplies("redevelopment_apt", d)).toBe(true);
      expect(regulatedAtTransferToggleApplies("right_to_move_in", d)).toBe(false);
      expect(regulatedAtTransferToggleApplies("land", d)).toBe(false);
    }
    expect(regulatedAtTransferToggleApplies("presale_right", "2020-06-01")).toBe(true);
    expect(regulatedAtTransferToggleApplies("presale_right", "2021-06-01")).toBe(false);
    expect(regulatedAtTransferToggleApplies("presale_right", "2017-12-31")).toBe(false);
  });
});

describe("B. 세액 — 직접 선택이 ④에 실리고 세액을 바꾼다 (분양권)", () => {
  it("K-4 보유 2년 이상 · 양도 2020-06-01 — 주소 판정(미지정) 215,550,000 ↔ 직접 «지정» 298,750,000(§104①4호 50%)", async () => {
    const off = await runCalc(presaleForm("2018-03-01", "2020-06-01"));
    const on = await runCalc(presaleForm("2018-03-01", "2020-06-01", picked(true)));
    expect([off.status, on.status]).toEqual([200, 200]);
    expect(off.body.isRegulatedArea).toBe(false);
    expect(on.body.isRegulatedArea).toBe(true);
    expect(off.result.determinedTax).toBe(215_550_000);
    expect(on.result.determinedTax).toBe(298_750_000);
  });

  it("K-6 보유 1~2년 · 구간 안 — 주소 판정 239,000,000(②호 40%) ↔ 직접 «지정» 298,750,000", async () => {
    const off = await runCalc(presaleForm("2018-09-01", "2020-06-01"));
    const on = await runCalc(presaleForm("2018-09-01", "2020-06-01", picked(true)));
    expect(off.result.determinedTax).toBe(239_000_000);
    expect(on.result.determinedTax).toBe(298_750_000);
  });

  it("만지지 않았다면 저장값이 아니라 주소 판정이다 — 마포(지정) 주소 + 저장값 false도 298,750,000", async () => {
    const r = await runCalc(presaleForm("2018-03-01", "2020-06-01", { isRegulatedArea: false }, { addressJibun: MAPO }));
    expect(r.body.isRegulatedArea).toBe(true);
    expect(r.result.determinedTax).toBe(298_750_000);
  });

  it("직접 «아님» 선택은 주소 판정(마포 지정)을 이긴다 — 구간 안 분양권의 만짐 표지 존중", async () => {
    const r = await runCalc(presaleForm("2018-03-01", "2020-06-01", picked(false), { addressJibun: MAPO }));
    expect(r.body.isRegulatedArea).toBe(false);
    expect(r.result.determinedTax).toBe(215_550_000);
  });

  it("K-5 구간 밖(2021-06-01 · 2017-12-31)은 만짐 표지를 보지 않는다 — 값은 주소 판정이고 세액은 직접 선택과 무관", async () => {
    for (const [acq, transfer] of [
      ["2018-03-01", "2021-06-01"],
      ["2015-03-01", "2017-12-31"],
    ] as const) {
      const off = await runCalc(presaleForm(acq, transfer, {}, { addressJibun: CHUNCHEON }));
      const on = await runCalc(presaleForm(acq, transfer, picked(true), { addressJibun: CHUNCHEON }));
      expect(on.body.isRegulatedArea, `${transfer} 표지 존중 안 함`).toBe(false);
      expect(on.result.determinedTax, transfer).toBe(off.result.determinedTax);
    }
  });

  it("취득 당시 값은 분양권 세액에 닿지 않고(M-1~M-5 불변) 만짐 표지도 보지 않는다 — 마포(취득 당시 지정) 주소는 저장값 «아님»이어도 판정값", async () => {
    const base = presaleForm("2018-03-01", "2020-06-01", picked(true), { addressJibun: MAPO });
    const marked = { ...base, wasRegulatedAtAcquisition: false, wasRegulatedAtAcquisitionTouched: true } as F;
    expect(calcStoredRegulatedFlags(marked).wasRegulatedAtAcquisition).toBe(true);
    const a = await runCalc(base);
    const b = await runCalc(marked);
    expect(b.result.determinedTax).toBe(a.result.determinedTax);
  });
});

describe("B. 세액 — 재개발 완공 APT (Q-1 a)", () => {
  const redev = (over: Partial<F>, addr: string) =>
    redevAptForm({
      houses: [houseRow("h1", "2010-01-01")],
      count: "2",
      assetOver: { acquisitionDate: "2015-03-01", addressJibun: addr },
      formOver: { transferDate: "2026-08-01", filingDate: "2026-10-31", ...over },
    });

  it("K-1 세대 주택 2 · 양도 2026-08-01 — 주소 판정(미지정)은 일반 ↔ 직접 «지정»은 §104⑦ 중과", async () => {
    const off = await runCalc(redev({}, POHANG));
    const on = await runCalc(redev(picked(true), POHANG));
    expect(off.body.isRegulatedArea).toBe(false);
    expect(on.body.isRegulatedArea).toBe(true);
    expect(off.issues).toEqual([]);
    expect([off.result.determinedTax, on.result.determinedTax]).toEqual([460_335_000, 907_435_000]);
  });
});

describe("C. Step4 화면 — 칸과 리셋 effect", () => {
  const patches = () => {
    const calls: Partial<F>[] = [];
    return { calls, onChange: (d: Partial<F>) => calls.push(d) };
  };
  const wiped = (calls: Partial<F>[]) =>
    calls.some((c) => c.isRegulatedArea === false || c.isRegulatedAreaTouched === false);

  it("K-4 분양권 · 구간 안 · 주소 문자열만 — «양도일 기준 조정대상지역» 토글이 있다", () => {
    render(<Step4 form={presaleForm("2018-03-01", "2020-06-01")} onChange={() => {}} />);
    expect(screen.queryAllByTestId("transfer-is-regulated")).toHaveLength(1);
  });

  it("K-5 분양권 · 구간 밖(2021-06-01) — 칸 없음", () => {
    render(<Step4 form={presaleForm("2018-03-01", "2021-06-01")} onChange={() => {}} />);
    expect(screen.queryAllByTestId("transfer-is-regulated")).toHaveLength(0);
  });

  it("K-3 분양권 · 법정동코드 있음 — 토글 대신 읽기 전용 자동 판정", () => {
    render(<Step4 form={presaleForm("2018-03-01", "2020-06-01", {}, { regionCode: "1144010100" })} onChange={() => {}} />);
    expect(screen.queryAllByTestId("transfer-is-regulated")).toHaveLength(0);
    expect(screen.queryAllByTestId("transfer-regulated-transfer-auto")).toHaveLength(1);
  });

  it("K-9 입주권 — 칸 없음(유지)", () => {
    render(<Step4 form={presaleForm("2018-03-01", "2020-06-01", {}, { assetKind: "right_to_move_in" })} onChange={() => {}} />);
    expect(screen.queryAllByTestId("transfer-is-regulated")).toHaveLength(0);
  });

  it("K-1 재개발 완공 APT · 양도 2026-08-01 — ④ 섹션에 토글이 한 벌 있다(분양권 칸과 겹치지 않음)", () => {
    render(<Step4 form={redevAptForm({ formOver: { transferDate: "2026-08-01", filingDate: "2026-10-31" } })} onChange={() => {}} />);
    expect(screen.queryAllByTestId("transfer-is-regulated")).toHaveLength(1);
  });

  it("K-2 분양권 · 구간 안 — Step4 진입(마운트)이 사용자의 선택과 만짐 표지를 지우지 않는다", () => {
    const { calls, onChange } = patches();
    render(<Step4 form={presaleForm("2018-03-01", "2020-06-01", picked(true))} onChange={onChange} />);
    expect(wiped(calls)).toBe(false);
  });

  it("짝 — 분양권이어도 구간 밖이면 종전대로 마운트 때 지운다(칸이 없는 값이 남지 않는다)", () => {
    const { calls, onChange } = patches();
    render(<Step4 form={presaleForm("2018-03-01", "2021-06-01", picked(true))} onChange={onChange} />);
    expect(calls.some((c) => c.isRegulatedArea === false)).toBe(true);
    expect(calls.some((c) => c.isRegulatedAreaTouched === false)).toBe(true);
  });

  it("짝 — 입주권은 종전대로 마운트 때 지운다", () => {
    const { calls, onChange } = patches();
    render(<Step4 form={presaleForm("2018-03-01", "2020-06-01", picked(true), { assetKind: "right_to_move_in" })} onChange={onChange} />);
    expect(calls.some((c) => c.isRegulatedArea === false)).toBe(true);
  });

  it("K-8 주택 — 종전과 같다(지우지 않고 토글 한 벌)", () => {
    const { calls, onChange } = patches();
    render(<Step4 form={presaleForm("2018-03-01", "2020-06-01", { ...picked(true), transferDate: "2026-06-01" }, { assetKind: "housing" })} onChange={onChange} />);
    expect(wiped(calls)).toBe(false);
    expect(screen.queryAllByTestId("transfer-is-regulated")).toHaveLength(1);
  });
});

describe("D. 결과 화면 고지 — 쓰이는 값만, 칸이 없는 값은 칸을 가리키지 않는다 (Q-3 a)", () => {
  /** 법정동코드 없이 «medium» 판정이 나는 주소 — 남양주 화도읍(시군구 매칭 · 읍·면 예외 못 봄). */
  const MEDIUM = "경기도 남양주시 화도읍 1";
  const rows = (kind: string, transfer: string, acq = "2018-03-01") =>
    regulatedAddressAssumptions({
      ...presaleForm(acq, transfer, {}, { assetKind: kind, addressJibun: MEDIUM }),
      regionCode: "",
    });
  const which = (kind: string, transfer: string) => rows(kind, transfer).map((r) => r.which);

  it("K-10 분양권 — 취득 당시 행은 없고, 양도일 행은 §104①4호 구간 안에서만", () => {
    expect(which("presale_right", "2020-06-01")).toEqual(["transfer"]);
    expect(which("presale_right", "2021-06-01")).toEqual([]);
    expect(which("presale_right", "2017-12-31")).toEqual([]);
  });

  it("주택·재개발APT는 종전대로 두 행, 모두 직접 선택할 칸이 있다", () => {
    for (const kind of ["housing", "redevelopment_apt"]) {
      const r = rows(kind, "2020-06-01");
      expect(r.map((x) => x.which), kind).toEqual(["transfer", "acquisition"]);
      expect(r.every((x) => x.selectable), kind).toBe(true);
    }
  });

  it("입주권은 행을 그대로 두되(다른 경로 미확인) 직접 선택할 칸이 없다고 표시한다", () => {
    const r = rows("right_to_move_in", "2020-06-01");
    expect(r.map((x) => x.which)).toEqual(["transfer", "acquisition"]);
    expect(r.every((x) => x.selectable === false)).toBe(true);
  });

  it("분양권 구간 안에서 직접 선택한 값은 고지에 나오지 않는다(사용자가 정한 값)", () => {
    const f = presaleForm("2018-03-01", "2020-06-01", picked(true), { addressJibun: MEDIUM });
    expect(regulatedAddressAssumptions({ ...f, regionCode: "" })).toEqual([]);
  });

  it("끝 줄 — 선택할 칸이 있는 줄이 하나라도 있으면 「보유 상황」을 말하고, 전부 없으면 주소검색 안내만", () => {
    const sel = [{ selectable: true }];
    const none = [{ selectable: false }, { selectable: false }];
    expect(regulatedAssumptionFooter("calculator", sel)).toContain("「보유 상황」");
    expect(regulatedAssumptionFooter("calculator", [...none, { selectable: true }])).toContain("「보유 상황」");
    expect(regulatedAssumptionFooter("calculator", none)).not.toContain("「보유 상황」");
    expect(regulatedAssumptionFooter("calculator", none)).toContain("주소검색");
    // 줄을 안 넘기거나 selectable이 없는 이력 데이터는 종전 문구
    expect(regulatedAssumptionFooter("calculator")).toContain("「보유 상황」");
    expect(regulatedAssumptionFooter("calculator", [{} as { selectable: boolean }])).toContain("「보유 상황」");
  });
});
