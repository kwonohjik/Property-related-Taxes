/**
 * anchor — 1세대1주택 리뷰 G1 후속 화면 계약 (OH-36 + 앞선 레인이 모아 둔 표시 후속)
 *
 *  - OH-36 넘겨받은 사실 카드: §155①이 **명부로 도출**되면(토글 false) §155⑯·⑱·§154① 단서 행을
 *    그린다 — ④(`buildHouseholdSpecialPayload`)가 같은 조건에서 그 값을 보내 세액을 바꾸기 때문이다.
 *    「입력란에 그대로 채워져 있다」는 안내는 그 값들에 입력란이 없으므로 쓰지 않는다.
 *  - 연혁 문구: 합가 기한(§155④⑤ · §156의2⑧⑨ — 양도일 2018-02-13 · 2024-11-12 경계),
 *    완성 후 기한(§156의2④⑤ — 양도일 2023-01-12 경계)을 **엔진 leaf**로 고른다.
 *  - 중과 배제 카드 라벨이 연수를 적지 않는다 — 연수는 엔진 `detail`이 양도일로 말한다.
 *  - 취득세 주택 수 산정 제외 사유: 엔진 사유값에 라벨이 있어 내부 id가 화면에 나오지 않는다.
 *  - 재개발 완공APT 안내·부담부증여 카드: 「12억」 리터럴 대신 양도일 기준금액/일반 용어.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

import { ImportedOneHouseFactsCard } from "@/components/calc/transfer/ImportedOneHouseFactsCard";
import { MergedHouseholdRightSection } from "@/components/calc/transfer/MergedHouseholdRightSection";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";
import { HouseCountVerifier } from "@/components/calc/results/acquisition/HouseCountVerifier";
import { ReplacementHouseSpecialBlock } from "@/app/calc/transfer-tax/steps/step4-sections/ReplacementHouseSpecialBlock";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { Step4 } from "@/app/calc/transfer-tax/steps/Step4";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AcquisitionTaxResult } from "@/lib/tax-engine/types/acquisition.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { oneHouseJudgmentExtraDefaults } from "@/lib/stores/one-house-extra-fields.types";

afterEach(() => cleanup());

const specials = (over: Partial<TransferFormData> = {}) =>
  ({ ...createDefaultTransferFormData(), ...over }) as TransferFormData;

const ROSTER = { previousAcquisitionDate: "2018-01-01", newAcquisitionDate: "2022-03-01", source: "roster" } as const;

// ── OH-36 ────────────────────────────────────────────────────────────
describe("OH-36 넘겨받은 사실 — 명부 도출 §155①의 ⑯·⑱·§154① 단서", () => {
  it("[G1F-1] 토글 false + 명부 도출 → ⑯·⑱ 행을 그린다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={specials({ publicInstitutionRelocation: true, disposalDelayReason: "auction" })}
        temporaryTwoHouse={ROSTER}
        provisoMode="temporary_two_house"
      />,
    );
    const block = screen.getByTestId("imported-temp-two-house-specials").textContent ?? "";
    expect(block).toContain("공공기관·법인 지방이전 (§155⑯)");
    expect(block).toContain("처분기한 예외 사유 (§155⑱)");
    expect(block).toContain("법원 경매 신청 (2호)");
    expect(block).toContain("2022-03-01");
  });

  it("[G1F-2] 일시적 2주택 맥락의 §154① 단서 사유를 그린다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={specials({ provisoReason: "unavoidable" })}
        temporaryTwoHouse={ROSTER}
        provisoMode="temporary_two_house"
      />,
    );
    expect(screen.getByTestId("imported-temp-two-house-specials").textContent).toContain(
      "부득이한 사유 (3호)",
    );
  });

  it("[G1F-3] 부정 짝 — 1주택 맥락의 단서는 편집 칸이 있으므로 적지 않는다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={specials({ provisoReason: "unavoidable" })}
        provisoMode="one_house"
      />,
    );
    expect(screen.queryByTestId("imported-temp-two-house-specials")).toBeNull();
  });

  it("[G1F-4] 부정 짝 — §155①이 성립하지 않으면(④가 보내지 않으면) ⑯·⑱을 적지 않는다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={undefined}
        specials={specials({ publicInstitutionRelocation: true, temporaryTwoHouseSpecial: true })}
        temporaryTwoHouse={undefined}
        provisoMode={null}
      />,
    );
    expect(screen.queryByTestId("imported-temp-two-house-specials")).toBeNull();
  });

  it("[G1F-5] 선언 없음 안내가 「일시적 2주택은 아래 입력란에 있다」고 말하지 않는다", () => {
    render(
      <ImportedOneHouseFactsCard
        facts={oneHouseJudgmentExtraDefaults}
        specials={specials()}
      />,
    );
    const t = screen.getByTestId("imported-one-house-facts-none").textContent ?? "";
    expect(t).not.toContain("일시적 2주택");
  });

  /** 🔑 배선 — Step4가 ④와 같은 leaf로 도출값을 넘기는가(라이브러리 anchor ≠ 배선 증명). */
  it("[G1F-6] 계산기 Step4 — 명부 1채로 §155① 도출 + ⑯ ON이면 카드에 ⑯ 행", () => {
    const base = createDefaultTransferFormData();
    const house: HouseEntry = {
      ...({} as HouseEntry),
      id: "h1",
      region: "capital",
      acquisitionDate: "2022-03-01",
      officialPrice: "300000000",
      isInherited: false,
      isLongTermRental: false,
      isApartment: false,
      isOfficetel: false,
      isUnsoldHousing: false,
    };
    const form: TransferFormData = {
      ...base,
      transferDate: "2026-06-01",
      assets: base.assets.map((a, i) =>
        i === 0 ? { ...a, assetKind: "housing" as const, acquisitionDate: "2018-01-01" } : a,
      ),
      isOneHousehold: true,
      householdHousingCount: "2",
      houses: [house],
      temporaryTwoHouseSpecial: false,
      publicInstitutionRelocation: true,
    };
    render(<Step4 form={form} onChange={() => {}} />);
    expect(screen.getByTestId("imported-temp-two-house-specials").textContent).toContain(
      "공공기관·법인 지방이전 (§155⑯)",
    );
  });
});

