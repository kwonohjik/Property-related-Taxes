/**
 * 재개발/재건축 신고서 양식 표 — 행 생성 헬퍼
 *
 * FilingFormTableHelpers.ts 에서 분리 (800줄 정책 준수).
 * subject="right" + settlementDirection="pay" 케이스의 3열 모드 포함.
 *
 * 열 구조:
 *   - redev-4split (apt 또는 right+receive):
 *       합계 / ① 인가전 / ② 인가후 기존건물분 / ③ 청산금 분
 *   - redev-right-pay (right+pay):
 *       합계 / ① 인가전 / ② 인가후 (= §166⑤1호 청산금 납부분)
 *       ※ postApprovalExistingHouse는 §95② 단서에 의해 LTHD 대상 양도차익 부존재(gain=0)
 *         → settlement 열에 합산하여 "인가후" 단일 열로 표시
 */

import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { RedevelopmentBranchDetail } from "@/lib/tax-engine/types/transfer.types";
import { fmtDate, holdingPeriodFromDates } from "./FilingFormTableHelpers";

// ── 내부 타입 ────────────────────────────────────────────────────

type SetNum = (rowKey: string, col: string, n: number | null) => void;
type SetStr = (rowKey: string, col: string, s: string) => void;
type SetRoseNote = (rowKey: string, col: string, note: string) => void;

// ── 공용 포맷 헬퍼 ───────────────────────────────────────────────

export function fmtD(d?: Date | string): string {
  if (!d) return "-";
  const iso = typeof d === "string" ? d : d instanceof Date ? d.toISOString() : "";
  return iso ? fmtDate(iso.slice(0, 10)) : "-";
}

export function fmtMonths(m?: number, d?: number): string {
  if (m === undefined || m <= 0) return "-";
  return `${Math.floor(m / 12)}년 ${m % 12}개월${d && d > 0 ? ` ${d}일` : ""}`;
}

const toIsoSlice = (d?: Date | string): string | undefined =>
  d ? (typeof d === "string" ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)) : undefined;

/**
 * 분기 열의 보유기간 — **그 열에 표시된 취득일자·양도일자의 연·월 차이**(2026-07-29 확정 규약).
 * 신고서 양식 전 표(합계·토지·건물·겸용 4열·자산 합산) 단일 규약이다.
 *
 * 엔진 `holdingMonths`(LTHD 산정용 만-개월 절사)를 그대로 쓰지 않는다 — 표시 일자와 어긋난다
 * (사례 37: 2007-04-09~2014-10-23 → 엔진 만 7년 vs 표시 7년 6월).
 * 일자가 없으면 종전대로 엔진 값으로 폴백.
 */
function branchHoldingPeriod(b: RedevelopmentBranchDetail): string {
  const s = holdingPeriodFromDates(toIsoSlice(b.branchAcqDate), toIsoSlice(b.branchTransferDate));
  return s !== "-" ? s : fmtMonths(b.holdingMonths, b.holdingDays);
}

// ── 4분할 모드 (apt 또는 right+receive) ─────────────────────────

/**
 * redev-4split 모드 — 3개 엔진 분기 각 열에 직접 매핑.
 * 기존 branches ["preApproval", "postApprovalExistingHouse", "settlement"] → 각 열 키.
 */
