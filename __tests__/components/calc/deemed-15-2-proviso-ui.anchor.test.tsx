/**
 * @vitest-environment jsdom
 *
 * 간주취득 §15② 단서 — **입력 경로** anchor [AT-D15-UI]
 *
 * ## 종전에는 이 칸이 화면에 없었다 (변경 전 red)
 *
 * `Step1.tsx:51`이 간주취득에서 **조기 반환**해 사치성 토글(그 아래)에 닿지 못했고,
 * 법인 중과는 Step 4인데 간주취득은 `computeNextStep`이 `Step0 → Step1 → API 호출`로
 * **2단계에서 끝난다**(사이드바도 2칸만 그린다). 그래서:
 *
 *   · **켤 수 없다** — 골프장 보유 법인의 과점주주가 §15② 단서 10%가 아니라 2%로 계산됐다.
 *   · **끌 수 없다** — 매매 단계에서 켠 `isLuxuryProperty`가 ④로 그대로 실려 갔는데
 *     (`acquisition-tax-api.ts`는 게이트 없이 전송한다) 되돌릴 토글이 화면에 없었다.
 *
 * ⇒ 엔진·④·⑫는 이미 준비돼 있었고 **⑤만 비어 있었다**.
 *   계획서: `docs/00-pm/acquisition-deemed-15-2-proviso.plan.md`
 *
 * ## 이 파일이 지키는 것
 * §1 3유형 **모두**에 §15② 단서 입력 칸이 **렌더된다** (개수 포함 — §15②1호로 같은 단서)
 * §2 과점주주 물건별 구분 모드가 렌더되고, 켜면 행 편집기가 나온다
 * §3 역방향 — 비과세 케이스(상장·설립)에서는 판정 칸이 잠긴다
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { DeemedLandCategorySection } from "@/components/calc/acquisition/deemed/DeemedLandCategorySection";
import { DeemedRenovationSection } from "@/components/calc/acquisition/deemed/DeemedRenovationSection";
import { DeemedMajorShareholderSection } from "@/components/calc/acquisition/deemed/DeemedMajorShareholderSection";
import { INITIAL_FORM, type FormState } from "@/components/calc/acquisition/shared";

afterEach(cleanup);

function form(patch: Partial<FormState> = {}): FormState {
  return { ...INITIAL_FORM, ...patch };
}

/** §13⑤ 사치성 토글의 제목 — 「사치성 재산(§13⑤)에 해당 — 세율 10%」 */
const PROVISO_TITLE = /사치성 재산\(§13⑤\)에 해당/;

describe("[AT-D15-UI] §1 §15② 단서 입력 칸이 3유형 모두에 렌더된다", () => {
  it("[AT-D15-UI-01] 지목변경(§15②2호)", () => {
    render(<DeemedLandCategorySection form={form()} set={vi.fn()} />);
    expect(screen.getByText(PROVISO_TITLE)).toBeTruthy();
  });

  it("[AT-D15-UI-02] 개수(§15②1호) — 같은 단서를 받는다", () => {
    render(<DeemedRenovationSection form={form()} set={vi.fn()} />);
    expect(screen.getByText(PROVISO_TITLE)).toBeTruthy();
  });

  it("[AT-D15-UI-03] 과점주주(§15②3호)", () => {
    render(<DeemedMajorShareholderSection form={form()} set={vi.fn()} />);
    expect(screen.getByText(PROVISO_TITLE)).toBeTruthy();
  });

  it("[AT-D15-UI-04] 토글을 끄면 사치성 유형도 함께 지운다 (stale luxuryType 방지)", () => {
    const set = vi.fn();
    render(
      <DeemedLandCategorySection
        form={form({ isLuxuryProperty: true, luxuryType: "golf_course" })}
        set={set}
      />,
    );
    // ToggleCard는 shadcn <Switch>(role="switch")를 쓴다 — 카드 안 아무 button이 아니다
    fireEvent.click(within(screen.getByTestId("deemed-proviso-toggle")).getByRole("switch"));
    expect(set).toHaveBeenCalledWith("isLuxuryProperty", false);
    expect(set).toHaveBeenCalledWith("luxuryType", "");
  });

  it("[AT-D15-UI-05] 세율 미리보기가 토글을 따라간다 — 2% ↔ 10%", () => {
    const base = { deemedLandPrevStandardValue: "500000000", deemedLandNewStandardValue: "1500000000" };
    const { container: plain } = render(<DeemedLandCategorySection form={form(base)} set={vi.fn()} />);
    expect(plain.textContent).toContain("× 2% = 20,000,000");
    cleanup();
    const { container: lux } = render(
      <DeemedLandCategorySection
        form={form({ ...base, isLuxuryProperty: true, luxuryType: "golf_course" })}
        set={vi.fn()}
      />,
    );
    expect(lux.textContent).toContain("× 10% = 100,000,000");
  });

  it("[AT-D15-UI-06] 고급선박은 토지·건축물 유형에서 감춘다 (과점주주에만 노출)", () => {
    /**
     * ⚠️ `screen.queryByText(/고급선박/)`로는 못 잰다 — 토글 **설명문**이
     *    「골프장·고급주택·고급오락장·고급선박」을 인용하고 있어 항상 걸린다
     *    (`feedback_hint_quoting_toggle_title_breaks_selector`). 선택지 그룹 안으로 좁힌다.
     */
    render(<DeemedLandCategorySection form={form({ isLuxuryProperty: true })} set={vi.fn()} />);
    expect(
      within(screen.getByTestId("deemed-proviso-type")).queryByText(/고급선박/),
    ).toBeNull();
    cleanup();
    render(<DeemedMajorShareholderSection form={form({ isLuxuryProperty: true })} set={vi.fn()} />);
    expect(
      within(screen.getByTestId("deemed-proviso-type")).getByText(/고급선박/),
    ).toBeTruthy();
  });
});

