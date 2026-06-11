/**
 * 양도세 감면 시한 검증 공통 헬퍼 (Phase 1 §1-D-1)
 *
 * 23개 조문의 시한 요건을 단일 함수로 통합 검증. UI에서는 `inPeriod === false` 항목을
 * disabled 처리하고 `failReason` 을 tooltip으로 노출 (사용자 결정사항 #6 — A안).
 *
 * 시한 일자 출처: docs/02-design/features/transfer-reduction-mapping-audit.md §4
 *                + 사용자 제공 조특법 원문 (2026-05-06)
 *
 * **주의**: 본 헬퍼는 시한만 검증한다. 지역·면적·가액·임대기간·사후관리 등 본 요건은
 * 각 조문 stub/구현체에서 별도 검증.
 */

import type { TransferReductionId, PeriodCheckContext, PeriodCheckResult } from "./types";

interface PeriodRule {
  /** UI 표시용 시한 라벨 (예: "2001.5.23~2003.6.30") */
  label: string;
  /** 검증 함수 — 컨텍스트를 받아 시한 내 여부 판정 */
  check: (ctx: PeriodCheckContext) => boolean;
  /** 미충족 시 사유 문구 */
  failReason: string;
}

/** YYYY-MM-DD 문자열 → Date (시간대 무관) */
const D = (s: string) => new Date(s + "T00:00:00");

/** 일자가 [start, end] 구간(폐구간) 내인지 */
const within = (d: Date | undefined, start: Date, end: Date): boolean =>
  d !== undefined && d >= start && d <= end;

/** 일자가 end 일자 이전(또는 같음) */
const before = (d: Date | undefined, end: Date): boolean =>
  d !== undefined && d <= end;

