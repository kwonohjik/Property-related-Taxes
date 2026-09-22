/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — ③ 섹션 `mode` 분할이 **실제로 그리는 것** (P6-b)
 *
 * ## 🔴 왜 소스 스캔으로는 부족한가
 *
 * 형제 anchor(`temp-two-house-sections-moved`)의 TM-8은 소스에 `mode="calc"` 문자열이
 * 있는지만 본다. P6-a에서 같은 모양의 가드가 렌더 조건을 `{false && (`로 바꿔도 **초록이었다**
 * (`feedback_guard_uses_proxy_not_the_claim`). ⇒ 여기서는 마운트해서 본다.
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 |
 * |---|---|
 * | CM-1 | `mode="calc"`는 §155⑧·합가를 **그린다** |
 * | CM-2 | `mode="calc"`는 §155①⑥⑦·§156의2⑤를 **그리지 않는다** |
 * | CM-3 | 기본(full)은 **전부** 그린다 — CM-2가 「컴포넌트가 죽었다」와 구별된다 |
 * | CM-4 | 안내 카드는 넘겨받은 사실이 **없을 때만** 뜬다 |
 * | CM-5 | 읽기 전용 요약이 ③ 값을 **실제로 그린다** |
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TemporaryTwoHouseSection } from "@/app/calc/transfer-tax/steps/step4-sections/TemporaryTwoHouseSection";
import { JudgmentHandoffNoticeCard } from "@/components/calc/transfer/JudgmentHandoffNoticeCard";
import {
  ImportedOneHouseFactsCard,
  type ImportedSpecialsSlice,
} from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { provisoGate } from "@/lib/calc/transfer-tax-api-helpers";
import { judgeTempTwoHouseFromForm } from "@/lib/calc/transfer-temp-two-house-judge";
import { judgeRuralHouseLocation } from "@/lib/geo/rural-house-location";

vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: () => null,
}));

afterEach(cleanup);

const form = (over: Partial<TransferFormData> = {}): TransferFormData => ({
  ...createDefaultTransferFormData(),
  isOneHousehold: true,
  householdHousingCount: "2", // 폼 필드는 문자열 — `provisoGate` 인자(number)와 다른 축이다
  transferDate: "2024-03-01",
  ...over,
});

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

/**
 * 🔄 **§155⑧도 이 컴포넌트를 떠났다** — 명부 행으로 갔다(D-6 4 · P7-5).
 *    `HouseEntry.oneHouseUnavoidableOutsideCapital` · `HouseEntryUnavoidableOutsideCapitalBlock`.
 *    ⑥⑦과 달리 §155⑧은 `full` 가드 **밖**이라 두 화면 모두에 떴다 — 저장소가 달라
 *    값이 두 벌 존재하던 **유일한 이중 입력**이었고, 이관으로 해소됐다.
 */
const UNAVOIDABLE_MOVED_TO_ROW = true;
const MARRIAGE = /혼인합가일/;
// 🔄 토글 제거(2026-09-22) — 축 제목으로 셀렉터를 옮겼다. 종전 「일시적 2주택 특례 해당」은 없다.
const TEMP_TWO = /일시적 2주택 특례 \(§155①\)/;
/**
 * 🔄 **§155⑥1호은 이 컴포넌트를 떠났다** — 명부 행으로 갔다(D-6 · P7-3).
 *    정본 `HouseEntry.oneHouseCulturalHeritage` · 입력 `HouseEntryOneHouseFactsSection`.
 *
 * ⚠️ CM-2에서 `shows(HERITAGE) === false`를 **지웠다**. 컴포넌트 어디에도 없으므로 그 단언은
 *    이제 **공허하게 통과**한다 — 남겨 두면 「calc 모드 게이트가 ⑥을 막고 있다」로 오독된다
 *    ([[feedback_mutation_zero_discrimination_is_not_proof]]).
 *    새 위치의 안전망은 `__tests__/calc/two-house-axis-path.anchor.test.tsx`가 진다.
 */
const HERITAGE_MOVED_TO_ROW = true;
/**
 * 🔄 **§155⑦도 이 컴포넌트를 떠났다** — 명부 행으로 갔다(D-6 3b · P7-4).
 *    정본 `HouseEntry.oneHouseRuralHouse`·`ruralHouseKind` · 입력 `HouseEntryRuralHouseBlock`.
 *    ⑥과 같은 이유로 CM-2의 `shows(RURAL) === false`도 **공허해져** 제거했다.
 *    새 위치의 안전망은 `one-house-row-facts.anchor.test.ts`(RU-1~9)와
 *    `e2e/transfer-house-row-one-house-facts.spec.ts`가 진다.
 */
const RURAL_MOVED_TO_ROW = true;
const REPLACEMENT = /대체주택 비과세 특례 해당/;

/** 판정 메뉴가 넘기는 파생 props — 계산기는 `mode="calc"`라 이것을 만들지 않는다. */
const fullProps = (f: TransferFormData) => ({
  tempTwoHouseVerdict: judgeTempTwoHouseFromForm({
    previousAcquisitionDate: "2019-03-01",
    newHouseAcquisitionDate: f.newHouseAcquisitionDate,
    transferDate: f.transferDate,
    provisoReason: f.provisoReason,
    provisoDepartureDate: f.provisoDepartureDate,
    provisoExpropriationDate: f.provisoExpropriationDate,
    provisoBusinessApprovalDate: f.provisoBusinessApprovalDate,
    residencePeriodMonths: f.residencePeriodMonths,
    publicInstitutionRelocation: f.publicInstitutionRelocation,
    disposalDelayReason: f.disposalDelayReason,
  }),
  relocationRegionVerdict: null,
  proviso: provisoGate({
    isOneHousehold: true,
    isHousing: true,
    householdHousingCount: 2,
    temporaryTwoHouseApplies: f.temporaryTwoHouseSpecial,
  }),
  primaryAcquisitionDate: "2019-03-01",
  // §155① 신규주택은 이제 명부 파생값이다 — 이 시료는 폼 필드를 그대로 흘려보낸다.
  derivedNewHouseAcquisitionDate: f.newHouseAcquisitionDate || undefined,
});

