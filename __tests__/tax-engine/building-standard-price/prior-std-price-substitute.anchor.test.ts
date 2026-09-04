/**
 * F-18 Pre-Do anchor — 취득연도 2001 + §164⑧ 제1산식이 **항상 차단된다**.
 *
 * ── 결함
 *   제1산식은 전기(취득연도 − 1) 기준시가를 지수표로 다시 계산한다
 *   (`building-standard-price.ts` `calcPointBreakdown(acquisitionYear - 1, …)`).
 *   취득 2001 이면 전기 = **2000** 인데 건물 기준시가 고시는 2001 년부터라 용도지수표가 없다
 *   (`resolveUsageIndex(2000, …) === undefined` — 다른 resolver 4종과 달리 하한 fallback 이 없다).
 *   ⇒ 「취득전기: 2000년 용도지수표에 용도번호 #1 없음」으로 차단된다.
 *   `sameYearFormula` 기본값이 `"prev"` 라 **취득2001·양도2001 사용자는 기본 상태에서** 걸리고,
 *   존재하지 않는 표를 요구하므로 폼에서 고칠 여지가 없다(취득2002 는 정상 계산된다).
 *
 * ── 근본 원인은 fallback 부재가 아니다
 *   「소득세법 시행규칙」 제80조 제3항 제2호가 **명문 대체산정**을 두고 있다:
 *     전기의 기준시가 = 국세청장이 **최초로 고시한 기준시가** × 국세청장이 고시한 **기준율**
 *   그 leaf(`calcPriorStdPriceSubstitute`, `same-adjustment-period-std-price.ts:214`)는
 *   이미 저장소에 있고 양도세 마법사가 쓰는데 **이 엔진만 import 하지 않는다**.
 *
 *   ⚠️ 2001 표 fallback 추가는 채택하지 않는다 — 기존 테스트
 *      (`resolveUsageIndex(2000,1) === undefined`)·silent-fallback 금지 정책과 충돌한다.
 *
 * ── 부수 효과: 입력 하나가 불요해진다
 *   이 경로에서는 지수표를 다시 계산하지 않으므로 「취득전기 ㎡당 공시지가」가 필요 없다.
 *   종전에는 그것을 **필수로 요구**했다(차단 메시지 「동일연도 제1산식: 취득전기 공시지가 필수 입력」).
 *
 * 법령: 「소득세법 시행규칙」 제80조 제3항 제2호 · 「소득세법 시행령」 제164조 제8항 위임.
 *
 * ⚠️ §1 은 **수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import {
  resolveUsageIndex,
  resolveAcqBaseGroup,
  resolveAcqBaseRate,
} from "@/lib/tax-engine/data/building-standard-price";
import {
  calcPriorStdPriceSubstitute,
  usesPriorStdPriceSubstitute,
} from "@/lib/tax-engine/same-adjustment-period-std-price";
import { initialBuildingStdPriceForm } from "@/lib/calc/building-std-price-form";
import { validateBuildingStdPriceForm } from "@/lib/calc/building-std-price-validate";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

const ACQ2001 = (over: Partial<BuildingStandardPriceInput> = {}): BuildingStandardPriceInput => ({
  taxType: "transfer",
  floorArea: 200,
  builtYear: 1995,
  acquisitionYear: 2001,
  transferYear: 2001,
  holdingMonths: 6,
  adjustMonths: 12,
  acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
  transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
  ...over,
});

describe("F-18 — §0 사실 고정 (수정 전후 불변)", () => {
  it("2000년 용도지수표는 실재하지 않는다 — fallback 추가는 채택하지 않는다", () => {
    expect(resolveUsageIndex(2000, 1)).toBeUndefined();
    expect(resolveUsageIndex(2001, 1)).toBeDefined();
  });

  it("산정기준율표에 (신축1995, 2000) 칸이 있다 — §80③2호의 「기준율」", () => {
    const g = resolveAcqBaseGroup("rc")!;
    expect(resolveAcqBaseRate(g, 1995, 2000)).toBeGreaterThan(0);
  });

  it("취득 2002 는 종전대로 계산된다 (역방향 가드)", () => {
    const r = calcBuildingStandardPrice(
      ACQ2001({ acquisitionYear: 2002, transferYear: 2002, prevLandPricePerM2: 2_800_000 }),
    );
    expect(r.transfer?.standardPrice).toBeGreaterThan(0);
  });
});

describe("F-18 — §1 취득 2001 이 차단되지 않는다 (수정 전 실패)", () => {
  it("전기 공시지가 없이도 계산된다 — §80③2호는 지수표를 쓰지 않는다", () => {
    const r = calcBuildingStandardPrice(ACQ2001());
    expect(r.transfer?.standardPrice).toBeGreaterThan(0);
  });

  it("전기 공시지가를 넣어도 무시된다 — 이 경로는 지수표 비의존", () => {
    const a = calcBuildingStandardPrice(ACQ2001());
    const b = calcBuildingStandardPrice(ACQ2001({ prevLandPricePerM2: 2_800_000 }));
    expect(b.transfer!.standardPrice).toBe(a.transfer!.standardPrice);
  });
});

/**
 * ⚠️ **세액으로는 대체산정 값을 관측할 수 없다** — 구별력 확보용 단위 단언이 별도로 필요하다.
 *   산정기준율표의 2000년 열은 **전 신축연도에서 1을 넘는다**(1985 1.022 … 2000 1.016).
 *   즉 전기(2000) 기준시가가 취득당시(2001)보다 **크므로** delta = acq − prior 가 음수가 되고,
 *   §80①1호 본문 단서(계산값이 취득당시보다 적으면 취득당시를 쓴다)가 **항상** 발동한다.
 *   ⇒ 취득 2001 제1산식의 양도값은 언제나 취득당시 기준시가와 같다.
 *      F-18 의 실질 효과는 금액 변화가 아니라 **「오류로 막히던 것이 계산된다」**는 것이다.
 */
