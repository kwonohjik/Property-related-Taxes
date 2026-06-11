/**
 * 양도세 감면 23개 조문 메타데이터 (Phase 1 골격)
 *
 * 단일 source of truth — UI 펼침 패널 라벨/카운터, 라우터 분기, 효과 카테고리 분류에 사용.
 * Phase 2 본격 구현 시 각 항목에 대응하는 개별 모듈(`new-99-3.ts` 등)로 분기 로직 이관.
 *
 * 본 파일의 데이터는 다음과 1:1 동기화:
 *   - docs/00-pm/transfer-reduction-expansion.plan.md §3 (인벤토리 표)
 *   - docs/02-design/features/transfer-reduction-mapping-audit.md §4
 *   - lib/tax-engine/legal-codes/transfer.ts TRANSFER_REDUCTION_ARTICLE
 */

import { TRANSFER_REDUCTION_ARTICLE, type ReductionEffectCategory } from "../legal-codes/transfer";
import type { TransferReductionId, ReductionCategory } from "./types";

export interface ReductionMetadata {
  id: TransferReductionId;
  article: string;
  category: ReductionCategory;
  effectCategory: ReductionEffectCategory;
  /** UI 라벨 (펼침 패널 항목명) */
  uiLabel: string;
  /** 효과 요약 (UI sublabel) */
  effectLabel: string;
  /**
   * Phase 2 본격 구현 완료 여부.
   * true → 라디오 선택 가능 + 본격 입력 폼 노출.
   * false → disabled + "Phase 2~ 구현 예정" tooltip.
   */
  isFullyImplemented?: boolean;
}

/**
 * Round 8 (2026-05-06): 카테고리별 UI 표시 메타.
 * - standalone(자경·공익): 단일 체크박스 (펼침 X)
 * - 그룹(장기임대·신축·미분양): 펼침 헤더 + 라디오 그룹
 */
export interface CategoryUiSchema {
  category: ReductionCategory;
  /** 헤더 표시명 */
  title: string;
  /** 헤더 서브타이틀 */
  subtitle: string;
  /** 단일 항목(체크박스) vs 그룹(펼침 라디오) */
  uiPattern: "single" | "group";
  /** 카테고리 tone (CLAUDE.md tone 가이드) */
  tone: "amber" | "rose" | "violet" | "emerald" | "sky";
}

export const CATEGORY_UI_SCHEMA: Record<ReductionCategory, CategoryUiSchema> = {
  rental: {
    category: "rental",
    title: "장기임대주택",
    subtitle: "조특법 §97 시리즈 (6개)",
    uiPattern: "group",
    tone: "violet",
  },
  new_housing: {
    category: "new_housing",
    title: "신축주택",
    subtitle: "조특법 §99 시리즈 (4개)",
    uiPattern: "group",
    tone: "amber",
  },
  unsold_housing: {
    category: "unsold_housing",
    title: "미분양주택",
    subtitle: "조특법 §98·§99의2 (10개)",
    uiPattern: "group",
    tone: "sky",
  },
  standalone: {
    category: "standalone",
    title: "자경·공익",
    subtitle: "별도 카테고리",
    uiPattern: "single",
    tone: "emerald",
  },
};

