/**
 * DetailedStatementRedevOverrides — 재개발/재건축 명세서 **오버라이드 진입점**
 *
 * `DetailedStatementHelpers.buildStatementItems()`에서 `applyRedevelopmentOverrides()`
 * 한 줄로 호출된다. 산식 문자열 자체를 만드는 빌더는 `DetailedStatementRedevelopmentBuilders.ts`에
 * 있고 여기서는 그것을 항목 Map에 **부착**하는 일만 한다.
 *
 * 800줄 정책 분리 (2026-09-07): 한 파일이 859줄이 되어 빌더(≈500)와 오버라이드(≈360)를 갈랐다.
 * 재export를 두지 않는다 — 순환이 생기고 eslint가 「미사용」으로 본다
 * ([[feedback_800line_split_playbook]]). 소비처 2곳이 이 경로를 직접 import한다.
 */

import type { StatementItem } from "./DetailedStatementHelpers";
import type { RedevelopmentResult } from "@/lib/tax-engine/types/transfer-redevelopment.types";
import type { LthdExclusionReason } from "@/lib/tax-engine/legal-codes/transfer";
import { LTHD_EXCLUSION_LABEL } from "@/lib/tax-engine/legal-codes/transfer";
import { redevBranchTotals, redevFilingTotals } from "./redev-acquisition-inverse";
import {
  fmt,
  buildRedevPerAssetForTransfer,
  buildRedevPerAssetForAcquisition,
  buildRedevPerAssetForExpense,
  buildRedevPerAssetForGain,
  buildRedevPerAssetForGrossGain,
  buildRedevPerAssetForLthd,
  buildRedevPerAssetForIncome,
} from "./DetailedStatementRedevelopmentBuilders";

// ──────────────────────────────────────────────────────────────────────────────
// 진입 헬퍼 — DetailedStatementHelpers.ts buildStatementItems()에서 1줄 호출
// ──────────────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────────────
// 사례 37 — 토지 출자 §166③ 2분할 산식 빌더
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 토지 출자 §166③ 케이스 — 산식 오버라이드.
 *
 * originalAssetType="land" + subject="right" + settlementDirection="pay" 분기.
 * landContribDetail echo 필드를 소비하여 산식·LTHD 라벨 부착.
 *
 * 산식 규칙:
 *  - 인가전: 권리가액 − 환산취득가(§166③) − 개산공제(§163⑥) = 인가전 양도차익
 *  - 인가후: 양도가액 − 권리가액 − 청산금 − 인가후 필요경비 = 인가후 양도차익
 *  - LTHD: 인가전 14% (§166⑤1호) / 인가후 0 (§95② 본문 괄호)
 */