describe("F-18 — §2 대체산정 값 자체 (세액에 드러나지 않는 축)", () => {
  it("2000년 산정기준율은 **전 그룹·전 신축연도에서 1 이상**이다 — 실측 고정", () => {
    const g = resolveAcqBaseGroup("rc")!;
    expect(resolveAcqBaseRate(g, 1995, 2000)).toBe(1.018);
    expect(resolveAcqBaseRate(g, 1985, 2000)).toBe(1.022);
    for (const key of ["rc", "brick", "cement_block", "solid_wood", "stone"]) {
      const grp = resolveAcqBaseGroup(key)!;
      for (let y = 1985; y <= 2000; y++) {
        const r = resolveAcqBaseRate(grp, y, 2000);
        if (r !== undefined) expect(r).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("대체산정 값이 warnings 로 노출된다 — 세액에 드러나지 않는 축의 유일한 관측 경로", () => {
    const r = calcBuildingStandardPrice(ACQ2001());
    const w = r.warnings.find((x) => x.includes("§80③2호"));
    expect(w).toBeDefined();
    expect(w).toContain("75,128,400");
  });

  it("leaf 가 §80③2호 산식을 그대로 낸다 — 최초고시 × 기준율", () => {
    const sub = calcPriorStdPriceSubstitute({
      firstNoticeStdPrice: 73_800_000,
      noticeBaseRate: 1.018,
    })!;
    expect(sub.basis).toBe("first_notice_rate");
    expect(sub.value).toBe(75_128_400); // 73,800,000 × 1.018 (정수 분수 연산)
  });

  it("하한 단서가 발동해 양도 = 취득당시다", () => {
    const r = calcBuildingStandardPrice(ACQ2001());
    expect(r.acquisition!.standardPrice).toBe(73_800_000);
    expect(r.transfer!.standardPrice).toBe(73_800_000);
  });

  /**
   * ⚠️ 「산정기준율표 미수록 구조」 분기는 **취득 2001 에서는 도달할 수 없다** —
   *    미수록 구조(ALC·보강블록·와이어패널·조립식패널·컨테이너)는 전부 2013년 신설이라
   *    2001년 **구조지수표**에 없어 그보다 앞에서 막힌다(실측: 「2001년 구조지수표에 구조키
   *    'container' 없음」). 방어는 유지하되 도달 가능한 층인 leaf 에서 계약을 고정한다.
   */
  it("기준율이 없으면 leaf 가 null 을 낸다 — 0 으로 떨어지지 않는다", () => {
    expect(
      calcPriorStdPriceSubstitute({ firstNoticeStdPrice: 73_800_000, noticeBaseRate: undefined }),
    ).toBeNull();
    expect(
      calcPriorStdPriceSubstitute({ firstNoticeStdPrice: 73_800_000, noticeBaseRate: 0 }),
    ).toBeNull();
  });
});

/**
 * 🔑 엔진·validate·UI 가 **같은 술어에 같은 인자**로 물어야 한다.
 *    한쪽만 바뀌면 「없어도 되는데 차단」(validate) 또는 「화면엔 있는데 계산은 무시」(UI)가 된다.
 */
describe("F-18 — §3 술어 단일화(엔진 ↔ validate ↔ UI)", () => {
  it("경계 — 취득 2001 은 대체산정, 2002 는 아니다", () => {
    expect(usesPriorStdPriceSubstitute(2001)).toBe(true);
    expect(usesPriorStdPriceSubstitute(2002)).toBe(false);
    expect(usesPriorStdPriceSubstitute(undefined)).toBe(false);
  });

  it("validate 가 취득 2001 에서 전기 공시지가를 요구하지 않는다", () => {
    const base = {
      ...initialBuildingStdPriceForm,
      taxType: "transfer" as const,
      builtYear: "1995",
      floorArea: "200",
      acquisitionYear: "2001",
      transferYear: "2001",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "3000000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "3000000",
      holdingMonths: "6",
      adjustMonths: "12",
      sameYearFormula: "prev" as const,
    };
    expect(validateBuildingStdPriceForm(base) ?? "").not.toMatch(/취득전기/);
    // 2002 는 종전대로 요구한다(역방향 가드)
    expect(
      validateBuildingStdPriceForm({ ...base, acquisitionYear: "2002", transferYear: "2002" }) ?? "",
    ).toMatch(/취득전기/);
  });

  it("UI 가 같은 술어를 쓴다 — 소스 규칙", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(
      "components/calc/building-std-price/BuildingStdPriceForm.tsx",
      "utf8",
    );
    expect(src).toContain("usesPriorStdPriceSubstitute(Number(f.acquisitionYear) || undefined)");
  });
});
