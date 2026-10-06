/**
 * anchor: B0 ⑥⑦ — 결과 카드는 엔진 echo를 그대로 읽는다 (재도출 없음) → 신규 입력이 표시에 자동 추종.
 *
 * 개산공제 괄호 「(취득시 건물분 기준시가 X × 3%)」의 X가 건물분 기준시가 echo다(S3-2: 개별주택가격을 가목:나목 비례로 나눈 건물분 — 종전 `H − 가목`).
 * 같은 입력에서 신규 값(L2)만 바꾸면 X가 따라 바뀌고, 토지 괄호의 취득시 토지 기준시가는 불변이어야 한다.
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

function run(l2: number) {
  const base = mixedUseCase14();
  return calcMixedUseTransferTax(
    3_000_000_000,
    new Date("2026-06-01"),
    {
      ...base,
      isOneHouseExempt: false,
      acquisitionStandardPrice: {
        ...base.acquisitionStandardPrice,
        housingPrice: 400_000_000,
        landPricePerSqmAtBuildingAcq: l2,
      },
    },
    makeMockRatesWithHouseEngine(),
  );
}

describe("B0 ⑦ 결과 카드 — 엔진 echo 추종", () => {
  const a = run(2_000_000);
  const b = run(3_000_000);
  const textA = render(<MixedUseResultCard breakdown={a} />).container.textContent ?? "";
  cleanup();
  const textB = render(<MixedUseResultCard breakdown={b} />).container.textContent ?? "";

  it("건물분 개산공제 괄호가 엔진의 건물분 기준시가 echo와 일치한다", () => {
    const sa = a.housingPart.buildingStdPriceAtAcq!.toLocaleString();
    const sb = b.housingPart.buildingStdPriceAtAcq!.toLocaleString();
    expect(sa).not.toBe(sb);
    expect(textA).toContain(`취득시 건물분 기준시가 ${sa} × 3%`);
    expect(textB).toContain(`취득시 건물분 기준시가 ${sb} × 3%`);
  });

  it("토지분 괄호의 취득시 토지 기준시가는 신규 값과 무관(토지일 값 기준)", () => {
    expect(a.housingPart.landStdPriceAtAcq).toBe(b.housingPart.landStdPriceAtAcq);
    expect(textA).toContain(`취득시 토지분 기준시가 ${a.housingPart.landStdPriceAtAcq!.toLocaleString()} × 3%`);
  });
});
