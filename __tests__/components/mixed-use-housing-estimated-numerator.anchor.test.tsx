/**
 * anchor: 겸용 「주택 환산취득가액」 산식의 **분자에 값이 있다** (결과탭 코드리뷰 Lane 3 — #077).
 *
 * 종전에는 분수의 분자가 라벨뿐이었다:
 *   「주택 환산취득가액 0 · §97: 주택 양도가액 1,514,911,103 ×
 *     (취득시 개별주택공시가격) ÷ (양도시 개별주택공시가격 872,000,000)」
 *
 * 취득시 개별주택가격이 **미공시**(2005년 이전 취득 등)면 값이 0인데, 분자가 비어 있으니
 * 사용자는 0으로 잡힌 것인지 입력이 누락돼 계산이 실패한 것인지 구별할 수 없었다.
 * 바로 아래 상가분은 `acqStandardTotal` echo로 분자 값을 보여주고 있어 비대칭이 더 두드러졌다.
 *
 * ⇒ 엔진이 **분자로 실제 쓴 값**을 echo하고(`acqHousingStandardPrice`) 카드가 그것을 그린다.
 *   0이면 「(미공시)」를 함께 적어 「0으로 계산됐다」는 사실 자체를 말한다.
 *
 * 법령: 소득세법 §97 · 시행령 §164 (환산취득가액)
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MixedUseResultCard } from "@/components/calc/results/mixed-use/MixedUseResultCard";
// S3-2 — 겸용 주택분이 가목:나목 비례라 나목(주택건물 기준시가)이 필수다. 나목이 없는 fixture에 항등 나목(N = H − 가목)을 채워 호출한다.
import { calcMixedUseTransferTaxIdN as calcMixedUseTransferTax } from "../tax-engine/_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { mixedUseCase14 } from "../tax-engine/_helpers/mixed-use-fixture";

afterEach(cleanup);

const D = (s: string) => new Date(s);

/**
 * 취득시 개별주택가격 미공시 — **구 저장 이력(S3-2 이전 resultData)** 형태.
 *
 * S3-2 이후 비-PHD 겸용 주택분은 취득시 개별주택가격(H)이 없으면 엔진이 throw하고(상속·증여 신고가액 취득만 예외 —
 * 그때는 환산이 아니라 §163⑨ 의제 경로다) ⑫·⑧도 막는다. 그래서 「H = 0인 §97 환산 결과」는 새로 만들 수 없고
 * 저장 이력으로만 남는다. 이 카드가 그 결과를 여전히 「(미공시)」로 읽어 내는지를 보려고, 공시 결과에서 분자·환산취득가와
 * 분할 echo를 0/없음으로 되돌린 **저장 형태**를 만든다(카드는 resultData만 읽는다).
 */
function undisclosed() {
  const b = JSON.parse(JSON.stringify(disclosed())) as ReturnType<typeof disclosed>;
  b.housingPart.acqHousingStandardPrice = 0;
  b.housingPart.estimatedAcquisitionPrice = 0;
  delete b.housingPart.housingStdSplit;
  return b;
}

/** 취득시 개별주택가격 공시 — 같은 분기에서 분자가 실제 값을 가진다. */
const DISCLOSED_HOUSING_PRICE = 240_000_000;
function disclosed() {
  const base = mixedUseCase14();
  return calcMixedUseTransferTax(
    3_000_000_000,
    D("2026-06-01"),
    {
      ...base,
      isOneHouseExempt: false,
      acquisitionStandardPrice: {
        ...base.acquisitionStandardPrice,
        housingPrice: DISCLOSED_HOUSING_PRICE,
        // B0 — 토지·건물 취득일(1992/1997)이 달라 건물 취득일 기준 공시지가가 필수. L2=L1로 채워 기대값 불변.
        landPricePerSqmAtBuildingAcq: base.acquisitionStandardPrice.landPricePerSqm,
      },
    },
    makeMockRatesWithHouseEngine(),
  );
}

// ── N-0 구별력 ──────────────────────────────────────────────────────
describe("N-0 격자 — 두 케이스가 §97 직접 환산 분기를 탄다", () => {
  it("PHD 역산 분기가 아니다 (그 분기는 다른 산식을 그린다)", () => {
    expect(undisclosed().housingPart.phdEstimatedAcqHousingPrice).toBeFalsy();
    expect(disclosed().housingPart.phdEstimatedAcqHousingPrice).toBeFalsy();
  });

  it("미공시는 0, 공시는 입력값이 분자로 쓰인다", () => {
    expect(undisclosed().housingPart.acqHousingStandardPrice).toBe(0);
    expect(disclosed().housingPart.acqHousingStandardPrice).toBe(DISCLOSED_HOUSING_PRICE);
    // 분자가 실제로 세액 축을 움직인다 — echo가 사문(死文)이 아니라는 확인.
    expect(undisclosed().housingPart.estimatedAcquisitionPrice).toBe(0);
    expect(disclosed().housingPart.estimatedAcquisitionPrice).toBeGreaterThan(0);
  });
});

// ── N-1 분자가 화면에 값으로 나온다 ─────────────────────────────────
describe("N-1 「주택 환산취득가액」 분수의 분자", () => {
  it("공시 — 분자에 실제 금액이 그려진다", () => {
    const { container } = render(<MixedUseResultCard breakdown={disclosed()} />);
    const text = container.textContent ?? "";
    expect(text).toContain(`취득시 개별주택공시가격 ${DISCLOSED_HOUSING_PRICE.toLocaleString()}`);
  });

  it("미공시 — 0과 그 사유를 함께 적는다", () => {
    const { container } = render(<MixedUseResultCard breakdown={undisclosed()} />);
    const text = container.textContent ?? "";
    expect(text).toContain("취득시 개별주택공시가격 0 (미공시)");
  });

  it("🔴 분자가 라벨만 남는 형태로 되돌아가지 않는다", () => {
    for (const b of [disclosed(), undisclosed()]) {
      const { container } = render(<MixedUseResultCard breakdown={b} />);
      const text = container.textContent ?? "";
      // 「취득시 개별주택공시가격」 뒤에는 반드시 숫자가 온다.
      expect(text).toMatch(/취득시 개별주택공시가격\s[\d,]/);
      cleanup();
    }
  });
});

// ── N-2 산식이 값을 만든다 ──────────────────────────────────────────
describe("N-2 분수가 표시된 환산취득가액을 재현한다", () => {
  it("주택 양도가액 × (분자 ÷ 분모) = 주택 환산취득가액", () => {
    const b = disclosed();
    const h = b.housingPart;
    const a = b.apportionment;
    expect(
      Math.floor((a.housingTransferPrice * (h.acqHousingStandardPrice ?? 0)) / a.housingStandardPrice),
    ).toBe(h.estimatedAcquisitionPrice);
  });
});
