/**
 * Pre-Do anchor — **축을 벗어난 재개발 저장값이 payload에 남는다** (U1-01 · U1-02)
 *
 * 두 결함은 같은 모양이다: **입력칸을 여는 게이트**와 **값을 보내는 게이트**가 어긋나 있어,
 * 사용자가 축을 되돌리면 화면에서는 사라진 값이 payload에는 그대로 남는다. 되돌린 축에는
 * 그 값을 지울 위젯이 아예 없으므로 **차단(⑧)은 dead-end**고, 정답은 **범위 밖이면 안 보내는 것**이다
 * (memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * ## U1-01 — `exemptionEligibleAtApproval` (인가일 기준 비과세 보유요건 자기선언)
 *
 * ③-c `ExemptionAtApprovalCard`는 `redevIsSuccessorMember !== "yes" && redevSettlementDirection ===
 * "receive" && isOneHouseSingle` 3중 게이트에서만 렌더된다(`RedevelopmentBlock.tsx:210`). ④ 변환은
 * **방향 게이트 없이** 그대로 송신하고, 엔진은 `=== false`면 `isOneHouseSingle`을 강제 false로 내려
 * 장기보유특별공제를 표2(최대 80%)에서 **표1(최대 30%)로 강등**한다.
 *
 * 청산금 「수령」에서 「미충족」을 고른 뒤 방향을 「납부」로 되돌리면 카드가 사라지면서 `"no"`가 남는다.
 * 완공APT에는 이 필드를 편집하는 다른 위젯이 없다 — `RedevelopmentRightExemptionSection`의 §⑥ 토글은
 * `assetKind === "right_to_move_in"`에서만 렌더된다. ⇒ **끄는 수단이 존재하지 않는다.**
 *
 * 리뷰 실측(mock-rates): `undefined` 산출세액 52,831,365 / `false` 143,081,180 — **+90,249,815원**.
 *
 * ## U1-02 — `postApprovalExpenses` (승계조합원 전용 인가후 필요경비)
 *
 * 입력칸은 `asset.redevIsSuccessorMember === "yes"` 게이트 안에만 있다(`RedevelopmentBlock.tsx:335`).
 * 그런데 `SuccessorMemberSection.handleToggle`은 「예」 진입 시 6개 필드를 명시 정리하면서
 * 「아니오」로 되돌릴 때는 **한 키만** 쓴다. ④ 변환은 `isSuccessorMember` 게이트 없이 합산해 보내고,
 * 엔진은 원조합원 3분할 산식의 인가후 양도차익에서 그 값을 차감한다.
 *
 * 리뷰 실측(mock-rates): stale 0 → 67,480,121 / stale 5,000만 → 54,180,121 — **−13,300,000원**.
 *
 * ## 조문
 *
 * · 「소득세법」 §95② 별표2 — 장기보유특별공제 표1·표2. 표2는 1세대1주택 축 전용이다.
 * · 「소득세법 시행령」 §166①1호 — 인가후 양도차익 산식의 필요경비.
 *
 * ## 두 축의 비대칭 — 입주권은 살려야 한다
 *
 * `exemptionEligibleAtApproval`은 **입주권(`subject === "right"`)에서는 §⑥ 토글이 항상 렌더**되므로
 * 정당한 입력 경로가 있다. 게이트를 `subject` 무관하게 걸면 입주권 §89①4호 비과세 선언이 사라진다.
 * ⇒ 범위 판정은 **완공APT일 때만** 방향·승계 축을 본다.
 */
import { describe, it, expect, vi } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

async function buildBody(form: TransferFormData): Promise<Record<string, unknown>> {
  const captured: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      captured.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  return captured.body!;
}

function makeForm(asset: AssetForm): TransferFormData {
  return {
    transferDate: "2026-02-16",
    assets: [asset],
    houses: [],
    presaleRights: [],
    contractTotalPrice: "800000000",
    totalTransferExpense: "0",
  } as unknown as TransferFormData;
}

