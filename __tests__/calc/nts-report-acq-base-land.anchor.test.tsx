/**
 * F-29 Pre-Do anchor — 계산서 ※표 (4) 토지가액·(5) 합계가 미구현이다.
 *
 * ── 서식 원문(2026-08-27 확인) — ※표는 **5칸**이다
 *   (1) 2001.1.1현재 건물 기준시가 / (2) 산정기준율 / (3) 취득당시 [(1)×(2)]
 *   / **(4) 토지가액** / 합계 〔(3)+(4)〕
 *   작성요령 ※4 「**토지가액은 취득당시 토지가액을 계산하여 기재합니다.**」
 *
 * ── (4) 는 `inst.landValue` 가 아니다 — 계산사례 실측으로 확증
 *   2026년 계산사례 마.(취득 2000.2.1 · 대지 130㎡):
 *     ※(4) **234,000,000** = 130㎡ × **1,800,000**(1999.6.30 = 취득일 **직전 고시분**)
 *     Ⅵ⑤ **291,200,000** = 130㎡ × 2,240,000(2001.1.1 기준)
 *   ⇒ 두 값이 다르다. 폼의 취득 공시지가 필드는 라벨 그대로
 *     「취득당시 위치지수용 ㎡당 개별공시지가 (**2001.1.1 기준**)」이라
 *     (`BuildingStdPriceForm.tsx:565`) ※(4) 에 쓸 수 없다 ⇒ **신규 입력 1개**가 필요하다.
 *
 * ── 미구현의 결과
 *   작성례(2)에서 ⑪ 154,960,000 · ※(3) 157,439,360 은 표시되지만 **취득당시 총합계가
 *   계산서 어디에도 없다.** 서식만 보면 Ⅵ 총합계(환산 **전** 건물 + 2001 토지)를
 *   취득당시 합계로 오독한다.
 *
 * ── 설계가 동결한 testid
 *   `nts-bsp-x-4` · `nts-bsp-x-sum` 은 UI 설계문서에 있으나 DOM 에 없고 요구하는 테스트도 0건이다.
 *
 * 법령: 「소득세법 시행령」 제164조 제5항(2000.12.31 이전 취득 환산) ·
 *   국세청 「건물 기준시가 계산서」 별지 ※란. **표시 전용이며 세액 산식에 개입하지 않는다.**
 *
 * ⚠️ §1·§2 는 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { buildNtsReportModel } from "@/lib/calc/nts-report-adapter";
import { ReportSection6Total } from "@/components/calc/building-std-price/nts-report/ReportSection6Total";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";
import type { NtsReportContext } from "@/lib/calc/nts-report-adapter";
import {
  buildNtsReportContext,
  initialBuildingStdPriceForm,
} from "@/lib/calc/building-std-price-form";

afterEach(cleanup);

const INPUT: BuildingStandardPriceInput = {
  taxType: "transfer",
  floorArea: 327.6,
  builtYear: 1985,
  acquisitionYear: 1997,
  transferYear: 2024,
  acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_200_000 },
  transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 1_200_000 },
};

/** 취득당시(1996년 고시분) 공시지가 900,000 — 2001 기준 1,200,000 과 별개 값 */
const CTX = (withAcqAtTime: boolean): NtsReportContext => ({
  taxType: "transfer",
  address: "서울특별시 종로구 적선동 80",
  builtYear: 1985,
  landAreaM2: 100,
  acquisition: {
    dateLabel: "1997년",
    landPricePerM2: 1_200_000,
    year: 1997,
    ...(withAcqAtTime && { atTimeLandPricePerM2: 900_000 }),
  },
  transfer: { dateLabel: "2024년", landPricePerM2: 1_200_000, year: 2024 },
});

const acqInstance = (withAcqAtTime: boolean) => {
  const model = buildNtsReportModel(CTX(withAcqAtTime), calcBuildingStandardPrice(INPUT));
  return model.instances.find((i) => i.markCell === "acq2000")!;
};

describe("F-29 ※표 (4)(5) — §1 어댑터 (수정 전 실패)", () => {
  it("취득당시 토지가액을 담는다 — 100㎡ × 900,000", () => {
    expect(acqInstance(true).acqBase?.landValue).toBe(90_000_000);
  });

  it("합계 = (3) + (4)", () => {
    const acq = acqInstance(true).acqBase!;
    expect(acq.converted).toBe(92_152_242); // (3) — 사실 고정
    expect(acq.total).toBe(92_152_242 + 90_000_000);
  });

  it("Ⅵ⑤ 토지가액과 **다른 값**이다 — 2001 기준 100㎡ × 1,200,000", () => {
    const inst = acqInstance(true);
    expect(inst.landValue).toBe(120_000_000);
    expect(inst.acqBase?.landValue).not.toBe(inst.landValue);
  });

  it("미입력이면 조용히 0 을 만들지 않는다 — undefined 로 남긴다", () => {
    const acq = acqInstance(false).acqBase!;
    expect(acq.landValue).toBeUndefined();
    expect(acq.total).toBeUndefined();
  });
});

describe("F-29 ※표 (4)(5) — §2 화면 5칸 (수정 전 실패)", () => {
  it("설계가 동결한 testid 로 (4)·합계를 렌더한다", () => {
    render(<ReportSection6Total inst={acqInstance(true)} />);
    expect(screen.getByTestId("nts-bsp-x-4").textContent).toContain("90,000,000");
    expect(screen.getByTestId("nts-bsp-x-sum").textContent).toContain("182,152,242");
  });

  it("종전 3칸도 그대로다 (역방향 가드)", () => {
    render(<ReportSection6Total inst={acqInstance(true)} />);
    expect(screen.getByTestId("nts-bsp-x-1").textContent).toContain("93,366,000");
    expect(screen.getByTestId("nts-bsp-x-3").textContent).toContain("92,152,242");
  });

  it("미입력이면 (4)·합계는 「—」 — 0 원으로 단정하지 않는다", () => {
    render(<ReportSection6Total inst={acqInstance(false)} />);
    expect(screen.getByTestId("nts-bsp-x-4").textContent).toBe("—");
    expect(screen.getByTestId("nts-bsp-x-sum").textContent).toBe("—");
  });
});

describe("F-29 — §3 폼 → 계산서 컨텍스트 배선 (④ 지점)", () => {
  it("신규 필드가 컨텍스트로 도달한다 — `acqLandPrice` 와 별개 값이다", () => {
    const ctx = buildNtsReportContext({
      ...initialBuildingStdPriceForm,
      taxType: "transfer",
      acquisitionYear: "1997",
      transferYear: "2024",
      acqLandPrice: "1200000",
      acqAtTimeLandPrice: "900000",
    });
    expect(ctx.acquisition?.landPricePerM2).toBe(1_200_000);
    expect(ctx.acquisition?.atTimeLandPricePerM2).toBe(900_000);
  });

  it("미입력이면 undefined — 0 으로 떨어뜨리지 않는다", () => {
    const ctx = buildNtsReportContext({
      ...initialBuildingStdPriceForm,
      taxType: "transfer",
      acquisitionYear: "1997",
      transferYear: "2024",
      acqLandPrice: "1200000",
    });
    expect(ctx.acquisition?.atTimeLandPricePerM2).toBeUndefined();
  });

  it("입력 위젯이 취득 ≤2000 분기에만 있다 — 소스 규칙", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "components/calc/building-std-price/BuildingStdPriceForm.tsx",
      "utf8",
    );
    expect(src).toContain("acqAtTimeLandPrice");
    expect(src).toMatch(/acqIndexYear === 2001 && \(\s*<LandPriceLookupField/);
  });
});
