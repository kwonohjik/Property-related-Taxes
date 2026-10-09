/**
 * OH-34 앵커 — 판정 메뉴 → 계산기 전달이 **분양권·입주권 목록 확인**과 **레거시 표식**을
 * 판정 폼 기준으로 확정한다. 리뷰: docs/reviews/one-house-exemption-review-2026-09.md OH-34
 * (+ 병합된 레거시 표식 보고). PR-D(2026-10-05)로 입주권 수 부분을 재작성했다.
 *
 * ## 입주권 수 (§89①4호 본문 「조합원입주권을 1개 보유한 1세대」) — PR-D 이후
 *
 * 종전에는 계산기에 「세대 보유 조합원입주권 수」 숫자 칸(0/1/2+, `householdRightCount`)이
 * 있어 전달이 그 스칼라를 **직접** 써야 했다(판정 폼 기본값 `"0"`을 그대로 복사하면 가목
 * 비과세였던 입주권이 계산기에서 과세로 바뀌는 결함 — 종전 버전 참조).
 *
 * PR-D가 그 숫자 칸을 없애고 ④가 `presaleRights` 목록에서 직접 도출하므로(판정 메뉴의
 * `deriveJudgmentRightCount`와 같은 leaf `deriveHouseholdRightCount`를 ④가 재사용 —
 * `resolveHouseholdRightCount`), 전달은 **목록 확인만** 확정하면 된다
 * (`householdNoPresaleRightsConfirmed`) — `presaleRights` 자체는 `base` 스프레드로 이미 넘어간다.
 * 계산기에 남은 옛 `householdRightCount` 스칼라는 더 이상 ④가 읽지 않는다(R-7b).
 *
 * ## 레거시 표식 (`legacyHouseCountPrecedence`)
 *
 * 표식은 「저장 당시 스칼라가 명부와 달랐던 **이력 record**」의 세액 보존용이다. 판정 전달은
 * 주택 수를 판정 명부에서 **새로** 파생해 넣으므로, 계산기에 남아 있던 이전 record의 표식은
 * 더 이상 이 폼을 설명하지 않는다. 그대로 두면 명부 도출 §155①(일시적 2주택)이 꺼진다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { toTransferFormPatch } from "@/lib/calc/one-house-judgment-handoff";
import { resolveHouseholdRightCount } from "@/lib/calc/household-house-count";
import { buildHouseholdSpecialPayload } from "@/lib/calc/transfer-tax-api-body-blocks";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

type Right = TransferFormData["presaleRights"][number];

/** 판정 메뉴 — 조합원입주권 양도(2010 취득 · 인가일 요건 충족 · 다른 주택·분양권 없음). */
function rightJudgmentForm(over: Partial<OneHouseJudgmentFormData> = {}): OneHouseJudgmentFormData {
  const f = createInitialOneHouseJudgmentForm();
  return {
    ...f,
    isOneHousehold: true,
    transferDate: "2024-06-01",
    contractTotalPrice: "900000000",
    assets: [
      {
        ...f.assets[0],
        assetKind: "right_to_move_in",
        acquisitionCause: "purchase",
        acquisitionDate: "2010-04-09",
        redevExemptionEligibleAtApproval: "yes",
      },
    ],
    ...over,
  };
}

const otherRight = (id: string): Right =>
  ({ id, type: "redevelopment_right", acquisitionDate: "2015-01-01", region: "capital" }) as unknown as Right;

/** 계산기 store에 patch를 붓는 것과 같은 병합(`updateFormData` = 얕은 merge). */
function applyPatch(calc: TransferFormData, patch: Partial<TransferFormData>): TransferFormData {
  return { ...calc, ...patch };
}

describe("PR-D 분양권·입주권 목록 — 판정 메뉴에서 넘겨받으면 계산기 확인을 다시 요구하지 않는다", () => {
  it("R-1 입주권 양도 · 명부 입주권 없음 → 목록 확정 true + 도출값 1 (양도 대상 포함)", () => {
    const patch = toTransferFormPatch(rightJudgmentForm());
    expect(patch.householdNoPresaleRightsConfirmed).toBe(true);
    expect(resolveHouseholdRightCount("right_to_move_in", patch.presaleRights)).toBe(1);
  });

  it("R-2 명부에 다른 입주권 1개 → 확정 false + 도출값 2 (가목 불성립 쪽도 전달된다)", () => {
    const patch = toTransferFormPatch(rightJudgmentForm({ presaleRights: [otherRight("r1")] }));
    expect(patch.householdNoPresaleRightsConfirmed).toBe(false);
    expect(resolveHouseholdRightCount("right_to_move_in", patch.presaleRights)).toBe(2);
  });

  it("R-3 입주권 2개 보유(자신 포함 3) → 캡 없이 그대로 3을 전달한다(숫자 칸 폐지, PR-D)", () => {
    const patch = toTransferFormPatch(
      rightJudgmentForm({ presaleRights: [otherRight("r1"), otherRight("r2")] }),
    );
    expect(resolveHouseholdRightCount("right_to_move_in", patch.presaleRights)).toBe(3);
  });

  it("R-4 주택 양도 · 입주권 없음 → 도출값 0 (양도 대상이 주택이면 입주권으로 세지 않는다)", () => {
    const f = rightJudgmentForm();
    const patch = toTransferFormPatch({
      ...f,
      assets: [{ ...f.assets[0], assetKind: "housing" }],
    });
    expect(resolveHouseholdRightCount("housing", patch.presaleRights)).toBe(0);
  });

  it("R-5 계산기에 남아 있던 목록 미확정(false)을 판정 값(true)으로 덮는다 — 「판정 불러오기」 경로", () => {
    const calc = { ...createDefaultTransferFormData(), householdNoPresaleRightsConfirmed: false };
    const merged = applyPatch(calc, toTransferFormPatch(rightJudgmentForm()));
    expect(merged.householdNoPresaleRightsConfirmed).toBe(true);
  });
});

