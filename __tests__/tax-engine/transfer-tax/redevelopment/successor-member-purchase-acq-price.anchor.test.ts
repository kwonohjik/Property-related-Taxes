/**
 * `E2-01` (🔴 critical) — 승계조합원 완공APT + **매매** 승계취득: 취득가액이 0으로 계산된다
 *
 * ## 결함
 *
 * `lib/tax-engine/redevelopment-successor.ts:60` 의 `runSuccessorMember` 는 취득가액을
 * `input.actualAcquisitionPrice ?? redevelopment.rightsValue` 로 잡는데, 승계조합원 모드에서는
 * **두 소스가 모두 0** 이 될 수 있다.
 *
 *  - `components/calc/transfer/RedevelopmentBlockCards.tsx:304` 토글 핸들러가
 *    `redevRightsValue: ""` 를 강제로 비운다 ⇒ `rightsValue = 0`.
 *  - `components/calc/transfer/RedevelopmentBlock.tsx:374` 가 ⑤ 「인가전 분 종전 부동산
 *    취득가액」 섹션 전체를 승계 모드에서 숨긴다.
 *  - 그 자리를 대신한다고 안내하는 「상단 자산 카드 취득가액」(`fixedAcquisitionPrice`)은
 *    `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:431-433` 이
 *    `assetKind === "redevelopment_apt"` 이면 통째로 렌더하지 않는다.
 *
 * ⇒ 취득원인 **purchase(매매)** 에는 취득가액 입력 경로가 어디에도 없다(상속은 STEP 0.45
 *   `inheritedAcquisition` override, 증여는 `CompanionAcqGiftBlock` 이 각각 살아 있다).
 *   그런데 `lib/calc/transfer-tax-validate-redev.ts:183` 은 매매를 정식 허용 취득원인으로 열어
 *   두고, `:214` 의 실가 취득가액 필수 검증은 `&& !isSuccessor` 로 승계를 제외한다.
 *   `??` 는 nullish 연산자라 **0 에서는 fallback 도 걸리지 않는다**.
 *
 * ## 근거 조문
 *
 *  - **「소득세법」 제97조 제1항 제1호** — 「필요경비는 … 취득가액. 다만, **가목의 실지거래가액을
 *    확인할 수 없는 경우에 한정하여 나목의 금액을 적용한다.**」
 *    가목 = 「제94조제1항 각 호의 자산 취득에 든 **실지거래가액**」 /
 *    나목 = 「대통령령으로 정하는 매매사례가액, 감정가액 또는 환산취득가액을 순차로 적용한 금액」.
 *    ⇒ 취득가액은 **가목 아니면 나목**이다. **0 은 어느 쪽도 아니다.**
 *  - **「소득세법 시행령」 제166조 제1항** — 「정비사업조합의 조합원이 당해 조합에 기존건물과 그
 *    부수토지를 **제공**(건물 또는 토지만을 제공한 경우를 포함한다)**하고 취득한** 입주자로
 *    선정된 지위를 양도하는 경우 **그 조합원의** 양도차익은 …」 ⇒ 승계조합원은 §166 안분의
 *    대상이 아니고, 「소득세법」 제100조 제1항·제95조 제1항·**제97조 제1항 제1호 가목**의
 *    일반 원칙으로 계산한다.
 *  - **「소득세법 시행령」 제166조 제4항 제1호** — 「기존건물과 그 부수토지의 평가액」 =
 *    「**관리처분계획등에 따라 정하여진 가격**」(= 엔진의 `rightsValue`).
 *  - (승계조합원 보유기간 기산) 「소득세법 시행령」 제162조 제1항 제4호 ·
 *    사전-2019-법령해석재산-0649(2020.02.11.) — 준공일(사용검사필증 교부일) 기산.
 *
 * ## 입력 사실관계 (검토서 probe6-B 와 동일)
 *
 *  - 관리처분계획 인가일 2016-02-20
 *  - 조합원입주권을 **매매**로 승계취득 2020-04-15
 *  - 신축APT 준공(사용검사필증 교부) 2022-12-02
 *  - 2023-02-16 양도, 양도가액 920,000,000
 *  - 승계취득가액 450,000,000 · 인가후 필요경비 0 · 1세대1주택(householdHousingCount = 1)
 *  - 준공일 기산 보유기간 ≈ 2.5개월 ⇒ 1년 미만 단기세율 70%(「소득세법」 §104①3호)
 *
 * ## 실측(현행) vs 기대(법령상 옳은 값)
 *
 * | # | 입력 | 현행 실측 | 기대 |
 * |---|---|---|---|
 * | A-1 | `actualAcquisitionPrice` 450,000,000 | 양도차익 470,000,000 · 산출세액 327,250,000 · 세액합계 359,975,000 | 동일 (characterization) |
 * | A-2 | `actualAcquisitionPrice` **0** · `rightsValue` 450,000,000 | 양도차익 **920,000,000** · 산출세액 **642,250,000** | 양도차익 470,000,000 · 산출세액 327,250,000 |
 * | A-3 | 두 소스 **모두 0** (화면 실제 경로) | 양도차익 **920,000,000**(= 양도가액 전액) · 산출세액 **642,250,000** | 양도가액 전액이 양도차익이 될 수 없다 |
 * | B-1 | `validateRedevelopmentAsset` | **null**(통과) | 취득가액을 요구하며 차단 |
 * | B-2 | `validateAssetAcquisition` | **null**(통과) | 취득가액을 요구하며 차단 |
 * | B-3 | 원조합원(대조군) 동일 공백 | 차단됨 | 차단(현행 유지) |
 *
 * **세액 영향** — 642,250,000 − 327,250,000 = **315,000,000원 과대**(산출세액 기준).
 *
 * ## 이 anchor 는 **수정 전 실패한다**
 *
 * 실패하는 단언: **A-2 · A-3 · B-1 · B-2** (4건). A-1 · B-3 은 통과한다
 * (A-1 = 정상 입력 characterization, B-3 = 원조합원 대조군 — 비대칭을 드러낸다).
 *
 * ⚠️ **B 층의 기대값은 「차단」이지 「차단만이 정본」이라는 뜻이 아니다.** 검토서 수정 방향은
 *    ⑤ 입력 경로를 여는 쪽(`CompanionAcqPurchaseBlock` 의 `redevelopment_apt` 게이트에
 *    `redevIsSuccessorMember !== "yes"` 조건 추가)이 정본이다. 다만 이 저장소의 3중 패턴
 *    (UI display fallback ↔ API 변환 ↔ ⑧ validate) 상 **입력 칸을 열면 ⑧ 도 같은 값을 요구해야**
 *    「UI 통과 ↔ 계산 오류」가 재발하지 않는다 — 그래서 두 수정 방향 어느 쪽이든 B-1·B-2 는
 *    같은 단언으로 만족된다.
 *
 * ⚠️ **A-3 은 가장 엄격한 독법이다.** ⑤ 입력 경로 + ⑧ 검증만으로 종결하기로 정하면 엔진은
 *    여전히 0 을 그대로 소비한다. 그 경우 A-3 을 **삭제하지 말고**, 「엔진 잔여 위험 —
 *    ⑧ 이 유일 게이트」라는 판단 근거를 적어 조정할 것(정책 `feedback_anchor_correction_legal_priority`).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import type { RedevelopmentInfo } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import { validateRedevelopmentAsset } from "@/lib/calc/transfer-tax-validate-redev";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const mockRates = makeMockRates();

const TRANSFER_PRICE = 920_000_000;
/** 승계취득가액(매매) — §97①1호 가목 실지거래가액 */
const SUCCESSOR_ACQ_PRICE = 450_000_000;

