/**
 * F-27 · F-28 · F-45 Pre-Do anchor — 국세청 계산서 표시 일관성 3건.
 *
 * ── F-27 `lib/calc/nts-report-adapter.ts` `toRow` — `standardPrice: b.standardPrice`
 *    취득 ≤2000 **단독** 경로의 `standardPrice` 는 산정기준율을 **이미 곱한** 값인데
 *    같은 행의 ⑧(`pricePerM2`)은 2001 지수표 값 그대로다 ⇒ 표 머리 산식 「⑩ = ⑧ × ⑨」가 깨진다.
 *    **복합** 경로는 정반대로 ⑩·⑪ 이 환산 **전** 값이라, 같은 칸이 경로별로 두 의미를 갖는다.
 *
 *    실측(rc · 용도1 · 327.6㎡ · 신축1985 · 취득1997 · 공시지가 1,200,000):
 *      ⑧ 285,000 · ⑨ 327.6 → ⑧×⑨ = **93,366,000**
 *      ⑩ standardPrice = **92,152,242** (산정기준율 0.987 적용 후) ← 자기모순
 *      ※표 echo: total2001 = 93,366,000 / convertedTotal = 92,152,242
 *
 *    ⇒ **복합 규약(⑩·⑪ = 환산 전, 환산은 ※표에만)** 으로 통일한다.
 *      국세청 작성례(2) anchor 가 ⑪ = 154,960,000(환산 전) · ※(3) = 157,439,360(환산 후)로
 *      복합 규약을 정본으로 고정하고 있다. 세액 경로는 `convertedTotal` 을 쓰므로 **표시 한정**이다.
 *
 * ── F-28 `components/.../nts-report/ReportEvalTable.tsx` — `adjustmentItems?.[0]~[2]` 만 렌더
 *    엔진은 고시 7구분을 독립 적용해 **최대 7항목**을 낸다. 4번째 이후는 경고 없이 사라진다.
 *    실측: 6항목 조합에서 표 머리 산식대로 계산하면 조정률 **1.5600**(앞 3개) vs 실제 **1.0811**.
 *    PDF 는 `items.map(...).join(" ")` 로 전건을 찍어 두 채널이 다른 집합을 보인다.
 *    ⇒ 3칸 레이아웃은 원본 서식으로 동결됐으므로 **넘치는 항목을 마지막 칸에 병합**한다.
 *
 * ── F-45 `lib/pdf/BuildingStdReportPdfPages.tsx:140` — Ⅵ 절 제목이 화면과 다르다
 *    화면 「부속토지」 / PDF 「부수토지」. 리뷰가 서식 원문(작성례 3건)으로 **정본은 「부속토지」**
 *    임을 확인했다 ⇒ PDF 한 줄만 정정한다.
 *    ⚠️ 「부수토지」는 지방세법 부수토지 한도 등 다른 맥락에서 정당하게 쓰이므로 전역 치환 금지.
 *
 * 법령: 「소득세법」 제99조 제1항 제1호 나목 · 같은 법 시행령 제164조 제5항(산정기준율) ·
 *   「상속세 및 증여세법」 제61조 제1항 제2호 위임 하의 국세청 고시 제2025-39호 제11조.
 *
 * ⚠️ §1·§2 는 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { selectSpecialAdjustment } from "@/lib/tax-engine/building-standard-price-helpers";
import { buildNtsReportModel } from "@/lib/calc/nts-report-adapter";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";
import type { NtsReportContext } from "@/lib/calc/nts-report-adapter";

const ACQ_PRE2001: BuildingStandardPriceInput = {
  taxType: "transfer",
  floorArea: 327.6,
  builtYear: 1985,
  acquisitionYear: 1997,
  transferYear: 2024,
  acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_200_000 },
  transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_200_000 },
};

const CTX: NtsReportContext = {
  taxType: "transfer",
  address: "서울특별시 종로구 적선동 80",
  builtYear: 1985,
  landAreaM2: 100,
  acquisition: { dateLabel: "1997년", landPricePerM2: 1_200_000, year: 1997 },
  transfer: { dateLabel: "2024년", landPricePerM2: 1_200_000, year: 2024 },
};

describe("F-27 계산서 ⑩ 칸 — §1 표 머리 산식 「⑩ = ⑧ × ⑨」 (수정 전 실패)", () => {
  it("취득 ≤2000 단독 경로에서 ⑩ 이 환산 전 값(⑧ × ⑨)이어야 한다", () => {
    const result = calcBuildingStandardPrice(ACQ_PRE2001);
    const model = buildNtsReportModel(CTX, result);
    const acqInstance = model.instances.find((i) => i.markCell === "acq2000")!;
    const row = acqInstance.mainRows[0];
    expect(row.pricePerM2).toBe(285_000);
    // ⑩ = ⑧ × ⑨ — 환산은 ※표에서만 한다(복합 규약)
    expect(row.standardPrice).toBe(Math.floor((row.pricePerM2 ?? 0) * (row.floorArea ?? 0)));
    expect(row.standardPrice).toBe(93_366_000);
  });

  it("환산 후 값은 ※표에만 남는다 (수정 후에도 불변)", () => {
    const result = calcBuildingStandardPrice(ACQ_PRE2001);
    expect(result.acqBaseConversion?.total2001).toBe(93_366_000);
    expect(result.acqBaseConversion?.convertedTotal).toBe(92_152_242);
    // 계산서 인스턴스에도 ※표 데이터가 실려 있다 — PDF 는 이것을 렌더하지 않는다(F-17)
    const inst = buildNtsReportModel(CTX, result).instances.find((i) => i.markCell === "acq2000")!;
    expect(inst.acqBase).toEqual({ total2001: 93_366_000, rate: 0.987, converted: 92_152_242 });
  });

  it("세액 경로는 환산 후 값을 그대로 쓴다 — 표시 수정이 금액을 바꾸지 않는다 (가드)", () => {
    expect(calcBuildingStandardPrice(ACQ_PRE2001).acquisition?.standardPrice).toBe(92_152_242);
  });
});

describe("F-28 조정률 항목 절단 — §2 전건이 표에 나타난다 (수정 전 실패)", () => {
  const SIX = {
    roofMaterial: 1 as const,
    maxFloors: 21,
    commercialFloor: 20 as const,
    remodelCount: 26 as const,
    wallessRatio: 0.5,
    structuralSafety: 31 as const,
  };

  it("엔진은 6항목을 낸다 — 표가 3칸이라 3개만 보이면 ⑧ 을 재현할 수 없다", () => {
    const sel = selectSpecialAdjustment(SIX, 90, 60000, {
      isResidential: false,
      isApartment: false,
      structureKey: "cement_brick",
    });
    expect(sel).toHaveLength(6);
    const all = sel.reduce((a, s) => a * s.rate, 1) / 100 ** sel.length;
    const first3 = sel.slice(0, 3).reduce((a, s) => a * s.rate, 1) / 100 ** 3;
    expect(all).toBeCloseTo(1.0811, 4);
    expect(first3).toBeCloseTo(1.56, 4); // 표 머리 산식대로 읽으면 이 값이 나온다 — 44% 어긋남
  });

  it("표시 헬퍼가 3칸에 전건을 담는다 — 넘치는 항목은 마지막 칸에 병합", async () => {
    const { packAdjustmentCells } = await import(
      "@/components/calc/building-std-price/nts-report/adjustment-cells"
    );
    const sel = selectSpecialAdjustment(SIX, 90, 60000, {
      isResidential: false,
      isApartment: false,
      structureKey: "cement_brick",
    });
    const cells = packAdjustmentCells(sel);
    expect(cells).toHaveLength(3);
    // 세 칸의 곱이 전체 조정률과 같아야 한다 — 「⑧ 을 재현할 수 있다」는 것이 이 축의 요건
    const product = cells.reduce((a, c) => a * c.rate, 1) / 100 ** 3;
    const all = sel.reduce((a, s) => a * s.rate, 1) / 100 ** sel.length;
    expect(product).toBeCloseTo(all, 6);
    // 병합된 칸은 어떤 번호들이 합쳐졌는지 드러낸다
    expect(cells[2].nos.length).toBeGreaterThan(1);
  });

  it("3항목 이하는 종전과 동일 (역방향 가드)", async () => {
    const { packAdjustmentCells } = await import(
      "@/components/calc/building-std-price/nts-report/adjustment-cells"
    );
    const sel = [
      { nos: [1], rate: 100 },
      { nos: [8], rate: 130 },
    ];
    expect(packAdjustmentCells(sel)).toEqual(sel);
  });
});

describe("F-17 서버 PDF ※ 산정기준율 환산표 — §3 (수정 전 실패)", () => {
  /**
   * PDF 는 화면과 **같은 `inst.acqBase`** 를 쓰므로 배선 추가가 필요 없고, 절만 렌더하면 된다.
   * 종전에는 파일 전체에 `acqBase` 참조가 0건이라 취득 ≤2000 계산서를 인쇄하면
   * 산정기준율(0.987)도 환산액(92,152,242)도 어디에도 남지 않았다.
   * Ⅵ 총합계는 환산 **전** 값이므로 이 표가 없으면 취득당시 기준시가를 PDF 단독으로 확인할 수 없다.
   */
  it("PDF 컴포넌트가 acqBase 를 참조한다", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("lib/pdf/BuildingStdReportPdfPages.tsx", "utf8");
    expect(src).toContain("inst.acqBase");
    expect(src).toContain("※ 2000.12.31 이전 취득 시 취득당시 기준시가 계산");
  });

  it("Ⅵ 절 제목이 화면과 같다 — 「부속토지」(F-45)", async () => {
    const fs = await import("node:fs/promises");
    const pdf = await fs.readFile("lib/pdf/BuildingStdReportPdfPages.tsx", "utf8");
    const screen = await fs.readFile(
      "components/calc/building-std-price/nts-report/ReportSection6Total.tsx",
      "utf8",
    );
    const title = "Ⅵ. 평가대상 건물 기준시가 및 부속토지 평가액 합계";
    expect(pdf).toContain(title);
    expect(screen).toContain(title);
    expect(pdf).not.toContain("부수토지 평가액 합계");
  });
});
