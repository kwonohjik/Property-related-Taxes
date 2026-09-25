/**
 * 주식 양도소득세 — Step 1 **국내주식 본체** Validation (800줄 정책 분리)
 *
 * `stock-transfer-tax-validate.ts`에서 `validateStep1`의 국내 본문을 추출했다.
 * 해외주식(`foreign_stock`)은 `-foreign.ts`, 국외전출세(`exit_tax`)는 `-exit.ts`가 갖는다 —
 * Step 2가 이미 `-step2.ts`로 같은 규약을 쓰고 있어 그것을 그대로 따랐다.
 *
 * 🔑 **호출 조건**: 본 파일은 `marketType`이 `foreign_stock`·`exit_tax`가 **아닐 때만** 불린다.
 *    종목명·시장 분류 같은 전 시장 공통 검증은 분리 전과 같이 디스패처가 먼저 수행한다.
 *
 * 🔑 작은 헬퍼(`parseF`·`parseI`·`isEmpty`)는 이 저장소의 분리 규약대로 **로컬 사본**이다
 *    (`-step2.ts`도 같다). 타입만 본 파일에서 가져온다 — 순환 import가 되지 않는 방향이다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockValidationError } from "./stock-transfer-tax-validate";
import {
  judgeBlockShareholderGate,
  BLOCK_SHAREHOLDER_REQUIREMENT_LABEL,
} from "@/lib/tax-engine/stock-transfer/block-shareholder-gate";

function parseF(s: string): number {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseI(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

function isEmpty(s: string | undefined): boolean {
  return !s || s.trim() === "";
}

/**
 * 분할 모드 시계열 검증 — **매도일 현재 보유하지 않은 주식은 그 매도의 원가가 될 수 없다**.
 *
 * 종전에는 총수량만 봤다(`totalTrn > totalAcq`). 그래서 매도일보다 **나중에** 취득한 lot이
 * 소진돼 보유일수가 음수가 되고, `isShortTerm`이 참이 되어 세율까지 갈리는데 경고조차 없었다.
 * 단건 모드는 이미 「양도일이 취득일보다 이전」을 막고 있어 두 모드가 갈려 있었다.
 * 형제 경로(부동산 `transfer-tax-validate-asset.ts`)도 같은 규칙을 갖고 있다.
 *
 * 두 검사로 나눈 이유 — **자본조정(무상증자) 때문이다**:
 *  · 존재 검사는 희석과 무관하므로 **항상** 건다(그 매도 이전에 취득한 lot이 아예 없다).
 *  · 누적 수량 검사는 매수 수량이 희석 **전** 단위라 무상증자 시 정당하게 초과할 수 있어
 *    기존 총수량 검사와 같은 기준으로 면제한다(엔진 `allocateLots`의 경고가 백스톱).
 */
function pushLotTimelineErrors(
  form: StockTransferFormData,
  errors: StockValidationError[],
): void {
  const buys = (form.acquisitionLots || [])
    .filter((l) => !isEmpty(l.acquisitionDate) && parseI(l.shareCount) > 0)
    .map((l) => ({ time: new Date(l.acquisitionDate).getTime(), shares: parseI(l.shareCount) }));
  // lots-only 모드(매수 다건 · 매도 단건)는 `transferLots`가 비어 있고 폼-전역 양도일 1건뿐이다.
  const saleForms = (form.transferLots || []).length > 0
    ? (form.transferLots || []).map((l) => ({ date: l.transferDate, shareCount: l.shareCount }))
    : [{ date: form.transferDate, shareCount: form.shareCount }];
  const sales = saleForms
    .map((l, i) => ({
      index: i,
      time: isEmpty(l.date) ? NaN : new Date(l.date).getTime(),
      shares: parseI(l.shareCount),
    }))
    .filter((s) => Number.isFinite(s.time) && s.shares > 0);
  if (buys.length === 0 || sales.length === 0) return;
  const isSynthSingleSale = (form.transferLots || []).length === 0;

  const hasCapitalAdj = !!(form.capitalAdjustments && form.capitalAdjustments.length > 0);
  let cumulativeSold = 0;
  for (const sale of [...sales].sort((a, b) => a.time - b.time)) {
    const availableShares = buys
      .filter((b) => b.time <= sale.time)
      .reduce((s, b) => s + b.shares, 0);
    cumulativeSold += sale.shares;
    const label = isSynthSingleSale ? "양도일" : `매도 lot #${sale.index + 1}`;
    if (availableShares === 0) {
      errors.push({
        field: isSynthSingleSale ? "transferDate" : `transferLots[${sale.index}].transferDate`,
        message: `${label}: 이 양도일 이전에 취득한 매수 lot이 없습니다. 일자를 확인하세요`,
        severity: "error",
      });
      continue;
    }
    if (!hasCapitalAdj && cumulativeSold > availableShares) {
      errors.push({
        field: isSynthSingleSale ? "shareCount" : `transferLots[${sale.index}].shareCount`,
        message: `${label}: 이 양도일까지 누적 매도(${cumulativeSold})가 그 시점 보유 수량(${availableShares})을 초과합니다. 매도일 이후 취득한 주식은 그 매도의 취득원가가 될 수 없습니다`,
        severity: "error",
      });
    }
  }
}

