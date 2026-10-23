/**
 * 겸용주택 §163⑨ 단서 자산 합계 비교 — 화면(⑤ 시점 라벨·① 칸·경비 칸 안내 · ⑦ 비교 카드) (PR-6 · 계획서 §17).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import { MixedUseAssetMajorStdPrice } from "@/components/calc/transfer/mixed-use/MixedUseAssetMajorStdPrice";
import { CompanionAcqInheritanceBlock } from "@/components/calc/transfer/CompanionAcqInheritanceBlock";
import { MixedSec163_9ComparisonCard } from "@/components/calc/results/mixed-use/MixedSec163_9ComparisonCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { mixedSec163_9CompareOf } from "@/lib/calc/mixed-use-sec163-9";
import { calcMixedUseTransferTaxIdN as calc } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

const mix = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing",
    isMixedUseHouse: true,
    acquisitionCause: "inheritance",
    acquisitionDate: "1980-03-01",
    inheritanceStartDate: "1980-03-01",
    residentialFloorArea: "100",
    nonResidentialFloorArea: "100",
    buildingFootprintArea: "100",
    mixedUseTotalLandArea: "200",
    ...over,
  }) as AssetForm;
const major = (a: AssetForm) => render(<MixedUseAssetMajorStdPrice asset={a} onChange={() => {}} transferDate="2024-08-20" />);

describe("⑤ 입력 화면", () => {
  it("1980 상속 → 취득시 라벨이 「의제취득일(1985.1.1.)」 · ① 칸 안내가 합계 비교 · 경비 칸이 개산공제 갈림을 말한다", () => {
    major(mix());
    expect(screen.getAllByText("의제취득일(1985.1.1.)").length).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(/두 칸의 합계를 §164 기준시가 합계·환산취득가액 합계와 비교/);
    expect(document.body.textContent).toMatch(/환산취득가액\(③\)이 채택되면 이 칸 대신 개산공제/);
    expect(document.body.textContent).not.toMatch(/미입력 시 아래 개별주택공시가격\(보충적평가\)을 자동 사용/);
  });

  it("1990 상속(공시 전) → 라벨은 「상속개시일」 그대로 · ① 안내는 ②와만 비교", () => {
    major(mix({ acquisitionDate: "1990-03-01", inheritanceStartDate: "1990-03-01" }));
    expect(screen.queryAllByText("의제취득일(1985.1.1.)")).toHaveLength(0);
    expect(document.body.textContent).toMatch(/두 칸의 합계를 §164 기준시가 합계와 비교/);
    // 경비 칸 갈림(③)은 의제취득일 전에만 있다
    expect(document.body.textContent).toMatch(/상속\(실가 의제\) 취득은 개산공제/);
  });

  it("2003 상속 → ① 안내가 「상가분은 신고가액 그대로 · 주택분만 비교」(Q-22)", () => {
    major(mix({ acquisitionDate: "2003-03-01", inheritanceStartDate: "2003-03-01" }));
    expect(document.body.textContent).toMatch(/상가분은 건물 기준시가 고시\(2001\.1\.1\.\) 뒤 취득이라 신고가액을 그대로 쓰고, 주택분만 §164 기준시가와 합계로 비교/);
  });

  it("2006 상속(공시 후) → 종전 문구", () => {
    major(mix({ acquisitionDate: "2006-03-01", inheritanceStartDate: "2006-03-01" }));
    expect(document.body.textContent).toMatch(/미입력 시 아래 개별주택공시가격\(보충적평가\)을 자동 사용/);
    expect(document.body.textContent).not.toMatch(/두 칸의 합계/);
  });

  it("1980 증여 → 「모두 입력하세요」(① 필수 · Q-16)", () => {
    major(mix({ acquisitionCause: "gift", inheritanceStartDate: "" }));
    expect(document.body.textContent).toMatch(/증여세 신고가액\(상증법 §60~66 평가액\) — 주택분·상가분 모두 입력하세요/);
  });

  it("상속 블록 안내 카드 — 1980이면 ①②③ 합계 비교, 2006이면 종전 「상속개시일 평가액 자동 적용」", () => {
    render(<CompanionAcqInheritanceBlock asset={mix()} onChange={() => {}} transferDate="2024-08-20" />);
    expect(screen.getByText("취득가액 — 겸용주택 ①②③ 합계 비교 (의제취득일 전)")).toBeTruthy();
    cleanup();
    render(<CompanionAcqInheritanceBlock asset={mix({ acquisitionDate: "2006-03-01", inheritanceStartDate: "2006-03-01" })} onChange={() => {}} transferDate="2024-08-20" />);
    expect(screen.getByText("취득가액 — 겸용주택 상속개시일 평가액 자동 적용")).toBeTruthy();
  });
});

describe("⑦ 비교 카드", () => {
  const tot = (h: number, c: number) => ({ housing: h, commercial: c, total: h + c });
  it("세 후보 · 채택 표시 · ① 미입력 행", () => {
    render(
      <MixedSec163_9ComparisonCard
        cmp={{ era: "pre_deemed", cause: "inheritance", reported: null, standard: tot(400_000_000, 200_000_000), converted: tot(413_793_103, 206_896_551), selected: "converted" }}
      />,
    );
    const card = screen.getByTestId("mixed-sec163-9-comparison");
    const row = (k: string) => card.querySelector(`tr[data-candidate="${k}"]`) as HTMLElement;
    expect(within(row("converted")).getByText(/← 채택/)).toBeTruthy();
    expect(row("converted").textContent).toContain("620,689,654");
    expect(row("standard").textContent).toContain("600,000,000");
    expect(row("reported").textContent).toContain("신고가액 미입력");
  });

  it("상가분 단서 밖 → ② 행 이름이 「주택분 §164 + 상가분 ①」", () => {
    render(
      <MixedSec163_9ComparisonCard
        cmp={{ era: "clause", cause: "inheritance", commercialOutsideClause: true, reported: tot(1, 1), standard: tot(4, 1), converted: null, selected: "standard" }}
      />,
    );
    expect(screen.getByText(/② 주택분 §164 기준시가 \+ 상가분 ①/)).toBeTruthy();
  });

  it("1985 이후(clause)는 ③ 행이 없다", () => {
    render(
      <MixedSec163_9ComparisonCard
        cmp={{ era: "clause", cause: "gift", reported: tot(1, 1), standard: tot(2, 2), converted: null, selected: "standard" }}
      />,
    );
    expect(document.querySelector('tr[data-candidate="converted"]')).toBeNull();
    expect(screen.getByText(/① 증여세 신고가액/)).toBeTruthy();
  });
});

describe("⑦ 결과 카드 — 엔진 결과 그대로", () => {
  const engine = (over: Partial<MixedUseAssetInput>) =>
    calc(
      3_000_000_000,
      new Date("2026-06-01"),
      {
        ...mixedUseCase14(),
        acquisitionStandardPrice: { ...mixedUseCase14().acquisitionStandardPrice, housingPrice: 300_000_000 },
        landAcquisitionDate: mixedUseCase14().buildingAcquisitionDate,
        ...over,
      } as MixedUseAssetInput,
      makeMockRates(),
    );

  it("🔴 ① 채택 → 비교 카드 + 주택분·상가분 산식이 「① 채택」을 말한다(종전 「상속개시일 신고가액」 문구 아님)", () => {
    const r = engine({ sec163_9Compare: { era: "clause", cause: "inheritance" }, acquisitionByInheritance: true, housingInheritedValue: 900_000_000, commercialInheritedValue: 500_000_000 });
    expect(r.sec163_9Comparison?.selected).toBe("reported");
    const { container } = render(<MixedUseResultCard breakdown={r} />);
    expect(screen.getByTestId("mixed-sec163-9-comparison")).toBeTruthy();
    const txt = container.textContent ?? "";
    expect(txt).toContain("자산 합계 비교에서 ① 상속세 신고가액 채택 — 주택분 900,000,000");
    expect(txt).toContain("자산 합계 비교에서 ① 상속세 신고가액 채택 — 상가분 500,000,000");
    expect(txt).not.toContain("상속개시일 신고가액 900,000,000");
  });

  it("비교 구간이 아니면 카드가 없고 종전 산식", () => {
    const r = engine({ acquisitionByInheritance: true, housingInheritedValue: 900_000_000, commercialInheritedValue: 500_000_000 });
    const { container } = render(<MixedUseResultCard breakdown={r} />);
    expect(screen.queryByTestId("mixed-sec163-9-comparison")).toBeNull();
    expect(container.textContent).toContain("상속개시일 신고가액 900,000,000");
  });
});

describe("비교 구간 술어 — ④·⑤·⑧ 공용", () => {
  it("날짜 경계 · 취득원인 · 부담부증여 · 겸용 아님", () => {
    expect(mixedSec163_9CompareOf(mix({ acquisitionDate: "1984-12-31" }))).toEqual({ era: "pre_deemed", cause: "inheritance" });
    expect(mixedSec163_9CompareOf(mix({ acquisitionDate: "1985-01-01" }))).toEqual({ era: "clause", cause: "inheritance" });
    expect(mixedSec163_9CompareOf(mix({ acquisitionDate: "2000-12-31" }))).toEqual({ era: "clause", cause: "inheritance" });
    // 상가 건물 기준시가 최초 고시(일반건물 2001-01-01) 뒤 — 상가분은 단서 밖(Q-22)
    expect(mixedSec163_9CompareOf(mix({ acquisitionDate: "2001-01-01" }))).toEqual({ era: "clause", cause: "inheritance", commercialOutsideClause: true });
    expect(mixedSec163_9CompareOf(mix({ acquisitionDate: "2005-04-29" }))).toEqual({ era: "clause", cause: "inheritance", commercialOutsideClause: true });
    expect(mixedSec163_9CompareOf(mix({ acquisitionDate: "2005-04-30" }))).toBeUndefined();
    expect(mixedSec163_9CompareOf(mix({ acquisitionCause: "gift" }))).toEqual({ era: "pre_deemed", cause: "gift" });
    expect(mixedSec163_9CompareOf(mix({ acquisitionCause: "purchase" }))).toBeUndefined();
    expect(mixedSec163_9CompareOf(mix({ acquisitionCause: "gift", transferType: "burdened_gift" }))).toBeUndefined();
    expect(mixedSec163_9CompareOf(mix({ isMixedUseHouse: false }))).toBeUndefined();
    expect(mixedSec163_9CompareOf(mix({ assetKind: "land" }))).toBeUndefined();
  });
});