export const REDUCTION_METADATA: Record<TransferReductionId, ReductionMetadata> = {
  // ── 장기임대 §97 시리즈 ──
  rental_97_main: {
    id: "rental_97_main",
    article: TRANSFER_REDUCTION_ARTICLE.RENTAL_97_MAIN,
    category: "rental",
    effectCategory: "tax_amount",
    uiLabel: "§97 ① 본문 — 장기임대 50% 감면",
    effectLabel: "산출세액 50% 감면 (5년+ 임대)",
    isFullyImplemented: true,
  },
  rental_97_proviso: {
    id: "rental_97_proviso",
    article: TRANSFER_REDUCTION_ARTICLE.RENTAL_97_PROVISO,
    category: "rental",
    effectCategory: "tax_amount",
    uiLabel: "§97 ① 단서 — 100% 면제",
    effectLabel: "산출세액 100% 면제 (건설/매입 5+ 또는 10년+ 임대)",
    isFullyImplemented: true,
  },
  rental_97_2: {
    id: "rental_97_2",
    article: TRANSFER_REDUCTION_ARTICLE.RENTAL_97_2,
    category: "rental",
    effectCategory: "tax_amount",
    uiLabel: "§97의2 — 신축임대 100% 면제",
    effectLabel: "산출세액 100% 면제 (1999.8.20~2001.12.31 신축/취득)",
    isFullyImplemented: true,
  },
  rental_97_3: {
    id: "rental_97_3",
    article: TRANSFER_REDUCTION_ARTICLE.RENTAL_97_3,
    category: "rental",
    effectCategory: "long_term_holding_special",
    uiLabel: "§97의3 — 장특공제율 70%",
    effectLabel: "장기보유특별공제율 70% 적용 (10년+ 임대, 등록 ~2027.12.31)",
    isFullyImplemented: true,
  },
  rental_97_4: {
    id: "rental_97_4",
    article: TRANSFER_REDUCTION_ARTICLE.RENTAL_97_4,
    category: "rental",
    // 2026-06-11 정정: §97의3(대체)과 달리 §97의4는 보유기간 공제율에 "가산" — 별도 effectCategory
    effectCategory: "long_term_holding_additional",
    uiLabel: "§97의4 — 장특공제 추가율",
    effectLabel: "장특공제 추가율 가산 (6년 2% ~ 10년 10%)",
    // R-3 확정 (2026-06-11): 추가율 표 = 사용자 제공값 = 코드 기재값 일치 → 활성화
    isFullyImplemented: true,
  },
  rental_97_5: {
    id: "rental_97_5",
    article: TRANSFER_REDUCTION_ARTICLE.RENTAL_97_5,
    category: "rental",
    effectCategory: "tax_amount",
    uiLabel: "§97의5 — 장기일반민간임대 100% 감면",
    effectLabel: "산출세액 100% 감면 (10년+ 임대, 취득·등록 ~2018.12.31)",
    isFullyImplemented: true,
  },

  // ── 신축 §99 시리즈 ──
  new_99: {
    id: "new_99",
    article: TRANSFER_REDUCTION_ARTICLE.NEW_99,
    category: "new_housing",
    effectCategory: "capital_gain",
    uiLabel: "§99 — 신축주택 양도세 감면 (IMF 1차)",
    effectLabel: "5년 내 = 취득~양도 발생분 차감 / 5년 후 = 5년간 발생분 차감 (1998.5.22~1999.6.30)",
  },
  new_99_3: {
    id: "new_99_3",
    article: TRANSFER_REDUCTION_ARTICLE.NEW_99_3,
    category: "new_housing",
    effectCategory: "capital_gain",
    uiLabel: "§99의3 — 신축주택 과세특례 (IMF 2차)",
    effectLabel: "5년 내 = 취득~양도 발생분 차감 / 5년 후 = 5년간 발생분 차감 (2001.5.23~2003.6.30, 가격 급등 지역 외)",
    isFullyImplemented: true,
  },
  new_99_4_rural: {
    id: "new_99_4_rural",
    article: TRANSFER_REDUCTION_ARTICLE.NEW_99_4_RURAL,
    category: "new_housing",
    effectCategory: "house_count_exclusion",
    uiLabel: "§99의4 (농어촌주택) — 주택수 제외",
    effectLabel: "1세대1주택 비과세 시 주택수 제외 (2003.8.1~2028.12.31, 3년+ 보유)",
    // 2026-06-11: 본격 구현 — evaluator(new-99-4.ts)·비과세/12억 안분/표2 유효 주택수 반영
    isFullyImplemented: true,
  },
  new_99_4_hometown: {
    id: "new_99_4_hometown",
    article: TRANSFER_REDUCTION_ARTICLE.NEW_99_4_HOMETOWN,
    category: "new_housing",
    effectCategory: "house_count_exclusion",
    uiLabel: "§99의4 (고향주택) — 주택수 제외",
    effectLabel: "1세대1주택 비과세 시 주택수 제외 (2009.1.1~2028.12.31, 3년+ 보유)",
    isFullyImplemented: true,
  },

  // ── 미분양 §98 시리즈 + §99의2 ──
  unsold_98: {
    id: "unsold_98",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98,
    category: "unsold_housing",
    effectCategory: "separated_taxation",
    uiLabel: "§98 — 미분양 분리과세 20%",
    effectLabel: "분리과세 20% OR 종합세 선택 (1995.11.1~1997.12.31, 5년+ 보유·임대)",
  },
  unsold_98_2: {
    id: "unsold_98_2",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_2,
    category: "unsold_housing",
    effectCategory: "cgt_with_normal_rate_and_ltsd",
    uiLabel: "§98의2 — 지방 미분양 일반세율",
    effectLabel: "장특공제(표 1) + 일반 누진세율 (2008.11.3~2010.12.31, 중과 배제)",
  },
  unsold_98_3: {
    id: "unsold_98_3",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_3,
    category: "unsold_housing",
    effectCategory: "tax_amount",
    uiLabel: "§98의3 — 서울 외 미분양 100%(과밀 60%)",
    effectLabel: "5년 내 100% (수도권과밀 60%) / 5년 후 5년간 발생분 차감",
  },
  unsold_98_4: {
    id: "unsold_98_4",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_4,
    category: "unsold_housing",
    effectCategory: "tax_amount",
    uiLabel: "§98의4 — 비거주자 일반주택 10%",
    effectLabel: "산출세액 10% 감면 (2009.3.16~2010.2.11, 비거주자 한정)",
  },
  unsold_98_5: {
    id: "unsold_98_5",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_5,
    category: "unsold_housing",
    effectCategory: "tax_amount",
    uiLabel: "§98의5 — 분양가 인하율 60/80/100%",
    effectLabel: "5년 내 인하율별 세액감면 / 5년 후 5년간 발생분 인하율 비율 차감 (2010.2.12~2011.4.30)",
  },
  unsold_98_6: {
    id: "unsold_98_6",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_6,
    category: "unsold_housing",
    effectCategory: "tax_amount",
    uiLabel: "§98의6 — 준공후미분양 50%",
    effectLabel: "5년 내 50% / 5년 후 5년간 발생분의 50% 차감 (~2011.12.31 임대계약)",
  },
  unsold_98_7: {
    id: "unsold_98_7",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_7,
    category: "unsold_housing",
    effectCategory: "tax_amount",
    uiLabel: "§98의7 — 9억↓ 미분양 100%",
    effectLabel: "5년 내 100% / 5년 후 5년간 발생분 차감 (2012.9.24~2012.12.31)",
  },
  unsold_98_8: {
    id: "unsold_98_8",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_8,
    category: "unsold_housing",
    effectCategory: "capital_gain",
    uiLabel: "§98의8 — 준공후미분양 6억·135㎡↓ 50%",
    effectLabel: "5년간 발생분의 50% 차감 (2015.1.1~2015.12.31, 5년+ 임대)",
  },
  unsold_98_9: {
    id: "unsold_98_9",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_9,
    category: "unsold_housing",
    effectCategory: "house_count_exclusion",
    uiLabel: "§98의9 — 수도권 밖 준공후미분양 (주택수 제외)",
    effectLabel: "1세대1주택 비과세 적용 시 주택수 제외 + 종부세 1세대1주택자 (2024.1.10~2026.12.31)",
    // 2026-06-11: 본격 구현 — evaluateUnsold989 + STEP 0.9 합류 (§99의4 우선 F-4)
    isFullyImplemented: true,
  },
  unsold_99_2: {
    id: "unsold_99_2",
    article: TRANSFER_REDUCTION_ARTICLE.UNSOLD_99_2,
    category: "unsold_housing",
    effectCategory: "tax_amount",
    uiLabel: "§99의2 — 신축·미분양·1세대1주택 100%",
    effectLabel: "5년 내 100% / 5년 후 5년간 발생분 차감 (2013.4.1~2013.12.31, 6억↓ OR 85㎡↓, 가격 급등 지역 배제)",
  },

  // ── 별도 카테고리 ──
  self_farming: {
    id: "self_farming",
    article: TRANSFER_REDUCTION_ARTICLE.SELF_FARMING,
    category: "standalone",
    effectCategory: "tax_amount",
    uiLabel: "§69 — 자경농지 감면",
    effectLabel: "8년 이상 자경 (한도 1억)",
    isFullyImplemented: true,
  },
  public_expropriation: {
    id: "public_expropriation",
    article: TRANSFER_REDUCTION_ARTICLE.PUBLIC_EXPROPRIATION,
    category: "standalone",
    effectCategory: "tax_amount",
    uiLabel: "§77 — 공익사업 수용 감면",
    effectLabel: "현금 10% / 채권 15~40% (연간 한도 2억)",
    isFullyImplemented: true,
  },
};

/** 모든 ID를 카테고리별로 묶어 반환 — UI 펼침 패널 그룹핑 */
export function getReductionsByCategory(): Record<ReductionCategory, ReductionMetadata[]> {
  const groups: Record<ReductionCategory, ReductionMetadata[]> = {
    rental: [],
    new_housing: [],
    unsold_housing: [],
    standalone: [],
  };
  for (const meta of Object.values(REDUCTION_METADATA)) {
    groups[meta.category].push(meta);
  }
  return groups;
}

/** 23개 ID 전체 — 라우터 순회용 */
export const ALL_REDUCTION_IDS: TransferReductionId[] = Object.keys(REDUCTION_METADATA) as TransferReductionId[];