export function applyLandContribOverrides(
  items: Map<string, StatementItem>,
  redev: RedevelopmentResult,
  totalTransferPrice: number,
): void {
  const lcd = redev.landContribDetail;
  if (!lcd) return; // landContribDetail 없으면 하우징 분기로 fall-through

  const fmt = (n: number) => n.toLocaleString("ko-KR");
  const pre = redev.preApproval;
  /**
   * 🔴 **인가후 분은 `settlement`다** (2026-09-07 UI 리뷰).
   *
   * 토지 출자 경로에서 엔진은 `postApprovalExistingHouse`를 **전 필드 0으로 zero-fill**하고
   * (`lib/tax-engine/redevelopment.ts:267` 「항상 0」) 실제 인가후 분을 `settlement`에 담는다
   * (:293~309 — 양도가액=실지 양도가 전액 · 취득가액=권리가액 · 필요경비=청산금+부대비용).
   *
   * 같은 화면 신고서 양식은 이를 알고 `const post = r.settlement;`를 쓰며
   * `FilingFormTableRedevRows.ts:284`에 「zero-filled — **사용 금지**」라고 적어 두었다.
   * 이 파일만 금지된 슬롯을 읽어 ② 인가후 분 행이 **전부 0**으로 떴고, 합계 행은 정상값이라
   * 「합계 ≠ 분할 합」이 되며 신고서와 명세서가 같은 자산을 정면으로 다르게 표시했다.
   */
  const post = redev.settlement;

  // 양도가액
  const transferItem = items.get("transferPrice");
  if (transferItem) {
    transferItem.formula =
      "합계 = 실지 양도가액. 분할 표시는 §166① — 인가전은 권리가액 의제, 인가후는 실지 양도가액 전액이며 단계별 의제라 합계와 다르다";
    transferItem.legalBasis = "소득세법 시행령 §166①1호 · §166④";
    transferItem.perAsset = [
      {
        label: "① 인가전 분 (§166①1호 · §166⑤1호 — 취득일~인가일 기산)",
        value: pre.apportionedTransfer,
        formula: `의제 양도가액 = 권리가액 = ${fmt(pre.apportionedTransfer)} (§166④)`,
      },
      {
        label: "② 인가후 분 (LTHD 제외 — §95② 본문 괄호)",
        value: post.apportionedTransfer,
        // 인가후 분의 **양도가액**은 실지 양도가액 전액이다(신고서 정본과 같은 값).
        // 종전 문구는 양도차익 산식을 양도가액 자리에 적고, 「청산금」 항에 권리가액을
        // 넣은 데다 우변이 zero-filled 0이라 좌변이 만들지 못하는 거짓 등식이었다.
        formula: `실지 양도가액 전액 = ${fmt(post.apportionedTransfer)} (§166①1호 — 인가전 분은 권리가액으로 의제)`,
      },
    ];
  }

  // 취득가액
  const acqItem = items.get("acquisitionPrice");
  if (acqItem) {
    // 합계는 **역산**이다 — §166은 파트가 단계별 의제라 파트 합이 실제 취득가액이 아니다.
    // 신고서 양식과 같은 leaf·같은 인자를 쓴다(`redev-acquisition-inverse.ts`).
    acqItem.value = redevFilingTotals(redev, totalTransferPrice).acquisition;
    acqItem.formula =
      "토지 출자 §166③ — 합계 취득가액 = 양도가액 − 필요경비 − 양도차익 (단계별 의제 구조상 파트 합과 다름)";
    acqItem.legalBasis = "소득세법 시행령 §166③";
    acqItem.note = undefined;
    acqItem.perAsset = [
      {
        label: "① 인가전 분 (§166③ — 권리가액 × 취득기준시가 / 관리처분 직전 기준시가)",
        value: pre.apportionedAcquisition,
        formula:
          `환산취득가 = ${fmt(pre.apportionedTransfer)} × (${fmt(lcd.landStdPriceAtAcq)} ÷ ${fmt(lcd.landStdPriceAtApproval)}) = ${fmt(lcd.convertedAcquisition)} (1원 미만 절사)`,
      },
      {
        label: "② 인가후 분 (§166②1호 — 권리가액 의제)",
        value: post.apportionedAcquisition,
        formula: `의제 = 권리가액 = ${fmt(post.apportionedAcquisition)}`,
      },
    ];
  }

  // 필요경비
  const expItem = items.get("expenses");
  if (expItem) {
    expItem.value = redevBranchTotals(redev).expenses;
    expItem.formula = "분할별 필요경비 합 — 인가전 개산공제(§163⑥) + 인가후 분 필요경비";
    expItem.legalBasis = "소득세법 시행령 §163⑥";
    expItem.perAsset = [
      {
        label: "① 인가전 분 (§163⑥)",
        value: lcd.estimatedDeduction,
        formula: `${fmt(lcd.landStdPriceAtAcq)} × 3% = ${fmt(lcd.estimatedDeduction)} (1원 미만 절사)`,
      },
      {
        label: "② 인가후 분",
        value: 0,
        formula: "해당 분할에는 개산공제 미적용",
      },
    ];
  }

  // 전체 양도차익
  const gainItem = items.get("transferGain");
  if (gainItem) {
    gainItem.formula = "토지 출자 §166① 분할별 양도차익 합 = 인가전 + 인가후";
    gainItem.legalBasis = "소득세법 시행령 §166①1호";
    gainItem.perAsset = [
      {
        label: "① 인가전 분",
        value: pre.gain,
        formula: `권리가액 ${fmt(pre.apportionedTransfer)} − 환산취득가 ${fmt(lcd.convertedAcquisition)} − 개산공제 ${fmt(lcd.estimatedDeduction)} = ${fmt(pre.gain)}`,
      },
      {
        label: "② 인가후 분",
        value: post.gain,
        // 필요경비(청산금 불입액 + 인가후 부대비용) 항을 빠뜨리면 좌변이 우변을 만들지 못한다.
        formula: `${fmt(post.apportionedTransfer)} − ${fmt(post.apportionedAcquisition)} − 필요경비 ${fmt(post.expenses ?? 0)} = ${fmt(post.gain)}`,
      },
    ];
  }

  // 과세대상 양도차익
  const taxableItem = items.get("taxableGain");
  if (taxableItem) {
    taxableItem.perAsset = gainItem?.perAsset;
  }

  // 장기보유특별공제
  const ltItem = items.get("ltDeduction");
  if (ltItem) {
    ltItem.formula = "§95② 본문 괄호 + §166⑤1호 — 인가전 분만 LTHD (취득일~인가일 기산). 인가후 LTHD=0 (본문 괄호)";
    ltItem.legalBasis = "소득세법 §95② 본문 괄호 · 시행령 §166⑤1호";
    const preYears = Math.floor(pre.holdingMonths / 12);
    const preMons = pre.holdingMonths % 12;
    const prePct = (pre.lthdRate * 100).toFixed(0);
    ltItem.perAsset = [
      {
        label: `① 인가전 분 (§166⑤1호 — 취득일~인가일, ${prePct}%)`,
        value: pre.lthd,
        formula: `${fmt(pre.gain)} × ${prePct}% (보유 ${preYears}년 ${preMons}개월) = ${fmt(pre.lthd)}`,
      },
      {
        label: "② 인가후 분 (LTHD=0 — §95② 본문 괄호)",
        value: 0,
        formula: "LTHD 대상 양도차익 부존재 (본문 괄호 — 관리처분 인가 전 토지·건물분에 한정)",
      },
    ];
  }

  // 보유/거주 분리 항목
  const ltHoldItem = items.get("ltHoldingPart");
  if (ltHoldItem) {
    ltHoldItem.note = "토지 출자 §166⑤1호 — 인가전 분만 보유기간 LTHD (표1), 인가후 미적용";
    ltHoldItem.perAsset = undefined;
  }
  const ltResItem = items.get("ltResidencePart");
  if (ltResItem) {
    ltResItem.note = "토지 출자 — 거주 분리 미적용";
    ltResItem.perAsset = undefined;
  }

  // 양도소득금액
  const incomeItem = items.get("incomeAmount");
  if (incomeItem) {
    incomeItem.formula = "토지 출자 §166 분할별 (양도차익 − LTHD) 합";
    incomeItem.legalBasis = "소득세법 §95①";
    incomeItem.perAsset = [
      {
        label: "① 인가전 분",
        value: Math.max(0, pre.gain - pre.lthd),
        formula: `${fmt(pre.gain)} − ${fmt(pre.lthd)} = ${fmt(Math.max(0, pre.gain - pre.lthd))}`,
      },
      {
        label: "② 인가후 분",
        value: Math.max(0, post.gain - post.lthd),
        formula: `${fmt(post.gain)} − 0 = ${fmt(post.gain)}`,
      },
    ];
  }
}

