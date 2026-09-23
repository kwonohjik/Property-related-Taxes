/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — ② 양도 대상 화면의 **소재지 입력 ↔ 조정대상지역 자동 판정**.
 * 계획서: `docs/00-pm/one-house-judgment-step-reorder.plan.md` §4 D-6.
 *
 * ## 왜 이 축에 anchor가 필요한가
 *
 * 엔진은 `regionCode`가 있으면 **사용자 토글을 무시한다**
 * (`transfer-tax-exemption-requirements.ts:382-390` `resolveWasRegulatedAtAcquisition`).
 * 그래서 화면이 주소가 있을 때도 토글을 그대로 띄우면 사용자가 켠 값이 **조용히 버려진다**
 * (`feedback_ui_engine_dual_truth_avoidance`). ⑤가 엔진과 같은 판단을 보여 주는지를 고정한다.
 *
 * 🔑 전송(④)과 엔진 도달은 `judgment-region-code-transport.anchor.test.ts`가 본다.
 *    여기는 **화면이 그 값을 만들어 내고, 만든 값에 맞게 스스로를 바꾸는가**만 본다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { Step3 } from "@/app/calc/one-house-exemption/steps/Step3";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { isRegulatedByBjdCode } from "@/lib/tax-engine/data/regulated-areas";

/** 서울 강남구 역삼동. 취득일(2019-06-01) 현재 조정대상지역이다 — AN-3a가 데이터로 확인한다. */
const SEOUL_GANGNAM = "1168010100";
/** 주소 검색 결과로 돌아오는 PNU(19자리). 화면은 **앞 10자리**만 잘라 쓴다. */
const PNU_19 = `${SEOUL_GANGNAM}${"1".repeat(9)}`;
const ACQ = "2019-06-01";

/**
 * `AddressSearch`를 **onChange를 쏘는 버튼**으로 대체한다.
 *
 * 🔴 라이브러리를 `() => null`로 죽이면 「Step3가 그 결과를 받아 `regionCode`를 세운다」를
 *    증명하지 못한다(`feedback_library_anchor_does_not_prove_component_uses_it`).
 *    실제 위젯이 주는 모양(`pnu` 포함)을 그대로 흘려보내 **호출부 배선**을 본다.
 */
vi.mock("@/components/ui/address-search", () => ({
  AddressSearch: ({ onChange }: { onChange: (v: Record<string, unknown>) => void }) => (
    <button
      type="button"
      data-testid="mock-address-pick"
      onClick={() =>
        onChange({
          road: "서울 강남구 테헤란로 1",
          jibun: "서울 강남구 역삼동 1-1",
          building: "",
          detail: "",
          lng: "",
          lat: "",
          pnu: PNU_19,
        })
      }
    >
      주소 선택
    </button>
  ),
}));

afterEach(cleanup);

function form(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2026-06-01",
    contractTotalPrice: "1000000000",
    assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: ACQ }],
    ...over,
  } as OneHouseJudgmentFormData;
}

/** `assets[0]`에 patch를 적용한 다음 폼을 만든다 — 화면이 상위에 돌려주는 모양 그대로. */
function applyAssetPatch(
  f: OneHouseJudgmentFormData,
  patch: Partial<OneHouseJudgmentFormData>,
): OneHouseJudgmentFormData {
  return { ...f, ...patch } as OneHouseJudgmentFormData;
}

describe("SAR — ② 소재지 입력이 regionCode를 세운다", () => {
  it("[SAR-1] 주소를 고르면 PNU 앞 10자리가 `assets[0].regionCode`로 들어간다", () => {
    const patches: Partial<OneHouseJudgmentFormData>[] = [];
    render(<Step3 form={form()} onChange={(p) => patches.push(p)} />);

    fireEvent.click(screen.getByTestId("mock-address-pick"));

    const asset = (patches.at(-1)?.assets ?? [])[0] as unknown as Record<string, unknown>;
    expect(asset.regionCode).toBe(SEOUL_GANGNAM);
    // ⑫ `propertySchema`가 `z.string().length(10)`을 요구한다 — 19자리를 그대로 보내면 400이다.
    expect(String(asset.regionCode)).toHaveLength(10);
    // 표시용 주소도 함께 들어간다(다시 열었을 때 검색창이 비어 보이지 않도록).
    expect(asset.addressJibun).toBe("서울 강남구 역삼동 1-1");
  });
});