export function fillRedev4SplitBranchData(
  r: NonNullable<TransferTaxResult["redevelopmentDetail"]>,
  setNum: SetNum,
  setStr: SetStr,
  setRoseNote?: SetRoseNote,
): void {
  const branches: Array<[string, RedevelopmentBranchDetail]> = [
    ["preApproval", r.preApproval],
    ["postApprovalExistingHouse", r.postApprovalExistingHouse],
    ["settlement", r.settlement],
  ];

  // 일자·기간
  for (const [key, b] of branches) {
    const hasMonths = (b.residenceMonths ?? 0) > 0;
    const ph = hasMonths ? "(개월수만 입력됨)" : "-";
    setStr("holdingPeriod", key, branchHoldingPeriod(b));
    setStr("acquisitionDate", key, fmtD(b.branchAcqDate));
    setStr("transferDate", key, fmtD(b.branchTransferDate));
    setStr("moveIn", key, b.residenceStartDate || ph);
    setStr("moveOut", key, b.residenceEndDate || ph);
    setStr("residencePeriod", key, fmtMonths(b.residenceMonths));
  }

  // 양도가액·취득가액
  for (const [key, b] of branches) {
    setNum("transferPrice", key, b.apportionedTransfer);
    setNum("acquisitionPrice", key, b.apportionedAcquisition);
  }

  // 필요경비 — 분기별 + 합계
  let totalExp = 0;
  for (const [key, b] of branches) {
    const ex = b.expenses ?? 0;
    setNum("expenses", key, ex);
    totalExp += ex;
  }
  setNum("expenses", "total", totalExp);

  // 양도차익(안분 전)·비과세·과세대상
  //
  // 🔴 §89①4호 청산금 비과세(사례 47)는 `settlement.gain`을 0으로 마스킹하고 그 금액을
  //   `exemptedGain`으로만 남긴다. 비과세 행이 `nontaxableGain`(12억 안분분)만 읽으면
  //   청산금 열이 「전체 175,000,000 = 비과세 105,000,000 + 과세대상 0」이 되어
  //   **70,000,000이 어느 금액 칸에도 나타나지 않는다**(붉은 주석 문장으로만 남았다).
  //   비과세로 처리된 금액이므로 비과세 행에 합산한다 — 세액 무영향(결과탭 코드리뷰 #025).
  const settlementExempted = r.settlementExemptionApplied === true ? (r.exemptedGain ?? 0) : 0;
  let tg = 0, eg = 0, xg = 0;
  for (const [key, b] of branches) {
    const tA = b.gainBeforeAllocation ?? b.gain;
    const eA = (b.nontaxableGain ?? 0) + (key === "settlement" ? settlementExempted : 0);
    setNum("transferGain", key, tA);
    setNum("exemptGain", key, eA);
    setNum("taxableGain", key, b.gain);
    tg += tA; eg += eA; xg += b.gain;
  }
  setNum("transferGain", "total", tg);
  setNum("exemptGain", "total", eg);
  setNum("taxableGain", "total", xg);

  // 장기보유특별공제 — 분기별 보유분/거주분
  let totalHolding = 0, totalResidence = 0;
  for (const [key, b] of branches) {
    setNum("ltDeduction", key, b.lthd);
    const hp = b.lthdHoldingPart ?? b.lthd;
    const rp = b.lthdResidencePart ?? 0;
    setNum("ltHoldingPart", key, hp);
    setNum("ltResidencePart", key, rp);
    totalHolding += hp;
    totalResidence += rp;
  }
  setNum("ltHoldingPart", "total", totalHolding);
  setNum("ltResidencePart", "total", totalResidence);

  // 양도소득금액·감면후 소득금액
  for (const [key, b] of branches) {
    const income = Math.max(0, b.gain - b.lthd);
    setNum("incomeAmount", key, income);
    setNum("incomeAmountAfter", key, income);
  }

  // §89①4호 비과세 차감 rose 주석 — settlementExemptionApplied=true 시만 청산금 열에 표시
  if (r.settlementExemptionApplied === true && setRoseNote) {
    const exemptedGain = r.exemptedGain ?? 0;
    const exemptedLthd = r.exemptedLthd ?? 0;
    if (exemptedGain > 0) {
      setRoseNote("transferGain", "settlement", `§89①4호 비과세 차감: ${exemptedGain.toLocaleString()}`);
    }
    if (exemptedLthd > 0) {
      setRoseNote("ltDeduction", "settlement", `§89①4호 비과세 LTHD 차감: ${exemptedLthd.toLocaleString()}`);
    }
  }
}

// ── right+receive 3열 모드 ───────────────────────────────────────────

/**
 * redev-right-receive 모드 — subject="right" + settlementDirection="receive".
 *
 * § 166①2호:
 *   - 나목: 입주권 분 양도차익 = floor(인가전raw × (권리가액 − 청산금) / 권리가액) — preApproval 열
 *   - 가목: 청산금 수령분 양도차익 = 청산금 − 안분 취득가 — settlement 열
 *
 * § 95② 단서: 청산금 수령분(가목)은 §94①2호(입주권 = 부동산 취득 권리) 범주 + 집행기준상
 * LTHD 배제. 현행 엔진 zeroBranch 보수적 적용 유지 (별도 법령해석 확보 전).
 *
 * 신고서 양식 표 컬럼:
 *   - "total": 합계
 *   - "preApproval": ① 입주권 분 (§166①2호 나목)
 *   - "settlement":  ② 청산금 분 (§166①2호 가목)
 *
 * 청산금 분(②) LTHD = 0 → §95② 단서 rose 배지로 시각화.
 */