/** Step 1 국내주식 본체 — 대주주·기타자산·취득원인·일자·수량·lot 시계열. */
export function validateStep1Domestic(form: StockTransferFormData): StockValidationError[] {
  const errors: StockValidationError[] = [];

  // 기타자산: 과점주주 or 부동산과다보유 최소 1개 필수
  if (form.marketType === "other_asset") {
    if (!form.isQualifyingBlockShareholder && !form.isHeavyRealEstateForRate) {
      errors.push({
        field: "otherAsset",
        message: "기타자산은 §94①4 다목(과점주주) 또는 라목(부동산과다보유법인) 중 하나 이상 해당해야 합니다",
        severity: "error",
      });
    }
  }

  // 대주주 판정 기준일 — 판정 대상 시장에서 필수 (시행령 §157④ "직전 사업연도 종료일 현재")
  // FieldCard는 이미 required로 표시하고 있었으나 검증이 없어 표시/검증이 어긋나 있었다.
  // 미입력을 통과시키면 API가 오늘 날짜로 채워 과거 양도 건에 현재 임계를 적용한다.
  if (
    form.marketType === "kospi" ||
    form.marketType === "kosdaq" ||
    form.marketType === "konex" ||
    form.marketType === "unlisted"
  ) {
    if (isEmpty(form.priorYearEndDate)) {
      errors.push({
        field: "priorYearEndDate",
        message: "대주주 판정 기준일(직전 사업연도 종료일)을 입력하세요 (시행령 §157④)",
        severity: "error",
      });
    }
  }

  // 대주주 판정 — 지분·시총 최소 1개 입력 필요
  if (form.isMajorShareholder) {
    const hasAny =
      parseF(form.selfShareRatio) > 0 ||
      parseI(form.selfMarketCap) > 0 ||
      parseF(form.combinedShareRatio) > 0 ||
      parseI(form.combinedMarketCap) > 0;
    if (!hasAny) {
      errors.push({
        field: "majorShareholder",
        message: "대주주인 경우 지분율 또는 시가총액을 1개 이상 입력하세요 (시행령 §157)",
        severity: "error",
      });
    }
  }

  // F-15·F-16 (2026-05-19) — 대차/사모펀드 자동 가산 입력 검증 (비음수 정수)
  const lentRaw = form.lentSharesCount?.trim();
  if (lentRaw && lentRaw !== "" && lentRaw !== "0") {
    const lent = parseI(form.lentSharesCount);
    if (!Number.isFinite(lent) || lent < 0) {
      errors.push({
        field: "lentSharesCount",
        message: "대차주식 수는 0 이상 정수여야 합니다 (시행령 §157 2013.2.15.~)",
        severity: "error",
      });
    }
  }
  const pefRaw = form.pefIndirectSharesCount?.trim();
  if (pefRaw && pefRaw !== "" && pefRaw !== "0") {
    const pef = parseI(form.pefIndirectSharesCount);
    if (!Number.isFinite(pef) || pef < 0) {
      errors.push({
        field: "pefIndirectSharesCount",
        message: "사모펀드 간접소유 주식 수는 0 이상 정수여야 합니다 (시행령 §157 2013.2.15.~)",
        severity: "error",
      });
    }
  }

  // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override 검증
  // basis 가 default 가 아니면 override 일자 필수
  if (form.judgmentBasis && form.judgmentBasis !== "default") {
    if (!form.judgmentDateOverride || !/^\d{4}-\d{2}-\d{2}$/.test(form.judgmentDateOverride)) {
      errors.push({
        field: "judgmentDateOverride",
        message:
          "특수 판정 사유(합병/분할/신설법인)를 선택한 경우 기준일자가 필요합니다 " +
          "(합병등기일·분할등기일·설립등기일 등)",
        severity: "error",
      });
    }
  }
  // override 일자만 입력하고 basis 가 default 이면 효과 없음 — 경고
  if (form.judgmentDateOverride && (!form.judgmentBasis || form.judgmentBasis === "default")) {
    errors.push({
      field: "judgmentBasis",
      message: "판정 기준일 override 일자를 사용하려면 사유(합병/분할/신설법인)를 선택하세요",
      severity: "warning",
    });
  }

  // 분할 매수·분할 양도 모드 분기 (Plan v2.2) — 폼-전역 acquisitionDate/transferDate는 single 한정
  const lotsMode = form.lotsMode || "single";

  if (lotsMode === "single") {
    // 취득일 필수
    if (isEmpty(form.acquisitionDate)) {
      errors.push({ field: "acquisitionDate", message: "취득일을 입력하세요", severity: "error" });
    }
    // 양도일 필수
    if (isEmpty(form.transferDate)) {
      errors.push({ field: "transferDate", message: "양도일을 입력하세요", severity: "error" });
    }
    // 양도일 < 취득일 — 음수 보유기간
    if (!isEmpty(form.acquisitionDate) && !isEmpty(form.transferDate)) {
      const acqDate = new Date(form.acquisitionDate);
      const trnDate = new Date(form.transferDate);
      if (trnDate < acqDate) {
        errors.push({
          field: "transferDate",
          message: "양도일이 취득일보다 이전입니다. 일자를 확인하세요",
          severity: "error",
        });
      }
    }
  }

  // 주식수 필수 검증 — single 모드 한정 (split 모드는 lot 배열로 대체)
  if (lotsMode === "single") {
    if (isEmpty(form.shareCount) || parseI(form.shareCount) <= 0) {
      errors.push({ field: "shareCount", message: "양도 주식수를 입력하세요", severity: "error" });
    }
  } else {
    // split 모드 검증
    if (!form.acquisitionLots || form.acquisitionLots.length === 0) {
      errors.push({ field: "acquisitionLots", message: "매수 lot을 1행 이상 입력하세요", severity: "error" });
    }
    if (!form.transferLots || form.transferLots.length === 0) {
      errors.push({ field: "transferLots", message: "매도 lot을 1행 이상 입력하세요", severity: "error" });
    }
    // lot별 검증
    (form.acquisitionLots || []).forEach((lot, i) => {
      if (isEmpty(lot.acquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].acquisitionDate`, message: `매수 lot #${i + 1}의 취득일을 입력하세요`, severity: "error" });
      }
      if (parseI(lot.shareCount) <= 0) {
        errors.push({ field: `acquisitionLots[${i}].shareCount`, message: `매수 lot #${i + 1}의 주식수는 0보다 커야 합니다`, severity: "error" });
      }
      if (parseI(lot.perShareAcquisitionPrice) <= 0) {
        errors.push({ field: `acquisitionLots[${i}].perShareAcquisitionPrice`, message: `매수 lot #${i + 1}의 1주당 단가는 0보다 커야 합니다 (C-22)`, severity: "error" });
      }
      if (lot.acquisitionCause === "inheritance" && isEmpty(lot.decedentAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].decedentAcquisitionDate`, message: `매수 lot #${i + 1} (상속): 피상속인 취득일을 입력하세요 (§104②1)`, severity: "error" });
      }
      if (lot.acquisitionCause === "carryover_gift" && isEmpty(lot.donorAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].donorAcquisitionDate`, message: `매수 lot #${i + 1} (이월과세): 증여자 취득일을 입력하세요 (§104②2)`, severity: "error" });
      }
      // §97의2① 본문 요건 — 미선택이면 엔진이 「배제하지 않음」으로 흘려보낸다(단건과 같은 규약).
      if (lot.acquisitionCause === "carryover_gift" && isEmpty(lot.donorRelation)) {
        errors.push({ field: `acquisitionLots[${i}].donorRelation`, message: `매수 lot #${i + 1} (이월과세): 증여자와의 관계를 선택하세요 (§97의2① 본문)`, severity: "error" });
      }
      // 승계 효과가 0이면 ②3호로 배제된다 — 차단이 아니라 경고다.
      if (lot.acquisitionCause === "carryover_gift" && isEmpty(lot.donorAcquisitionPrice)) {
        errors.push({ field: `acquisitionLots[${i}].donorAcquisitionPrice`, message: `매수 lot #${i + 1} (이월과세): 증여자 취득가액이 없으면 취득가액이 승계되지 않습니다 (§97의2①1호)`, severity: "warning" });
      }
      /**
       * ①3호 증여세는 **산출세액과 과세가액이 짝**이다 — 영 §163의2②가 둘의 비율로 안분하므로
       * 한쪽만 있으면 계산되지 않고 조용히 0이 된다(단건 축의 안분 3종 짝 규칙과 같다).
       * 분자(양도한 자산가액)는 엔진이 매도 주식수 × 증여 당시 평가액으로 구한다.
       */
      if (lot.acquisitionCause === "carryover_gift") {
        const hasGiftTax = parseI(lot.donorGiftTaxAmount ?? "") > 0;
        const hasGiftBase = parseI(lot.donorGiftTaxableValue ?? "") > 0;
        if (hasGiftTax !== hasGiftBase) {
          errors.push({
            field: `acquisitionLots[${i}].donorGiftTaxableValue`,
            message: `매수 lot #${i + 1} (이월과세): 증여세 산출세액과 과세가액을 함께 입력하세요 (영 §163의2② 안분)`,
            severity: "error",
          });
        }
      }
      if (lot.acquisitionCause === "merger_split" && isEmpty(lot.preMergerAcquisitionDate)) {
        errors.push({ field: `acquisitionLots[${i}].preMergerAcquisitionDate`, message: `매수 lot #${i + 1} (합병·분할): 종전 주식 취득일을 입력하세요 (§104②3)`, severity: "error" });
      }
    });
    (form.transferLots || []).forEach((lot, i) => {
      if (isEmpty(lot.transferDate)) {
        errors.push({ field: `transferLots[${i}].transferDate`, message: `매도 lot #${i + 1}의 양도일을 입력하세요`, severity: "error" });
      }
      if (parseI(lot.shareCount) <= 0) {
        errors.push({ field: `transferLots[${i}].shareCount`, message: `매도 lot #${i + 1}의 주식수는 0보다 커야 합니다`, severity: "error" });
      }
      if (parseI(lot.perShareTransferPrice) <= 0) {
        errors.push({ field: `transferLots[${i}].perShareTransferPrice`, message: `매도 lot #${i + 1}의 1주당 단가는 0보다 커야 합니다 (C-23)`, severity: "error" });
      }
    });
    // 매도 ≤ 매수
    const totalAcq = (form.acquisitionLots || []).reduce((s, l) => s + parseI(l.shareCount), 0);
    const totalTrn = (form.transferLots || []).reduce((s, l) => s + parseI(l.shareCount), 0);
    if (totalTrn > totalAcq) {
      errors.push({ field: "transferLots", message: `총 매도 수량(${totalTrn})이 총 매수 수량(${totalAcq})을 초과합니다`, severity: "error" });
    }
    // specific 매칭 검증
    const costMethod = form.costAllocationMethod || "fifo";
    if (costMethod === "specific") {
      (form.transferLots || []).forEach((trn, i) => {
        const matchedSum = (form.specificMatchings || [])
          .filter((m) => m.transferLotId === trn.id)
          .reduce((s, m) => s + parseI(m.shareCount), 0);
        if (matchedSum !== parseI(trn.shareCount)) {
          errors.push({
            field: `specificMatchings`,
            message: `매도 lot #${i + 1}의 매칭 합계(${matchedSum})가 매도 수량(${trn.shareCount})과 다릅니다 (C-20)`,
            severity: "error",
          });
        }
      });
      (form.acquisitionLots || []).forEach((acq, i) => {
        const matchedSum = (form.specificMatchings || [])
          .filter((m) => m.acquisitionLotId === acq.id)
          .reduce((s, m) => s + parseI(m.shareCount), 0);
        if (matchedSum > parseI(acq.shareCount)) {
          errors.push({
            field: `specificMatchings`,
            message: `매수 lot #${i + 1}에 매칭된 합계(${matchedSum})가 lot 수량(${acq.shareCount})을 초과합니다 (C-20b)`,
            severity: "error",
          });
        }
      });
    }
  }

  // 매수 lot 시계열 — 분할 모드·lots-only 모드 양쪽에 건다(매도 축의 형태만 다르다)
  pushLotTimelineErrors(form, errors);

  // 발행주식총수 필수
  if (isEmpty(form.totalIssuedShares) || parseI(form.totalIssuedShares) <= 0) {
    errors.push({ field: "totalIssuedShares", message: "발행주식 총수를 입력하세요", severity: "error" });
  }

  // 지분율 입력 모드 — shares 모드 시 분자 필수 + 분자 ≤ 분모 (3중 패턴: mode || "direct")
  const selfMode = form.selfShareRatioMode || "direct";
  if (selfMode === "shares") {
    if (isEmpty(form.selfOwnedShares) || parseI(form.selfOwnedShares) < 0) {
      errors.push({
        field: "selfOwnedShares",
        message: "본인 보유 주식수를 입력하세요",
        severity: "error",
      });
    } else if (
      !isEmpty(form.totalIssuedShares) &&
      parseI(form.selfOwnedShares) > parseI(form.totalIssuedShares)
    ) {
      errors.push({
        field: "selfOwnedShares",
        message: "본인 보유 주식수가 총 발행주식수를 초과합니다",
        severity: "error",
      });
    }
  }
  const combinedMode = form.combinedShareRatioMode || "direct";
  if (form.isLargestShareholderGroup && combinedMode === "shares") {
    if (isEmpty(form.combinedOwnedShares) || parseI(form.combinedOwnedShares) < 0) {
      errors.push({
        field: "combinedOwnedShares",
        message: "본인+특수관계인 합산 보유 주식수를 입력하세요",
        severity: "error",
      });
    } else if (
      !isEmpty(form.totalIssuedShares) &&
      parseI(form.combinedOwnedShares) > parseI(form.totalIssuedShares)
    ) {
      errors.push({
        field: "combinedOwnedShares",
        message: "합산 보유 주식수가 총 발행주식수를 초과합니다",
        severity: "error",
      });
    }
  }

  // 취득원인 보조 일자 검증 (3중 패턴: acquisitionCause || "purchase")
  const acquisitionCause = form.acquisitionCause || "purchase";
  if (acquisitionCause === "inheritance" && isEmpty(form.decedentAcquisitionDate)) {
    errors.push({
      field: "decedentAcquisitionDate",
      message: "상속의 경우 피상속인 취득일을 입력하세요 (§104②1 — 단기 30% 기산점)",
      severity: "error",
    });
  }
  if (acquisitionCause === "carryover_gift") {
    if (isEmpty(form.donorAcquisitionDate)) {
      errors.push({
        field: "donorAcquisitionDate",
        message: "이월과세(증여)의 경우 증여자 취득일을 입력하세요 (§104②2 — 단기 30% 기산점)",
        severity: "error",
      });
    }
    /**
     * §97의2① **본문 요건**이라 필수다 — 배우자·직계존비속이 아니면 애초에 대상이 아니고,
     * 사망 여부에 따라 적용이 갈린다. 미선택이면 엔진이 「배제하지 않음」으로 흘려보내므로
     * 여기서 막지 않으면 사용자가 모른 채 적용받는다.
     */
    if (isEmpty(form.donorRelation)) {
      errors.push({
        field: "donorRelation",
        message: "이월과세(증여)의 경우 증여자와의 관계를 선택하세요 (§97의2① 본문)",
        severity: "error",
      });
    }
    /**
     * ⚠️ **취득가액·증여세는 필수가 아니다** — 증여자 실지거래가액을 확인할 수 없으면
     * §97①1호 **나목**(환산)으로 가고, 증여세가 없을 수도 있다. API zod도 전부 optional이라
     * 두 계층 기준이 같다(⑧⑩ 정합 — 한쪽만 조이면 「UI 통과 → API 400」이 된다).
     *
     * 다만 **둘 다 비면 승계 효과가 0**이라 §97의2②3호로 배제되는 것이 보통이다.
     * 그 사실은 결과 카드가 알린다(사전 차단하지 않는다 — 법 근거 없이 입력을 막지 않는다).
     */
    const hasDonorBasis =
      !isEmpty(form.donorAcquisitionPrice) || !isEmpty(form.donorAcquisitionStdPrice);
    if (!hasDonorBasis) {
      errors.push({
        field: "donorAcquisitionPrice",
        message:
          "증여자 취득가액 또는 증여자 취득 당시 기준시가 중 하나를 입력하세요 " +
          "(§97의2①1호 — 없으면 취득가액이 승계되지 않아 이월과세가 배제됩니다)",
        severity: "warning",
      });
    }
    // 영 §163의2② 안분 — 증여세를 넣었으면 분자·분모가 함께 있어야 계산된다.
    if (!isEmpty(form.giftTaxAmount)) {
      if (isEmpty(form.transferredAssetValue) || isEmpty(form.giftTaxableValue)) {
        errors.push({
          field: "giftTaxableValue",
          message:
            "증여세 산출세액을 입력했다면 양도한 해당 자산가액과 증여세 과세가액도 입력하세요 " +
            "(영 §163의2② 안분 분자·분모)",
          severity: "error",
        });
      }
    }
  }
  if (acquisitionCause === "merger_split" && isEmpty(form.preMergerAcquisitionDate)) {
    errors.push({
      field: "preMergerAcquisitionDate",
      message: "합병·분할의 경우 종전 주식 취득일을 입력하세요 (§104②3)",
      severity: "error",
    });
  }

  // 3년 누적 양도 비율 > 100 금지 (UI는 % 단위, "100" = 100%)
  const cumRatio = parseF(form.cumulativeTransferRatio);
  if (form.cumulativeTransferRatio && cumRatio > 100) {
    errors.push({
      field: "cumulativeTransferRatio",
      message: "3년 누적 양도 비율은 100%를 초과할 수 없습니다",
      severity: "error",
    });
  }

  // ── §94①4 다목 요건 4칸 (영 §158①②) — ⑫ Zod 와 3중 패턴 ──────────────
  //
  // 🔑 **미입력은 차단한다.** 다목 토글 ON 은 적극적 선언이므로 요건 수치를 요구한다.
  //    (형제 `nblRatioOfCorpAssets` 는 «미입력 = 미해당» — 그쪽은 적용이 **불리**해서다.)
  if (form.isQualifyingBlockShareholder) {
    const ratioFields: Array<[keyof StockTransferFormData, string]> = [
      ["blockShareholderRealEstateRatio", "법인 자산총액 중 부동산등 비율"],
      ["blockShareholderOwnershipRatio", "과점주주 소유비율"],
      ["cumulativeTransferRatio", "소급 3년 누적 양도비율"],
    ];
    for (const [key, label] of ratioFields) {
      const raw = form[key];
      if (isEmpty(typeof raw === "string" ? raw : "")) {
        errors.push({
          field: key as string,
          message: `§94①4 다목(과점주주)을 선택하면 «${label}»을 입력하세요 (영 §158①②)`,
          severity: "error",
        });
      } else if (parseF(typeof raw === "string" ? raw : "") > 100) {
        errors.push({
          field: key as string,
          message: `«${label}»은 100%를 초과할 수 없습니다`,
          severity: "error",
        });
      }
    }
    if (isEmpty(form.aggregationFirstTransferDate)) {
      errors.push({
        field: "aggregationFirstTransferDate",
        message:
          "§94①4 다목(과점주주)을 선택하면 «합산기간 최초 양도일»을 입력하세요 " +
          "(영 §158② — 소급 3년 창 판정 + 요건①② 기준일)",
        severity: "error",
      });
    }

    /**
     * 영 §158② 기신고분 합산 축 — **음수·비수치 차단**.
     *
     * 🔑 **미입력은 오류가 아니다** — 여러 번에 걸쳐 양도한 경우에만 값이 생긴다.
     *    (다목 토글 ON 이어도 1회 양도만으로 요건③을 채울 수 있다.)
     *    ④ API 는 `> 0` 일 때만 body 에 싣고 엔진은 `Math.max(0, …)` 로 받는다 —
     *    **세 층이 같은 규약**이다([[feedback_mirror_pattern]]).
     */
    const priorAmountFields: Array<[keyof StockTransferFormData, string]> = [
      ["priorTransferPrice", "기신고분 양도가액"],
      ["priorAcquisitionPrice", "기신고분 취득가액"],
      ["priorExpenses", "기신고분 필요경비"],
      ["priorShareCount", "기신고분 주식수"],
    ];
    for (const [key, label] of priorAmountFields) {
      const raw = form[key];
      const str = typeof raw === "string" ? raw : "";
      if (isEmpty(str)) continue;
      const n = parseF(str);
      if (!Number.isFinite(n) || n < 0) {
        errors.push({
          field: key as string,
          message: `«${label}»은 0 이상의 숫자여야 합니다 (영 §158②)`,
          severity: "error",
        });
      }
    }

    // 요건 판정은 **엔진 leaf 단일 소스**에 위임한다 — 임계(양도일 종속 「초과/이상」)를
    // 여기서 다시 쓰면 판정이 두 벌이 된다.
    const transferDate = form.transferDate ? new Date(form.transferDate) : undefined;
    const firstDate = form.aggregationFirstTransferDate
      ? new Date(form.aggregationFirstTransferDate)
      : undefined;
    if (transferDate && !Number.isNaN(transferDate.getTime()) && firstDate) {
      const gate = judgeBlockShareholderGate({
        realEstateRatio: parseF(form.blockShareholderRealEstateRatio) * 0.01,
        ownershipRatio: parseF(form.blockShareholderOwnershipRatio) * 0.01,
        cumulativeTransferRatio: parseF(form.cumulativeTransferRatio) * 0.01,
        firstTransferDate: firstDate,
        transferDate,
      });
      if (!gate.passed) {
        const labels = gate.failed
          .map((r) => BLOCK_SHAREHOLDER_REQUIREMENT_LABEL[r])
          .join(" · ");
        if (form.marketType === "other_asset" && !form.isHeavyRealEstateForRate) {
          // 돌아갈 곳이 없다 — 시장·대주주 정보가 애초에 입력되지 않는다(Step1 이 숨긴다).
          errors.push({
            field: "marketType",
            message:
              `§94①4 다목 요건 미충족(${labels}) — ` +
              "시장 유형에서 상장·비상장을 선택해 §94①3호(주식) 세율로 계산하세요.",
            severity: "error",
          });
        } else {
          // §94①3호 시장이면 **폴백 가능**하다 — 차단하지 않고 안내만 한다.
          errors.push({
            field: "isQualifyingBlockShareholder",
            message:
              `§94①4 다목 요건 미충족(${labels}) — 기타자산이 아니라 §94①3호(주식) 세율로 계산됩니다.`,
            severity: "warning",
          });
        }
      }
    }
  }

  // §104①9호 비사업용토지 가액 비율 > 100 금지 (Zod가 0~1 소수로 max(1)을 걸므로 UI에서도 동일 상한)
  // ⚠️ **미입력은 오류가 아니다** — 9호 미해당으로 흐른다(법 근거 없이 불리 적용 금지).
  //    API·엔진도 같은 fallback이라 3중이 일치한다(memory `mirror-pattern`).
  // ⚠️ `parseF`는 `s.replace`를 부르므로 **가드를 먼저** 건다 — 이 필드는 신규라
  //   normalize를 거치지 않은 폼(레거시 sessionStorage·테스트 픽스처)에서 `undefined`일 수 있다.
  //   (형제 `cumulativeTransferRatio`는 선행 필드라 항상 존재해 가드 순서가 문제되지 않았다.)
  if (form.nblRatioOfCorpAssets && parseF(form.nblRatioOfCorpAssets) > 100) {
    errors.push({
      field: "nblRatioOfCorpAssets",
      message: "비사업용토지 가액 비율은 100%를 초과할 수 없습니다",
      severity: "error",
    });
  }

  return errors;
}
