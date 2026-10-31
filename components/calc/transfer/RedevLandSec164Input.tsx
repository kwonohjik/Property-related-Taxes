"use client";

/**
 * 원조합원 재개발 자산 — 1990.8.30. 전 취득 종전 토지의 「취득당시 토지 ㎡당 단가」를 영 §164④로 채우는 입력
 * (계획서 successor-right-carryover-contribution.plan.md §18 Q-1·Q-2 a).
 *
 * 게이트·파생은 `lib/calc/transfer-pre1990-redev-bridge.ts` 단일 소스 — ④·⑧과 같은 함수를 읽는다.
 * 상속·증여받은 토지 출자는 취득 정보의 §163⑨ ② 칸(#2782)이 같은 `pre1990*` 5필드를 이미 받으므로 칸을 다시 그리지 않고 안내만 한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { deriveRedevLandSec164PerSqm, redevLandSec164Applies } from "@/lib/calc/transfer-pre1990-redev-bridge";
import { sec164LandStatus } from "@/lib/calc/sec164-required-fields";
import { redevPreApprovalAcquisitionDate } from "@/lib/calc/redev-carryover-acq-mode";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
}

/**
 * ③ 분자 칸이 상속·증여 §163⑨ ② 칸과 5필드를 공유하는가 — 1990.8.30. 전 상속·증여받은 토지 출자(`sec164LandStatus`가 토지 자산·상속·증여만 받는다).
 * 이월과세(`carryover_gift`)·주택 출자는 여기서 빠진다 — ② 칸이 없거나 다른 필드다.
 */
function sharesSec163_9LandFields(asset: AssetForm): boolean {
  return sec164LandStatus(asset) !== null;
}

export function RedevLandSec164Input({ asset, onChange }: Props) {
  if (!redevLandSec164Applies(asset)) return null;
  const derived = deriveRedevLandSec164PerSqm(asset);
  const derivedText = derived ? `${derived.toLocaleString()}원/㎡` : "칸을 모두 채우면 계산됩니다";

  if (sharesSec163_9LandFields(asset)) {
    return (
      <p className="text-caption text-muted-foreground" data-testid="redev-land-sec164-shared-note">
        1990.8.30. 전 취득이라 그때의 개별공시지가가 없습니다. 위 칸을 비워 두면 취득 정보의 「1990.8.30. 이전 취득 토지 기준시가 환산 (§164④)」 칸으로
        환산한 값({derivedText})을 씁니다. (「소득세법」 제99조제3항제2호 · 시행령 제164조제4항)
      </p>
    );
  }

  return (
    <div className="space-y-1.5" data-testid="redev-land-sec164-input">
      <p className="text-caption text-muted-foreground">
        1990.8.30. 전 취득이라 그때의 개별공시지가가 없습니다. 위 칸을 비워 두면 아래 환산값({derivedText})을 씁니다.
        (「소득세법」 제99조제3항제2호 · 시행령 제164조제4항)
      </p>
      <Pre1990LandValuationInput
        form={{
          pre1990Enabled: asset.pre1990Enabled,
          pre1990PricePerSqm_1990: asset.pre1990PricePerSqm_1990,
          pre1990PricePerSqm_atTransfer: asset.pre1990PricePerSqm_atTransfer,
          pre1990Grade_current: asset.pre1990Grade_current,
          pre1990Grade_prev: asset.pre1990Grade_prev,
          pre1990Grade_atAcq: asset.pre1990Grade_atAcq,
          pre1990GradeMode: asset.pre1990GradeMode,
        }}
        onChange={(patch) => onChange(patch)}
        acquisitionArea={asset.redevLandArea || undefined}
        jibun={asset.addressJibun || undefined}
        acquisitionDate={redevPreApprovalAcquisitionDate(asset)}
        alwaysOpen
      />
    </div>
  );
}