export function fillRedevRightReceiveBranchData(
  r: NonNullable<TransferTaxResult["redevelopmentDetail"]>,
  setNum: SetNum,
  setStr: SetStr,
  setRoseNote?: SetRoseNote,
): void {
  const nakkok = r.preApproval;  // 나목 — 입주권 분 (축소 후)
  const gamok = r.settlement;    // 가목 — 청산금 수령 분

  // 일자·기간 — ① 입주권 분 (나목)
  {
    const hasMonths = (nakkok.residenceMonths ?? 0) > 0;
    const ph = hasMonths ? "(개월수만 입력됨)" : "-";
    setStr("holdingPeriod", "preApproval", branchHoldingPeriod(nakkok));
    setStr("acquisitionDate", "preApproval", fmtD(nakkok.branchAcqDate));
    setStr("transferDate", "preApproval", fmtD(nakkok.branchTransferDate));
    setStr("moveIn", "preApproval", nakkok.residenceStartDate || ph);
    setStr("moveOut", "preApproval", nakkok.residenceEndDate || ph);
    setStr("residencePeriod", "preApproval", fmtMonths(nakkok.residenceMonths));
  }

  // 일자·기간 — ② 청산금 분 (가목)
  // LTHD 보유기간 미적용(zeroBranch) → 보유기간 표시 불필요 ("-")
  setStr("holdingPeriod", "settlement", "-");
  setStr("acquisitionDate", "settlement", fmtD(gamok.branchAcqDate));
  setStr("transferDate", "settlement", fmtD(gamok.branchTransferDate));
  setStr("moveIn", "settlement", "-");
  setStr("moveOut", "settlement", "-");
  setStr("residencePeriod", "settlement", "-");

  // 양도가액·취득가액
  setNum("transferPrice", "preApproval", nakkok.apportionedTransfer);
  setNum("acquisitionPrice", "preApproval", nakkok.apportionedAcquisition);
  setNum("transferPrice", "settlement", gamok.apportionedTransfer);  // = 청산금 수령액
  setNum("acquisitionPrice", "settlement", gamok.apportionedAcquisition);  // = 안분 취득가

  // 필요경비
  const nakkokExp = nakkok.expenses ?? 0;
  const gamokExp = gamok.expenses ?? 0;
  setNum("expenses", "preApproval", nakkokExp);
  setNum("expenses", "settlement", gamokExp);
  setNum("expenses", "total", nakkokExp + gamokExp);

  // 양도차익(안분 전)·비과세·과세대상
  const nakkokTg = nakkok.gainBeforeAllocation ?? nakkok.gain;
  const gamokTg = gamok.gainBeforeAllocation ?? gamok.gain;
  const nakkokEg = nakkok.nontaxableGain ?? 0;
  const gamokEg = gamok.nontaxableGain ?? 0;

  setNum("transferGain", "preApproval", nakkokTg);
  setNum("exemptGain", "preApproval", nakkokEg);
  setNum("taxableGain", "preApproval", nakkok.gain);

  setNum("transferGain", "settlement", gamokTg);
  setNum("exemptGain", "settlement", gamokEg);
  setNum("taxableGain", "settlement", gamok.gain);

  setNum("transferGain", "total", nakkokTg + gamokTg);
  setNum("exemptGain", "total", nakkokEg + gamokEg);
  setNum("taxableGain", "total", nakkok.gain + gamok.gain);

  // 장기보유특별공제
  // ① 입주권 분 (나목): 정상 LTHD (취득일 ~ 관리처분 인가일, §166⑤1호 + 표1)
  const nakkokHp = nakkok.lthdHoldingPart ?? nakkok.lthd;
  const nakkokRp = nakkok.lthdResidencePart ?? 0;
  setNum("ltDeduction", "preApproval", nakkok.lthd);
  setNum("ltHoldingPart", "preApproval", nakkokHp);
  setNum("ltResidencePart", "preApproval", nakkokRp);

  // ② 청산금 분 (가목): LTHD = 0 (§95② 단서 — zeroBranch)
  setNum("ltDeduction", "settlement", 0);
  setNum("ltHoldingPart", "settlement", 0);
  setNum("ltResidencePart", "settlement", 0);
  // rose 배지 — 청산금 분 LTHD 행에 §95② 단서 배제 안내
  setRoseNote?.("ltDeduction", "settlement", "§95② 단서·§94①2호 — LTHD 대상 외");

  setNum("ltHoldingPart", "total", nakkokHp);
  setNum("ltResidencePart", "total", nakkokRp);

  // 양도소득금액·감면후 소득금액
  const nakkokIncome = Math.max(0, nakkok.gain - nakkok.lthd);
  const gamokIncome = Math.max(0, gamok.gain - 0); // LTHD=0

  setNum("incomeAmount", "preApproval", nakkokIncome);
  setNum("incomeAmountAfter", "preApproval", nakkokIncome);
  setNum("incomeAmount", "settlement", gamokIncome);
  setNum("incomeAmountAfter", "settlement", gamokIncome);
}

