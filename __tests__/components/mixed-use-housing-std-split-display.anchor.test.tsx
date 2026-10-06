/**
 * anchor: S3-2 ⑦ — 겸용 결과 카드의 「주택분 기준시가 분할」 산식은 엔진 echo(`housingPart.housingStdSplit`)를 **그대로** 읽는다.
 *
 *  · kind 3형태(proportional · separate_date_converted · raw_ratio) 각각의 문구·숫자 = echo 값.
 *  · echo가 없는 결과(PHD · 구 저장 이력)는 블록을 그리지 않는다 — 유무로 분기(재도출 없음).
 *  · 상가→주택 용도변경은 취득시 echo가 없어 양도시만 그린다.
 *  · 개산공제 괄호 라벨이 「취득시 토지분/건물분 기준시가」이고 그 숫자 = 분할 블록의 landBasis/buildingBasis (같은 값을 가리킨다).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

afterEach(cleanup);

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();

/** 취득 H 400M · 가목 120M(1.2M × 100㎡) · 나목 380M / 양도 H_T 1.6B · 가목 1.2B · 나목 800M */
function base(over: Record<string, unknown> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2010-03-15"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: { housingPrice: 1_600_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 800_000_000 },
    acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 380_000_000 },
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}
const calc = (a: MixedUseAssetInput) => calcMixedUseTransferTax(3_000_000_000, D("2024-08-20"), a, rates);
const text = (b: ReturnType<typeof calc>) => render(<MixedUseResultCard breakdown={b} />);
const txt = (r: ReturnType<typeof text>, id: string) => r.getByTestId(id).textContent ?? "";
const num = (n: number) => n.toLocaleString();

describe("proportional — 취득시·양도시 산식 = echo", () => {
  const b = calc(base());
  const echo = b.housingPart.housingStdSplit!;

  it("echo가 실제로 있고 proportional이다 (아래 단언이 공허하지 않다)", () => {
    expect(echo.acq?.kind).toBe("proportional");
    expect(echo.transfer?.kind).toBe("proportional");
  });

  it("취득시: 개별주택가격·가목·나목 라벨 + 토지분·건물분이 echo 값", () => {
    const r = text(b);
    const a = echo.acq!;
    const t = txt(r, "mixed-housing-std-split-acq");
    expect(t).toContain(`개별주택가격 ${num(a.housingTotal)}`);
    expect(t).toContain(`토지 기준시가 ${num(a.landStd)}`);
    expect(t).toContain(`주택건물 기준시가 ${num(a.buildingStd)}`);
    expect(txt(r, "mixed-housing-std-split-acq-land")).toBe(num(a.landBasis));
    expect(txt(r, "mixed-housing-std-split-acq-building")).toBe(num(a.buildingBasis));
    // 건물분은 잔액 흡수 — 표시값의 합 = 개별주택가격
    expect(a.landBasis + a.buildingBasis).toBe(a.housingTotal);
  });

  it("양도시도 같은 형식", () => {
    const r = text(b);
    const t = echo.transfer!;
    expect(txt(r, "mixed-housing-std-split-transfer-land")).toBe(num(t.landBasis));
    expect(txt(r, "mixed-housing-std-split-transfer-building")).toBe(num(t.buildingBasis));
    expect(txt(r, "mixed-housing-std-split-transfer")).toContain(`개별주택가격 ${num(t.housingTotal)}`);
  });

  it("법정 변수 약어·floor 표기가 없다 (한국어 풀어쓰기)", () => {
    const t = text(b).getByTestId("mixed-housing-std-split").textContent ?? "";
    expect(t).not.toMatch(/floor|Math\.|P_[A-Z]|Sum_/);
    expect(t).toContain("주택분 기준시가 분할");
  });

  it("개산공제 괄호가 같은 숫자를 가리킨다 — 「취득시 토지분/건물분 기준시가 X × 3%」의 X = landBasis/buildingBasis", () => {
    const all = text(b).container.textContent ?? "";
    expect(all).toContain(`취득시 토지분 기준시가 ${num(echo.acq!.landBasis)} × 3%`);
    expect(all).toContain(`취득시 건물분 기준시가 ${num(echo.acq!.buildingBasis)} × 3%`);
  });
});

