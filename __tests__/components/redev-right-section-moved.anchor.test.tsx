/**
 * @vitest-environment jsdom
 *
 * anchor(⑤·④) — 1세대1입주권 §89①4호 입력의 **판정 메뉴 이관** (P6-c-1)
 *
 * ## 무엇을 고정하는가
 *
 * | # | 주장 | 왜 필요한가 |
 * |---|---|---|
 * | RC-1 | 계산기 `RedevelopmentBlock`에 §⑥ 입력 4필드가 **없다** | 이관의 본체 |
 * | RC-2 | 판정 메뉴 `Step3`에 **있다** | RC-1은 부정형이다 — 짝이 없으면 「지워진 것」과 구별되지 않는다 |
 * | RC-3 | 계산기가 §95② LTHD 구조 안내를 **그린다** | 세액 맥락은 계산기 몫이다. 함께 옮기면 계산기가 그걸 말할 곳을 잃는다 |
 * | RC-4 | 판정 메뉴는 그 안내를 그리지 않는다 | RC-3의 짝. E2E `one-house-judgment-one-right` ORR-2와 같은 축인데, 그쪽은 이제 구조적으로 참이라 **여기 긍정 짝이 없으면 공허해진다** |
 * | RC-5 | 읽기 전용 요약이 선언된 값을 **실제로 그린다** | 소스 스캔은 `{false && (`에 SURVIVED한다(P6-a 실측) — 마운트해서 본다 |
 * | RC-6 | 선언이 없으면 안내 카드가 대신 뜬다 | 침묵 제거 금지(OH-20) |
 * | RC-7 | ④ 전송 payload가 **바뀌지 않는다** | 위젯만 없앴다. 값이 함께 사라지면 저장된 이력의 세액이 달라진다(OH-21) |
 *
 * ## 🔴 중과 축 없음 — 실측
 *
 * 4필드(`redevExemptionEligibleAtApproval`·`redevOtherHouseAcquisitionDate`·
 * `redevPriorHouseHoldingMonths`·`redevPriorHouseResidenceMonths`) 중
 * `multi-house-surcharge*`에 도달하는 것은 **하나도 없다**. 소비처는 ④ 변환 2곳과
 * ⑧ 형식검증 1곳뿐이다 — P6-b의 §155⑧·합가(중과 배제가 §154① 충족을 요구하지 않아
 * 계산기에 남겨야 했던 축)와 다르다. 그래서 통째로 옮길 수 있었다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RedevelopmentBlock } from "@/components/calc/transfer/RedevelopmentBlock";
import { Step3 as JudgmentStep3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  ImportedRedevRightFactsCard,
  type ImportedRedevRightSlice,
} from "@/components/calc/transfer/ImportedRedevRightFactsCard";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm } from "@/lib/stores/one-house-judgment-form.types";
import { buildRedevelopmentPayload } from "@/lib/calc/transfer-tax-api-redev";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(cleanup);

const TOGGLE_TITLE = "인가일 현재 §89①3호 가목 요건 충족 (자기선언)";
const LTHD_NOTICE = /관리처분 인가 후 조합원입주권 양도 — 과세 구조 안내/;
const OTHER_HOUSE_LABEL = /세대 보유 1주택의 취득일/;

function rightAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "right_to_move_in",
    redevSubject: "right",
    acquisitionDate: "2010-01-01",
    actualSalePrice: "2000000000",
    redevApprovalDate: "2020-10-23",
    redevRightsValue: "800000000",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "100000000",
    ...over,
  };
}

const judgmentForm = (asset: AssetForm) => ({
  ...createDefaultTransferFormData(),
  ...createInitialOneHouseJudgmentForm(),
  transferDate: "2024-06-01",
  assets: [asset],
});

const shows = (re: RegExp | string) => screen.queryAllByText(re).length > 0;

describe("RC-1·2 §⑥ 입력 — 계산기에 없고 판정 메뉴에 있다", () => {
  /** 🔑 **양쪽에 같은 시료**를 쓴다 — 토글 ON이라야 하위 칸이 열린다. */
  const declared = () => rightAsset({ redevExemptionEligibleAtApproval: "yes" });

  it("[RC-1] 계산기 `RedevelopmentBlock`에 자기선언 토글·취득일 칸이 없다", () => {
    render(<RedevelopmentBlock asset={declared()} onChange={() => {}} isOneHouseSingle />);
    expect(screen.queryByLabelText(TOGGLE_TITLE)).toBeNull();
    expect(shows(OTHER_HOUSE_LABEL)).toBe(false);
  });

  /** 🔴 RC-1의 **긍정 짝**. 없으면 「이관」과 「삭제」가 구별되지 않는다. */
  it("[RC-2] 판정 메뉴 `Step3`에 그대로 있다", () => {
    render(<JudgmentStep3 form={judgmentForm(declared())} onChange={() => {}} />);
    expect(screen.getByLabelText(TOGGLE_TITLE)).toBeTruthy();
    expect(shows(OTHER_HOUSE_LABEL)).toBe(true);
  });
});