// ── right+land+pay 3열 모드 (사례 37) ────────────────────────────

/**
 * redev-right-land-pay 모드 — subject="right" + originalAssetType="land" + settlementDirection="pay".
 *
 * 토지 출자 §166③ 환산취득가 케이스 — landContribDetail echo 필드 소비.
 * 신고서 양식 표 컬럼:
 *   - "total": 합계
 *   - "preApproval": ① 인가전 분 (취득일~인가일, §166⑤1호)
 *   - "postApprovalExistingHouse": ② 인가후 분 (인가일~양도일, LTHD=0)
 *
 * 인가후 열(postApprovalExistingHouse) LTHD = 0 → §95② 본문 괄호 rose 배지.
 */
export function fillRedevRightLandPayBranchData(
  r: NonNullable<TransferTaxResult["redevelopmentDetail"]>,
  setNum: SetNum,
  setStr: SetStr,
  setRoseNote?: SetRoseNote,
): void {
  const pre = r.preApproval;
  // 엔진은 land+pay 분기의 인가후 분 데이터를 r.settlement에 부착 (사례 36 mirror).
  // r.postApprovalExistingHouse는 0으로 zero-filled — 사용 금지.
  const post = r.settlement;

  // 일자·기간 — ① 인가전
  // 보유기간 = 분기 표시 일자 차이 (취득일~인가일).
  // LTHD 산정 보유기간(pre.holdingMonths = 만 7년 절사)과 다름 — 신고서 표시는 정확한 일자 차이.
  // 사례 37: 2007-04-09 ~ 2014-10-23 = 7년 6월.
  const toIsoSlice = (d?: Date): string | undefined =>
    d ? new Date(d).toISOString().slice(0, 10) : undefined;
  const preHoldingPeriod = holdingPeriodFromDates(
    toIsoSlice(pre.branchAcqDate),
    toIsoSlice(pre.branchTransferDate),
  );
  {
    const hasMonths = (pre.residenceMonths ?? 0) > 0;
    const ph = hasMonths ? "(개월수만 입력됨)" : "-";
    setStr("holdingPeriod", "preApproval", preHoldingPeriod);
    setStr("acquisitionDate", "preApproval", fmtD(pre.branchAcqDate));
    setStr("transferDate", "preApproval", fmtD(pre.branchTransferDate));
    setStr("moveIn", "preApproval", pre.residenceStartDate || ph);
    setStr("moveOut", "preApproval", pre.residenceEndDate || ph);
    setStr("residencePeriod", "preApproval", fmtMonths(pre.residenceMonths));
  }

  // 일자·기간 — ② 인가후 (LTHD 미적용 — 보유기간 표시 불필요)
  setStr("holdingPeriod", "postApprovalExistingHouse", "-");
  setStr("acquisitionDate", "postApprovalExistingHouse", fmtD(post.branchAcqDate));
  setStr("transferDate", "postApprovalExistingHouse", fmtD(post.branchTransferDate));
  setStr("moveIn", "postApprovalExistingHouse", "-");
  setStr("moveOut", "postApprovalExistingHouse", "-");
  setStr("residencePeriod", "postApprovalExistingHouse", "-");

  // 양도가액·취득가액
  setNum("transferPrice", "preApproval", pre.apportionedTransfer);
  setNum("acquisitionPrice", "preApproval", pre.apportionedAcquisition);
  setNum("transferPrice", "postApprovalExistingHouse", post.apportionedTransfer);
  setNum("acquisitionPrice", "postApprovalExistingHouse", post.apportionedAcquisition);

  // 필요경비 — 인가전 분 개산공제(§163⑥), 인가후 분 청산금 불입액 + 기타 부대비용
  const preExp = pre.expenses ?? 0;
  const postExp = post.expenses ?? 0;
  setNum("expenses", "preApproval", preExp);
  setNum("expenses", "postApprovalExistingHouse", postExp);
  setNum("expenses", "total", preExp + postExp);

  // 양도차익(안분 전)·비과세·과세대상
  const preTg = pre.gainBeforeAllocation ?? pre.gain;
  const postTg = post.gainBeforeAllocation ?? post.gain;
  const preEg = pre.nontaxableGain ?? 0;
  const postEg = post.nontaxableGain ?? 0;

  setNum("transferGain", "preApproval", preTg);
  setNum("exemptGain", "preApproval", preEg);
  setNum("taxableGain", "preApproval", pre.gain);

  setNum("transferGain", "postApprovalExistingHouse", postTg);
  setNum("exemptGain", "postApprovalExistingHouse", postEg);
  setNum("taxableGain", "postApprovalExistingHouse", post.gain);

  setNum("transferGain", "total", preTg + postTg);
  setNum("exemptGain", "total", preEg + postEg);
  setNum("taxableGain", "total", pre.gain + post.gain);

  // 장기보유특별공제
  // ① 인가전: 정상 LTHD (§166⑤1호 — 취득일~인가일)
  const preHp = pre.lthdHoldingPart ?? pre.lthd;
  const preRp = pre.lthdResidencePart ?? 0;
  setNum("ltDeduction", "preApproval", pre.lthd);
  setNum("ltHoldingPart", "preApproval", preHp);
  setNum("ltResidencePart", "preApproval", preRp);

  // ② 인가후: LTHD = 0 (§95② 본문 괄호 — 관리처분 인가 전 토지·건물분에 한정)
  setNum("ltDeduction", "postApprovalExistingHouse", 0);
  setNum("ltHoldingPart", "postApprovalExistingHouse", 0);
  setNum("ltResidencePart", "postApprovalExistingHouse", 0);
  setRoseNote?.("ltDeduction", "postApprovalExistingHouse",
    "§95② 본문 괄호 — 관리처분 인가 전 토지·건물분에 한정");

  setNum("ltHoldingPart", "total", preHp);
  setNum("ltResidencePart", "total", preRp);

  // 양도소득금액·감면후 소득금액
  const preIncome = Math.max(0, pre.gain - pre.lthd);
  const postIncome = post.gain; // LTHD=0

  setNum("incomeAmount", "preApproval", preIncome);
  setNum("incomeAmountAfter", "preApproval", preIncome);
  setNum("incomeAmount", "postApprovalExistingHouse", postIncome);
  setNum("incomeAmountAfter", "postApprovalExistingHouse", postIncome);
}

