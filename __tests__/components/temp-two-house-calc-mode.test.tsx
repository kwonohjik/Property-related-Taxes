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
  householdHousingCount: "2",
  transferDate: "2024-03-01",
  ...over,
});

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

const UNAVOIDABLE = /수도권 밖 부득이한 사유 주택 보유/;
const MARRIAGE = /혼인합가일/;
const TEMP_TWO = /일시적 2주택 특례 해당/;
const HERITAGE = /지정문화유산·국가등록문화유산·천연기념물등 주택 보유/;
const RURAL = /농어촌주택 보유/;
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
  ruralLocation: judgeRuralHouseLocation({ jibun: "", urbanVerdict: undefined }),
  proviso: provisoGate({
    isOneHousehold: true,
    isHousing: true,
    householdHousingCount: "2",
    temporaryTwoHouseSpecial: f.temporaryTwoHouseSpecial,
  }),
  primaryAcquisitionDate: "2019-03-01",
});

describe("CM-1·2 계산기 `mode=\"calc\"`", () => {
  /** 🔴 이 둘이 사라지면 비과세를 주장할 수 없는 세대의 중과 입력 경로가 끊긴다. */
  it("[CM-1] §155⑧·합가는 그린다", () => {
    render(<TemporaryTwoHouseSection form={form()} onChange={() => {}} mode="calc" />);
    expect(shows(UNAVOIDABLE)).toBe(true);
    expect(shows(MARRIAGE)).toBe(true);
    expect(shows(/동거봉양 합가일/)).toBe(true);
  });

  it("[CM-2] §155①⑥⑦·§156의2⑤는 그리지 않는다", () => {
    render(
      <TemporaryTwoHouseSection
        form={form({ temporaryTwoHouseSpecial: true })}
        onChange={() => {}}
        mode="calc"
      />,
    );
    expect(shows(TEMP_TWO)).toBe(false);
    expect(shows(HERITAGE)).toBe(false);
    expect(shows(RURAL)).toBe(false);
    expect(shows(REPLACEMENT)).toBe(false);
  });
});

describe("CM-3 판정 메뉴(기본 모드)는 전부 그린다 — CM-2의 **긍정 짝**", () => {
  it("[CM-3] 같은 컴포넌트가 full에서는 네 특례를 모두 그린다", () => {
    const f = form({ temporaryTwoHouseSpecial: true });
    render(<TemporaryTwoHouseSection form={f} onChange={() => {}} {...fullProps(f)} />);
    expect(shows(TEMP_TWO)).toBe(true);
    expect(shows(HERITAGE)).toBe(true);
    expect(shows(RURAL)).toBe(true);
    expect(shows(REPLACEMENT)).toBe(true);
    // §155⑧·합가도 여전히 함께 있다(판정 메뉴에서는 둘 다 필요하다).
    expect(shows(UNAVOIDABLE)).toBe(true);
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
