/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·⑧·④) — §155⑳은 **주 자산 전용**이다 (P6-c-4)
 *
 * ## 🔴 고친 비대칭 — 실측
 *
 * 엔진 입력의 `rentalHousingException`은 `TransferTaxInput` **top-level 단일 객체**다
 * (`transfer.types.ts:1032`) — 자산별이 아니다. 그래서 ④는 단건·다건 모두 primary만 보낸다
 * (`transfer-tax-api.ts:696` · `multi-transfer-tax-api.ts:170`).
 *
 * 그런데 ⑤는 모든 주택 자산에 카드를 띄우고 ⑧은 **모든 자산**을 돌았다
 * (`transfer-tax-validate.ts:378` 루프):
 *
 * | 자산 | ⑤ 카드 | ⑧ 검증 | ④ 전송 | 엔진 도달 |
 * |---|---|---|---|---|
 * | primary (i=0) | ✅ | ✅ | ✅ | ✅ |
 * | 컴패니언 (i>0) | ✅ | ✅ **차단** | ✗ | ✗ |
 *
 * 컴패니언에서 토글을 켜면 「임대주택 정보를 1호 이상 입력하세요」로 **계산이 막히는데**,
 * 다 채워도 세액은 한 푼도 달라지지 않았다 — **효과 없는 입력 때문에 차단**된 셈이다.
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 | 왜 필요한가 |
 * |---|---|---|
 * | RP-1 | ⑧이 컴패니언 선언을 **검증하지 않는다** | 차단 제거 — 이 작업의 본체 |
 * | RP-2 | ⑧이 primary 선언은 **검증한다** | RP-1의 긍정 짝. 없으면 「검증을 통째로 없앴다」와 구별 안 됨 |
 * | RP-3 | ⑤가 컴패니언에 §155⑳ 섹션을 띄우지 않는다 | ⑧과 **같은 술어**를 봐야 한다(3중 패턴) |
 * | RP-4 | ⑤가 primary에는 띄운다 | RP-3의 긍정 짝 |
 * | RP-5 | 컴패니언에 **stale 선언이 남아 있으면 말해 준다** | 침묵 제거 금지(OH-20) — 값을 지우지 않으므로 화면이 밝혀야 한다 |
 * | RP-6 | 선언이 없는 컴패니언은 **조용하다** | RP-5가 모든 컴패니언에 소음을 내면 안 된다 |
 * | RP-7 | ④ primary payload는 그대로다 | 좁히면서 원래 경로를 깨지 않았다 |
 *
 * ## ⚠️ 값은 지우지 않는다
 *
 * 세액 영향이 0이라 남아도 무해하고, 첫 자산을 지우면 컴패니언이 primary로 승격하므로 그때
 * 선언이 살아 있어야 한다. `clearOutOfScopeRedevPatch` 같은 정리를 두지 않은 이유다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AssetSectionExtras } from "@/components/calc/transfer/asset-sections/AssetSectionExtras";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { canDeclareRentalHousingException } from "@/lib/calc/rental-housing-exception-scope";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const TRANSFER = "2026-06-01";
/**
 * 🔑 계산기는 P6-c-2 이후 `mode="calc"`라 **ToggleCard가 없다** — 선언이 있으면 읽기 전용
 *    요약(`imported-rental-housing-facts`), 없으면 판정 메뉴 안내(`rental-housing-handoff-notice`).
 *    섹션이 렌더됐는지는 그 둘 중 하나로 본다.
 */
const CALC_SECTION_TESTIDS = ["imported-rental-housing-facts", "rental-housing-handoff-notice"];
const calcSectionShown = () =>
  CALC_SECTION_TESTIDS.some((id) => screen.queryByTestId(id) !== null);

/** 특례 ON · 임대주택 **미입력** — ⑧이 차단하던 바로 그 상태. */
function declaredEmpty(over: Partial<AssetForm> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-01",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      rentalUnits: [],
    },
    ...over,
  };
}