// ── §156의2④ 완성 후 기한 연혁 (2023-01-11 / 2023-01-12) ─────────────
describe("완성 후 기한 연혁 — 넘겨받은 권리 사실", () => {
  const rights = { ...specials(), rightThreeYearExceptionKind: "new_house" as const, rightMovedInWithin3Years: true };
  it("[G1F-7] 2023-01-11 양도 → 2년", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} rights={rights} transferDate="2023-01-11" />);
    const t = screen.getByTestId("imported-right-exceptions").textContent ?? "";
    expect(t).toContain("완성 후 2년 내 전입");
    expect(t).not.toContain("3년 내 전입");
  });
  it("[G1F-8] 2023-01-12 양도 → 3년", () => {
    render(<ImportedOneHouseFactsCard facts={undefined} rights={rights} transferDate="2023-01-12" />);
    const t = screen.getByTestId("imported-right-exceptions").textContent ?? "";
    expect(t).toContain("완성 후 3년 내 전입");
    expect(t).not.toContain("2년 내 전입");
  });
});

// ── §156의2⑤ 대체주택 완성 후 기한 연혁 ──────────────────────────────
describe("대체주택 완성 후 기한 연혁 — 선언 토글·사후관리 안내", () => {
  const f = (transferDate: string) =>
    ({ ...createDefaultTransferFormData(), transferDate, replacementHouseSpecial: true }) as TransferFormData;
  it("[G1F-9] 2023-01-11 양도 → 2년 · 인용은 §156의2⑤2호", () => {
    const { container } = render(<ReplacementHouseSpecialBlock form={f("2023-01-11")} onChange={() => {}} />);
    const t = container.textContent ?? "";
    expect(t).toContain("신축주택 완성 후 2년 내 세대전원 이사");
    expect(t).toContain("§156의2⑤2호");
    expect(t).not.toContain("§156의2⑤③");
    expect(t).not.toContain("완성 후 3년");
  });
  it("[G1F-10] 2023-01-12 양도 → 3년", () => {
    const { container } = render(<ReplacementHouseSpecialBlock form={f("2023-01-12")} onChange={() => {}} />);
    const t = container.textContent ?? "";
    expect(t).toContain("신축주택 완성 후 3년 내 세대전원 이사");
    expect(t).not.toContain("완성 후 2년");
  });
});

