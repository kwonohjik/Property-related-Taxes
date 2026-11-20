/**
 * 공익수용 무조건 사업용 의제 — 영 §168의14③3호 판정 leaf (NBL2611-C4 · 로드맵 R16 · Q-3b).
 *
 * 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」 및 그 밖의 법률에 따라 협의매수 또는 수용되는 토지로서
 *   가목 사업인정고시일이 2006년 12월 31일 이전인 토지
 *   나목 취득일(상속받은 토지는 피상속인이 해당 토지를 취득한 날 · 법 제97조의2제1항을 적용받는 경우에는 증여한 배우자 또는 직계존비속이 해당 자산을 취득한 날)이
 *        사업인정고시일부터 N년 이전인 토지 — N은 양도일·고시일 연혁(`publicNoticeLookback`)
 * 는 비사업용 토지로 보지 않는다. 기간·지역·면적 기준과 무관한 **무조건 의제**다.
 *
 * 이 leaf를 세 입구가 함께 쓴다 — 입구마다 따로 구현하면 가목·연혁 N·소급 취득일이 경로마다 갈린다(리뷰 §7.2 「수용 의제 leaf」).
 *   · NBL 엔진 Step 0.6(`unconditional-exemption.ts`) · 화면 어댑터(`nbl-unconditional-exemption-status.ts`가 같은 연혁 leaf를 읽는다)
 *   · 주택 부수토지 배율 초과분(`transfer-tax-appurtenant-land.ts` `resolveAppurtenantLandExcess`)
 *   · 일반건물·상업용건물 부속토지 초과분(`judgeAppurtenantLandExcess`의 `expropriationDeem` 인자)
 *
 * 순수 함수 — DB를 부르지 않는다. 날짜 연산은 UTC 달력(`utc-date`).
 */
import { addYears } from "../utc-date";
import { publicNoticeLookback, type PublicNoticeLookbackEra } from "../data/nbl-historical-values-era";
import { NBL } from "../legal-codes/transfer-nbl";

/** 영 §168의14③3호가목 「사업인정고시일이 2006년 12월 31일 이전」의 경계 — 이 날 포함. */
const NOTICE_CUTOFF_2006 = new Date("2006-12-31T00:00:00.000Z");

export interface PublicExpropriationDeemFacts {
  transferDate: Date;
  /** 사업인정고시일 */
  noticeDate: Date;
  /**
   * 나목 괄호까지 반영한 취득일 — 상속받은 토지는 피상속인 취득일, 법 §97의2①을 적용받는 경우는 증여자 취득일, 그 밖은 자기 취득일.
   * 소급 규칙은 호출부의 취득 경위 사실(`resolveRateBasis` 등)이 정한다 — 이 leaf는 받은 날짜를 그대로 비교한다.
   */
  acquisitionDate: Date;
}

export interface PublicExpropriationDeemResult {
  /** 의제 성립 — 비사업용 토지로 보지 않는다 */
  deemed: boolean;
  basis: "notice_before_2007" | "acquired_before_lookback" | "none";
  /** 나목 연혁 N (가목이거나 불성립이면 undefined) */
  lookbackYears?: 2 | 5;
  era?: PublicNoticeLookbackEra;
  /** 결과 카드·고지에 그대로 쓰는 문장 */
  detail: string;
  /** 성립한 호·목의 법령 근거 */
  legalBasis?: string;
}

/** Invalid Date(취득일 미입력 — 증여자 취득일이 빈 이월과세 등)는 비교가 모두 false라 의제 불성립이다. 문구만 깨지지 않게 한다. */
const iso = (d: Date) => (Number.isNaN(d.getTime()) ? "미입력" : d.toISOString().slice(0, 10));

/**
 * 영 §168의14③3호 가목·나목 판정. 고시일은 호출부가 확정해 넘긴다(미입력은 «의제 불성립 + 확인 필요»라 호출 자체를 하지 않는다).
 * 나목 경계는 「N년 이전」 — 취득일이 고시일 N년 전 같은 날과 같으면 성립(`<=`).
 */
export function judgePublicExpropriationDeemed(f: PublicExpropriationDeemFacts): PublicExpropriationDeemResult {
  if (f.noticeDate <= NOTICE_CUTOFF_2006) {
    return {
      deemed: true,
      basis: "notice_before_2007",
      detail: `공익사업 협의매수·수용 — 사업인정고시일 ${iso(f.noticeDate)} (2006.12.31 이전)`,
      legalBasis: NBL.UNCONDITIONAL_PUBLIC_NOTICE_2006,
    };
  }
  const lookback = publicNoticeLookback(f.transferDate, f.noticeDate);
  const boundary = addYears(f.noticeDate, -lookback.years);
  if (f.acquisitionDate <= boundary) {
    return {
      deemed: true,
      basis: "acquired_before_lookback",
      lookbackYears: lookback.years,
      era: lookback.era,
      detail: `공익사업 협의매수·수용 — 고시일 ${iso(f.noticeDate)} ${lookback.years}년 이전 취득 (취득일 ${iso(f.acquisitionDate)})`,
      legalBasis: lookback.legalBasis,
    };
  }
  return {
    deemed: false,
    basis: "none",
    lookbackYears: lookback.years,
    era: lookback.era,
    detail: `사업인정고시일 ${iso(f.noticeDate)} 기준 ${lookback.years}년 이전 취득이 아님 (취득일 ${iso(f.acquisitionDate)})`,
  };
}