const RULES: Record<TransferReductionId, PeriodRule> = {
  // ── 장기임대 §97 시리즈 ──
  rental_97_main: {
    label: "임대개시 ~2000.12.31",
    check: (c) => before(c.rentalStartDate, D("2000-12-31")),
    failReason: "임대개시일이 2000.12.31 이후 — 조특법 §97 ① 본문 적용 시한 외",
  },
  rental_97_proviso: {
    label: "임대개시 ~2000.12.31 (5/10년+ 임대 단서)",
    check: (c) => before(c.rentalStartDate, D("2000-12-31")),
    failReason: "임대개시일이 2000.12.31 이후 — 조특법 §97 ① 단서 적용 시한 외",
  },
  rental_97_2: {
    label: "매매계약 1999.8.20~2001.12.31",
    check: (c) => {
      // 조특법 §97의2 ① 2호 매입임대: "1999.8.20부터 2001.12.31까지의 기간 중에 매매계약을 체결하고 계약금을 지급한 경우만 해당"
      // 자기건설(1호): 사용승인일 fallback
      const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate;
      return within(target, D("1999-08-20"), D("2001-12-31"));
    },
    failReason: "매매계약/신축 시기가 1999.8.20~2001.12.31 시한 외 — 조특법 §97의2",
  },
  rental_97_3: {
    label: "장기일반민간임대 등록 ~2027.12.31",
    check: (c) => before(c.registrationDate, D("2027-12-31")),
    failReason: "임대 등록일이 2027.12.31 이후 — 조특법 §97의3 등록 시한 외",
  },
  rental_97_4: {
    label: "임대등록 2014.1.1~",
    check: (c) => c.registrationDate !== undefined && c.registrationDate >= D("2014-01-01"),
    failReason: "임대 등록일이 2014.1.1 이전 — 조특법 §97의4 적용 시한 외",
  },
  rental_97_5: {
    label: "매매계약·취득 ~2018.12.31",
    check: (c) =>
      // 조특법 §97의5 ① 1호: "2018.12.31까지 ... 매입임대주택 ... 을 취득(2018.12.31까지 매매계약을 체결하고 계약금을 납부한 경우를 포함한다)"
      before(c.contractDate ?? c.registrationDate ?? c.acquisitionDate, D("2018-12-31")),
    failReason: "매매계약/등록일이 2018.12.31 이후 — 조특법 §97의5 적용 시한 외",
  },

  // ── 신축 §99 시리즈 ──
  new_99: {
    label: "매매계약/사용승인 1998.5.22~1999.6.30 (국민주택 ~1999.12.31)",
    check: (c) => {
      // 조특법 §99 ① 1호(자기건설): 사용승인일 / ① 2호(주건업): 매매계약일 + 계약금 납부
      // 본 헬퍼는 넓은 범위로 통과 — 본 요건(자기건설 vs 주건업 분기)은 evaluateNew99에서 재검증.
      const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate;
      return within(target, D("1998-05-22"), D("1999-12-31"));
    },
    failReason: "매매계약/사용승인일이 1998.5.22~1999.6.30(국민주택 ~1999.12.31) 시한 외 — 조특법 §99",
  },
  new_99_3: {
    label: "매매계약/사용승인 2001.5.23~2003.6.30",
    check: (c) => {
      // 조특법 §99의3 ① 1호(주건업): 매매계약일 / 2호(자기건설): 사용승인일
      const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate;
      return within(target, D("2001-05-23"), D("2003-06-30"));
    },
    failReason: "매매계약/사용승인일이 2001.5.23~2003.6.30 시한 외 — 조특법 §99의3",
  },
  // D-1 (2026-06-11): §99의4 시한 기준은 "농어촌주택등 취득일"인데 PeriodCheckContext는
  // 자산(양도하는 일반주택) 취득일만 보유 → 라디오 사전판정은 낙관 통과.
  // 정확 판정은 evaluateNew994(new-99-4.ts)가 ruralHouseAcquisitionDate 기준으로 수행.
  new_99_4_rural: {
    label: "농어촌주택 취득 2003.8.1~2028.12.31",
    check: () => true,
    failReason: "농어촌주택 취득기간(2003.8.1~2028.12.31) 시한 외 — 조특법 §99의4 ①항 1호",
  },
  new_99_4_hometown: {
    label: "고향주택 취득 2009.1.1~2028.12.31",
    check: () => true,
    failReason: "고향주택 취득기간(2009.1.1~2028.12.31) 시한 외 — 조특법 §99의4 ①항 2호",
  },

  // ── 미분양 §98 시리즈 + §99의2 ──
  unsold_98: {
    label: "취득 1995.11.1~1997.12.31 (③항 1998.3.1~1998.12.31)",
    check: (c) => {
      const t = c.contractDate ?? c.acquisitionDate;
      return within(t, D("1995-11-01"), D("1997-12-31")) ||
             within(t, D("1998-03-01"), D("1998-12-31"));
    },
    failReason: "미분양 국민주택 취득기간 시한 외 — 조특법 §98 ①·③",
  },
  unsold_98_2: {
    label: "취득 2008.11.3~2010.12.31",
    check: (c) => within(c.contractDate ?? c.acquisitionDate, D("2008-11-03"), D("2010-12-31")),
    failReason: "지방 미분양 취득기간(2008.11.3~2010.12.31) 시한 외 — 조특법 §98의2",
  },
  unsold_98_3: {
    label: "취득 2009.2.12~2010.2.11 (비거주자 2009.3.16~)",
    check: (c) => within(c.contractDate ?? c.acquisitionDate, D("2009-02-12"), D("2010-02-11")),
    failReason: "미분양 취득기간(거주자 2009.2.12~2010.2.11 / 비거주자 2009.3.16~2010.2.11) 시한 외 — 조특법 §98의3",
  },
  unsold_98_4: {
    label: "취득 2009.3.16~2010.2.11 (비거주자 일반주택)",
    check: (c) => within(c.contractDate ?? c.acquisitionDate, D("2009-03-16"), D("2010-02-11")),
    failReason: "비거주자 일반주택 취득기간(2009.3.16~2010.2.11) 시한 외 — 조특법 §98의4",
  },
  unsold_98_5: {
    label: "매매계약 ~2011.4.30 (2010.2.11 현재 미분양)",
    check: (c) => before(c.contractDate, D("2011-04-30")) &&
                  (c.contractDate === undefined || c.contractDate >= D("2010-02-12")),
    failReason: "수도권 외 미분양 매매계약 시한(2010.2.12~2011.4.30) 외 — 조특법 §98의5",
  },
  unsold_98_6: {
    label: "임대계약 ~2011.12.31",
    check: (c) => before(c.contractDate ?? c.acquisitionDate, D("2011-12-31")),
    failReason: "준공후미분양 임대계약 시한(~2011.12.31) 외 — 조특법 §98의6",
  },
  unsold_98_7: {
    label: "매매계약 2012.9.24~2012.12.31",
    check: (c) => within(c.contractDate, D("2012-09-24"), D("2012-12-31")),
    failReason: "9억 이하 미분양 매매계약 시한(2012.9.24~2012.12.31) 외 — 조특법 §98의7",
  },
  unsold_98_8: {
    label: "매매계약 2015.1.1~2015.12.31",
    check: (c) => within(c.contractDate, D("2015-01-01"), D("2015-12-31")),
    failReason: "준공후미분양 매매계약 시한(2015.1.1~2015.12.31) 외 — 조특법 §98의8",
  },
  unsold_98_9: {
    label: "취득 2024.1.10~2026.12.31",
    check: (c) => within(c.acquisitionDate, D("2024-01-10"), D("2026-12-31")),
    failReason: "수도권 밖 준공후미분양 취득기간(2024.1.10~2026.12.31) 시한 외 — 조특법 §98의9",
  },
  unsold_99_2: {
    label: "매매계약 2013.4.1~2013.12.31",
    check: (c) => within(c.contractDate, D("2013-04-01"), D("2013-12-31")),
    failReason: "신축·미분양·1세대1주택 매매계약 시한(2013.4.1~2013.12.31) 외 — 조특법 §99의2",
  },

  // ── 별도 카테고리 (시한 검증 없음 — 본 요건은 stub에서) ──
  self_farming: {
    label: "시한 없음 (8년+ 자경 요건)",
    check: () => true,
    failReason: "",
  },
  public_expropriation: {
    label: "시한 없음 (수용·협의매수 시점 별도)",
    check: () => true,
    failReason: "",
  },
};

/**
 * 시한 검증 — 23개 조문 ID와 컨텍스트를 받아 시한 내 여부 판정.
 *
 * @example
 * const r = checkReductionPeriod("new_99_3", {
 *   transferDate: new Date("2023-02-16"),
 *   contractDate: new Date("2001-05-24"),
 *   acquisitionDate: new Date("2003-09-23"),
 * });
 * // r = { inPeriod: true, periodLabel: "취득 2001.5.23~2003.6.30" }
 */
export function checkReductionPeriod(
  id: TransferReductionId,
  ctx: PeriodCheckContext,
): PeriodCheckResult {
  const rule = RULES[id];
  const inPeriod = rule.check(ctx);
  return {
    inPeriod,
    failReason: inPeriod ? undefined : rule.failReason,
    periodLabel: rule.label,
  };
}

/** 단순 라벨 조회 (UI 펼침 헤더 등에서 활성/전체 카운트 시 컨텍스트 없이 라벨만 필요한 경우) */
export function getReductionPeriodLabel(id: TransferReductionId): string {
  return RULES[id].label;
}
