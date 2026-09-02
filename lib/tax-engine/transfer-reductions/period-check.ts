/**
 * 양도세 감면 시한 검증 공통 헬퍼 (Phase 1 §1-D-1)
 *
 * 24개 조문의 시한 요건을 단일 함수로 통합 검증. UI에서는 `inPeriod === false` 항목을
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

// YYYY-MM-DD 문자열 → Date. UTC 자정 파싱 — API 경유 입력(new Date("YYYY-MM-DD") = UTC midnight)과
// 동일 기준. "T00:00:00" 로컬 자정은 KST 서버에서 9시간 어긋나 경계일 오판 (unsold-hybrid-p5 D()와 통일).
const D = (s: string) => new Date(s);

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
    label: "신축 1999.8.20~2001.12.31 (1호) / 매매계약 같은 기간 (2호)",
    /**
     * 조특법 §97의2① (법제처 원문, 사용자 제공 화면 실측 2026-08-31) — D1-10
     *
     * **1호 건설임대주택**
     *   가. **1999년 8월 20일부터 2001년 12월 31일까지의 기간 중에 신축된 주택**
     *   나. **1999년 8월 19일 이전에 신축된 공동주택**으로서 1999년 8월 20일 현재 입주된
     *       사실이 없는 주택
     * **2호 매입임대주택** 중 1999.8.20 이후 취득(**1999.8.20부터 2001.12.31까지의 기간 중에
     *   매매계약을 체결하고 계약금을 지급한 경우만 해당**) 및 임대를 개시한 임대주택
     *
     * ⇒ **축이 호마다 다르다** — 1호는 **신축일(사용승인일)**, 2호는 **매매계약일**.
     *
     * 🔴 종전 결함: **1호 나목이 구조적으로 배제**됐다 —
     *    나목은 「1999.8.19 **이전** 신축」인데 `within(target, 1999-08-20, …)`이 하한을 걸어
     *    어떤 입력으로도 통과할 수 없었다(납세자 불리).
     *
     * ⚠️ 「신축일」 전용 입력 필드는 만들지 않는다 — 자산-수준 `usageApprovalDate` 소스가
     *    저장소에 없어서 넣어도 항상 undefined인 dead prop이 된다
     *    (memory `feedback_api_trigger_without_input_path_is_noop`).
     *    건설임대는 신축이 곧 취득이므로 `acquisitionDate`가 실무상 신축일과 일치한다.
     *    전용 필드가 필요해지면 ⑤UI부터 함께 신설할 것.
     *
     * ⚠️ 나목의 「1999.8.20 현재 입주된 사실이 없는 주택」은 자기확인 필드가 없으므로
     *    여기서 판정하지 않는다 — 시한 게이트만 열고 요건 판정은 하지 않는다.
     *    (없는 입력을 추정해 판정하지 않는다.)
     */
    check: (c) => {
      if (c.rental972Type === "construction") {
        // 1호 — 신축일 축. 건설임대는 신축이 곧 취득이므로 취득일을 쓴다.
        const built = c.acquisitionDate;
        // 가목: 1999.8.20~2001.12.31 신축 / 나목: 1999.8.19 이전 신축(하한 없음)
        return (
          within(built, D("1999-08-20"), D("2001-12-31")) ||
          before(built, D("1999-08-19"))
        );
      }
      // 2호 — 매매계약일 축. 계약일이 없으면 취득일로 대체한다.
      const target = c.contractDate ?? c.acquisitionDate;
      return within(target, D("1999-08-20"), D("2001-12-31"));
    },
    failReason:
      "신축일(1호) 또는 매매계약일(2호)이 조특법 §97의2① 시한 외 — " +
      "1호 가목 1999.8.20~2001.12.31 신축 / 1호 나목 1999.8.19 이전 신축 공동주택 / " +
      "2호 1999.8.20~2001.12.31 매매계약",
  },
  rental_97_3: {
    label: "장기일반민간임대 등록 ~2027.12.31",
    check: (c) => before(c.registrationDate, D("2027-12-31")),
    failReason: "임대 등록일이 2027.12.31 이후 — 조특법 §97의3 등록 시한 외",
  },
  rental_97_4: {
    label: "양도 2014.1.1~",
    /**
     * 조특법 §97의4 신설 — **법률 제12173호**(2014.1.1 공포·시행) (CB-01)
     *
     * 🔴 종전에는 **등록일** 하한(`registrationDate >= 2014-01-01`)이었다. **축이 틀렸다.**
     *
     * 부칙 원문(법제처 `target=eflaw` 부칙 조회, MST 149368 — 2026-08-31 실측):
     *   **제1조(시행일)** 이 법은 2014년 1월 1일부터 시행한다. (§97의4는 단서 예외 목록에 없다)
     *   **제2조(일반적 적용례) ③** 「이 법 중 **양도소득세** 및 증권거래세에 관한 개정규정은
     *     이 법 시행 후 **양도하는 분**부터 적용한다.」
     *
     * §97의4 **전용 적용례 조문은 없다**(제31조는 §96, 제32조는 §99의4). 따라서 §2③의
     * 일반 적용례가 적용되고 기준은 **양도일**이다.
     *
     * 조특법 §97의4·조특령 §97의4·조특령 §97⑤ 어디에도 **등록일 시한 규정이 없다**는 점도
     * 같은 결론을 뒷받침한다 — 등록일 하한은 시행일을 요건으로 오전사한 것이었고,
     * 2013년 등록·2026년 양도 사안을 부당 배제했다(납세자 불리).
     */
    check: (c) => c.transferDate !== undefined && c.transferDate >= D("2014-01-01"),
    failReason:
      "양도일이 2014.1.1 이전 — 조특법 §97의4는 법률 제12173호 부칙 §2③에 따라 " +
      "2014.1.1 이후 양도분부터 적용됩니다",
  },
  rental_97_5: {
    label: "매매계약·취득 ~2018.12.31",
    check: (c) =>
      // 조특법 §97의5 ① 1호: "2018.12.31까지 ... 매입임대주택 ... 을 취득(2018.12.31까지 매매계약을 체결하고 계약금을 납부한 경우를 포함한다)"
      // 2026-07-29 정정(#591 감사 R7): fallback에서 `registrationDate`를 제거했다.
      //   §97의5①1호는 "2018.12.31.까지 …매입임대주택…을 **취득**(2018.12.31.까지 **매매계약**을
      //   체결하고 계약금을 납부한 경우를 포함한다)하고, **취득일로부터 3개월 이내**에 …등록할 것"
      //   ⇒ 시한 기준은 취득 또는 매매계약이며 **임대사업자 등록일이 아니다**.
      //   등록이 취득 후 3개월 내여서 registrationDate ≥ acquisitionDate가 항상 성립하므로,
      //   등록일을 앞에 두면 판정이 **뒤로만 밀려** 시한 내 취득분을 부당 배제했다(납세자 불리).
      //   (memory `feedback_reduction_sunset_is_acquisition_window` ·
      //    `feedback_no_unfavorable_application_without_legal_basis`)
      //   §97의3의 `registrationDate` 사용은 조문이 등록 시한을 직접 규정한 것이라 정당하다
      //   (§97의3① 「…장기일반민간임대주택을 2027년 12월 31일까지 **등록**…한 후」).
      //
      //   🔴 §97의4는 다르다 (CB-01 정정 2026-08-31) — **「등록」 단어 자체가 없다**.
      //      · 조특법 §97의4① — 「…대통령령으로 정하는 주택을 6년 이상 임대한 후 양도하는 경우」
      //      · 조특령 §97의4① — 「…「소득세법 시행령」 제167조의3제1항제2호가목 및 다목에 따른
      //        장기임대주택…을 말한다」 (날짜 없음)
      //      · 소령 §167의3①2호 가목·다목 — 「다만, **2018년 3월 31일까지** 사업자등록등을 한
      //        주택으로 한정한다」 ⇒ 조문이 정한 것은 **상한**이고 **하한은 존재하지 않는다**.
      //      즉 종전 `rental_97_4`의 등록일 하한은 방향이 반대였다.
      //
      //   ✅ **CB-01 해소 (2026-08-31)** — 법률 제12173호 부칙을 법제처 `target=eflaw`
      //      부칙 조회(MST 149368)로 확보했다. §2③이 「양도소득세…는 이 법 시행 후
      //      **양도하는 분**부터」이고 §97의4 전용 적용례는 없다
      //      ⇒ 아래 `rental_97_4`의 축을 **양도일**로 옮겼다.
      before(c.contractDate ?? c.acquisitionDate, D("2018-12-31")),
    failReason: "취득일(또는 매매계약일)이 2018.12.31 이후 — 조특법 §97의5①1호 취득 시한 외",
  },

  // ── 신축 §99 시리즈 ──
  new_99: {
    label: "매매계약/사용승인 1998.5.22~1999.6.30 (국민주택 ~1999.12.31)",
    check: (c) => {
      // 조특법 §99 ① 1호(자기건설): 사용승인일 / ① 2호(주건업): 매매계약일 + 계약금 납부
      // 본 헬퍼는 넓은 범위로 통과 — 본 요건(자기건설 vs 주건업 분기)은 evaluateNew99에서 재검증.
      // P1 (2026-06-11): 일자 전부 미입력 시 낙관 통과 (라디오 활성) — 정확 판정은 evaluator (D-1' 완화).
      const target = c.contractDate ?? c.usageApprovalDate ?? c.acquisitionDate;
      return target === undefined || within(target, D("1998-05-22"), D("1999-12-31"));
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
    // P5 (2026-06-12): 일자 미입력 시 낙관 통과 — 본 판정은 evaluateUnsold98 (취득 OR 계약 2-트랙)
    check: (c) => {
      const t = c.contractDate ?? c.acquisitionDate;
      if (t === undefined) return true;
      const inTrack = (d: Date | undefined) =>
        within(d, D("1995-11-01"), D("1997-12-31")) || within(d, D("1998-03-01"), D("1998-12-31"));
      return inTrack(c.acquisitionDate) || inTrack(c.contractDate);
    },
    failReason: "미분양 국민주택 취득기간 시한 외 — 조특법 §98 ①·③",
  },
  unsold_98_2: {
    label: "취득 2008.11.3~2010.12.31",
    // P4 (2026-06-12): 일자 미입력 시 낙관 통과 (라디오 활성) — 본 판정은 evaluateUnsold982
    // (취득일 OR 계약일 — 계약+계약금 케이스는 취득일이 기간 외여도 적격).
    check: (c) => {
      const t = c.contractDate ?? c.acquisitionDate;
      return t === undefined ||
        within(c.acquisitionDate, D("2008-11-03"), D("2010-12-31")) ||
        within(c.contractDate, D("2008-11-03"), D("2010-12-31"));
    },
    failReason: "지방 미분양 취득기간(2008.11.3~2010.12.31) 시한 외 — 조특법 §98의2",
  },
  unsold_98_3: {
    label: "취득 2009.2.12~2010.2.11 (비거주자 2009.3.16~)",
    // P3 (2026-06-12): 낙관 통과 + contractDate만 — 자기건설(법②)은 착공·사용승인 기준이라
    // 자산 취득일로 차단 불가. 본 판정은 evaluateUnsold983 (취득일 fallback 금지).
    check: (c) =>
      c.contractDate === undefined || within(c.contractDate, D("2009-02-12"), D("2010-02-11")),
    failReason: "미분양 취득기간(거주자 2009.2.12~2010.2.11 / 비거주자 2009.3.16~2010.2.11) 시한 외 — 조특법 §98의3",
  },
  unsold_98_4: {
    label: "취득 2009.3.16~2010.2.11 (비거주자 일반주택)",
    // P4 (2026-06-12): 일자 미입력 시 낙관 통과 — 본 판정은 evaluateUnsold984 (취득 OR 계약).
    check: (c) => {
      const t = c.contractDate ?? c.acquisitionDate;
      return t === undefined ||
        within(c.acquisitionDate, D("2009-03-16"), D("2010-02-11")) ||
        within(c.contractDate, D("2009-03-16"), D("2010-02-11"));
    },
    failReason: "비거주자 일반주택 취득기간(2009.3.16~2010.2.11) 시한 외 — 조특법 §98의4",
  },
  unsold_98_5: {
    label: "매매계약 ~2011.4.30 (2010.2.11 현재 미분양)",
    // P3 (2026-06-12): 낙관 통과. D-8 — 법문에 시작 경계 없으나 2010.2.11 미분양 컷오프상
    // 그 이전 본인 계약은 미분양 모순 → 사실상 2010.2.12 이후 유지. 본 판정은 evaluateUnsold985.
    check: (c) =>
      c.contractDate === undefined ||
      within(c.contractDate, D("2010-02-12"), D("2011-04-30")),
    failReason: "수도권 외 미분양 매매계약 시한(2010.2.12~2011.4.30) 외 — 조특법 §98의5",
  },
  unsold_98_6: {
    label: "임대계약 ~2011.12.31",
    // P3 (2026-06-12): 낙관 통과 — 시한 기준은 임대계약 체결일(법 ①1·2호)인데
    // PeriodCheckContext는 자산 매매계약·취득일만 보유. 본 판정은 evaluateUnsold986.
    check: () => true,
    failReason: "준공후미분양 임대계약 시한(~2011.12.31) 외 — 조특법 §98의6",
  },
  unsold_98_7: {
    label: "매매계약 2012.9.24~2012.12.31",
    // P2 (2026-06-11): 자산 계약일 미입력 시 낙관 통과 — 본 판정은 reduction-수준
    // contractDate987 기준 evaluateUnsold987. 취득일 fallback 금지 — 계약 2012·취득 2013
    // 케이스("그 계약에 따라 취득")를 취득일로 오차단하지 않도록 contractDate만 본다.
    check: (c) =>
      c.contractDate === undefined || within(c.contractDate, D("2012-09-24"), D("2012-12-31")),
    failReason: "9억 이하 미분양 매매계약 시한(2012.9.24~2012.12.31) 외 — 조특법 §98의7",
  },
  unsold_98_8: {
    label: "매매계약 2015.1.1~2015.12.31",
    // P1 (2026-06-11): 자산 계약일 미입력 시 낙관 통과 — 본 판정은 reduction-수준
    // contractDate988 기준 evaluateUnsold988 (D-1' 완화). 취득일 fallback 금지 —
    // 계약 2015·취득 2016 케이스를 취득일로 오차단하지 않도록 contractDate만 본다.
    check: (c) =>
      c.contractDate === undefined || within(c.contractDate, D("2015-01-01"), D("2015-12-31")),
    failReason: "준공후미분양 매매계약 시한(2015.1.1~2015.12.31) 외 — 조특법 §98의8",
  },
  // D-1' (2026-06-11): §98의9 시한 기준은 "준공후미분양주택 취득일"인데 PeriodCheckContext는
  // 자산(양도하는 종전주택) 취득일만 보유 → 라디오 사전판정은 낙관 통과.
  // 정확 판정은 evaluateUnsold989(unsold-98-9.ts)가 unsoldHouseAcquisitionDate 기준으로 수행.
  unsold_98_9: {
    label: "취득 2024.1.10~2026.12.31",
    check: () => true,
    failReason: "수도권 밖 준공후미분양 취득기간(2024.1.10~2026.12.31) 시한 외 — 조특법 §98의9",
  },
  unsold_99_2: {
    label: "매매계약 2013.4.1~2013.12.31",
    // P2 (2026-06-11): 낙관 통과 + contractDate만 (자기건설은 사용승인일 기준이라
    // 자산 계약일로 차단 불가 — 본 판정은 evaluateUnsold992. 취득일 fallback 금지)
    check: (c) =>
      c.contractDate === undefined || within(c.contractDate, D("2013-04-01"), D("2013-12-31")),
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
  gb_designated_land: {
    // §77의3 sunset(2028-12-31)은 **양도일** 기준 — 엔진에서 별도 판정 (취득/계약일 기준 아님).
    // period-check(취득·계약일 target)는 낙관 통과.
    label: "양도 2028-12-31까지 (엔진 판정)",
    check: () => true,
    failReason: "",
  },
  replacement_land_comp: {
    // §77의2 sunset(2026-12-31)은 **양도일** 기준 — 엔진 판정. period-check는 낙관 통과.
    label: "양도 2026-12-31까지 (엔진 판정)",
    check: () => true,
    failReason: "",
  },
};

/**
 * 시한 검증 — 24개 조문 ID와 컨텍스트를 받아 시한 내 여부 판정.
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
