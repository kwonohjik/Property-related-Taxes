/**
 * 청산금 수령분 단독 신고 — 양도차익 근거 인용 anchor (`docs/02-design/features/redev-receive-only-gain-citation.plan.md`).
 *
 * 「소득세법 시행령」 §166①2호 가목은 입주권 양도 산식이다. 단독 신고의 계산(청산금 − 취득가액 × 청산금 ÷ 평가액)은
 * 양도소득세 집행기준 100-166-10 · 법규재산2012-358이 근거다. 동시신고·입주권 경로의 조문 인용은 맞으므로 그대로 둔다.
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ReceiveOnlyToggleCard } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { SalePriceTotalPreviewCard } from "@/components/calc/transfer/RedevelopmentBlockCards";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { buildRedevPerAssetForGain } from "@/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import type { StatementItem } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { applyRedevelopmentOverrides } from "@/components/calc/results/transfer/DetailedStatementRedevOverrides";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const GUIDELINE = "양도소득세 집행기준 100-166-10";
const RULING = "법규재산2012-358";
const rates = makeMockRates();

function run(redevPatch: Partial<RedevelopmentInfo>, transferPrice: number) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice,
      transferDate: new Date("2024-01-26"),
      acquisitionDate: new Date("2002-04-09"),
      acquisitionPrice: 200_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 2,
      residencePeriodMonths: 0,
      redevelopment: {
        subject: "apt",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2009-10-23"),
        rightsValue: 500_000_000,
        settlementDirection: "receive",
        settlementAmount: 114_000_000,
        settlementSaleDate: new Date("2024-01-26"),
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
        exemptionEligibleAtApproval: false,
        ...redevPatch,
      },
    }),
    rates,
  );
}

const receiveOnly = () => run({ receiveOnlyMode: true }, 114_000_000);
const simultaneous = () => run({ receiveOnlyMode: false }, 525_000_000);

const statementText = (result: ReturnType<typeof run>) => {
  const form = {
    transferDate: "2024-01-26",
    filingDate: "2024-03-31",
    contractTotalPrice: "525000000",
    assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2002-04-09" }],
  } as unknown as TransferFormData;
  return JSON.stringify(Array.from(buildStatementItems(result, form, undefined, undefined, undefined).values()));
};
const cardText = (result: ReturnType<typeof run>) =>
  render(
    <RedevelopmentDetailCard detail={result.redevelopmentDetail!} subject="apt" settlementDirection="receive" />,
  ).container.textContent ?? "";

describe("입력 화면", () => {
  it("토글 설명·링크 — 집행기준 번호와 해석례를 적고 §166①2호를 근거로 들지 않는다", () => {
    const text =
      render(
        <ReceiveOnlyToggleCard asset={{ redevReceiveOnlyMode: "yes" } as AssetForm} onChange={() => {}} />,
      ).container.textContent ?? "";
    expect(text).toContain(
      `신축APT 양도 없이 청산금 수령분만 신고 — 종전 부동산의 분할양도로 계산 (${GUIDELINE} · ${RULING})`,
    );
    expect(text).toContain("시행령 §166④1호");
    expect(text).toContain(`${RULING} (청산금 과세)`);
    expect(text).not.toContain("§166①2호");
    expect(text).not.toContain("NTS 집행기준");
  });

  it("입주권 공제액 문구의 가목 인용은 유지한다", () => {
    const text =
      render(
        <SalePriceTotalPreviewCard
          asset={
            { redevSubject: "right", redevRightsValue: "500000000", redevSettlementAmount: "114000000" } as AssetForm
          }
        />,
      ).container.textContent ?? "";
    expect(text).toContain("§166①2호 가목 공제액");
  });
});

describe("상세명세서", () => {
  it("분기 라벨이 집행기준을 근거로 든다", () => {
    const labels = buildRedevPerAssetForGain(receiveOnly().redevelopmentDetail!, "apt", "receive").map((v) => v.label);
    expect(labels).toEqual([
      `① 인가전 분 (미신고) (청산금 수령분 단독 신고 — ${GUIDELINE})`,
      `② 인가후 기존건물분 (미신고) (청산금 수령분 단독 신고 — ${GUIDELINE})`,
      `③ 청산금 수령분 (단독 신고) (${GUIDELINE} · ${RULING} · 재산-439 · 서면2016-2705)`,
    ]);
  });

  it("단독 신고 — 가목·3분할 설명이 없고 합계 근거가 집행기준이다", () => {
    const text = statementText(receiveOnly());
    expect(text).not.toContain("가목");
    expect(text).not.toContain("§166①·②");
    expect(text).not.toContain("인가일 기산");
    expect(text).toContain("0 (청산금 수령분만 신고 대상)");
    expect(text).toContain(`청산금 수령액 = 114,000,000 (${GUIDELINE} — 양도가액)`);
    expect(text).toContain(`안분 취득가액 = 200,000,000 × (114,000,000 ÷ 500,000,000) = 45,600,000 (${GUIDELINE}`);
    expect(text).toContain(`양도가액 = 청산금 수령액 (종전 부동산의 분할양도 — ${RULING})`);
    expect(text).toContain(`취득가액 = 종전 취득가액을 평가액 대비 청산금 수령액 비율로 안분 (${GUIDELINE})`);
    expect(text).toContain("청산금 수령분 양도차익 − 장기보유특별공제 (음수 시 0)");
    expect(text).not.toContain("§166 분할별");
    expect(text).toContain(`양도차익 = 청산금 수령액 − 안분 취득가액 − 안분 필요경비 (${GUIDELINE})`);
    expect(text).toContain("청산금 수령분 — 취득일부터 청산금분 양도일까지");
  });

  it("근거 칸은 조문 모달로 열리므로 집행기준·해석례를 넣지 않는다", () => {
    const form = {
      transferDate: "2024-01-26",
      filingDate: "2024-03-31",
      contractTotalPrice: "525000000",
      assets: [{ ...makeDefaultAsset(1), acquisitionDate: "2002-04-09" }],
    } as unknown as TransferFormData;
    const items = buildStatementItems(receiveOnly(), form, undefined, undefined, undefined);
    expect(items.get("transferPrice")?.legalBasis).toBe("소득세법 §88 1호");
    expect(items.get("acquisitionPrice")?.legalBasis).toBe("소득세법 시행령 §166 ④");
    expect(items.get("transferGain")?.legalBasis).toBe("소득세법 §88 1호");
    expect(items.get("ltDeduction")?.legalBasis).toBe("소득세법 §95 ④");
    for (const item of items.values()) {
      expect(item.legalBasis ?? "").not.toMatch(/집행기준|법규재산|재산-439/);
    }
  });

  it("동시신고의 §166 인용은 유지한다", () => {
    const text = statementText(simultaneous());
    expect(text).toContain("§166①2호 가목");
    expect(text).not.toContain(GUIDELINE);
  });
});

describe("입주권 경로", () => {
  it("플래그가 남은 입주권 양도는 단독 신고 문구를 쓰지 않는다 (엔진이 플래그를 그대로 돌려준다)", () => {
    const items = new Map<string, StatementItem>([["transferPrice", { label: "양도가액", value: 0 } as StatementItem]]);
    applyRedevelopmentOverrides(items, receiveOnly().redevelopmentDetail!, 500_000_000, "right", "receive");
    expect(items.get("transferPrice")?.legalBasis).toBe("소득세법 시행령 §166①2호 가목·나목 · §166④");
  });
});

describe("§97②2호 단서 비교 표시", () => {
  const PROVISO = "소득세법 §97 ② 2호 단서";
  const estimated = (postApprovalExpenses: number) =>
    calculateTransferTax(
      baseTransferInput({
        propertyType: "redevelopment_apt",
        transferPrice: 114_000_000,
        transferDate: new Date("2024-01-26"),
        acquisitionDate: new Date("2002-04-09"),
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: true,
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
        redevelopment: {
          subject: "apt",
          approvalLawBasis: "urban_renovation_art_74",
          approvalDate: new Date("2009-10-23"),
          rightsValue: 500_000_000,
          settlementDirection: "receive",
          settlementAmount: 114_000_000,
          settlementSaleDate: new Date("2024-01-26"),
          preApprovalExpenses: 0,
          postApprovalExpenses,
          originalAssetType: "housing",
          exemptionEligibleAtApproval: false,
          receiveOnlyMode: true,
          acquisitionHousingPrice: 100_000_000,
          managementDisposalHousingPrice: 500_000_000,
        } as RedevelopmentInfo,
      }),
      rates,
    );

  it("단서 적용 — 카드·명세서가 비교 금액과 미차감을 밝힌다", () => {
    const result = estimated(200_000_000);
    expect(cardText(result)).toContain(
      `${PROVISO} 적용 — 환산취득가액 + 개산공제 103,000,000 < 자본적지출·양도비 등 200,000,000이므로 환산취득가액을 차감하지 않고`,
    );
    const text = statementText(result);
    expect(text).toContain(`취득가액 = 0 — 환산취득가액을 차감하지 않음 (${PROVISO})`);
    expect(text).toContain(`환산취득가액 차감 안 함 (${PROVISO}`);
    expect(text).toContain("자본적지출·양도비 등 200,000,000을 권리가액 대비 청산금 비율로 안분 = 45,600,000");
  });

  it("본문 — 비교 결과만 밝히고 안분 취득가액 산식은 그대로다", () => {
    const result = estimated(50_000_000);
    expect(cardText(result)).toContain(`환산취득가액 + 개산공제 103,000,000 ≥ 자본적지출·양도비 등 50,000,000이므로 ${PROVISO}를 적용하지 않습니다.`);
    const text = statementText(result);
    expect(text).toContain(`취득가액 = 종전 취득가액을 평가액 대비 청산금 수령액 비율로 안분 (${GUIDELINE})`);
    expect(text).not.toContain("차감하지 않음");
  });

  it("실가 — 비교 안내가 없다", () => {
    expect(cardText(receiveOnly())).not.toContain(PROVISO);
  });
});

describe("결과 카드", () => {
  it("단독 신고 — §166②2호 수령 구조로 설명하지 않는다", () => {
    const text = cardText(receiveOnly());
    expect(text).not.toContain("§166②2호");
    expect(text).not.toContain("가목");
    expect(text).not.toContain("나목");
    expect(text).toContain(`청산금 수령분 단독 신고 — 종전 부동산의 분할양도로, 양도차익은 청산금 수령액 − 안분 취득가액 − 안분 필요경비입니다 (${GUIDELINE} · ${RULING}).`);
    expect(text).toContain("시행령 §166④1호");
    // 인가전·인가후 칸은 그리지 않는다(사용자 결정 2026-11-12 a — `redev-receive-only-result-card.anchor.test.tsx`).
    expect(text).not.toContain("미신고");
    expect(text).toContain("청산금 수령분 단독 신고 양도차익");
  });

  it("동시신고 카드는 §166②2호 구조를 유지한다", () => {
    const text = cardText(simultaneous());
    expect(text).toContain("시행령 §166②2호 (제1항제2호) 수령 구조");
    expect(text).toContain("§166②2호 · §166①2호 가목");
    expect(text).not.toContain(GUIDELINE);
  });
});

describe("세액 불변", () => {
  it("단독 신고 시료의 양도차익·세액은 그대로다", () => {
    const r = receiveOnly();
    expect(r.redevelopmentDetail?.settlement.apportionedTransfer).toBe(114_000_000);
    expect(r.redevelopmentDetail?.settlement.apportionedAcquisition).toBe(45_600_000);
    expect(r.redevelopmentDetail?.settlement.gain).toBe(68_400_000);
  });
});
