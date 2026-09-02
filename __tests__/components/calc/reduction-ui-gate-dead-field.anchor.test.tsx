/**
 * ⑤ UI anchor — 자산종류 게이트의 UI 공유(D9-06)와 사문 입력란 제거(D9-07).
 *
 * ## D9-06 — §77의3 §17 매수청구 경로
 *
 * `asset-kind-gate.ts`의 `isGbClaimRouteAllowedForAssetKind` 주석은 「⑧ validate와
 * ⑤ UI가 공유한다」고 적혀 있었으나 **⑤ 호출부가 존재하지 않았다**. 라디오가 무조건
 * 선택 가능해 사용자는 계산 실행 시점에야 차단당했다.
 *
 * 조문: 개발제한구역법 §17①의 대상은 「매수대상토지」(**토지만**)이고 §20①은
 * 「토지와 그 토지의 정착물」이다. 토지 파트가 독립 계산되지 않는 자산은 안분 없이
 * 토지분을 뽑을 수 없어 차단된다(자동 안분 fallback 금지 정책).
 *
 * 기존 anchor GR-03은 차단 대상 5종 중 3종만 고정하고 있었다 —
 * `presale_right`·`redevelopment_apt`가 사각지대였다. 여기서 8종 전수를 고정한다.
 *
 * ## D9-07 — §97의3 「아파트 여부」
 *
 * `propertyType`(아파트/비아파트)은 폼→스토어→④→⑫→라우터까지 5계층 배선돼
 * `evaluateRental973`에 도달했지만 **평가기가 읽지 않았다**(구별력 0 실측: 두 값의
 * 결과 객체가 완전히 동일). 사용자에게는 세액을 가르는 입력처럼 보였다.
 *
 * 법령상 요건이 될 여지가 없다 — §97의3①의 대상은 민특법 §2 2호 **민간건설임대주택**
 * 이고, 아파트 배제 괄호는 민특법 §2 5호의 「…아파트…를 임대하는 **민간매입임대주택**은
 * 제외한다」로 **매입임대 전용**이다. 따라서 레거시 엔진의 아파트 배제를 이 경로에
 * 이식하는 것은 법 근거 없는 불리 적용이므로 금지 — 입력란 제거가 정본 처방이다.
 *
 * `rentalHousingType`(장기일반/공공지원)도 같은 이유로 엔진 입력에서 뺐다. §97의3①은
 * 민특법 §2 **4호·5호를 동등하게** 대상으로 삼아 어느 쪽이든 공제율이 같다 — 사용자
 * 신고 사실로는 남기되(①④⑫), 엔진 입력은 엔진이 읽는 것만 담는다.
 */
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { Rental973InputForm } from "@/components/calc/transfer/rental/Rental973InputForm";
import { getStandaloneDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { isGbClaimRouteAllowedForAssetKind } from "@/lib/tax-engine/transfer-reductions";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-store";
import type { ReductionAssetKind } from "@/lib/tax-engine/transfer-reductions";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ALL_ASSET_KINDS: ReductionAssetKind[] = [
  "housing",
  "land",
  "building",
  "right_to_move_in",
  "presale_right",
  "commercial_building",
  "general_building",
  "redevelopment_apt",
];

/** §17 경로가 허용되는 자산 — 토지 파트가 독립 계산되는 3종 */
const CLAIM_ALLOWED: ReductionAssetKind[] = ["land", "general_building", "commercial_building"];

async function renderStep5(assetKind: ReductionAssetKind) {
  const { Step5 } = await import("@/app/calc/transfer-tax/steps/Step5");
  const asset = {
    ...makeDefaultAsset(1),
    assetKind,
    acquisitionDate: "2000-01-01",
    reductions: [getStandaloneDefault("gb_designated_land")],
  } as AssetForm;
  render(
    <Step5 form={{ assets: [asset], transferDate: "2026-03-01" } as never} onChange={vi.fn()} />,
  );
}

function claimRadio(): HTMLInputElement {
  return screen.getByRole("radio", { name: /토지매수 청구/ }) as HTMLInputElement;
}

describe("D9-06 §77의3 §17 매수청구 — ⑤ UI 게이트", () => {
  it("D9-06-1: 술어 전수 — 8종 중 land·general_building·commercial_building만 허용", () => {
    for (const kind of ALL_ASSET_KINDS) {
      expect(isGbClaimRouteAllowedForAssetKind(kind), kind).toBe(CLAIM_ALLOWED.includes(kind));
    }
  });

  it("D9-06-2: 🔴 GR-03 사각지대 — presale_right·redevelopment_apt도 차단 대상이다", () => {
    expect(isGbClaimRouteAllowedForAssetKind("presale_right")).toBe(false);
    expect(isGbClaimRouteAllowedForAssetKind("redevelopment_apt")).toBe(false);
  });

  it("D9-06-3: 토지에서는 §17 라디오가 선택 가능하다", async () => {
    await renderStep5("land");
    expect(claimRadio().disabled).toBe(false);
    expect(screen.getByText("매수대상토지 — 토지분만 감면 대상")).toBeTruthy();
  });

  it("D9-06-4: 🔴 주택에서는 §17 라디오가 **입력 시점에** 잠긴다 (종전에는 계산 실행 시점)", async () => {
    await renderStep5("housing");
    expect(claimRadio().disabled).toBe(true);
    expect(screen.getByText(/토지분이 독립 계산되지 않아 선택할 수 없습니다/)).toBeTruthy();
  });

  it("D9-06-5: 협의매수(§20)는 자산 종류와 무관하게 열려 있다 — 「토지등」이라 건물 포함", async () => {
    await renderStep5("housing");
    const negotiated = screen.getByRole("radio", { name: /협의매수 \(§20\)/ }) as HTMLInputElement;
    expect(negotiated.disabled).toBe(false);
  });

  it("D9-06-6: 차단 5종 전부에서 잠기고, 허용 3종 전부에서 열린다", async () => {
    for (const kind of ALL_ASSET_KINDS) {
      cleanup();
      await renderStep5(kind);
      expect(claimRadio().disabled, kind).toBe(!CLAIM_ALLOWED.includes(kind));
    }
  });
});

describe("D9-07 §97의3 사문 입력란", () => {
  /**
   * ⑤ 입력 폼을 직접 렌더한다 — `UnifiedReductionPanel`은 카테고리 펼침 상태를 거쳐야
   * 이 폼에 도달하므로, 입력란 존재 여부를 보는 데는 폼 단위가 정확하다.
   */
  function renderRental973Panel() {
    const value = getReductionDefault("rental_97_3") as never;
    render(<Rental973InputForm value={value} onChange={vi.fn()} transferDate="2026-03-01" />);
  }

  it("D9-07-1: 🔴 「아파트 여부」 라디오가 화면에서 사라졌다", () => {
    renderRental973Panel();
    expect(screen.queryByText("아파트 여부")).toBeNull();
    expect(screen.queryByRole("radio", { name: /^아파트$/ })).toBeNull();
    expect(screen.queryByRole("radio", { name: /비아파트/ })).toBeNull();
  });

  it("D9-07-2: 「임대주택 유형」은 남는다 — §97의3① 본문이 요구하는 신고 사실이다", () => {
    renderRental973Panel();
    expect(screen.getByText("임대주택 유형")).toBeTruthy();
    // 4호·5호를 동등 대상으로 삼는다는 사실을 옵션 설명이 밝힌다
    expect(screen.getByText("민특법 §2 5호")).toBeTruthy();
    expect(screen.getByText("민특법 §2 4호")).toBeTruthy();
  });

  it("D9-07-3: ④ 변환 payload에 propertyType 키가 없다 (사문 배선 제거)", () => {
    const form = { ...getReductionDefault("rental_97_3") } as AssetReductionForm;
    const [converted] = toEngineReductions([form], "purchase") as Record<string, unknown>[];
    expect(converted.type).toBe("rental_97_3");
    expect("propertyType" in converted).toBe(false);
    // 신고 사실인 임대주택 유형은 payload에 남는다
    expect(converted.rentalHousingType).toBe("long_term_private");
  });

  it("D9-07-4: ① 스토어 기본값에도 propertyType이 없다", () => {
    const def = getReductionDefault("rental_97_3") as Record<string, unknown>;
    expect("propertyType" in def).toBe(false);
    expect("rentalHousingType" in def).toBe(true);
  });
});