describe("[AT-D15-UI] §2 과점주주 물건별 구분", () => {
  it("[AT-D15-UI-10] 구분 모드 토글이 렌더된다", () => {
    render(<DeemedMajorShareholderSection form={form()} set={vi.fn()} />);
    expect(screen.getByText(/물건별로 구분해 입력/)).toBeTruthy();
  });

  it("[AT-D15-UI-11] 켜면 단일 사치성 토글을 끄고 첫 행을 시딩한다 (이중 적용 방지)", () => {
    const set = vi.fn();
    render(<DeemedMajorShareholderSection form={form()} set={set} />);
    fireEvent.click(within(screen.getByTestId("deemed-bucket-mode")).getByRole("switch"));
    expect(set).toHaveBeenCalledWith("deemedMajorUseBuckets", true);
    expect(set).toHaveBeenCalledWith("isLuxuryProperty", false);
    const seeded = set.mock.calls.find((c) => c[0] === "deemedMajorAssetBuckets");
    expect(seeded?.[1]).toHaveLength(1);
  });

  it("[AT-D15-UI-12] 구분 모드에서는 단일 장부가액 칸과 사치성 토글이 사라진다", () => {
    render(
      <DeemedMajorShareholderSection
        form={form({
          deemedMajorUseBuckets: true,
          deemedMajorAssetBuckets: [
            { id: "a", label: "", bookValue: "3000000000", proviso: "luxury", luxuryType: "golf_course" },
          ],
        })}
        set={vi.fn()}
      />,
    );
    expect(screen.queryByText(/법인 보유 부동산등 장부상 총가액/)).toBeNull();
    expect(screen.queryByText(PROVISO_TITLE)).toBeNull();
    expect(screen.getByTestId("deemed-bucket-rows")).toBeTruthy();
  });

  it("[AT-D15-UI-13] 행 미리보기가 엔진과 같은 순서로 계산한다 — floor(장부 × 지분) × 세율", () => {
    const { container } = render(
      <DeemedMajorShareholderSection
        form={form({
          deemedMajorPrevShareRatio: "0",
          deemedMajorNewShareRatio: "100",
          deemedMajorUseBuckets: true,
          deemedMajorAssetBuckets: [
            { id: "a", label: "골프장", bookValue: "3000000000", proviso: "luxury", luxuryType: "golf_course" },
            { id: "b", label: "일반토지", bookValue: "7000000000", proviso: "none", luxuryType: "" },
          ],
        })}
        set={vi.fn()}
      />,
    );
    // 엔진 anchor AT-D15-10 과 같은 수: 3억 + 1.4억 = 4억 4,000만
    expect(container.textContent).toContain("440,000,000");
  });

  it("[AT-D15-UI-14] 금액 칸이 비어도 지분율 판정은 돈다 — 최초 과점주주 100%", () => {
    const { container } = render(
      <DeemedMajorShareholderSection
        form={form({
          deemedMajorPrevShareRatio: "0",
          deemedMajorNewShareRatio: "100",
          deemedMajorUseBuckets: true,
          deemedMajorAssetBuckets: [
            { id: "a", label: "", bookValue: "1000000000", proviso: "none", luxuryType: "" },
          ],
        })}
        set={vi.fn()}
      />,
    );
    expect(container.textContent).toContain("× 100.00%");
  });
});

describe("[AT-D15-UI] §3 역방향 가드", () => {
  it("[AT-D15-UI-20] 상장법인(비과세)이면 단서 판정 칸이 잠긴다", () => {
    render(<DeemedMajorShareholderSection form={form({ deemedMajorIsListed: true })} set={vi.fn()} />);
    const card = screen.getByTestId("deemed-proviso-toggle");
    expect(card.getAttribute("data-disabled")).toBe("true");
    // 구분 모드 토글 자체가 렌더되지 않는다
    expect(screen.queryByText(/물건별로 구분해 입력/)).toBeNull();
  });

  it("[AT-D15-UI-21] 사치성 OFF에서는 유형 선택지가 펼쳐지지 않는다", () => {
    // 설명문이 유형명을 인용하므로 텍스트가 아니라 **선택지 그룹의 존재**로 잰다
    render(<DeemedRenovationSection form={form()} set={vi.fn()} />);
    expect(screen.queryByTestId("deemed-proviso-type")).toBeNull();
    cleanup();
    render(<DeemedRenovationSection form={form({ isLuxuryProperty: true })} set={vi.fn()} />);
    expect(screen.getByTestId("deemed-proviso-type")).toBeTruthy();
  });
});
