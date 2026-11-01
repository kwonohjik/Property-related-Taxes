/**
 * 가산세 파생 시점 — 양도일·신고일·부담부증여 판정이 바뀔 때만.
 *
 * 종전 결함: 자산 입력을 고칠 때마다 파생이 돌아, 상세주소만 고쳐도 수동으로 켠 가산세가 꺼지고(494,300·39,600 과소)
 * 끈 가산세가 켜졌다. 기한 내 신고여도 과소신고가산세(「국세기본법」 §47의3①)와 납부지연가산세(§47의4①1호)는 생긴다.
 *
 * 계획서: docs/02-design/features/penalty-history-restore.plan.md
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { AssetSectionBasic } from "@/components/calc/transfer/asset-sections/AssetSectionBasic";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { filingOverdueNote, penaltyPatchOnFormChange } from "@/lib/calc/filing-deadline";

afterEach(() => cleanup());

const TRANSFER = "2024-01-26"; // 기한 2024-03-31 · 부담부증여 2024-04-30
const IN_TIME = "2024-03-15";
const LATE = "2024-06-30";

const PLAIN = [{ transferType: undefined }];
const BURDENED = [{ transferType: "burdened_gift" }];

const OFF = { enablePenalty: false, filingType: "correct", penaltyReason: "normal", paymentDeadline: "", actualPaymentDate: "" } as const;
const AUTO_ON = { enablePenalty: true, filingType: "none", penaltyReason: "normal", paymentDeadline: "2024-03-31", actualPaymentDate: LATE } as const;
const UNDER = { enablePenalty: true, filingType: "under", penaltyReason: "normal", paymentDeadline: "2024-03-31", actualPaymentDate: "2024-07-01" } as const;
const LATE_PAY_ONLY = { enablePenalty: true, filingType: "correct", penaltyReason: "normal", paymentDeadline: "2024-03-31", actualPaymentDate: "2024-07-01" } as const;
const OFF_AFTER_TOGGLE = { enablePenalty: false, filingType: "none", penaltyReason: "normal", paymentDeadline: "2024-03-31", actualPaymentDate: LATE } as const;

const OFF_PATCH = { enablePenalty: false, filingType: "correct", penaltyReason: "normal", paymentDeadline: "", actualPaymentDate: "" };

const form = (filingDate: string, state: object, assets: { transferType?: string }[] = PLAIN, transferDate = TRANSFER) =>
  ({ transferDate, filingDate, assets, ...state }) as never;

describe("날짜를 건드리지 않는 자산 입력 — 파생하지 않는다", () => {
  const assets = [{ transferType: undefined, addressDetail: "101동" }];
  it.each([
    ["기한 내 · 수동 과소신고", IN_TIME, UNDER],
    ["기한 내 · 지연납부만", IN_TIME, LATE_PAY_ONLY],
    ["기한 내 · OFF", IN_TIME, OFF],
    ["기한 후 · OFF", LATE, OFF],
    ["기한 후 · 자동 ON", LATE, AUTO_ON],
    ["기한 후 · 수동 과소신고", LATE, UNDER],
  ])("%s", (_n, filing, state) => {
    expect(penaltyPatchOnFormChange(form(filing, state), { assets })).toEqual({});
  });

  it("같은 날짜 값이 함께 와도 바뀐 것이 아니다", () => {
    expect(penaltyPatchOnFormChange(form(IN_TIME, UNDER), { transferDate: TRANSFER, filingDate: IN_TIME })).toEqual({});
    expect(penaltyPatchOnFormChange(form(LATE, OFF), { transferDate: TRANSFER, filingDate: LATE })).toEqual({});
  });

  it("부담부증여 판정이 그대로면 자산 유형이 바뀌어도 파생하지 않는다", () => {
    const two = [{ transferType: "burdened_gift" }, { transferType: undefined }];
    expect(penaltyPatchOnFormChange(form(IN_TIME, UNDER, PLAIN), { assets: two })).toEqual({});
  });
});

describe("기한 경과 여부가 뒤집히면 켜고 끈다", () => {
  it("기한 내 → 기한 후 · OFF: 무신고로 켠다", () => {
    expect(penaltyPatchOnFormChange(form(IN_TIME, OFF), { filingDate: LATE })).toEqual({
      enablePenalty: true, filingType: "none", penaltyReason: "normal", paymentDeadline: "2024-03-31", actualPaymentDate: LATE,
    });
  });

  it("기한 내 → 기한 후 · 수동 과소신고: 유형은 두고 날짜만 맞춘다", () => {
    expect(penaltyPatchOnFormChange(form(IN_TIME, UNDER), { filingDate: LATE })).toEqual({
      paymentDeadline: "2024-03-31", actualPaymentDate: LATE,
    });
  });

  it("기한 후 → 기한 내 · ON: 끈다", () => {
    expect(penaltyPatchOnFormChange(form(LATE, AUTO_ON), { filingDate: IN_TIME })).toEqual(OFF_PATCH);
  });

  it("기한 후 → 신고일 삭제 · ON: 끈다", () => {
    expect(penaltyPatchOnFormChange(form(LATE, AUTO_ON), { filingDate: "" })).toEqual(OFF_PATCH);
  });

  it("양도일 변경으로 뒤집혀도 같다 — 새 기한을 쓴다", () => {
    expect(penaltyPatchOnFormChange(form("2024-04-15", OFF, PLAIN, "2024-02-26"), { transferDate: "2024-01-26" })).toMatchObject({ enablePenalty: true, paymentDeadline: "2024-03-31" });
    expect(penaltyPatchOnFormChange(form("2024-04-15", AUTO_ON, PLAIN, "2024-01-26"), { transferDate: "2024-02-26" })).toEqual(OFF_PATCH);
  });

  it("부담부증여 전환으로 기한이 바뀌어 뒤집히면 자산 입력에서도 돈다(§105①3호)", () => {
    const filing = "2024-04-15"; // 2개월 기한 후 · 3개월 기한 내
    expect(penaltyPatchOnFormChange(form(filing, AUTO_ON, PLAIN), { assets: BURDENED })).toEqual(OFF_PATCH);
    expect(penaltyPatchOnFormChange(form(filing, OFF, BURDENED), { assets: PLAIN })).toMatchObject({ enablePenalty: true, paymentDeadline: "2024-03-31", actualPaymentDate: filing });
  });
});

describe("기한 경과 여부가 그대로면 사용자의 ON·OFF를 둔다", () => {
  it("기한 내 → 기한 내 · 수동 과소신고: 끄지 않는다", () => {
    expect(penaltyPatchOnFormChange(form(IN_TIME, UNDER), { filingDate: "2024-03-31" })).toEqual({});
  });

  it("기한 내 → 기한 내 · 납부일은 신고일과 같아도 따라가지 않는다 — 기한 내에선 사용자 값이다", () => {
    const own = { ...UNDER, actualPaymentDate: IN_TIME };
    expect(penaltyPatchOnFormChange(form(IN_TIME, own), { filingDate: "2024-03-20" })).toEqual({});
  });

  it("기한 내 신고일 삭제 · 수동 ON: 끄지 않는다", () => {
    expect(penaltyPatchOnFormChange(form(IN_TIME, UNDER), { filingDate: "" })).toEqual({});
  });

  it("기한 후 → 기한 후 · 수동 OFF: 켜지 않는다", () => {
    expect(penaltyPatchOnFormChange(form(LATE, OFF), { filingDate: "2024-07-15" })).toEqual({});
  });

  it("기한 후 → 기한 후 · ON: 날짜만 맞춘다", () => {
    expect(penaltyPatchOnFormChange(form(LATE, UNDER), { filingDate: "2024-07-15" })).toEqual({
      paymentDeadline: "2024-03-31", actualPaymentDate: "2024-07-15",
    });
  });

  it("기한 내 → 기한 내 · ON, 납부기한이 옛 기한과 같으면 새 기한을 따른다 — 납부일은 사용자 값", () => {
    expect(penaltyPatchOnFormChange(form("2024-03-15", UNDER), { transferDate: "2024-02-10" })).toEqual({ paymentDeadline: "2024-04-30" });
  });

  it("납부기한을 사용자가 다르게 넣었으면 건드리지 않는다", () => {
    const own = { ...UNDER, paymentDeadline: "2024-05-05" };
    expect(penaltyPatchOnFormChange(form("2024-03-15", own), { transferDate: "2024-02-10" })).toEqual({});
  });

  it("양도일을 지워도 납부기한을 비우지 않는다", () => {
    expect(penaltyPatchOnFormChange(form("2024-03-15", UNDER), { transferDate: "" })).toEqual({});
  });

  it("부담부증여 전환 · 기한 내 유지: 납부기한만 3개월로 따른다", () => {
    expect(penaltyPatchOnFormChange(form("2024-03-15", UNDER, PLAIN), { assets: BURDENED })).toEqual({ paymentDeadline: "2024-04-30" });
  });

  it("토글로 끈 뒤 기한 후 날짜를 옮기면 숨은 납부기한·납부일도 따라간다 — 다시 켤 때 옛 값이 남지 않게", () => {
    expect(penaltyPatchOnFormChange(form(LATE, OFF_AFTER_TOGGLE), { filingDate: "2024-07-15" })).toEqual({ actualPaymentDate: "2024-07-15" });
    const moved = form("2024-07-15", { ...OFF_AFTER_TOGGLE, actualPaymentDate: "2024-07-15" });
    expect(penaltyPatchOnFormChange(moved, { transferDate: "2024-02-10" })).toEqual({ paymentDeadline: "2024-04-30" });
  });
});

describe("기한 경과 안내", () => {
  it("상태대로 표시한다", () => {
    expect(filingOverdueNote({ enablePenalty: true, amendmentMode: false })).toBe("가산세 자동 적용");
    expect(filingOverdueNote({ enablePenalty: false, amendmentMode: false })).toBe("가산세 계산이 꺼져 있어 세액에 포함되지 않습니다");
    expect(filingOverdueNote({ enablePenalty: false, amendmentMode: true })).toBe("");
    expect(filingOverdueNote({ enablePenalty: true, amendmentMode: true })).toBe("");
  });

  const renderWarning = (note: string | undefined) =>
    render(
      <AssetSectionBasic
        asset={{ ...makeDefaultAsset(1), assetKind: "land" }}
        onChange={vi.fn()}
        isMultiBundled={false}
        onAddAsset={vi.fn()}
        showFormDates
        transferDate={TRANSFER}
        filingDate={LATE}
        filingOverdue
        filingOverdueNote={note}
        filingDeadline="2024-03-31"
        onFormChange={vi.fn()}
      />,
    );

  it("양도일 칸에 문구가 도달한다", () => {
    renderWarning("가산세 계산이 꺼져 있어 세액에 포함되지 않습니다");
    expect(screen.getByText("⚠ 신고기한(2024-03-31)을 지났습니다 — 가산세 계산이 꺼져 있어 세액에 포함되지 않습니다")).toBeInTheDocument();
  });

  it("빈 문구면 기한 경과 사실만", () => {
    renderWarning("");
    expect(screen.getByText("⚠ 신고기한(2024-03-31)을 지났습니다")).toBeInTheDocument();
  });

  it("Step1 → 자산 카드 전달 — 명시 prop 매핑에서 빠지지 않는다", () => {
    for (const f of ["app/calc/transfer-tax/steps/Step1.tsx", "components/calc/transfer/CompanionAssetsSection.tsx", "components/calc/transfer/CompanionAssetCard.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/filingOverdueNote=\{/);
    }
  });
});

describe("배선", () => {
  it("handleFormChange는 전이 판정 함수만 쓴다 — 무조건 파생으로 되돌리지 않는다", () => {
    const src = readFileSync("app/calc/transfer-tax/TransferTaxCalculator.tsx", "utf8");
    const body = src.slice(src.indexOf("const handleFormChange"), src.indexOf("// 검증 실패 적용"));
    expect(body).toMatch(/penaltyPatchOnFormChange\(formData, patch\)/);
    expect(body).not.toMatch(/derivePenaltyFields\(/);
  });
});
