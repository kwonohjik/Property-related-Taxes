"use client";

/**
 * 1990.8.30. 전 상속·증여 토지 파트의 **②(영 §164④ 가액) 입력 카드** — D1-4b.
 *
 * 설계: docs/02-design/features/transfer-acq-cause-mixed-d1-4.ui.design.md §2 · 계획서 §11
 *
 * 「소득세법 시행령」 §163⑨ 단서 1호: 1990.8.30. 개별공시지가가 고시되기 전에 상속·증여받은 토지의 취득가액은 상속개시일·증여일
 * 현재 평가액(①)과 영 §164④ 가액(②) 중 **많은 금액**이다. 그 시기에는 개별공시지가가 없어 ②는 토지등급 환산으로만 얻는다.
 *
 * - 노출은 단서 구간(`landSec164Applies` — 유효 토지 원인 ∧ 토지 취득일 < 1990-08-30)일 때만, 호스트(신축·매매) 공통이다.
 * - 비교는 법이 정한 계산이라 토글을 두지 않는다(`Pre1990LandValuationInput`의 `alwaysOpen`). 환산 래치 `pre1990Enabled`는 읽지도 쓰지도 않는다.
 * - `onCalculatedPrice`를 주지 않는다 — 파생값을 store에 쓰는 effect(미러링)를 켜지 않는다. 아래 ㎡당 가액·② 총액은 **④가 보내는 것과 같은
 *   브리지 함수**(`deriveHousingLandSec164PerSqm`·`…Total`)를 읽어 표시만 한다(3중 패턴).
 * - 입력 화면에는 채택값(max)이 없다 — 채택은 엔진이 하고 결과 화면이 echo로 보인다.
 * - 토지 면적은 기본 정보의 칸(`acquisitionArea`)을 쓴다 — 같은 면적을 두 곳에서 받지 않는다.
 */
import { Pre1990LandValuationInput } from "@/components/calc/inputs/Pre1990LandValuationInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LAND_CAUSE_META, type LandCause } from "./land-cause-meta";
import {
  deriveHousingLandSec164PerSqm,
  deriveHousingLandSec164Total,
  isPartialAreaScenario,
  landSec164Applies,
} from "@/lib/calc/transfer-pre1990-housing-land-bridge";
import { getOwnershipRatio } from "@/lib/calc/transfer-tax-api-asset-basics";
import { sec164LandPartStatus } from "@/lib/calc/sec164-required-fields";
import { SPLIT_SEC164_VALUE_LABEL } from "@/lib/tax-engine/transfer-tax-split-display";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const fmt = (n: number) => n.toLocaleString();

export function LandSec164Card(props: {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}) {
  const { asset, onChange } = props;
  if (!landSec164Applies(asset)) return null;

  const cause = (asset.landAcquisitionCause || "inheritance") as LandCause;
  const meta = LAND_CAUSE_META[cause];
  const partial = isPartialAreaScenario(asset);
  const status = sec164LandPartStatus(asset);
  const perSqm = deriveHousingLandSec164PerSqm(asset);
  const total = deriveHousingLandSec164Total(asset);
  const ratio = getOwnershipRatio(asset);
  const area = parseFloat((asset.acquisitionArea ?? "").replace(/,/g, "")) || 0;

  return (
    <div className="space-y-2" data-testid="land-sec164-card" data-field="landSec164Value">
      <ToneCard tone="amber" noDark>
        <p className="text-xs text-amber-900">
          토지를 {meta.dateLabel}에 {meta.label}받았는데 그때는 개별공시지가가 고시되기 전(1990.8.30. 이전)이라 토지등급으로 환산한{" "}
          <strong>{SPLIT_SEC164_VALUE_LABEL}</strong>을 구합니다. 이 가액과 위 {meta.valueLabel} 중{" "}
          <strong>많은 금액</strong>이 토지 취득가액입니다 (소득세법 시행령 §163조 제9항 단서 1호). 토지 면적은 기본 정보의 토지 면적을
          사용하고, 취득일을 바꾸면 취득시 등급을 다시 확인하세요.
        </p>
      </ToneCard>

      <Pre1990LandValuationInput
        form={asset}
        onChange={onChange}
        acquisitionArea={asset.acquisitionArea}
        jibun={asset.addressJibun || undefined}
        acquisitionDate={asset.landAcquisitionDate}
        transferDate={props.transferDate}
        alwaysOpen
      />

      {partial ? (
        <ToneCard tone="amber" noDark>
          <p className="text-xs text-amber-900" data-testid="land-sec164-partial-note">
            면적 입력 방식이 「일부 양도」이면 이 비교를 지원하지 않습니다 — 평가액이 취득 전체분인지 양도분인지 정해지지 않았고 면적으로
            자동 안분하지 않습니다. 기본 정보에서 면적 입력 방식을 확인하세요.
          </p>
        </ToneCard>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-xs space-y-1" data-testid="land-sec164-derived">
          {perSqm !== null && total > 0 ? (
            <>
              <p>
                ㎡당 가액 <span className="font-mono tabular-nums" data-testid="land-sec164-per-sqm">{fmt(perSqm)}</span> × 토지 면적{" "}
                <span className="font-mono tabular-nums">{fmt(area)}</span>㎡
                {ratio < 1 && ` × 지분 ${Number((ratio * 100).toFixed(4))}%`}
              </p>
              <p className="font-medium">
                {SPLIT_SEC164_VALUE_LABEL} <span className="font-mono tabular-nums" data-testid="land-sec164-total">{fmt(total)}</span>
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {status.missing.length > 0
                ? `입력할 칸: ${status.missing.join(" · ")}`
                : "토지등급 입력을 확인하세요 — 등급번호(1~365) 또는 등급가액으로 영 §164④ 가액을 계산할 수 없습니다."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