// ── §156의2⑧⑨ 합가 기한 연혁 ─────────────────────────────────────────
describe("합가 기한 연혁 — 동거봉양·혼인 합가 세대 카드", () => {
  const f = (over: Partial<TransferFormData>) =>
    ({
      ...createDefaultTransferFormData(),
      householdHousingCount: "1",
      presaleRights: [{ id: "r1", type: "redevelopment_right", acquisitionDate: "2016-10-01", region: "capital" }],
      ...over,
    }) as TransferFormData;
  const text = (over: Partial<TransferFormData>) =>
    render(<MergedHouseholdRightSection form={f(over)} onChange={() => {}} />).container.textContent ?? "";

  it("[G1F-11] 동거봉양 · 2018-02-12 양도 → 5년", () => {
    const t = text({ parentalCareMergeDate: "2014-01-01", transferDate: "2018-02-12" });
    expect(t).toContain("5년 이내에 먼저 양도하는 주택");
    expect(t).not.toContain("10년");
  });
  it("[G1F-12] 동거봉양 · 2018-02-13 양도 → 10년", () => {
    const t = text({ parentalCareMergeDate: "2014-01-01", transferDate: "2018-02-13" });
    expect(t).toContain("10년 이내에 먼저 양도하는 주택");
    expect(t).not.toContain("5년");
  });
  it("[G1F-13] 혼인 · 2024-11-11 양도 → 5년", () => {
    const t = text({ marriageDate: "2020-01-01", transferDate: "2024-11-11" });
    expect(t).toContain("5년 이내에 먼저 양도하는 주택");
    expect(t).not.toContain("10년");
  });
  it("[G1F-14] 혼인 · 2024-11-12 양도 → 10년", () => {
    const t = text({ marriageDate: "2020-01-01", transferDate: "2024-11-12" });
    expect(t).toContain("10년 이내에 먼저 양도하는 주택");
    expect(t).not.toContain("5년");
  });
  it("[G1F-15] 합가일·양도일 미입력 → 10년 단정 없이 5년 경과 규정을 함께 적는다", () => {
    const t = text({ transferDate: "" });
    expect(t).toContain("2018-02-13");
    expect(t).toContain("2024-11-12");
  });
});

// ── 중과 배제 카드 라벨 ───────────────────────────────────────────────
describe("다주택 중과 배제 카드 — 합가 라벨이 연수를 단정하지 않는다", () => {
  it("[G1F-16] 라벨에 10년이 없고, 엔진 detail(5년)이 그대로 보인다", () => {
    const { container } = render(
      <MultiHouseSurchargeDetailCard
        detail={{
          effectiveHouseCount: 2,
          rawHouseCount: 2,
          excludedHouses: [],
          exclusionReasons: [
            { type: "parental_care_merge", detail: "동거봉양 합가일(2014-01-01) 5년 내 먼저 양도 — …" },
            { type: "marriage_merge", detail: "혼인일(2020-01-01) 5년 내 먼저 양도 — …" },
          ],
          isRegulatedAtTransfer: true,
          warnings: [],
        }}
      />,
    );
    const t = container.textContent ?? "";
    expect(t).not.toContain("10년");
    expect(t).toContain("동거봉양 합가일(2014-01-01) 5년 내 먼저 양도");
  });
});

// ── 취득세 주택 수 산정 제외 사유 라벨 ───────────────────────────────
describe("취득세 HouseCountVerifier — 엔진 사유값에 한국어 라벨", () => {
  it("[G1F-17] joint_inheritance_not_owner · low_value_metro · inheritance_under_5yr 내부 id 비노출", () => {
    const result = {
      houseCountDetail: {
        totalCount: 4,
        effectiveCount: 1,
        pendingAcquisitionIncluded: true,
        referenceDate: "2026-06-01",
        excludedDetails: [
          { assetType: "house", reason: "joint_inheritance_not_owner", legalBasis: "", description: "" },
          { assetType: "house", reason: "low_value_metro", legalBasis: "", description: "" },
          { assetType: "house", reason: "inheritance_under_5yr", legalBasis: "", description: "" },
        ],
      },
    } as unknown as AcquisitionTaxResult;
    render(<HouseCountVerifier result={result} />);
    fireEvent.click(screen.getByRole("button"));
    const t = document.body.textContent ?? "";
    expect(t).not.toMatch(/joint_inheritance_not_owner|low_value_metro|inheritance_under_5yr/);
    expect(t).toContain("공동상속");
    expect(t).toContain("상속");
  });
});

// ── 재개발 완공APT 안내 — 양도일 기준금액 ─────────────────────────────
describe("재개발 완공APT 1세대1주택 안분 안내 — 양도일 기준금액", () => {
  it("[G1F-18] 2021-12-07 양도 → 9억, 12억 문구 없음", () => {
    const asset = { ...makeDefaultAsset(1), assetKind: "redevelopment_apt" as const, redevSubject: "apt" as const };
    const { container } = render(
      <RedevelopmentBlock asset={asset} onChange={() => {}} isOneHouseSingle transferDate="2021-12-07" />,
    );
    const t = container.textContent ?? "";
    expect(t).toContain("1세대1주택 + 9억 초과 비과세 안분 적용 여부");
    expect(t).not.toContain("12억");
  });
  it("[G1F-19] 2021-12-08 양도 → 12억", () => {
    const asset = { ...makeDefaultAsset(1), assetKind: "redevelopment_apt" as const, redevSubject: "apt" as const };
    const { container } = render(
      <RedevelopmentBlock asset={asset} onChange={() => {}} isOneHouseSingle transferDate="2021-12-08" />,
    );
    expect(container.textContent).toContain("1세대1주택 + 12억 초과 비과세 안분 적용 여부");
  });
});
