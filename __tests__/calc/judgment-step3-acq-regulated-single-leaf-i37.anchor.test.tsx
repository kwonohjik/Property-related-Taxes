/**
 * @vitest-environment jsdom
 *
 * anchor — 판정 메뉴 ② Step3 「취득 당시 조정대상지역」은 메뉴 ④와 **같은 leaf**로 낸다 (2026-11 리뷰 I-37).
 *
 * Step3은 기준일(용도변경 → 동일세대 상속 → 증여 세대 보유 시작일 → 취득일)과 증여 basis 결합을 인라인으로 다시 골랐다.
 * 메뉴 ④(`buildOneHouseExemptionApiBody`)와 ⑧은 이미 `calcEffectiveWasRegulatedAtAcquisition`을 쓴다. 사본이 따로 있으면
 * 형제 소비처 하나를 빠뜨리는 drift가 반복됐다(G1-13·S10-6·S12-5·M4·#38-10·L24·D-67). 그래서 Step3도 같은 leaf를 부르게 하고,
 * 기준일은 2-C 라벨에만 쓴다.
 *
 * 격자: 매매 3 · 일반 증여 10 · 동일세대 상속 4 · 용도변경 3 · 입주권 잔존 3 = 23칸 × 법정동코드/주소 문자열 = 46칸.
 * 각 칸에서 단언하는 것:
 *   ⑤ 카드(⑳ `RentalHousingExceptionSection` · 입주권 `RedevelopmentRightExemptionSection`)가 받는 값 = ④ 본문 `wasRegulatedAtAcquisition`
 *   코드 경로의 2-C 자동 판정(`RegulatedAreaField.verdict.isRegulated`) = ④
 * 리뷰 probe(`evidence/probes/v3-r3-regulated-at-acq-parity-…-value/grid.txt` C)의 42칸에 「용도변경 · 취득일 공란」과
 * 「입주권 + 잔존 증여 사실」을 더했다. 앞 칸은 사본에서 갈렸다(사본은 취득일이 비면 저장값, ④는 주거용 사용 개시일로 판정).
 *
 * 서울 마포(1144010100) — 2017-08-03 지정 · 2023-01-05 해제.
 */
import { readFileSync } from "node:fs";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";

const seen = vi.hoisted(() => ({
  card: [] as boolean[],
  field: [] as { autoTestId?: string; verdict?: { isRegulated: boolean } | null; autoLabel?: string }[],
}));

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
vi.mock("@/components/calc/transfer/RentalHousingExceptionSection", () => ({
  RentalHousingExceptionSection: (p: { wasRegulatedAtAcquisition: boolean }) => {
    seen.card.push(p.wasRegulatedAtAcquisition);
    return null;
  },
}));
vi.mock("@/components/calc/transfer/RedevelopmentRightExemptionSection", () => ({
  RedevelopmentRightExemptionSection: (p: { wasRegulatedAtAcquisition: boolean }) => {
    seen.card.push(p.wasRegulatedAtAcquisition);
    return null;
  },
}));
vi.mock("@/components/calc/transfer/RegulatedAreaField", () => ({
  RegulatedAreaField: (p: { autoTestId?: string; verdict?: { isRegulated: boolean } | null; autoLabel?: string }) => {
    seen.field.push(p);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  seen.card.length = 0;
  seen.field.length = 0;
});

const MAPO_CODE = "1144010100";
const MAPO_ADDR = "서울특별시 마포구 공덕동 1";

type Cell = { name: string; asset: Record<string, unknown> };

const gift = (sh: "yes" | "no", start: string, giftDate: string, donor: string): Cell => ({
  name: `증여 sh=${sh} start=${start || "-"} gift=${giftDate} donor=${donor}`,
  asset: {
    acquisitionCause: "gift",
    giftDonorRelation: "lineal",
    acquisitionDate: giftDate,
    donorAcquisitionDate: donor,
    giftSameHousehold: sh,
    giftHouseholdHoldingStartDate: start,
  },
});
const inherit = (start: string, acq: string): Cell => ({
  name: `동일세대 상속 start=${start} acq=${acq}`,
  asset: {
    acquisitionCause: "inheritance",
    acquisitionDate: acq,
    decedentSameHouseholdBeforeInheritance: true,
    decedentCohabitationHoldingStartDate: start,
  },
});
const conversion = (acq: string, use: string): Cell => ({
  name: `용도변경 acq=${acq || "공란"} use=${use}`,
  asset: { acquisitionDate: acq, hasNonHousingConversion: true, residentialUseStartDate: use },
});
const right = (name: string, stale: Record<string, unknown>): Cell => ({
  name: `입주권 + 잔존 ${name}`,
  asset: { assetKind: "right_to_move_in", redevSubject: "right", acquisitionDate: "2023-06-01", ...stale },
});

const CELLS: Cell[] = [
  ...["2016-01-01", "2019-01-01", "2023-06-01"].map((d) => ({ name: `매매 acq=${d}`, asset: { acquisitionDate: d } })),
  gift("no", "", "2022-06-01", "2010-01-01"),
  gift("yes", "2016-01-01", "2022-06-01", "2010-01-01"),
  gift("yes", "2018-01-10", "2022-06-01", "2010-01-01"),
  gift("no", "", "2022-06-01", "2018-01-01"),
  gift("yes", "2018-01-10", "2022-06-01", "2018-01-01"),
  gift("no", "", "2023-06-01", "2010-01-01"),
  gift("yes", "2016-01-01", "2023-06-01", "2010-01-01"),
  gift("yes", "2018-01-10", "2023-06-01", "2010-01-01"),
  gift("no", "", "2023-06-01", "2018-01-01"),
  gift("yes", "2018-01-10", "2023-06-01", "2018-01-01"),
  inherit("2016-01-01", "2023-06-01"),
  inherit("2016-01-01", "2022-06-01"),
  inherit("2018-01-10", "2023-06-01"),
  inherit("2018-01-10", "2022-06-01"),
  conversion("2014-01-01", "2016-01-01"),
  conversion("2014-01-01", "2019-01-01"),
  conversion("", "2019-01-01"),
  right("동일세대 상속", { acquisitionCause: "inheritance", decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "2018-01-10" }),
  right("용도변경", { hasNonHousingConversion: true, residentialUseStartDate: "2019-01-01" }),
  right("증여 세대 사실", {
    acquisitionCause: "gift",
    giftDonorRelation: "lineal",
    donorAcquisitionDate: "2010-01-01",
    giftSameHousehold: "yes",
    giftHouseholdHoldingStartDate: "2018-01-10",
  }),
];

function formOf(cell: Cell, path: "code" | "addr"): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2025-06-15",
    contractTotalPrice: "1000000000",
    assets: [
      {
        ...f.assets[0],
        assetKind: "housing",
        acquisitionCause: "purchase",
        addressJibun: MAPO_ADDR,
        regionCode: path === "code" ? MAPO_CODE : "",
        ...cell.asset,
      },
    ],
  } as OneHouseJudgmentFormData;
}

