/**
 * P5-b-2 — 「판정 불러오기」 모달의 **행동**과 **이동 금지** 가드
 *
 * 계획서 §5.3 표 2행.
 *
 * ## 왜 정적 스캔을 섞는가
 *
 * 「이동하지 않는다」는 **부재(不在)의 주장**이라 렌더 테스트로 증명되지 않는다 — jsdom에는
 * router가 없어서 `router.push`를 넣어도 테스트가 **초록인 채로 넘어갈 수 있다**. 부재는
 * 소스를 직접 읽어 고정한다(`feedback_negative_assertion_needs_mutation_probe` 형제 축).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { OneHouseJudgmentLoadModal } from "@/components/calc/transfer/OneHouseJudgmentLoadModal";
import type { CalculationRecord } from "@/lib/storage/types";
import { stripComments } from "./_helpers/strip-comments";

const records = vi.hoisted(() => ({ value: [] as unknown[] }));
const applySpy = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("@/lib/storage/calculation-repository", () => ({
  calculationRepository: { list: vi.fn(async () => records.value) },
}));

vi.mock("@/lib/calc/one-house-judgment-handoff", () => ({
  applyOneHouseFactsToTransferForm: applySpy,
}));

function judgment(over: Partial<CalculationRecord> = {}): CalculationRecord {
  return {
    id: "ohh-1",
    userId: "u1",
    taxType: "one_house_exemption",
    title: "1세대1주택 판정 — 서울 강남구 대치동 316 (양도예정 2026-06-01)",
    inputData: { transferDate: "2026-06-01", assets: [{ id: "a1" }] },
    resultData: { judgment: { isExempt: true, isPartialExempt: false, pending: [] } },
    taxLawVersion: "2026-06-01",
    linkedCalculationId: null,
    clientId: null,
    inputHash: "h1",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-21T01:00:00.000Z",
    ...over,
  } as CalculationRecord;
}

beforeEach(() => {
  records.value = [judgment()];
  applySpy.mockClear();
});
afterEach(() => cleanup());

describe("P5-b-2 모달 — 행동", () => {
  it("[LM-1] 저장된 판정이 배지와 함께 뜬다", async () => {
    render(<OneHouseJudgmentLoadModal open onOpenChange={() => {}} />);
    await screen.findByTestId("load-judgment-ohh-1");
    expect(screen.getByText("비과세")).toBeTruthy();
    expect(screen.getByText(/대치동 316/)).toBeTruthy();
  });

  /**
   * 🔴 **id를 함께 넘기는 것이 staleness의 전부다.** 폼만 넘기면 출처는 뜨지만 원본을 짚을 수
   *    없어 **영원히 「확인 불가」**가 된다 — 기능이 살아 있는 채로 감지만 죽는 모양이다
   *    (P5-b-1 뮤테이션 M8과 같은 축).
   */
  it("[LM-2] 카드를 누르면 폼과 **판정 id**가 함께 적용된다", async () => {
    render(<OneHouseJudgmentLoadModal open onOpenChange={() => {}} />);
    fireEvent.click(await screen.findByTestId("load-judgment-ohh-1"));

    await waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    const [form, id] = applySpy.mock.calls[0] as unknown as [{ transferDate: string }, string];
    expect(id).toBe("ohh-1");
    expect(form.transferDate).toBe("2026-06-01");
  });

  /**
   * 🔑 **쓰기가 끝난 뒤에 닫힌다.** 먼저 닫으면 「모달이 사라졌다」가 「폼이 채워졌다」를
   *    뜻하지 않게 되어 E2E가 기댈 신호가 사라진다.
   */
  it("[LM-3] 적용이 끝난 뒤에 닫힌다", async () => {
    const order: string[] = [];
    applySpy.mockImplementationOnce(async () => {
      order.push("apply");
    });
    render(
      <OneHouseJudgmentLoadModal open onOpenChange={() => order.push("close")} />,
    );
    fireEvent.click(await screen.findByTestId("load-judgment-ohh-1"));
    await waitFor(() => expect(order).toEqual(["apply", "close"]));
  });

  it("[LM-4] 판정 이력이 없으면 판정 메뉴로 안내한다", async () => {
    records.value = [];
    render(<OneHouseJudgmentLoadModal open onOpenChange={() => {}} />);
    expect(await screen.findByText(/저장된 1세대1주택 판정이 없습니다/)).toBeTruthy();
  });

  /** 닫혀 있으면 조회하지 않는다 — 모든 계산기 진입에서 IndexedDB를 두드리지 않는다. */
  it("[LM-5] 닫혀 있으면 목록을 그리지 않는다", () => {
    render(<OneHouseJudgmentLoadModal open={false} onOpenChange={() => {}} />);
    expect(screen.queryByTestId("one-house-judgment-load-modal")).toBeNull();
  });
});

