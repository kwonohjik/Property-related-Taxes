/**
 * @vitest-environment jsdom
 *
 * 양도세 이월과세(§97의2) × 지분(공유) 모드 — **입력 기준 hint 계약** anchor.
 *
 * ## 왜 필요한가
 *
 * `OwnershipRatioBlock`(`OwnershipRatioInput.tsx`)의 지분 모드 배너는
 * 「양도가액·취득가액·필요경비는 물건 전체(100%) 기준으로 입력합니다. 시스템이 지분율을
 * 자동으로 적용합니다」라고 **선언**한다. 그런데 이월과세 칸은 필드마다 갈린다:
 *
 * | × 지분율 (100% 기준 입력) | 미스케일 (실제 금액 그대로) |
 * |---|---|
 * | 증여자 취득가액 · 증여자 자본적지출 · 증여 당시 평가액 | 증여세 산출세액 · 과세가액 · 상당액 · 기준시가 |
 *
 * 🔴 증여세 상당액은 「소득세법」 §97의2① **3호**의 필요경비다(`legal-codes/transfer.ts`
 *    `CARRYOVER_GIFT_TAX_EXPENSE`). ⚠️ **2호가 아니다** — 2호는 증여자 자본적지출이고,
 *    「① 2호 (전단)」은 2023.12.31. 개정 전 구조라 2026-08-10에 이미 정정됐다.
 *    배너를 문자 그대로 읽어 100% 기준으로 넣으면 필요경비가 지분율의 역수배로 들어간다.
 *
 * ⇒ 예외를 hint에 명시해 계약을 닫는다. **지분 모드일 때만** 노출한다(단독 소유에서는 노이즈).
 *
 * ## 케이스
 * - A1 비-일반건물(주택·컴패니언 경로) 「증여세 상당액」 — 지분 ON 노출 / OFF 미노출
 * - A2 일반건물 「증여세 산출세액」·「증여세 과세가액」 두 칸 — 지분 ON 노출 / OFF 미노출
 * - A3 환산(general) 기준시가 2칸 안내 — 지분 ON 노출 / OFF 미노출
 * - A4 술어 동일성 — 배너(`OwnershipRatioBlock`)와 hint가 **같은 입력에서 함께** 켜진다
 * - A5 배선 — GB 경로·컴패니언 경로가 **같은 컴포넌트**를 쓴다(한 번에 닫힌다)
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { CarryoverGiftBlock } from "@/components/calc/transfer/CarryoverGiftBlock";
import { OwnershipRatioBlock } from "@/components/calc/transfer/OwnershipRatioInput";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);

/** 예외 안내의 판별 문구 — 이 문자열이 사라지면 계약이 다시 열린다. */
const EXCEPTION_MARK = /증여세 신고서에 적힌 금액을 그대로 입력합니다/;
/** 기준시가 2칸 안내의 판별 문구. */
const STD_PRICE_MARK = /공시된 가격\(물건 전체 기준\)을 두 칸 모두 그대로/;

function makeAsset(over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2021-05-10",
      donorAcquisitionDate: "2010-03-02",
      donorRelation: "spouse",
    },
    ...over,
  };
}

/** 지분 40% (분자<분모) — `isFractionalRatio` true. */
const SHARE_40 = { ownershipNumerator: "40", ownershipDenominator: "100" } as const;
/** 단독 소유 100/100 — false. */
const SOLE = { ownershipNumerator: "100", ownershipDenominator: "100" } as const;

function renderBlock(asset: AssetForm) {
  return render(
    <CarryoverGiftBlock asset={asset} transferDate="2025-06-01" onChange={() => {}} />,
  );
}

describe("A1 — 증여세 상당액(비-일반건물) 예외 안내", () => {
  it("지분 모드에서 노출된다", () => {
    renderBlock(makeAsset({ assetKind: "housing", ...SHARE_40 }));
    expect(screen.getAllByText(EXCEPTION_MARK).length).toBe(1);
  });

  it("단독 소유에서는 노출되지 않는다", () => {
    renderBlock(makeAsset({ assetKind: "housing", ...SOLE }));
    expect(screen.queryAllByText(EXCEPTION_MARK)).toHaveLength(0);
  });

  it("예외 안내는 「증여세 상당액」 칸에만 붙는다 — 증여자 자본적지출(× 지분율)에는 붙지 않는다", () => {
    renderBlock(makeAsset({ assetKind: "housing", ...SHARE_40 }));
    // 자본적지출 hint는 §97의2①2호 문구만 유지 — 예외 문구가 섞이면 스케일 규칙과 어긋난다.
    const capex = screen.getByText(/증여자가 보유기간 중 지출한 자본적 지출액/);
    expect(capex.textContent ?? "").not.toMatch(EXCEPTION_MARK);
  });
});

