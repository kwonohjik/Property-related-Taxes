/**
 * @vitest-environment jsdom
 *
 * Pre-Do anchor — **`severity: "warning"`을 화면에 띄우는 경로가 없다**를 현행에서 고정한다.
 * 계획서: `docs/00-pm/validation-warnings-display.plan.md` §5.
 *
 * ## 이 파일은 Pre-Do anchor였고, 수정 후 **반전됐다**
 *
 * 착수 **전**에 AW-1·2를 「경고가 DOM에 **없다**」로 현행에서 통과시켜 진단을 확정했다.
 * 그러지 않았다면 「고쳤다」가 「원래 그랬다」와 구별되지 않는다
 * (`feedback_pre_anchor_verification`). 지금은 그 반대를 고정한다 —
 * **`<ValidationWarnings>` 배선이 빠지면 다시 red가 된다**. 그것이 이 파일의 존재 이유다.
 *
 * ## 🔑 긍정 짝이 부재 단언을 지탱한다
 *
 * AW-1·2·4는 **「없다」** 단언이다. 그것만 두면 폼을 잘못 세워 **경고 자체가 만들어지지 않은**
 * 경우에도 초록이 된다(`feedback_negative_anchor_needs_positive_twin`). ⇒ AW-3이 같은 폼으로
 * validate를 직접 불러 **배열에는 있다**를 못 박는다. 두 단언을 합쳐야
 * 「만들어지지만 화면에 도달하지 않는다」 = **표시 갭**이 증명된다.
 *
 * AW-1·2는 반전됐다. AW-3(긍정 짝)은 불변이다 — 표시가 붙어도 **데이터 계층은 그대로**여야
 * 한다. 만약 누군가 「경고를 안 보이게」 하려고 `warn()` 호출을 지우면 AW-3이 잡는다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import OneHouseJudgmentCalculator from "@/app/calc/one-house-exemption/OneHouseJudgmentCalculator";
import { useOneHouseJudgmentStore } from "@/lib/stores/one-house-judgment-store";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import {
  validateStep1,
  validateStep2,
} from "@/lib/calc/one-house-exemption-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

/* 브라우저 전용 의존만 잘라낸다 — 검증·렌더 경로는 **진짜**를 쓴다. */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/storage/use-auto-save-calculation", () => ({
  useAutoSaveCalculation: () => ({ savedId: null }),
}));
vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));

afterEach(() => {
  cleanup();
  useOneHouseJudgmentStore.getState().reset();
});

/** ① 경고 2건이 동시에 성립하는 폼 — 1세대 비해당 + 합가일 2개. */
function formWithStep1Warnings(): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    isOneHousehold: false,
    marriageDate: "2024-03-01",
    parentalCareMergeDate: "2023-05-01",
  } as unknown as OneHouseJudgmentFormData;
}

/** ③ §155⑳ 이중입력 경고 — 임대주택을 특례로 선언하고 **명부에도** 넣은 상태. */
function formWithRentalDoubleEntry(): OneHouseJudgmentFormData {
  return {
    ...createInitialOneHouseJudgmentForm(),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "housing",
        acquisitionCause: "purchase",
        acquisitionDate: "2015-03-10",
        rentalHousingException: {
          applyException: true,
          rentalUnits: [{ id: "r1" }],
        },
      },
    ],
    transferDate: "2026-06-01",
    houses: [
      {
        id: "h1",
        region: "capital",
        acquisitionDate: "2020-01-01",
        officialPrice: "300000000",
        isInherited: false,
        isLongTermRental: false,
        isApartment: true,
        isOfficetel: false,
        isUnsoldHousing: false,
      },
    ],
  } as unknown as OneHouseJudgmentFormData;
}

function renderAtStep(step: number, formData: OneHouseJudgmentFormData) {
  useOneHouseJudgmentStore.setState({ currentStep: step, formData, result: null, error: null });
  render(<OneHouseJudgmentCalculator />);
}

/* ─────────────────────────────────────────────────────────────────────────
   AW-3 — 긍정 짝. **데이터 계층에는 경고가 있다.**
   ───────────────────────────────────────────────────────────────────────── */
