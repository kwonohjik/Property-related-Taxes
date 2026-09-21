/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — 읽기 전용 요약이 **넘겨받은 권리 사실을 실제로 그린다** (P6-a)
 *
 * ## 🔴 왜 소스 스캔으로는 부족한가 — 뮤테이션 실측
 *
 * 형제 anchor(`right-exception-sections-moved`)의 RM-6은 소스에 `imported-right-exceptions`
 * 문자열이 있는지만 봤다. 렌더 조건을 `{false && (`로 바꿔도 **초록이었다(SURVIVED)** —
 * 문자열은 그대로 남기 때문이다. 가드가 주장(「그린다」)이 아니라 **대리 지표**(「코드에 있다」)를
 * 본 것이다(`feedback_guard_uses_proxy_not_the_claim`). ⇒ 실제로 마운트해서 본다.
 *
 * ## 🔑 이 카드가 P6-a의 **유일한 방어선**이다
 *
 * 권리 13필드는 `TransferFormData` flat이라 위젯을 지워도 값이 남아 세액을 바꾼다. 화면이
 * 말하지 않으면 「보이지 않는 값이 세액을 바꾸는」 상태가 된다 — P6 이전에 저장한 이력을
 * 다시 열었을 때가 정확히 그 경우다(OH-21).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
  ImportedOneHouseFactsCard,
  type ImportedRightsSlice,
} from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";

afterEach(cleanup);

const rights = (over: Partial<ImportedRightsSlice> = {}): ImportedRightsSlice => ({
  ...(createDefaultTransferFormData() as unknown as ImportedRightsSlice),
  ...over,
});

describe("P6-a 읽기 전용 요약 — 권리 사실", () => {
  /** 🔴 핵심 — 선언된 값이 화면에 나온다. */
  it("[IR-1] 3년 초과 예외 선언이 보인다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        rights={rights({
          rightThreeYearExceptionKind: "new_house",
          rightNewHouseCompletionDate: "2020-05-01",
        })}
      />,
    );
    expect(screen.getByTestId("imported-right-exceptions")).toBeTruthy();
    expect(screen.getByText("2020-05-01")).toBeTruthy();
  });

  /**
   * 🔴 **`facts`가 없어도 렌더한다.** P6 이전 저장 record는 `importedOneHouseFacts`가 없는데
   *    권리 값은 갖고 있다 — `facts`만 보고 숨기면 그 값이 세액을 바꾸는 채로 사라진다.
   */
  it("[IR-2] 넘겨받은 사실이 없어도 권리 값만으로 카드가 뜬다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        rights={rights({ generalHouseHeldAtInheritance: true })}
      />,
    );
    expect(screen.getByTestId("imported-one-house-facts")).toBeTruthy();
    expect(screen.getByText(/상속개시 당시 보유한 주택/)).toBeTruthy();
  });

  /**
   * 🔑 **선언하지 않은 것은 말하지 않는다.** 13필드를 전부 나열하면 「아니오」가 쌓여
   *    실제 선언이 묻힌다 — 그러면 카드가 있으나 마나다.
   */
  it("[IR-3] 아무 선언도 없으면 권리 블록이 뜨지 않는다", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} rights={rights()} />);
    expect(screen.queryByTestId("imported-right-exceptions")).toBeNull();
    // 근거가 아예 없으면 카드 자체를 그리지 않는다.
    expect(screen.queryByTestId("imported-one-house-facts")).toBeNull();
  });

  /** 🔑 §155의2·§155의3 블록과 **함께** 뜬다 — 한쪽이 다른 쪽을 가리지 않는다. */
  it("[IR-4] 특례 사실과 권리 사실이 같이 보인다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={{
          ...oneHouseJudgmentExtraDefaults,
          winWinRentalSpecial: true,
          winWinRentalContractDate: "2022-05-01",
          winWinRentalIncreaseRatePct: "5",
          winWinRentalPriorLeaseMonths: "18",
          winWinRentalLeaseMonths: "24",
        }}
        rights={rights({ mergedHouseholdFirstHouseKind: "house_only" })}
      />,
    );
    expect(screen.getByTestId("imported-win-win-rental")).toBeTruthy();
    expect(screen.getByTestId("imported-right-exceptions")).toBeTruthy();
  });
});