describe("SAR — 2-C는 엔진과 같은 판단을 보여 준다", () => {
  it("[SAR-2] 주소가 없으면 토글이 판정 근거다 (fallback 경로)", () => {
    render(<Step3 form={form()} onChange={() => {}} />);
    expect(screen.queryByTestId("one-house-was-regulated")).toBeTruthy();
    expect(screen.queryByTestId("one-house-regulated-auto")).toBeNull();
  });

  /**
   * 🔴 **핵심.** `regionCode`가 있으면 엔진이 토글을 무시하므로, 화면도 토글을 내리고
   *    자동 판정을 보여 줘야 한다. 토글이 남아 있으면 사용자가 켠 값이 조용히 버려진다.
   */
  it("[SAR-3] 주소가 있으면 토글이 사라지고 자동 판정이 읽기 전용으로 뜬다", () => {
    render(<Step3 form={form({ assets: [{ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: ACQ, regionCode: SEOUL_GANGNAM }] } as Partial<OneHouseJudgmentFormData>)} onChange={() => {}} />);

    expect(screen.queryByTestId("one-house-was-regulated")).toBeNull();
    const auto = screen.queryByTestId("one-house-regulated-auto");
    expect(auto).toBeTruthy();
    expect(auto!.textContent).toContain("취득 당시 조정대상지역 해당");
  });

  /**
   * 음성 짝 — 「항상 해당이라고 쓴다」가 아님을 본다. 지정 이력 **밖의 취득일**을 주면
   * 같은 주소가 「미해당」으로 뒤집혀야 한다(구별력 확보).
   */
  it("[SAR-4] 음성 짝 — 지정 전 취득일이면 같은 주소가 「미해당」이다", () => {
    const EARLY = "2010-01-01";
    // 전제: 엔진 데이터가 실제로 갈린다(이것이 깨지면 시료를 다시 골라야 한다).
    expect(isRegulatedByBjdCode(SEOUL_GANGNAM, ACQ).isRegulated).toBe(true);
    expect(isRegulatedByBjdCode(SEOUL_GANGNAM, EARLY).isRegulated).toBe(false);

    render(
      <Step3
        form={applyAssetPatch(form(), {
          assets: [
            { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: EARLY, regionCode: SEOUL_GANGNAM },
          ],
        } as Partial<OneHouseJudgmentFormData>)}
        onChange={() => {}}
      />,
    );

    expect(screen.queryByTestId("one-house-regulated-auto")!.textContent).toContain(
      "취득 당시 조정대상지역 미해당",
    );
  });

  /**
   * 🔑 취득일이 없으면 판정 기준일이 없다 — 자동 판정을 띄우지 않고 토글로 남는다.
   *    (엔진도 `regionCode`만으로는 판정하지 않는다 — `resolveResidenceJudgmentDate`가 취득일을 쓴다.)
   */
  it("[SAR-5] 주소만 있고 취득일이 없으면 토글이 남는다", () => {
    render(
      <Step3
        form={applyAssetPatch(form(), {
          assets: [
            { ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "", regionCode: SEOUL_GANGNAM },
          ],
        } as Partial<OneHouseJudgmentFormData>)}
        onChange={() => {}}
      />,
    );
    expect(screen.queryByTestId("one-house-was-regulated")).toBeTruthy();
    expect(screen.queryByTestId("one-house-regulated-auto")).toBeNull();
  });
});