describe("A2 — 일반건물 증여세 산출세액·과세가액 두 칸", () => {
  it("지분 모드에서 두 칸 모두 노출된다", () => {
    renderBlock(makeAsset({ assetKind: "general_building", ...SHARE_40 }));
    expect(screen.getAllByText(EXCEPTION_MARK).length).toBe(2);
  });

  it("단독 소유에서는 노출되지 않는다", () => {
    renderBlock(makeAsset({ assetKind: "general_building", ...SOLE }));
    expect(screen.queryAllByText(EXCEPTION_MARK)).toHaveLength(0);
  });
});

describe("A3 — 환산(general) 기준시가 2칸 안내", () => {
  function makeEstimated(over: Partial<AssetForm>): AssetForm {
    const base = makeAsset(over);
    return {
      ...base,
      carryover: {
        ...base.carryover!,
        useEstimatedAcquisition: true,
        estimationMode: "general",
      },
    };
  }

  it("지분 모드에서 노출된다", () => {
    renderBlock(makeEstimated({ assetKind: "housing", ...SHARE_40 }));
    expect(screen.getAllByText(STD_PRICE_MARK).length).toBe(1);
  });

  it("단독 소유에서는 노출되지 않는다", () => {
    renderBlock(makeEstimated({ assetKind: "housing", ...SOLE }));
    expect(screen.queryAllByText(STD_PRICE_MARK)).toHaveLength(0);
  });

  it("환산 OFF면 기준시가 칸 자체가 없으므로 안내도 없다", () => {
    renderBlock(makeAsset({ assetKind: "housing", ...SHARE_40 }));
    expect(screen.queryAllByText(STD_PRICE_MARK)).toHaveLength(0);
  });
});

describe("A4 — 배너와 hint는 같은 술어로 함께 켜진다", () => {
  /**
   * 두 곳이 각자 판정하면 「배너는 뜨는데 예외 안내는 안 뜨는」 어긋남이 난다.
   * 배너(`OwnershipRatioBlock`)와 hint는 `isFractionalRatio` 단일 소스를 공유해야 한다.
   */
  const CASES: { n: string; d: string; on: boolean }[] = [
    { n: "40", d: "100", on: true },
    { n: "1", d: "2", on: true },
    { n: "100", d: "100", on: false },
    { n: "", d: "", on: false },
    { n: "0", d: "100", on: false },
  ];

  it.each(CASES)("지분 $n/$d → 배너·hint 동시 $on", ({ n, d, on }) => {
    const { unmount } = render(
      <OwnershipRatioBlock numerator={n} denominator={d} onChange={() => {}} />,
    );
    const bannerShown = screen.queryAllByText(/모든 금액을/).length > 0;
    expect(bannerShown).toBe(on);
    unmount();

    renderBlock(
      makeAsset({ assetKind: "housing", ownershipNumerator: n, ownershipDenominator: d }),
    );
    expect(screen.queryAllByText(EXCEPTION_MARK).length > 0).toBe(on);
  });
});

describe("A5 — GB 경로·컴패니언 경로가 같은 컴포넌트를 쓴다", () => {
  /**
   * 컴패니언(주택) 경로에도 같은 갭이 있었다(F16 A-10이 3필드만 스케일). 두 호출부가 같은
   * `CarryoverGiftBlock`을 렌더하므로 hint 한 곳을 고치면 양쪽이 함께 닫힌다 —
   * 별도 컴포넌트로 갈라지면 이 anchor가 red가 된다.
   */
  it.each([
    "components/calc/transfer/GeneralBuildingAcquisitionCards.tsx",
    "components/calc/transfer/CompanionAcquisitionCauseSection.tsx",
  ])("%s 가 CarryoverGiftBlock을 import한다", (p) => {
    const src = readFileSync(p, "utf-8");
    expect(src).toMatch(/import \{ CarryoverGiftBlock \} from "\.\/CarryoverGiftBlock"/);
  });
});