/** 정상 계산값 (A-1 실측 = 법령상 옳은 값) */
const EXPECTED_GAIN = 470_000_000; // 920,000,000 − 450,000,000 − 0
const EXPECTED_CALCULATED_TAX = 327_250_000; // (470,000,000 − 2,500,000) × 70%
const EXPECTED_TOTAL_TAX = 359_975_000; // 327,250,000 + 지방소득세 32,725,000

function successorRedevelopmentInfo(rightsValue: number): RedevelopmentInfo {
  return {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: new Date("2016-02-20"),
    // ⑤ 토글 핸들러가 `redevRightsValue: ""` 로 비우므로 화면 경로에서는 0 이 도달한다.
    rightsValue,
    settlementDirection: "pay",
    settlementAmount: 0,
    preApprovalExpenses: 0,
    postApprovalExpenses: 0,
    originalAssetType: "housing",
    completionDate: new Date("2022-12-02"),
    isSuccessorMember: true,
  } as RedevelopmentInfo;
}

/** 승계조합원 신축APT 양도 — 취득가액 2소스만 바꿔 가며 계산한다. */
function runSuccessorApt(actualAcquisitionPrice: number, rightsValue: number) {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: TRANSFER_PRICE,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2020-04-15"), // 입주권 매매 승계취득일
    acquisitionPrice: actualAcquisitionPrice,
    expenses: 0,
    useEstimatedAcquisition: false,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    redevelopment: successorRedevelopmentInfo(rightsValue),
  });
  return calculateTransferTax(input, mockRates);
}