describe("RC-3·4 §95② LTHD 안내 — 반대 방향으로 갈렸다", () => {
  /**
   * 🔑 세액 맥락은 **계산기** 몫이다. 입력과 함께 판정 메뉴로 넘기면 계산기가
   *    「인가전 차익만 LTHD 대상」을 말할 곳을 잃는다 — 판정 메뉴는 세액을 말하지 않는다.
   */
  it("[RC-3] 계산기가 LTHD 구조 안내를 그린다", () => {
    render(<RedevelopmentBlock asset={rightAsset()} onChange={() => {}} isOneHouseSingle />);
    expect(shows(LTHD_NOTICE)).toBe(true);
  });

  it("[RC-4] 판정 메뉴는 그 안내를 그리지 않는다", () => {
    render(<JudgmentStep3 form={judgmentForm(rightAsset())} onChange={() => {}} />);
    expect(shows(LTHD_NOTICE)).toBe(false);
  });
});

describe("RC-5·6 읽기 전용 요약", () => {
  const slice = (over: Partial<ImportedRedevRightSlice> = {}): ImportedRedevRightSlice => ({
    ...(makeDefaultAsset(1) as unknown as ImportedRedevRightSlice),
    ...over,
  });

  /** 🔴 P6-c-1 **이전**에 저장한 이력이 정확히 이 경우다 — 값은 살아서 세액을 바꾼다(OH-21). */
  it("[RC-5] 선언된 값이 실제로 화면에 나온다", () => {
    render(
      <ImportedRedevRightFactsCard
        asset={slice({
          redevExemptionEligibleAtApproval: "yes",
          redevOtherHouseAcquisitionDate: "2022-05-01",
          redevPriorHouseResidenceMonths: "30",
        })}
      />,
    );
    expect(screen.getByTestId("imported-redev-right-facts")).toBeTruthy();
    expect(screen.getByText("2022-05-01")).toBeTruthy();
    expect(screen.getByText("30개월")).toBeTruthy();
    expect(screen.getByText("충족 선언")).toBeTruthy();
  });

  it("[RC-6] 선언이 없으면 요약 대신 판정 메뉴 안내가 뜬다", () => {
    render(<ImportedRedevRightFactsCard asset={slice()} />);
    expect(screen.queryByTestId("imported-redev-right-facts")).toBeNull();
    expect(screen.getByTestId("redev-right-handoff-notice")).toBeTruthy();
    expect(screen.getByTestId("redev-right-handoff-link").getAttribute("href")).toBe(
      "/calc/one-house-exemption",
    );
  });

  /** 🔑 「아니오」를 쌓지 않는다 — 실제 선언이 묻히면 카드가 있으나 마나다. */
  it("[RC-6b] 미충족 선언도 말해 준다 — 빈 값만 침묵한다", () => {
    render(<ImportedRedevRightFactsCard asset={slice({ redevExemptionEligibleAtApproval: "no" })} />);
    expect(screen.getByText("미충족 선언")).toBeTruthy();
  });
});

describe("RC-7 ④ 전송 — 위젯만 없앴고 값은 그대로 간다", () => {
  it("[RC-7] 4필드가 payload에 그대로 실린다", () => {
    const payload = buildRedevelopmentPayload(
      rightAsset({
        redevExemptionEligibleAtApproval: "yes",
        redevOtherHouseAcquisitionDate: "2022-05-01",
        redevPriorHouseHoldingMonths: "36",
        redevPriorHouseResidenceMonths: "30",
      }),
    ) as Record<string, unknown>;
    const redev = (payload.redevelopment ?? payload) as Record<string, unknown>;
    expect(JSON.stringify(redev)).toContain("2022-05-01");
    expect(JSON.stringify(redev)).toContain("36");
  });
});