describe("AW-3 (긍정 짝) — validate는 경고를 만들어 낸다", () => {
  it("① 1세대 비해당 + 합가일 2개 → warning 2건", () => {
    const warnings = validateStep1(formWithStep1Warnings()).filter(
      (e) => e.severity === "warning",
    );
    expect(warnings).toHaveLength(2);
    expect(warnings.map((w) => w.field).sort()).toEqual(["isOneHousehold", "marriageDate"]);
  });

  it("③ §155⑳ 이중입력 → warning 1건 (차단 오류가 아니다)", () => {
    const errors = validateStep2(formWithRentalDoubleEntry());
    expect(errors.some((e) => e.severity === "warning" && e.field === "houses")).toBe(true);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   AW-1 · AW-2 — 그런데 **화면에는 도달하지 않는다**.
   ───────────────────────────────────────────────────────────────────────── */
describe("AW-1 (반전) — ① 단계 경고가 DOM에 뜬다", () => {
  it("① 경고 2건이 한 카드 안에 함께 뜬다", () => {
    renderAtStep(0, formWithStep1Warnings());
    // 화면이 실제로 ① 단계를 그렸는지 먼저 못 박는다(빈 렌더를 통과로 읽지 않기 위해).
    expect(screen.getByTestId("one-house-household")).toBeTruthy();

    const card = screen.getByTestId("one-house-validation-warnings");
    expect(card.textContent).toMatch(/1세대1주택 비과세 판정 대상이 아닙니다/);
    expect(card.textContent).toMatch(/각각 별개 특례이므로 해당하는 쪽만 남기세요/);
    expect(card.querySelectorAll("li")).toHaveLength(2);
  });

  /**
   * 🔑 **음성 짝** — 경고가 없으면 카드 자체가 없다. 이것이 없으면 「항상 떠 있는 빈 카드」도
   *    위 단언을 통과한다(`feedback_negative_anchor_needs_positive_twin`의 역방향).
   */
  it("경고 조건이 없으면 카드가 렌더되지 않는다", () => {
    renderAtStep(0, createInitialOneHouseJudgmentForm());
    expect(screen.getByTestId("one-house-household")).toBeTruthy();
    expect(screen.queryByTestId("one-house-validation-warnings")).toBeNull();
  });
});

describe("AW-2 (반전) — ③ 단계 경고가 DOM에 뜬다", () => {
  it("§155⑳ 이중입력 경고가 뜬다", () => {
    renderAtStep(2, formWithRentalDoubleEntry());
    expect(screen.getByText("③ 보유 주택·권리")).toBeTruthy();
    expect(screen.getByTestId("one-house-validation-warnings").textContent).toMatch(
      /주택 수가 이중 계상됩니다/,
    );
  });

  /**
   * 🔴 **단계 귀속** — ③의 경고가 ②에서 뜨면 안 된다. 「전 단계 경고를 아무 화면에나
   *    쏟는」 구현으로 미끄러지는 것을 막는다.
   */
  it("같은 폼이라도 ② 화면에서는 그 경고가 뜨지 않는다", () => {
    renderAtStep(1, formWithRentalDoubleEntry());
    expect(screen.getByText("② 양도 대상 주택")).toBeTruthy();
    expect(screen.queryByText(/주택 수가 이중 계상됩니다/)).toBeNull();
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   AW-5 — 결과 화면은 **전 단계를 모은다**.
   사이드바로 단계를 건너뛴 사용자가 한 번도 못 보는 경로를 덮는다(계획서 D-3).
   ───────────────────────────────────────────────────────────────────────── */
describe("AW-5 — ④ 결과 화면이 전 단계 경고를 모은다", () => {
  /**
   * 🔑 ②·③의 **필수값을 채운 채로** ①의 경고만 남긴다.
   *
   * 2026-09-25 F-2 이후 `handleJudge`가 `validateAllSteps`로 막으므로, ②가 빈 폼은 **④에
   * 머무를 수 없다**(③으로 되돌려진다). 종전 픽스처는 그 상태를 전제해 red가 됐다 —
   * 결함이 아니라 **전제가 바뀐 것**이라 픽스처를 고쳤다.
   */
  function formAtResultWithStep1Warnings(): OneHouseJudgmentFormData {
    const f = formWithStep1Warnings();
    return {
      ...f,
      transferDate: "2026-06-01",
      contractTotalPrice: "900000000",
      assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2015-03-10" }],
    } as OneHouseJudgmentFormData;
  }

  it("①의 경고가 결과 화면에서도 보인다", () => {
    renderAtStep(3, formAtResultWithStep1Warnings());
    const card = screen.getByTestId("one-house-validation-warnings");
    expect(card.textContent).toMatch(/판정 시 전제된 주의사항/);
    expect(card.textContent).toMatch(/1세대1주택 비과세 판정 대상이 아닙니다/);
  });
});