describe("E2-01 · A 엔진 층 — 승계조합원 완공APT 취득가액 0", () => {
  it("A-1 ✅ characterization — 취득가액 450,000,000 이 도달하면 양도차익 470,000,000 · 산출세액 327,250,000", () => {
    const r = runSuccessorApt(SUCCESSOR_ACQ_PRICE, 0);
    expect(r.redevelopmentDetail?.successorMemberApplied).toBe(true);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
    expect(r.calculatedTax).toBe(EXPECTED_CALCULATED_TAX);
    expect(r.totalTax).toBe(EXPECTED_TOTAL_TAX);
  });

  it("A-2 🔴 `??` 는 nullish라 0에서 fallback이 걸리지 않는다 — rightsValue 450,000,000 이 있어도 취득가액 0", () => {
    // 엔진 주석(`redevelopment-successor.ts:58`)이 스스로 「fallback: redevelopment.rightsValue」
    // 라고 적어 둔 경로다. `??` 대신 0 을 「미입력」으로 보는 연산자였다면 §166④1호
    // 「관리처분계획등에 따라 정하여진 가격」이 취득가액으로 쓰여 양도차익 470,000,000 이 된다.
    const r = runSuccessorApt(0, SUCCESSOR_ACQ_PRICE);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
    expect(r.calculatedTax).toBe(EXPECTED_CALCULATED_TAX);
  });

  it("A-3 🔴 두 소스 모두 0(화면 실제 경로) — 양도가액 전액이 양도차익이 될 수 없다 (§97①1호 단서)", () => {
    // §97①1호 단서상 취득가액은 「가목 실지거래가액」 아니면 「나목 매매사례가액·감정가액·
    // 환산취득가액」이다. 0 은 어느 쪽도 아니므로, 어떤 형태의 방어(fallback·예외·계산 중단)든
    // 「양도가액 = 양도차익」 결과가 나와서는 안 된다.
    //
    // 📌 채택된 방어는 **계산 중단**이다(2026-08-25 수정). 위 세 형태 중 하나를 고른 것이며
    //    anchor 의 법령상 요구(= 양도가액이 그대로 양도차익이 되지 않을 것)는 그대로다.
    //    fallback 을 고르지 않은 이유: 0 은 §97①1호 어느 목에도 없는 값이라 대체할 법정 금액이
    //    없고, 임의로 0 을 「취득가액 0원」으로 읽으면 근거 없이 세액을 3억 넘게 부풀린다.
    //    이 상태는 정상 경로에서 도달하지 않는다 — ⑧ validate(B-1·B-2)가 먼저 막고
    //    ⑤ UI 는 취득가액 칸을 렌더한다. 이 throw 는 그 관문이 뚫렸을 때 울리는 트립와이어다.
    expect(() => runSuccessorApt(0, 0)).toThrow(/취득가액을 확인할 수 없습니다/);
  });
});

/** ⑤ 화면 상태 그대로 — 승계조합원 ON + 매매 + 취득가액 칸이 어디에도 없어 전부 공란 */
function successorPurchaseAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "redevelopment_apt",
    acquisitionCause: "purchase",
    acquisitionDate: "2020-04-15",
    actualSalePrice: "920000000",
    // ⑤ CompanionAcqPurchaseBlock:431-433 이 redevelopment_apt 를 렌더하지 않으므로 공란으로 남는다.
    fixedAcquisitionPrice: "",
    useEstimatedAcquisition: false,
    redevSubject: "apt",
    redevApprovalLawBasis: "urban_renovation_art_74",
    redevOriginalAssetType: "housing",
    redevApprovalDate: "2016-02-20",
    redevIsSuccessorMember: "yes",
    redevCompletionDate: "2022-12-02",
    // RedevelopmentBlockCards:296-305 토글 핸들러가 강제로 넣는 값 그대로.
    redevSettlementDirection: "pay",
    redevSettlementAmount: "0",
    redevPreApprovalExpenses: "0",
    redevReceiveOnlyMode: "no",
    redevRightsValue: "",
    // ⑤ RedevelopmentBlock:374 가 섹션을 숨기므로 공란으로 남는다.
    redevActualAcquisitionPrice: "",
    ...over,
  } as AssetForm;
}

/**
 * `null`(= 차단하지 않음)을 **읽히는 실패 메시지**로 바꾼다.
 * 그대로 `toMatch` 에 넘기면 vitest 가 `TypeError: got object` 를 던져
 * 「무엇이 통과했는지」가 메시지에서 사라진다.
 */
const blockMessage = (v: string | null) => v ?? "«null — 차단되지 않음(통과)»";

describe("E2-01 · B 검증 층 — 「승계조합원 + 매매 + 취득가액 미입력」이 통과한다", () => {
  it("B-1 🔴 validateRedevelopmentAsset 이 취득가액을 요구해야 한다 (현행 null — 통과)", () => {
    expect(blockMessage(validateRedevelopmentAsset(successorPurchaseAsset(), "자산1"))).toMatch(
      /취득가액/,
    );
  });

  it("B-2 🔴 validateAssetAcquisition 이 취득가액을 요구해야 한다 (현행 null — 통과)", () => {
    expect(
      blockMessage(validateAssetAcquisition(successorPurchaseAsset(), "자산1", "2023-02-16")),
    ).toMatch(/취득가액/);
  });

  it("B-3 ✅ 대조군 — 원조합원(승계 아님)의 같은 공란은 §166①1호로 차단된다 (비대칭 실측)", () => {
    const original = successorPurchaseAsset({
      redevIsSuccessorMember: "no",
      redevCompletionDate: "",
      acquisitionDate: "2010-05-10", // 인가일(2016-02-20) 이전 취득 = 원조합원
      redevRightsValue: "450000000", // §166④1호 권리가액 — 원조합원은 필수
      redevActualAcquisitionPrice: "", // ⑤ 화면에 칸이 **있는데** 비운 상태
    });
    expect(blockMessage(validateRedevelopmentAsset(original, "자산1"))).toMatch(
      /인가전 분 종전 주택 취득가액/,
    );
  });
});