describe("RP-1·2 ⑧ — 컴패니언은 검증하지 않고 primary는 검증한다", () => {
  /** 🔴 종전에는 여기서 「임대주택 정보를 1호 이상 입력하세요」가 나와 계산이 막혔다. */
  it("[RP-1] 컴패니언(index 1)의 선언은 검증을 건너뛴다", () => {
    const msg = validateRentalHousingException(
      declaredEmpty().rentalHousingException,
      declaredEmpty(),
      1,
      "자산 2",
      TRANSFER,
    );
    expect(msg).toBeNull();
  });

  /** 🔴 RP-1의 **긍정 짝**. 없으면 「⑧에서 §155⑳ 검증을 통째로 없앴다」와 구별되지 않는다. */
  it("[RP-2] primary(index 0)의 같은 선언은 그대로 차단한다", () => {
    const msg = validateRentalHousingException(
      declaredEmpty().rentalHousingException,
      declaredEmpty(),
      0,
      "자산 1",
      TRANSFER,
    );
    expect(msg).toContain("임대주택 정보를 1호 이상");
  });

  it("[RP-2b] 술어가 두 축을 모두 본다 — 위치 ∧ 자산종류", () => {
    expect(canDeclareRentalHousingException("housing", 0)).toBe(true);
    expect(canDeclareRentalHousingException("housing", 1)).toBe(false);
    // 자산 종류 축은 그대로 살아 있다(기존 계약).
    expect(canDeclareRentalHousingException("land", 0)).toBe(false);
  });
});

describe("RP-3·4·5·6 ⑤ — 카드 노출과 고아 선언 안내", () => {
  const renderExtras = (asset: AssetForm, assetIndex: number) =>
    render(
      <AssetSectionExtras
        asset={asset}
        assetIndex={assetIndex}
        onChange={() => {}}
        transferDate={TRANSFER}
      />,
    );

  it("[RP-3] 컴패니언에는 §155⑳ 섹션이 아예 없다", () => {
    renderExtras(declaredEmpty(), 1);
    expect(calcSectionShown()).toBe(false);
  });

  /** 🔴 RP-3의 **긍정 짝**. ⑧(RP-2)과 **같은 술어**를 보는지도 함께 지킨다. */
  it("[RP-4] primary에는 그대로 있다 — 선언을 읽기 전용으로 보여 준다", () => {
    renderExtras(declaredEmpty(), 0);
    expect(screen.getByTestId("imported-rental-housing-facts")).toBeTruthy();
  });

  /** 선언이 없는 primary는 판정 메뉴 안내가 뜬다(P6-c-2) — 좁히면서 그 경로도 깨지 않았다. */
  it("[RP-4b] 선언이 없는 primary에는 판정 메뉴 안내가 뜬다", () => {
    const clean = makeDefaultAsset(1);
    renderExtras({ ...clean, assetKind: "housing" }, 0);
    expect(screen.getByTestId("rental-housing-handoff-notice")).toBeTruthy();
  });

  /** 🔑 값을 지우지 않으므로 **화면이 밝혀야 한다** — 안 그러면 조용히 사라진 입력이 된다. */
  it("[RP-5] 컴패니언에 stale 선언이 남아 있으면 말해 준다", () => {
    renderExtras(declaredEmpty(), 1);
    const notice = screen.getByTestId("rental-exception-companion-notice");
    expect(notice.textContent).toContain("이 자산에 적용되지 않습니다");
    expect(notice.textContent).toContain("자산 1");
  });

  /** 🔴 RP-5가 **모든** 컴패니언 주택 카드에 뜨면 소음이다 — 선언이 있을 때만이다. */
  it("[RP-6] 선언이 없는 컴패니언은 조용하다", () => {
    const clean = makeDefaultAsset(2);
    renderExtras({ ...clean, assetKind: "housing" }, 1);
    expect(screen.queryByTestId("rental-exception-companion-notice")).toBeNull();
    expect(calcSectionShown()).toBe(false);
  });
});

describe("RP-7 ④ — primary 전송 경로는 그대로다", () => {
  it("[RP-7] primary의 선언은 payload에 실린다", () => {
    const a = declaredEmpty({
      rentalHousingException: {
        ...makeDefaultAsset(1).rentalHousingException,
        applyException: true,
        scenario: "A",
        rentalUnits: [makeDefaultRentalUnit()],
      },
    });
    const payload = toRentalHousingExceptionApi(a) as Record<string, unknown>;
    expect(payload).toBeTruthy();
    expect(payload.applyException).toBe(true);
    expect(payload.scenario).toBe("A");
  });
});
