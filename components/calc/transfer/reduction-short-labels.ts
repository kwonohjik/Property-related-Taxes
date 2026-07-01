/**
 * 양도세 감면 조문 short 라벨 — 사이드바 「공제·감면 사항」 목록 표시용.
 * Record<ReductionType, string> 로 정의해 신규 감면 type 추가 시 tsc가 누락을 강제 감지.
 * 라벨 문구는 UnifiedReductionPanel-defaults.ts STANDALONE_LABELS 와 일관.
 */

import type { ReductionType } from "@/lib/stores/calc-wizard-asset-reduction";

export const REDUCTION_SHORT_LABELS: Record<ReductionType, string> = {
  self_farming: "자경농지 감면 (§69)",
  public_expropriation: "공익사업 수용 감면 (§77)",
  gb_designated_land: "개발제한구역 매수 토지 감면 (§77의3)",
  replacement_land_comp: "대토보상 과세특례 (§77의2)",
  long_term_rental: "장기임대주택 감면 (§97)",
  new_housing: "신축주택 감면 (§99)",
  unsold_housing: "미분양주택 감면 (§98)",
  new_99_3: "신축주택 특례 (§99의3)",
  rental_97_3: "장기일반민간임대 (§97의3)",
  rental_97_4: "장기임대주택 (§97의4)",
  rental_97_5: "장기임대주택 (§97의5)",
  rental_97_main: "장기임대주택 (§97)",
  rental_97_proviso: "장기임대주택 단서 (§97①)",
  rental_97_2: "신축임대주택 (§97의2)",
  new_99_4_rural: "농어촌주택 (§99의4)",
  new_99_4_hometown: "고향주택 (§99의4)",
  new_99: "신축주택 (§99)",
  unsold_98: "미분양 국민주택 (§98)",
  unsold_98_2: "지방 미분양 (§98의2)",
  unsold_98_3: "서울 밖 미분양 (§98의3)",
  unsold_98_4: "비거주자 미분양 (§98의4)",
  unsold_98_5: "수도권 밖 미분양 (§98의5)",
  unsold_98_6: "준공후미분양 (§98의6)",
  unsold_98_7: "9억 이하 미분양 (§98의7)",
  unsold_98_8: "준공후미분양 (§98의8)",
  unsold_98_9: "수도권 밖 준공후미분양 (§98의9)",
  unsold_99_2: "신축·미분양 1세대1주택 (§99의2)",
};