/** 완공 재개발APT 공통 축 (사례 45 계열). */
function redevApt(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    acquisitionDate: "2005-04-09",
    actualSalePrice: "800000000",
    redevSubject: "apt",
    redevApprovalDate: "2009-10-23",
    redevRightsValue: "219218500",
    redevSettlementDirection: "pay",
    redevSettlementAmount: "92781500",
    redevActualAcquisitionPrice: "141221534",
    ...over,
  } as AssetForm;
}

const redevOf = (body: Record<string, unknown>) =>
  (body.redevelopment ?? {}) as Record<string, unknown>;

describe("U1-01 · 인가일 비과세 자기선언의 범위", () => {
  it("U1-01-00: 청산금 수령 + 완공APT — 정상 축이므로 그대로 송신한다 (회귀 가드)", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          redevSettlementDirection: "receive",
          redevExemptionEligibleAtApproval: "no",
        }),
      ),
    );
    expect(redevOf(body).exemptionEligibleAtApproval).toBe(false);
  });

  it("U1-01-01: 청산금 납부로 되돌린 완공APT — stale `no`를 보내지 않는다", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          redevSettlementDirection: "pay",
          redevExemptionEligibleAtApproval: "no",
        }),
      ),
    );
    // 종전: false가 그대로 실려 LTHD가 표1로 강등됐다(+90,249,815원).
    expect(redevOf(body).exemptionEligibleAtApproval).toBeUndefined();
  });

  it("U1-01-02: 승계조합원 완공APT — ③-c 카드가 안 뜨므로 보내지 않는다", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          redevSettlementDirection: "receive",
          redevIsSuccessorMember: "yes",
          redevExemptionEligibleAtApproval: "no",
        }),
      ),
    );
    expect(redevOf(body).exemptionEligibleAtApproval).toBeUndefined();
  });

  it("U1-01-03: 🔑 입주권은 방향과 무관하게 송신한다 (§⑥ 토글이 정당한 입력 경로)", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          assetKind: "right_to_move_in",
          redevSubject: "right",
          redevSettlementDirection: "pay",
          redevExemptionEligibleAtApproval: "no",
        }),
      ),
    );
    expect(redevOf(body).exemptionEligibleAtApproval).toBe(false);
  });

  it("U1-01-04: 마이그레이션이 저장값을 정규화한다 (payload 게이트와 2중선)", () => {
    const stale = redevApt({
      redevSettlementDirection: "pay",
      redevExemptionEligibleAtApproval: "no",
    });
    expect(migrateAsset(stale).redevExemptionEligibleAtApproval).toBe("");
  });
});

describe("U1-02 · 승계조합원 인가후 필요경비의 범위", () => {
  it("U1-02-00: 승계조합원 — 정상 축이므로 그대로 합산한다 (회귀 가드)", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          redevIsSuccessorMember: "yes",
          redevPostApprovalExpenses: "50000000",
        }),
      ),
    );
    expect(redevOf(body).postApprovalExpenses).toBe(50_000_000);
  });

  it("U1-02-01: 원조합원으로 되돌린 뒤 — stale 5,000만을 합산하지 않는다", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          redevIsSuccessorMember: "no",
          redevPostApprovalExpenses: "50000000",
        }),
      ),
    );
    // 종전: 50,000,000이 그대로 실려 양도차익이 그만큼 깎였다(−13,300,000원).
    expect(redevOf(body).postApprovalExpenses).toBeUndefined();
  });

  it("U1-02-02: 🔑 자본적지출·양도비는 일반 입력 경로가 있으므로 그대로 둔다", async () => {
    const body = await buildBody(
      makeForm(
        redevApt({
          redevIsSuccessorMember: "no",
          redevPostApprovalExpenses: "50000000",
          capitalExpenditure: "30000000",
          transferExpense: "5000000",
        }),
      ),
    );
    expect(redevOf(body).postApprovalExpenses).toBe(35_000_000);
  });

  it("U1-02-03: 마이그레이션이 저장값을 정규화한다 (payload 게이트와 2중선)", () => {
    const stale = redevApt({
      redevIsSuccessorMember: "no",
      redevPostApprovalExpenses: "50000000",
    });
    expect(migrateAsset(stale).redevPostApprovalExpenses).toBe("");
  });
});