/**
 * 재개발 케이스 1단계 양도차익 산정 그룹의 항목에 3분할 perAsset[] 부착.
 *
 * - isAggregate(다건) 모드와 mutually exclusive로 처리 (호출 전 분기 체크)
 * - 합계값(value)은 기존 단건 합계 그대로 유지 → 32-항목 합계 anchor 회귀 0
 * - 각 항목의 formula·legalBasis는 재개발 §166 컨텍스트로 갱신
 */
export function applyRedevelopmentOverrides(
  items: Map<string, StatementItem>,
  redev: RedevelopmentResult,
  totalTransferPrice: number,
  subject?: "apt" | "right",
  settlementDirection?: "pay" | "receive",
  /**
   * §95② 장기보유특별공제 **배제 사유** — 있으면 분할별 산식 대신 사유를 쓴다.
   *
   * 재개발은 자체 산식 빌더를 쓰므로 일반 경로의 `buildLthdFallbackFormulas`(배제 시
   * 「0 — 사유」로 대체)를 타지 않는다. 그래서 배제돼도 「양도차익 × **0%** (보유 21년 1개월)」로
   * 표시돼 **보유기간이 짧아서 0인 것처럼** 읽혔다.
   */
  lthdExclusionReason?: LthdExclusionReason,
): void {
  // 사례 37 — 토지 출자 §166③ 분기: landContribDetail 존재 시 2분할 산식으로 오버라이드
  if (redev.landContribDetail) {
    applyLandContribOverrides(items, redev, totalTransferPrice);
    applyLthdExclusionOverride(items, lthdExclusionReason);
    return;
  }

  const isRightSubject = subject === "right";
  const isRightReceive = isRightSubject && settlementDirection === "receive";

  // 양도가액 — 합계는 totalTransferPrice 유지.
  // ⚠️ 산식 문구는 **합계가 아니라 분할 구조**를 설명한다. 종전 문구("인가전 + 인가후 + 청산금")는
  //    합계가 그 셋의 합인 것처럼 읽혀 값(계약총액)과 어긋났다 — 파트 합은 실제 양도가액이 아니다.
  const transferItem = items.get("transferPrice");
  if (transferItem) {
    // 청산금 **수령** 동시신고는 신고 단위가 두 개의 양도다 — 신축APT 양도가액 + 청산금.
    // 신고서 양식과 같은 leaf를 써서 두 카드가 같은 합계를 말하게 한다.
    const separate = redev.settlementSeparateConsideration ?? 0;
    if (separate > 0) {
      transferItem.value = redevFilingTotals(redev, totalTransferPrice).transferPrice;
      transferItem.formula = `합계 = 신축주택 양도가액 ${fmt(totalTransferPrice)} + 청산금 수령액 ${fmt(separate)} — 동시신고 단위의 대가 전부(§166①2호 가목은 별개의 양도다)`;
      transferItem.legalBasis = "소득세법 시행령 §166①2호 가목 · §166②·④";
    } else if (isRightReceive) {
      transferItem.formula = "합계 = 실지 양도가액. 분할 표시는 §166①2호 — 인가전(권리가액−청산금 의제)·청산금 수령분(청산금 의제)이며 단계별 의제라 합계와 다르다";
      transferItem.legalBasis = "소득세법 시행령 §166①2호 가목·나목 · §166④";
    } else {
      transferItem.formula = isRightSubject
        ? "합계 = 실지 양도가액. 분할 표시는 §166① — 인가전(권리가액 의제)·인가후·청산금(양도가액 − 권리가액 − 청산금 납부액)이며 단계별 의제라 합계와 다르다"
        : "합계 = 실지 양도가액. 분할 표시는 §166 — 인가전(권리가액 의제)·인가후(분양가 안분)·청산금(분양가 안분)이며 단계별 의제라 합계와 다르다";
      transferItem.legalBasis = isRightSubject ? "소득세법 시행령 §166①·④" : "소득세법 시행령 §166①·②·④";
    }
    transferItem.perAsset = buildRedevPerAssetForTransfer(redev, totalTransferPrice, subject, settlementDirection);
  }

  // 취득가액
  const acqItem = items.get("acquisitionPrice");
  if (acqItem) {
    // 합계: 분할별 apportionedAcquisition 합
    // 합계는 **역산**이다 — 파트 합(단계별 의제)이 아니라 자기일관식에서 얻는다.
    // 신고서 양식과 같은 leaf·같은 인자(`redevFilingTotals`)를 쓴다.
    acqItem.value = redevFilingTotals(redev, totalTransferPrice).acquisition;
    if (isRightReceive) {
      acqItem.formula = "합계 취득가액 = 양도가액 − 필요경비 − 양도차익 (§166①2호 단계별 의제 구조상 파트 합과 다름). 분할 표시는 인가전(실가 또는 환산 − 안분 취득가)·청산금 분(종전취득가 × 청산금/권리가)";
      acqItem.legalBasis = "소득세법 시행령 §166①2호 가목·나목 · §166③";
    } else {
      acqItem.formula = isRightSubject
        ? "합계 취득가액 = 양도가액 − 필요경비 − 양도차익 (§166 단계별 의제 구조상 파트 합과 다름). 분할 표시는 인가전(§166③ 환산 또는 실가)·인가후·청산금(권리가액+청산금 의제)"
        : "합계 취득가액 = 양도가액 − 필요경비 − 양도차익 (§166 단계별 의제 구조상 파트 합과 다름). 분할 표시는 인가전(§166③ 환산 또는 실가)·인가후(권리가액 의제)·청산금(청산금 의제)";
      acqItem.legalBasis = isRightSubject ? "소득세법 시행령 §166①③ · §163" : "소득세법 시행령 §166③ · §163";
    }
    acqItem.note = undefined;
    acqItem.perAsset = buildRedevPerAssetForAcquisition(redev, subject, settlementDirection);
  }

  // 필요경비 — 개산공제(§163⑥, 인가전만)
  const expItem = items.get("expenses");
  if (expItem) {
    expItem.value = redevBranchTotals(redev).expenses;
    expItem.formula = "분할별 필요경비 합 — 인가전 개산공제(§163⑥) + 인가후·청산금 분 필요경비";
    expItem.legalBasis = "소득세법 시행령 §163⑥";
    expItem.perAsset = buildRedevPerAssetForExpense(redev, subject, settlementDirection);
  }

  // 전체 양도차익 — 합계는 기존 result.transferGain 유지
  const gainItem = items.get("transferGain");
  if (gainItem) {
    if (isRightReceive) {
      gainItem.formula = "입주권 §166①2호 분할별 양도차익 합 = 인가전(나목 축소) + 청산금(가목)";
      gainItem.legalBasis = "소득세법 시행령 §166①2호 가목·나목";
    } else {
      gainItem.formula = isRightSubject
        ? "입주권 §166①1호 분할별 양도차익 합 = 인가전 + 인가후·청산금"
        : "재개발 §166 분할별 양도차익 합 = 인가전 + 인가후 기존건물분 + 청산금 분";
      gainItem.legalBasis = isRightSubject ? "소득세법 시행령 §166①1호" : "소득세법 시행령 §166①·②";
    }
    gainItem.perAsset = buildRedevPerAssetForGrossGain(redev, subject, settlementDirection);
  }

  // 과세대상 양도차익 — 합계 result.taxableGain 유지 (1세대1주택 12억 안분 등은 합계 단계에서 처리)
  const taxableItem = items.get("taxableGain");
  if (taxableItem) {
    taxableItem.perAsset = buildRedevPerAssetForGain(redev, subject, settlementDirection);
  }

  // 장기보유특별공제 — 분할별 lthdRate 상이
  const ltItem = items.get("ltDeduction");
  if (ltItem) {
    if (isRightReceive) {
      ltItem.formula = "§95② 본문 괄호 + §166⑤1호 — 인가전(나목) 분만 LTHD 적용. 청산금(가목) 분 LTHD=0 (§94①2호)";
      ltItem.legalBasis = "소득세법 §95② 단서 · §94①2호 · 시행령 §166⑤1호 · §166①2호 가목";
    } else {
      ltItem.formula = isRightSubject
        ? "§95② 본문 괄호 + §166⑤1호 — 인가전 분만 LTHD 적용 (취득일~인가일 기산). 인가후·청산금 분 LTHD=0"
        : "재개발 §166⑤ 분할별 보유기간·율 — 인가전·인가후 기존건물분(취득일 기산) + 청산금분(인가일 기산)";
      ltItem.legalBasis = isRightSubject
        ? "소득세법 §95② 단서 · §94①2호 · 시행령 §166⑤1호"
        : "소득세법 §95② · 시행령 §166⑤";
    }
    ltItem.perAsset = buildRedevPerAssetForLthd(redev, subject, settlementDirection);
  }

  // 보유분/거주분 — 재개발은 분할별 표1·표2 적용으로 보유/거주 분리 미적용
  const ltHoldItem = items.get("ltHoldingPart");
  if (ltHoldItem) {
    ltHoldItem.note = "재개발은 분할별 표1·표2 적용 — 보유/거주 분리 미적용";
    ltHoldItem.perAsset = undefined;
  }
  const ltResItem = items.get("ltResidencePart");
  if (ltResItem) {
    ltResItem.note = "재개발은 분할별 표1·표2 적용 — 보유/거주 분리 미적용";
    ltResItem.perAsset = undefined;
  }

  // 양도소득금액 — 합계 기존 유지
  const incomeItem = items.get("incomeAmount");
  if (incomeItem) {
    incomeItem.formula = "재개발 §166 분할별 (양도차익 − LTHD) 합 (음수 시 0)";
    incomeItem.legalBasis = "소득세법 §95①";
    incomeItem.perAsset = buildRedevPerAssetForIncome(redev, subject, settlementDirection);
  }

  applyLthdExclusionOverride(items, lthdExclusionReason);
}

/**
 * §95② 배제 시 장특공제 행을 **사유로 덮는다** — 분할별 산식은 이때 의미가 없다.
 *
 * 일반 경로(`buildLthdFallbackFormulas`)와 **같은 라벨 소스**(`LTHD_EXCLUSION_LABEL`)를 쓴다.
 * 문구를 따로 쓰면 같은 배제가 화면 두 곳에서 다르게 읽힌다.
 */
function applyLthdExclusionOverride(
  items: Map<string, StatementItem>,
  reason: LthdExclusionReason | undefined,
): void {
  if (!reason) return;
  const ltItem = items.get("ltDeduction");
  if (!ltItem) return;

  const label = LTHD_EXCLUSION_LABEL[reason];
  ltItem.formula = `0 — ${label}`;
  ltItem.legalBasis = "소득세법 §95② 본문 괄호 · §104⑦";
  // 분할별 값도 전부 0이므로 「분할별 산식」을 남기면 0%가 보유기간 탓으로 읽힌다.
  ltItem.perAsset = undefined;
}