/**
 * 🔑 **주석을 지우고 읽는다.** 이 파일들의 주석은 「`updateFormData`를 여기서 부르면 안 된다」처럼
 *    금지를 설명하느라 금지어를 그대로 담고 있다. 원문을 세면 그 설명이 위반 증거로 잡혀
 *    가드가 빨개진다 — 실제로 LM-6~LM-8이 그렇게 한 번 빨개졌다.
 */
const read = (p: string) => stripComments(readFileSync(resolve(process.cwd(), p), "utf-8"));
const MODAL = "components/calc/transfer/OneHouseJudgmentLoadModal.tsx";
const STEP1 = "app/calc/transfer-tax/steps/Step1.tsx";

describe("P5-b-2 가드 — 이동 금지·배선", () => {
  /**
   * 🔴 계산기 0단계는 **다건 편집 화면도 그대로 마운트한다**
   *    (`MultiTransferTaxCalculator.tsx:472`). 이동하는 헬퍼를 부르면 다건 편집 중에
   *    단건 마법사로 튕겨 나간다(계획서 V-12 실측).
   */
  it.each(["useRouter", "router.push", "openTransferWithOneHouseFacts", "next/navigation"])(
    "[LM-6] 모달이 «%s»를 쓰지 않는다",
    (needle) => {
      expect(read(MODAL).includes(needle), `${MODAL}: 불러오기는 이동하면 안 된다`).toBe(false);
    },
  );

  /**
   * 🔑 **적용은 P5-a 헬퍼 하나를 거친다.** 모달이 store를 직접 쓰면 판정 → 계산기 경로가
   *    두 갈래가 되고, 기준선 해시를 심는 줄이 한쪽에만 남는다.
   */
  it("[LM-7] 모달은 store를 직접 쓰지 않고 적용 헬퍼를 거친다", () => {
    const src = read(MODAL);
    expect(src).toContain("applyOneHouseFactsToTransferForm");
    expect(src.includes("useCalcWizardStore")).toBe(false);
    expect(src.includes("updateFormData")).toBe(false);
  });

  /**
   * 🔴 **같은 화면에 이력 런처가 둘이다.** 다건 편집 화면은 이 0단계를 마운트하므로 다건의
   *    「📂 이력에서 불러오기」(`multi-load-history-btn`)와 나란히 뜬다. testid가 겹치면
   *    기존 spec의 셀렉터 유일성이 깨진다(`feedback_new_widget_breaks_uniqueness_selectors`).
   */
  it("[LM-8] Step1이 런처·모달을 배선하고 testid가 다건과 겹치지 않는다", () => {
    const src = read(STEP1);
    expect(src).toMatch(/<OneHouseJudgmentLoadModal\b/);
    expect(src).toContain('data-testid="open-one-house-judgment-load"');
    expect(src).toContain('variant="modalLauncher"');
    expect(src.includes("multi-load-history-btn")).toBe(false);
  });

  /**
   * 🔑 불러온 뒤의 확인 표시는 **4종 결과뷰와 같은 공용 술어**를 쓴다. 여기서 조건을 손으로
   *    쓰면 술어가 두 벌이 되어 「결과에는 출처가 뜨는데 입력 화면은 조용한」 상태가 갈린다.
   */
  it("[LM-9] 불러옴 표시는 공용 술어를 쓴다", () => {
    const src = read(STEP1);
    expect(src).toContain("hasJudgmentProvenance(form)");
    expect(src).toContain('data-testid="one-house-judgment-loaded"');
    expect(src.includes("form.sourceJudgmentId")).toBe(false);
  });
});