// ── right+pay 3열 모드 ────────────────────────────────────────────

/**
 * redev-right-pay 모드 — subject="right" + settlementDirection="pay".
 *
 * § 95② 단서: 조합원입주권 양도에서 인가후 양도차익(=청산금납부분)은 LTHD 배제.
 * 신고서 양식 표 컬럼:
 *   - "total": 합계
 *   - "preApproval": ① 인가전 분 (취득일 ~ 인가일, §166⑤1호)
 *   - "postApproval": ② 인가후 분 (인가일 ~ 양도일, = 청산금 납부분 settlement)
 *     ※ postApprovalExistingHouse는 subject="right"에서 gain=0이므로 settlement 열에 통합
 *
 * 인가후 열(settlement) 의 LTHD = 0 → §95② 단서 배제 배지로 시각화 (FilingFormTable.tsx 렌더).
 */
export function fillRedevRightPayBranchData(
  r: NonNullable<TransferTaxResult["redevelopmentDetail"]>,
  setNum: SetNum,
  setStr: SetStr,
  setRoseNote?: SetRoseNote,
): void {
  const pre = r.preApproval;
  const post = r.settlement; // subject="right"이면 settlement = 청산금납부분 = 인가후분

  // 일자·기간 — ① 인가전
  {
    const hasMonths = (pre.residenceMonths ?? 0) > 0;
    const ph = hasMonths ? "(개월수만 입력됨)" : "-";
    setStr("holdingPeriod", "preApproval", branchHoldingPeriod(pre));
    setStr("acquisitionDate", "preApproval", fmtD(pre.branchAcqDate));
    setStr("transferDate", "preApproval", fmtD(pre.branchTransferDate));
    setStr("moveIn", "preApproval", pre.residenceStartDate || ph);
    setStr("moveOut", "preApproval", pre.residenceEndDate || ph);
    setStr("residencePeriod", "preApproval", fmtMonths(pre.residenceMonths));
  }

  // 일자·기간 — ② 인가후 (settlement 데이터)
  {
    const hasMonths = (post.residenceMonths ?? 0) > 0;
    const ph = hasMonths ? "(개월수만 입력됨)" : "-";
    setStr("holdingPeriod", "postApproval", branchHoldingPeriod(post));
    setStr("acquisitionDate", "postApproval", fmtD(post.branchAcqDate));
    setStr("transferDate", "postApproval", fmtD(post.branchTransferDate));
    setStr("moveIn", "postApproval", post.residenceStartDate || ph);
    setStr("moveOut", "postApproval", post.residenceEndDate || ph);
    setStr("residencePeriod", "postApproval", fmtMonths(post.residenceMonths));
  }

  // 양도가액·취득가액
  setNum("transferPrice", "preApproval", pre.apportionedTransfer);
  setNum("acquisitionPrice", "preApproval", pre.apportionedAcquisition);
  setNum("transferPrice", "postApproval", post.apportionedTransfer);
  setNum("acquisitionPrice", "postApproval", post.apportionedAcquisition);

  // 필요경비
  const preExp = pre.expenses ?? 0;
  const postExp = post.expenses ?? 0;
  setNum("expenses", "preApproval", preExp);
  setNum("expenses", "postApproval", postExp);
  setNum("expenses", "total", preExp + postExp);

  // 양도차익(안분 전)·비과세·과세대상
  const preTg = pre.gainBeforeAllocation ?? pre.gain;
  const postTg = post.gainBeforeAllocation ?? post.gain;
  const preEg = pre.nontaxableGain ?? 0;
  const postEg = post.nontaxableGain ?? 0;

  setNum("transferGain", "preApproval", preTg);
  setNum("exemptGain", "preApproval", preEg);
  setNum("taxableGain", "preApproval", pre.gain);

  setNum("transferGain", "postApproval", postTg);
  setNum("exemptGain", "postApproval", postEg);
  setNum("taxableGain", "postApproval", post.gain);

  setNum("transferGain", "total", preTg + postTg);
  setNum("exemptGain", "total", preEg + postEg);
  setNum("taxableGain", "total", pre.gain + post.gain);

  // 장기보유특별공제
  // ① 인가전: 정상 LTHD (§166⑤1호 보유기간)
  const preHp = pre.lthdHoldingPart ?? pre.lthd;
  const preRp = pre.lthdResidencePart ?? 0;
  setNum("ltDeduction", "preApproval", pre.lthd);
  setNum("ltHoldingPart", "preApproval", preHp);
  setNum("ltResidencePart", "preApproval", preRp);

  // ② 인가후(청산금납부분): LTHD = 0 (§95② 단서 배제)
  setNum("ltDeduction", "postApproval", 0);
  setNum("ltHoldingPart", "postApproval", 0);
  setNum("ltResidencePart", "postApproval", 0);
  // rose 배지 — 장기보유특별공제 행에만 §95② 단서 배제 안내
  setRoseNote?.("ltDeduction", "postApproval", "§95② 단서 배제");

  setNum("ltHoldingPart", "total", preHp);
  setNum("ltResidencePart", "total", preRp);

  // 양도소득금액·감면후 소득금액
  const preIncome = Math.max(0, pre.gain - pre.lthd);
  const postIncome = Math.max(0, post.gain - 0); // LTHD=0

  setNum("incomeAmount", "preApproval", preIncome);
  setNum("incomeAmountAfter", "preApproval", preIncome);
  setNum("incomeAmount", "postApproval", postIncome);
  setNum("incomeAmountAfter", "postApproval", postIncome);
}
