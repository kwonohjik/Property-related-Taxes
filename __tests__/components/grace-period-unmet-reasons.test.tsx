/**
 * @vitest-environment jsdom
 *
 * 중과 경과조치(소령 §167의3①12의2 나·다목) 미리보기 — 미충족 사유 목록.
 * 계획서 `docs/01-plan/features/surcharge-grace-period-unmet-reason.plan.md` §3.2 · §4 (G-2·G-4·G-12 · G-1 대조).
 * 헤드라인 「미충족 — 현재 입력 기준 경과조치 배제 미해당」은 그대로 두고 그 아래에 사유를 나열한다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { GracePeriodSection } from "@/app/calc/transfer-tax/steps/step4-sections/GracePeriodSection";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(cleanup);

type Form = ReturnType<typeof createDefaultTransferFormData>;
type GP = NonNullable<Form["gracePeriod"]>;
const SEONGNAM = "4113110100";
const UNMET = "미충족 — 현재 입력 기준 경과조치 배제 미해당";

function renderWith(gp: Partial<GP>) {
  const f = createDefaultTransferFormData();
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: "2020-05-11", regionCode: SEONGNAM };
  const form = Object.assign(f, {
    transferDate: "2026-09-18",
    gracePeriod: {
      contractDate: "2026-04-25",
      isLandPermitTarget: true,
      permitApplicationDate: "2026-04-17",
      permitGranted: true,
      depositReceiptConfirmed: true,
      ...gp,
    },
  }) as Form;
  render(<GracePeriodSection form={form} onChange={() => {}} />);
  const list = screen.queryByTestId("grace-period-unmet-reasons");
  return { items: list ? Array.from(list.querySelectorAll("li")).map((li) => li.textContent) : null };
}

describe("경과조치 미리보기 — 미충족 사유", () => {
  it("G-2 ★ 허가 수령 미확인 — 헤드라인 유지 + 「나목2)」 사유 1건 + 계산된 기한 노출", () => {
    const { items } = renderWith({ permitGranted: false });
    expect(screen.getByText(UNMET)).toBeTruthy();
    expect(items).toEqual(["나목2) 「토지거래허가 수령」이 확인되지 않았습니다"]);
    expect(screen.getByText(/계산된 양도 기한: 2026-10-26까지/)).toBeTruthy();
  });

  it("G-4 허가·계약금 둘 다 — 두 사유를 모두 나열", () => {
    const { items } = renderWith({ permitGranted: false, depositReceiptConfirmed: false });
    expect(items).toEqual([
      "나목2) 「토지거래허가 수령」이 확인되지 않았습니다",
      "나목3)·다목1) 「계약금 수령 증빙 확인」이 꺼져 있습니다",
    ]);
  });

  it("G-12 다목 계약 2026-05-20 — 「다목1)」 사유", () => {
    const { items } = renderWith({ isLandPermitTarget: false, permitApplicationDate: undefined, permitGranted: false, contractDate: "2026-05-20" });
    expect(items).toEqual(["다목1) 매매계약일이 2026-05-09 뒤입니다"]);
  });

  it("G-7 기한 초과 — 기한 날짜를 문구에 넣는다", () => {
    const { items } = renderWith({ contractDate: "2026-02-01" });
    expect(items).toEqual(["양도일이 양도 기한(2026-08-03) 뒤입니다"]);
  });

  it("G-1 대조 — 전부 충족이면 목록이 없다", () => {
    const { items } = renderWith({});
    expect(items).toBeNull();
    expect(screen.getByText("충족 — 중과 경과조치 배제 대상")).toBeTruthy();
  });
});
