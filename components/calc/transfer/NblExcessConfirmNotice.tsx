import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE,
  NBL_STATE_AT_TRANSFER_APPLIED_NOTICE,
} from "@/lib/tax-engine/nbl-confirm-notices";

/**
 * 건축물 부속토지 기준면적 초과분(일반건물·상업용건물) 입력 화면 고지 — NBL2611-V10-BX06·V2-C2.
 *
 * 초과분이 생기는 입력일 때만 호출부가 띄운다. 판정을 하지 않는다는 사실과 «양도일 현재 상태를 소유기간 전체에 적용»만 알린다.
 * 문구는 결과 화면 「확인이 필요한 사항」과 같은 상수(`nbl-confirm-notices.ts`)를 읽는다.
 * `includeStateNotice=false`는 상업용건물처럼 «양도일 현재 상태 가정» 고지가 엔진 경고로만 나가는 경로용이다.
 */
export function NblExcessConfirmNotice({ includeStateNotice = true }: { includeStateNotice?: boolean }) {
  return (
    <ToneCard tone="amber" title="확인 필요" bodyClassName="space-y-1" className="mt-1">
      <p className="text-caption text-amber-800 dark:text-amber-300">{NBL_BUILDING_SITE_EXCESS_UNJUDGED_NOTICE}</p>
      {includeStateNotice && <p className="text-caption text-amber-800 dark:text-amber-300">{NBL_STATE_AT_TRANSFER_APPLIED_NOTICE}</p>}
    </ToneCard>
  );
}