const PATHS = ["code", "addr"] as const;
const GRID = CELLS.flatMap((cell) => PATHS.map((path) => [`${path} · ${cell.name}`, cell, path] as const));

describe("I-37 — Step3 「취득 당시」 조정대상지역 = 메뉴 ④ (46칸)", () => {
  it.each(GRID)("%s", (_label, cell, path) => {
    const form = formOf(cell, path);
    const menu4 = buildOneHouseExemptionApiBody(form).wasRegulatedAtAcquisition;
    render(<Step3 form={form} onChange={() => {}} />);
    expect(seen.card).not.toHaveLength(0);
    expect(seen.card.at(-1)).toBe(menu4);
    if (path === "code") {
      const auto = seen.field.filter((p) => p.autoTestId === "one-house-regulated-auto").at(-1);
      expect(auto?.verdict?.isRegulated).toBe(menu4);
    }
  });

  it("격자가 두 결론을 모두 지난다 — 한쪽 값만 나오면 단언이 비어 있다", () => {
    const values = new Set(GRID.map(([, cell, path]) => buildOneHouseExemptionApiBody(formOf(cell, path)).wasRegulatedAtAcquisition));
    expect(values).toEqual(new Set([true, false]));
  });
});

describe("I-37 — 2-C 라벨은 기준일 경위를 그대로 보인다", () => {
  const label = (cell: Cell) => {
    render(<Step3 form={formOf(cell, "code")} onChange={() => {}} />);
    return seen.field.filter((p) => p.autoTestId === "one-house-regulated-auto").at(-1)?.autoLabel;
  };
  it("용도변경 → 주거용 사용 개시 · 동일세대 상속 → 동일세대 보유 개시 · 증여 통산·매매 → 취득 당시 · 입주권 잔존 사실 → 취득 당시", () => {
    expect(label(conversion("2014-01-01", "2019-01-01"))).toBe("주거용 사용 개시 당시 조정대상지역");
    expect(label(inherit("2016-01-01", "2023-06-01"))).toBe("동일세대 보유 개시 당시 조정대상지역");
    expect(label(gift("yes", "2016-01-01", "2022-06-01", "2010-01-01"))).toBe("취득 당시 조정대상지역");
    expect(label(CELLS[0])).toBe("취득 당시 조정대상지역");
    expect(label(CELLS.find((c) => c.name.includes("입주권 + 잔존 동일세대"))!)).toBe("취득 당시 조정대상지역");
    expect(label(CELLS.find((c) => c.name.includes("입주권 + 잔존 용도변경"))!)).toBe("취득 당시 조정대상지역");
  });
});

describe("I-37 — Step3은 기준일·결합을 다시 고르지 않는다(소스 가드)", () => {
  const src = readFileSync("app/calc/one-house-exemption/steps/Step3.tsx", "utf8");
  it("메뉴 ④·⑧과 같은 leaf를 부른다", () => {
    expect(src).toMatch(/calcEffectiveWasRegulatedAtAcquisition\(/);
    expect(src).toMatch(/calcResidenceJudgmentDate\(/);
  });
  it("인라인 사본(동일세대 상속 시작일 재계산 · 증여 통산 시작일 분기 · 기준일 직접 지정 실효값)이 없다", () => {
    expect(src).not.toMatch(/sameHouseholdInheritanceHoldingStart/);
    expect(src).not.toMatch(/giftHouseholdConsolidationStart/);
    expect(src).not.toMatch(/(?<![A-Za-z])effectiveWasRegulatedAtAcquisition\(/);
  });
});