describe("CM-1·2 계산기 `mode=\"calc\"`", () => {
  /**
   * 🔴 합가가 사라지면 비과세를 주장할 수 없는 세대의 중과 입력 경로가 끊긴다
   *    (영 §167의3⑨는 §154①을 요구하지 않는다 — 실측 −5.29억).
   *
   * 🔄 **§155⑧은 명부 행으로 갔다**(D-6 4 · 2026-09-22). 같은 이유로 입력 경로는 여전히
   *    필요하고, 그 안전망은 `one-house-row-facts.anchor.test.ts`(UO-1~8)와
   *    `e2e/transfer-house-row-one-house-facts.spec.ts`가 진다.
   */
  it("[CM-1] 합가는 그린다", () => {
    render(<TemporaryTwoHouseSection form={form()} onChange={() => {}} mode="calc" />);
    expect(shows(MARRIAGE)).toBe(true);
    expect(shows(/동거봉양 합가일/)).toBe(true);
  });

  it("[CM-2] §155①·§156의2⑤는 그리지 않는다", () => {
    render(
      <TemporaryTwoHouseSection
        form={form({ temporaryTwoHouseSpecial: true })}
        onChange={() => {}}
        mode="calc"
      />,
    );
    expect(shows(TEMP_TWO)).toBe(false);
    expect(shows(REPLACEMENT)).toBe(false);
  });
});

describe("CM-3 판정 메뉴(기본 모드)는 전부 그린다 — CM-2의 **긍정 짝**", () => {
  it("[CM-3] 같은 컴포넌트가 full에서는 네 특례를 모두 그린다", () => {
    /**
     * ⚠️ `newHouseAcquisitionDate`가 있어야 §155① 블록이 그려진다 (2026-09-22).
     *    토글이 사라지고 **신규주택이 특정돼야** 그 축을 그린다 — 특정되지 않으면 화면이
     *    「신규주택이 없다」고 말하는 대신 축 자체를 숨긴다(`TempTwoHouseCoreBlocks` 조기 반환).
     *    이 시료는 `fullProps`가 그 값을 `derivedNewHouseAcquisitionDate`로 흘려보낸다.
     */
    const f = form({ temporaryTwoHouseSpecial: true, newHouseAcquisitionDate: "2023-05-01" });
    render(<TemporaryTwoHouseSection form={f} onChange={() => {}} {...fullProps(f)} />);
    expect(shows(TEMP_TWO)).toBe(true);
    expect(shows(REPLACEMENT)).toBe(true);
    // 합가는 여전히 함께 있다. §155⑧은 명부 행으로 갔다(위 주석).
    expect(shows(MARRIAGE)).toBe(true);
  });
});

describe("CM-4 안내 카드", () => {
  it("[CM-4a] 넘겨받은 사실이 없으면 뜬다", () => {
    render(<JudgmentHandoffNoticeCard form={form()} />);
    expect(screen.getByTestId("judgment-handoff-notice")).toBeTruthy();
    expect(screen.getByTestId("judgment-handoff-link").getAttribute("href")).toBe(
      "/calc/one-house-exemption",
    );
  });

  it("[CM-4b] 판정을 거쳤으면 뜨지 않는다 — 이미 값이 들어와 있다", () => {
    render(<JudgmentHandoffNoticeCard form={form({ sourceJudgmentId: "abc" })} />);
    expect(screen.queryByTestId("judgment-handoff-notice")).toBeNull();
  });
});

describe("CM-5 읽기 전용 요약 — ③ 값을 실제로 그린다", () => {
  const specials = (over: Partial<ImportedSpecialsSlice> = {}): ImportedSpecialsSlice => ({
    ...(createDefaultTransferFormData() as unknown as ImportedSpecialsSlice),
    ...over,
  });

  /** 🔴 P6-b 이전에 저장한 이력이 정확히 이 경우다 — 화면이 말하지 않으면 보이지 않는 값이 세액을 바꾼다. */
  it("[CM-5a] `facts`가 없어도 ③ 값만으로 카드가 뜬다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={specials({
          temporaryTwoHouseSpecial: true,
          newHouseAcquisitionDate: "2023-06-01",
        })}
      />,
    );
    expect(screen.getByTestId("imported-temp-two-house-specials")).toBeTruthy();
    expect(screen.getByText("2023-06-01")).toBeTruthy();
  });

  it("[CM-5b] 아무 선언도 없으면 블록이 뜨지 않는다 — 「아니오」를 쌓지 않는다", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} specials={specials()} />);
    expect(screen.queryByTestId("imported-temp-two-house-specials")).toBeNull();
  });

  /**
   * 🔑 §154① 단서는 **일시적 2주택 맥락일 때만** 적는다 — 1주택 맥락의 같은 카드는
   *    계산기 섹션②에 편집 칸으로 남아 있어, 조건 없이 적으면 값이 두 곳에 보인다.
   */
  it("[CM-5c] 1주택 맥락의 단서 사유는 요약에 넣지 않는다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={specials({ provisoReason: "overseas_migration" })}
      />,
    );
    expect(screen.queryByTestId("imported-temp-two-house-specials")).toBeNull();
  });
});
