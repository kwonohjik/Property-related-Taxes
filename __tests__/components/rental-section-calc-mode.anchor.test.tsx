/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·④) — §155⑳ 특례 섹션의 `mode="calc"` 분할 (P6-c-2)
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 | 왜 필요한가 |
 * |---|---|---|
 * | RM-1 | 계산기에 ① 임대주택 정보·시나리오 라디오가 **없다** | 이관의 본체 |
 * | RM-2 | 판정 메뉴에는 **있다** | RM-1은 부정형이다 — 짝이 없으면 「지워진 것」과 구별되지 않는다 |
 * | RM-3 | 계산기에 ② §161① 안분 입력이 **있다** | 계산기에 **남기는** 것이야말로 이관 중 조용히 사라진다 |
 * | RM-4 | 판정 메뉴에는 없고 안내로 대체된다 | RM-3의 짝 (Q-7 분할선) |
 * | RM-5 | 계산기에 ③ 거주기간 편집기가 **있다** | 🔴 유일 입력 경로 — 아래 |
 * | RM-6 | 선언이 없으면 판정 메뉴 안내가 뜬다 | 침묵 제거 금지(OH-20) |
 * | RM-7 | ④ 전송 payload가 **바뀌지 않는다** | 위젯만 없앴다. 값이 함께 사라지면 저장된 이력의 세액이 달라진다(OH-21) |
 * | RM-8 | 명부 `isLongTermRental`과 **서로 무관하다** | 이름이 비슷한 중과 축 — 같이 옮기면 안 된다 |
 *
 * ## 🔴 RM-5 — ③를 감출 수 없었던 이유 (계획서 §5.0이 틀렸다)
 *
 * 계획서는 「§161① 안분만 남기고 판정 사실은 전부 감춘다」였다. ⑧
 * (`transfer-tax-validate-rental-exception.ts:190`)이 `deriveResidencePeriodMonths(asset, …)`를
 * **자산별로** 불러 24개월 미만이면 계산을 차단하는데, 대체 입력 경로인 Step4
 * `ResidencePeriodSection`은 게이트가 `form.isOneHousehold && isOneHouseExemptionAsset(…)`이고
 * 패치도 `i === 0`만 한다(`Step4.tsx:498`). 이 카드의 게이트는 자산종류뿐이다
 * (`AssetSectionExtras.tsx:42`).
 *
 * ⇒ **컴패니언 주택 자산**이나 **`isOneHousehold` OFF**에서는 이 ③이 유일한 입력 경로다.
 *   감추면 「24개월 이상 입력하세요」라 막으면서 채울 칸이 없다.
 *
 * ## 🔑 중과 축 실측 (RM-8)
 *
 * `asset.rentalHousingException`은 `multi-house-surcharge*`에 도달하지 않는다 — P6-b의
 * §155⑧·합가(중과 배제가 §154① 충족을 요구하지 않아 계산기에 남겨야 했던 축)와 다르다.
 * 다만 `houses[].isLongTermRental`은 **완전히 다른 필드**이고 그쪽이 중과 축이다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalHousingExceptionSection } from "@/components/calc/transfer/RentalHousingExceptionSection";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { buildHousesPayload } from "@/lib/calc/transfer-tax-api-houses";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const TRANSFER_DATE = "2027-01-01";
const UNIT_BLOCK = "임대주택 정보";
const ALLOCATION_BLOCK = "직전거주주택 + 3-시점 기준시가";

function declaredAsset(over: Partial<AssetForm["rentalHousingException"]> = {}): AssetForm {
  const a = makeDefaultAsset(1);
  return {
    ...a,
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-01-01",
    residenceInputMode: "direct",
    residencePeriodMonthsAsset: "30",
    rentalHousingException: {
      ...a.rentalHousingException,
      applyException: true,
      scenario: "A",
      /** ④는 `rentalUnits`가 비면 payload를 통째로 버린다 — 시료는 1호를 갖춰야 한다. */
      rentalUnits: [makeDefaultRentalUnit()],
      ...over,
    },
  };
}

function renderSection(asset: AssetForm, mode: "full" | "facts" | "calc") {
  render(
    <RentalHousingExceptionSection
      mode={mode}
      rh={asset.rentalHousingException}
      asset={asset}
      acquisitionDate={asset.acquisitionDate}
      transferDate={TRANSFER_DATE}
      onChangeResidence={() => {}}
      onChange={() => {}}
    />,
  );
}

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;
const scenarioRadios = (): number =>
  document.querySelectorAll('input[name^="rental-scenario-"]').length;

describe("RM-1·2 ① 임대주택 정보 — 계산기에 없고 판정 메뉴에 있다", () => {
  it("[RM-1] 계산기(`calc`)에 ① 블록·시나리오 라디오가 없다", () => {
    renderSection(declaredAsset(), "calc");
    expect(shows(UNIT_BLOCK)).toBe(false);
    expect(scenarioRadios()).toBe(0);
  });

  /** 🔴 RM-1의 **긍정 짝**. 없으면 「이관」과 「삭제」가 구별되지 않는다. */
  it("[RM-2] 판정 메뉴(`facts`)에 그대로 있다", () => {
    renderSection(declaredAsset(), "facts");
    expect(shows(UNIT_BLOCK)).toBe(true);
    expect(scenarioRadios()).toBeGreaterThan(0);
  });
});