/** 계산기 ④ 본문 → 단건 route. 판정이 실제로 움직이는지 본다(본문 키 존재는 도달의 증명이 아니다). */
async function route(form: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(form);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(cap.body),
    }),
  );
  const json = (await res.json()) as { data?: { result?: { isExempt?: boolean; totalTax?: number } } };
  return { status: res.status, body: cap.body!, result: json.data?.result };
}

/** 전달 후 사용자가 계산기에서 채우는 §166 산식 입력(판정 메뉴가 묻지 않는 값). */
function withRedevInputs(f: TransferFormData): TransferFormData {
  return {
    ...f,
    assets: [
      {
        ...f.assets[0],
        fixedAcquisitionPrice: "300,000,000",
        redevSubject: "right",
        redevApprovalDate: "2018-10-23",
        redevApprovalLawBasis: "urban_renovation_art_74",
        redevRightsValue: "500,000,000",
        redevSettlementDirection: "pay",
        redevSettlementAmount: "50,000,000",
        redevOriginalAssetType: "housing",
      },
    ],
  };
}

describe("OH-34 판정 — 전달된 폼이 계산기 route에서 가목 비과세를 유지한다", () => {
  it("R-6 [긍정] 판정 전달 → §166 입력만 채우면 비과세 · 본문 householdRightCount 1 (presaleRights에서 도출)", async () => {
    const f = withRedevInputs(
      applyPatch(createDefaultTransferFormData(), toTransferFormPatch(rightJudgmentForm())),
    );
    const { status, body, result } = await route(f);
    expect(status).toBe(200);
    expect(body.householdRightCount).toBe(1);
    expect(result?.isExempt).toBe(true);
    expect(result?.totalTax).toBe(0);
  });

  it("R-7a [부정 짝] 목록에 다른 입주권을 추가하면 과세 — presaleRights가 실제로 판정을 가른다", async () => {
    const f = withRedevInputs(
      applyPatch(createDefaultTransferFormData(), toTransferFormPatch(rightJudgmentForm())),
    );
    const { status, result } = await route({
      ...f,
      presaleRights: [...(f.presaleRights ?? []), otherRight("r-extra")],
    });
    expect(status).toBe(200);
    expect(result?.isExempt).toBe(false);
  });

  it("R-7b [stale 스칼라 무시, PR-D] 계산기에 남은 옛 householdRightCount를 바꿔도 결과가 그대로다 — ④가 더 이상 읽지 않는다", async () => {
    const f = withRedevInputs(
      applyPatch(createDefaultTransferFormData(), toTransferFormPatch(rightJudgmentForm())),
    );
    const { status, result } = await route({ ...f, householdRightCount: "0" });
    expect(status).toBe(200);
    expect(result?.isExempt).toBe(true);
  });
});

describe("OH-34(병합) 레거시 표식 — 판정 폼 값으로 확정한다", () => {
  /** 양도 주택 2018 취득 · 명부 신규 주택 2024-05-30 취득 · 2026-06-01 양도 → §155① 도출 대상. */
  function tempTwoHouseJudgment(): OneHouseJudgmentFormData {
    const f = createInitialOneHouseJudgmentForm();
    return {
      ...f,
      isOneHousehold: true,
      transferDate: "2026-06-01",
      contractTotalPrice: "900000000",
      assets: [{ ...f.assets[0], assetKind: "housing", acquisitionDate: "2018-06-01" }],
      houses: [
        {
          id: "h-new",
          region: "capital",
          acquisitionDate: "2024-05-30",
          officialPrice: "300000000",
          isInherited: false,
          isLongTermRental: false,
          isApartment: true,
          isOfficetel: false,
          isUnsoldHousing: false,
        } as HouseEntry,
      ],
    };
  }

  it("L-1 판정 폼에 표식이 없으면 false로 확정한다 (계산기의 이전 record 표식을 지운다)", () => {
    expect(toTransferFormPatch(tempTwoHouseJudgment()).legacyHouseCountPrecedence).toBe(false);
  });

  it("L-2 [긍정] 표식이 남아 있던 계산기에 전달하면 명부 도출 §155①이 살아난다", () => {
    const calc = { ...createDefaultTransferFormData(), legacyHouseCountPrecedence: true };
    const f = applyPatch(calc, toTransferFormPatch(tempTwoHouseJudgment()));
    const p = buildHouseholdSpecialPayload(f, f.assets[0]) as { temporaryTwoHouse?: unknown };
    expect(p.temporaryTwoHouse).toEqual({
      previousAcquisitionDate: "2018-06-01",
      newAcquisitionDate: "2024-05-30",
    });
  });

  it("L-3 [부정 짝] 표식이 켜진 폼이면 §155①이 도출되지 않는다 — 표식이 실제로 가른다", () => {
    const f = applyPatch(createDefaultTransferFormData(), toTransferFormPatch(tempTwoHouseJudgment()));
    const p = buildHouseholdSpecialPayload(
      { ...f, legacyHouseCountPrecedence: true },
      f.assets[0],
    ) as { temporaryTwoHouse?: unknown };
    expect(p.temporaryTwoHouse).toBeUndefined();
  });

  it("L-4 판정 폼 자신이 표식을 가졌으면 그 값을 그대로 넘긴다", () => {
    const f = { ...tempTwoHouseJudgment(), legacyHouseCountPrecedence: true };
    expect(toTransferFormPatch(f).legacyHouseCountPrecedence).toBe(true);
  });
});