describe("separate_date_converted (B0 — 토지·건물 취득일 상이, 집행기준 99-164-9)", () => {
  const b = calc(
    base({
      landAcquisitionDate: D("2005-06-10"),
      acquisitionStandardPrice: { housingPrice: 400_000_000, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, landPricePerSqmAtBuildingAcq: 1_800_000, housingBuildingPrice: 320_000_000 },
    }),
  );
  const a = b.housingPart.housingStdSplit!.acq!;

  it("kind·echo: 취득당시 주택가격 352M을 토지일 가목 120M : 나목 320M으로 안분 — 토지 96M · 건물 256M", () => {
    expect(a.kind).toBe("separate_date_converted");
    expect(a.landStd).toBe(180_000_000); // 건물 취득일 1.8M × 100㎡
    expect(a.landStdAtLandAcq).toBe(120_000_000); // 토지 취득일 1.2M × 100㎡
    expect(a.convertedHousingTotal).toBe(352_000_000);
    expect(a.landBasis).toBe(96_000_000);
    expect(a.buildingBasis).toBe(256_000_000);
  });

  it("문구: 취득당시 주택가격 → 토지분(토지 취득일 가목 비례) → 건물분(잔액) — 숫자 = echo", () => {
    const r = text(b);
    const t = txt(r, "mixed-housing-std-split-acq");
    expect(t).toContain(`취득당시 주택가격 = 건물 취득일 개별주택가격 ${num(a.housingTotal)}`);
    expect(t).toContain(`토지 취득일 토지 기준시가 ${num(a.landStdAtLandAcq!)}`);
    expect(t).toContain(`건물 취득일 토지 기준시가 ${num(a.landStd)}`);
    expect(t).toContain(`주택건물 기준시가 ${num(a.buildingStd)}`);
    expect(txt(r, "mixed-housing-std-split-acq-converted")).toBe(num(a.convertedHousingTotal!));
    expect(txt(r, "mixed-housing-std-split-acq-land")).toBe(num(a.landBasis));
    expect(txt(r, "mixed-housing-std-split-acq-building")).toBe(num(a.buildingBasis));
    // 건물분은 취득당시 주택가격의 잔액이다 — 개별주택가격(건물 취득일)에서 빼지 않는다
    expect(t).toContain(`취득당시 주택가격 ${num(a.convertedHousingTotal!)} − 토지분 ${num(a.landBasis)}`);
  });
});

describe("raw_ratio (상속·증여 신고가액만 — 개별주택가격 없음)", () => {
  const b = calc(
    base({
      acquisitionByInheritance: true,
      housingInheritedValue: 450_000_000,
      commercialInheritedValue: 100_000_000,
      acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000, housingBuildingPrice: 320_000_000 },
    }),
  );
  const a = b.housingPart.housingStdSplit!.acq!;

  it("kind=raw_ratio · housingTotal 0", () => {
    expect(a.kind).toBe("raw_ratio");
    expect(a.housingTotal).toBe(0);
  });

  it("문구: 개별주택가격 없음 + 가목:나목 원값 — 「개별주택가격 0」을 곱·뺄셈으로 쓰지 않는다", () => {
    const r = text(b);
    const t = txt(r, "mixed-housing-std-split-acq");
    expect(t).toContain("개별주택가격 없음");
    expect(txt(r, "mixed-housing-std-split-acq-land")).toBe(num(a.landBasis));
    expect(txt(r, "mixed-housing-std-split-acq-building")).toBe(num(a.buildingBasis));
    expect(t).not.toContain("개별주택가격 0");
    // 양도시는 정상 비례 형식 (짝)
    expect(txt(r, "mixed-housing-std-split-transfer")).toContain("개별주택가격 1,600,000,000");
  });
});

describe("echo 없음 — 블록 미표시 (유무로 분기)", () => {
  it("구 저장 이력(echo 필드 없음): 블록이 없고 카드는 예외 없이 그려진다 · 개산공제 괄호는 유지", () => {
    const b = JSON.parse(JSON.stringify(calc(base()))) as ReturnType<typeof calc>;
    delete b.housingPart.housingStdSplit;
    const r = text(b);
    expect(r.queryByTestId("mixed-housing-std-split")).toBeNull();
    expect(r.container.textContent).toContain("취득시 토지분 기준시가");
  });

  it("같은 시드에서 echo가 있으면 블록이 있다 (위 미표시의 짝)", () => {
    expect(text(calc(base())).queryByTestId("mixed-housing-std-split")).not.toBeNull();
  });

  it("상가→주택 용도변경: 취득시 echo 없음 → 양도시 분할만 표시", () => {
    const b = calc(
      base({
        landAcquisitionDate: D("2010-03-15"),
        partialUsageChange: { direction: "commercial_to_house", usageChangeDate: D("2018-01-01") },
        acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 80_000_000, landPricePerSqm: 1_200_000 },
      }),
    );
    expect(b.housingPart.housingStdSplit?.acq).toBeUndefined();
    const r = text(b);
    expect(r.queryByTestId("mixed-housing-std-split-acq")).toBeNull();
    expect(r.queryByTestId("mixed-housing-std-split-transfer")).not.toBeNull();
  });
});