describe("RM-3·4 ② §161① 안분 — 반대 방향으로 갈렸다", () => {
  /**
   * 🔑 실측: 직전양도 기준시가 4.5억 → 4억 하나로 과세 양도차익이
   *    172,605,000 → 115,070,000(−57,535,000)이 됐다. 순수 세액 축이다.
   */
  it("[RM-3] 계산기가 §161① 안분 입력을 그린다 (B 시나리오)", () => {
    renderSection(declaredAsset({ scenario: "B" }), "calc");
    expect(shows(ALLOCATION_BLOCK)).toBe(true);
    expect(screen.queryByTestId("rental-allocation-deferred-notice")).toBeNull();
  });

  it("[RM-4] 판정 메뉴는 그리지 않고 안내로 대체한다", () => {
    renderSection(declaredAsset({ scenario: "B" }), "facts");
    expect(shows(ALLOCATION_BLOCK)).toBe(false);
    expect(screen.getByTestId("rental-allocation-deferred-notice")).toBeTruthy();
  });
});

describe("RM-5·6 계산기에 남는 것 / 선언이 없을 때", () => {
  /**
   * 🔴 **유일 입력 경로**라 감출 수 없었다. 이 단언이 깨지면 컴패니언 주택 자산에서
   *    ⑧이 요구하는 24개월을 채울 칸이 사라진다 — 계산이 영구 차단되는 dead-end다.
   */
  it("[RM-5] 계산기가 ③ 거주기간 편집기를 그린다", () => {
    renderSection(declaredAsset(), "calc");
    expect(screen.getByTestId("residence-period-editor")).toBeTruthy();
  });

  it("[RM-6] 선언이 없으면 ②③ 대신 판정 메뉴 안내가 뜬다", () => {
    renderSection(declaredAsset({ applyException: false }), "calc");
    expect(screen.queryByTestId("imported-rental-housing-facts")).toBeNull();
    expect(screen.queryByTestId("residence-period-editor")).toBeNull();
    expect(screen.getByTestId("rental-housing-handoff-notice")).toBeTruthy();
    expect(screen.getByTestId("rental-housing-handoff-link").getAttribute("href")).toBe(
      "/calc/one-house-exemption",
    );
  });

  /** 🔑 선언이 있으면 **무엇을 선언했는지** 말해 준다 — 값은 살아서 세액을 바꾼다. */
  it("[RM-6b] 선언이 있으면 시나리오·호수를 읽기 전용으로 말해 준다", () => {
    renderSection(declaredAsset({ scenario: "B" }), "calc");
    const facts = screen.getByTestId("imported-rental-housing-facts");
    expect(facts.textContent).toContain("임대주택을 거주주택으로 전환 후 양도");
    expect(facts.textContent).toContain("임대주택 1호");
  });
});

describe("RM-7 ④ 전송 — 위젯만 없앴고 값은 그대로 간다", () => {
  it("[RM-7] 선언 4필드가 payload에 그대로 실린다", () => {
    const payload = toRentalHousingExceptionApi(
      declaredAsset({
        scenario: "B",
        priorResidenceTransferDate: "2022-01-01",
        standardPriceAtAcquisitionForPhrp: "300,000,000",
        standardPriceAtPriorTransfer: "450,000,000",
        standardPriceAtTransferForPhrp: "500,000,000",
      }),
    ) as Record<string, unknown>;

    expect(payload).toBeTruthy();
    expect(payload.applyException).toBe(true);
    expect(payload.scenario).toBe("B");
    expect(payload.standardPriceAtPriorTransfer).toBe(450_000_000);
    expect(payload.standardPriceAtAcquisitionForPhrp).toBe(300_000_000);
    expect(payload.standardPriceAtTransferForPhrp).toBe(500_000_000);
  });
});

describe("RM-8 중과 축 — 명부 `isLongTermRental`은 별개 필드다", () => {
  /**
   * 🔴 이름이 비슷하다고 같이 옮기면 안 된다. 그쪽은 명부(`HouseEntryEditor.tsx:361`,
   *    계산기 Step4)에 있고 `multi-house-surcharge-count.ts:214`가 소비하는 **중과 축**이다.
   *    특례를 선언하든 말든 명부 payload는 움직이지 않아야 한다.
   */
  it("[RM-8] 특례 선언 여부가 명부 payload의 `isLongTermRental`을 건드리지 않는다", () => {
    const houses = [
      {
        id: "h1",
        region: "capital",
        acquisitionDate: "2018-01-01",
        officialPrice: "300000000",
        isInherited: false,
        isLongTermRental: true,
        isApartment: false,
        isOfficetel: false,
      },
    ] as unknown as Parameters<typeof buildHousesPayload>[1];

    const withException = JSON.stringify(buildHousesPayload(declaredAsset(), houses, 0));
    const withoutException = JSON.stringify(
      buildHousesPayload(declaredAsset({ applyException: false }), houses, 0),
    );
    expect(withException).toBe(withoutException);
    expect(withException).toContain('"isLongTermRental":true');

    // 특례 payload에는 중과 축 키가 아예 없다.
    const rh = toRentalHousingExceptionApi(declaredAsset()) as Record<string, unknown>;
    expect(Object.keys(rh)).not.toContain("isLongTermRental");
  });
});
