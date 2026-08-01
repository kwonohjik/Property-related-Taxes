/**
 * anchor: 전남·광주 통합 코드(12) 별칭이 판정 집합에 실제로 반영되는가 (X-2).
 *
 * 계획서: docs/02-design/features/sigungu-code-system-drift.plan.md (D-1 · D-2)
 *
 * 🔴 결함이었던 것: 주소검색 PNU는 통합 코드(`12xxx`)를 주는데 판정 집합은 구 코드
 *    (조정지역 `29xxx` · 인구감소 `46xxx`)라 **매칭이 조용히 실패**했다.
 *    예외가 아니라 「해당 없음」으로 흡수돼 눈에 띄지 않았다.
 *
 * ⚠️ 방향이 반대인 두 결함을 한 파일에서 고정한다:
 *    D-1은 비과세를 되돌리는 **증세**, D-2는 중과를 푸는 **감세**다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";
import { classifyPopulationDeclineArea } from "@/lib/tax-engine/data/population-decline-areas";
import { makeMockRatesWithHouseEngine, makeHouseInfo, baseTransferInput } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);

describe("D-1 — 광주 조정대상지역 (지정 2020-12-18 ~ 해제 2022-09-25)", () => {
  it("🔴 구·신 코드 모두 조정대상지역으로 판정된다", () => {
    for (const code of ["2911010100", "1221010100"]) {
      const r = isRegulatedByBjdCode(code, "2021-06-01");
      expect(r.isRegulated, code).toBe(true);
      expect(r.confidence, code).toBe("high"); // 「데이터 미수록 시도」로 떨어지지 않는다
    }
  });

  it("해제 후에는 양쪽 다 미지정 (별칭이 기간 판정을 흐리지 않는다)", () => {
    for (const code of ["2911010100", "1221010100"]) {
      expect(isRegulatedByBjdCode(code, "2023-01-01").isRegulated, code).toBe(false);
    }
  });

  it("🔴 세액 — 취득 당시 조정지역 → §154① 거주 2년 요건 → 비과세 미적용", () => {
    // 거주 0개월. 종전에는 신 코드에서 조정지역 판정이 누락돼 비과세가 적용됐다(과소과세).
    const calc = (regionCode: string) =>
      calculateTransferTax(
        baseTransferInput({
          transferPrice: 2_000_000_000,
          acquisitionPrice: 700_000_000,
          acquisitionDate: D("2021-06-01"),
          transferDate: D("2026-06-01"),
          householdHousingCount: 1,
          isOneHousehold: true,
          residencePeriodMonths: 0,
          regionCode,
        }),
        makeMockRatesWithHouseEngine(),
      );
    const legacy = calc("2911010100");
    const current = calc("1221010100");
    expect(current.exemptReason).toBeUndefined();
    expect(current.totalTax).toBe(518_248_500); // 종전 신 코드: 180,862,000 (−337,386,500 과소)
    expect(current.totalTax).toBe(legacy.totalTax); // 같은 장소는 같은 결론
  });
});

describe("D-2 — 전남 인구감소지역 세컨드홈 (§167의3①12 다목)", () => {
  it("🔴 구·신 코드 모두 인구감소지역으로 분류된다", () => {
    for (const code of ["4689010100", "1285010100"]) {
      expect(classifyPopulationDeclineArea(code).kind, code).toBe("decline");
    }
  });

  it("인구감소지역이 아닌 곳은 그대로 null (무차별 매칭 아님)", () => {
    expect(classifyPopulationDeclineArea("1168010100").kind).toBeNull(); // 서울 강남구
    expect(classifyPopulationDeclineArea("1221010100").kind).toBeNull(); // 광주(통합) 동구
  });

  it("🔴 세액 — 세컨드홈이 주택 수에서 빠져 중과가 풀린다", () => {
    const calc = (regionCode: string) =>
      calculateTransferTax(
        baseTransferInput({
          transferPrice: 2_000_000_000,
          acquisitionPrice: 700_000_000,
          acquisitionDate: D("2018-01-01"),
          transferDate: D("2026-06-01"),
          isRegulatedArea: true,
          householdHousingCount: 2,
          isOneHousehold: false,
          sellingHouseId: "h1",
          houses: [
            makeHouseInfo("h1", { regionCode: "11680", acquisitionDate: D("2018-01-01") }),
            makeHouseInfo("h2", {
              regionCode,
              acquisitionDate: D("2026-02-01"),
              officialPrice: 500_000_000,
              regionCriteria: "REGION",
              region: "non_capital",
              isSecondHomeRegistered: true,
            }),
          ],
        }),
        makeMockRatesWithHouseEngine(),
      );
    const current = calc("1285010100");
    expect(current.multiHouseSurchargeDetail!.effectiveHouseCount).toBe(1);
    expect(current.surchargeType).toBeUndefined();
    expect(current.totalTax).toBe(466_768_500); // 종전 신 코드: 855,178,500 (+388,410,000 과다)
    expect(current.totalTax).toBe(calc("4689010100").totalTax);
  });
});
