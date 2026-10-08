"use client";

/**
 * 파트(토지·건물) 취득 방식별 조건부 입력 — `LandBuildingSplitSection`에서 추출(B1, 2026-10-07).
 *
 * 주택·건물 split(`LandBuildingSplitSection`)과 겸용 별개 취득(`MixedUseSeparateAcqBlock`)이 **같은 입력 위젯**을 쓴다.
 * 문구를 한 곳에 두어 한쪽만 고쳐져 드리프트하는 것을 막는다(복제 금지).
 *
 * 신규 prop 2개는 **기본값이 현행 동작**이다(기존 호출부 무변경):
 *   · `testIdPrefix`(기본 `"split"`) — 겸용은 `"mixed-split"`으로 testid를 분리한다(한 화면에 두 변종이 공존해도 E2E strict mode가 깨지지 않는다).
 *   · `estimatedNote`(기본 = 현행 「위 『○○ 취득시 기준시가』 카드」 안내) — 겸용은 그 카드가 없으므로 겸용 문구를 주입한다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import type { RadioCardOption } from "@/components/calc/inputs/RadioCardGroup";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { Frac } from "@/components/calc/results/shared/FormulaParts";
import type { PartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { ReactNode } from "react";

export const ACQ_MODE_OPTIONS: RadioCardOption<PartAcqMode>[] = [
  { value: "actual", label: "실거래가" },
  { value: "estimated", label: "환산취득가" },
  { value: "appraisal", label: "감정가액" },
  { value: "salesCase", label: "매매사례가액" },
];

/** 파트 취득 방식별 조건부 입력 (actual/appraisal은 총액 직접입력, salesCase는 매매사례가, estimated는 안내만) */
export function PartAcqInputs(props: {
  part: "land" | "building";
  mode: PartAcqMode;
  /** 별개 취득 — 총액 잔액 도출·안분이 폐지되어 파트별 입력이 **필수**가 된다 */
  isSeparateAcq: boolean;
  acquisitionPrice: string;
  onAcquisitionPriceChange: (v: string) => void;
  salesCaseValue: string;
  onSalesCaseValueChange: (v: string) => void;
  /** 양도시 기준시가 카드가 **이 파트 섹션 안**에 있는가 — 안내 문구가 가리킬 대상이 달라진다(기본 안내문 전용) */
  saleStdInPart?: boolean;
  /** testid 접두 — 기본 `"split"` (겸용은 `"mixed-split"`) */
  testIdPrefix?: string;
  /** 환산 안내 문구 교체 — 지정하면 기본 안내(`○○ 취득시 기준시가 카드` 지시)를 대신한다 */
  estimatedNote?: ReactNode;
  /** 실거래가 칸 라벨·hint 교체 — 토지를 상속·증여로 취득한 매매 건물(D1-2: 「토지 상속개시일 평가액」 등) */
  actualLabel?: string;
  actualHint?: string;
}) {
  const label = props.part === "land" ? "토지" : "건물";
  const tid = props.testIdPrefix ?? "split";
  if (props.mode === "actual" || props.mode === "appraisal") {
    const isApr = props.mode === "appraisal";
    return (
      <FieldCard
        field={props.part === "land" ? "landAcquisitionPrice" : "buildingAcquisitionPrice"}
        label={!isApr && props.actualLabel ? props.actualLabel : `${label} ${isApr ? "감정가액" : "취득가액"}`}
        hint={
          !isApr && props.actualHint
            ? props.actualHint
            : props.isSeparateAcq
              ? "취득시기가 다르므로 나머지 금액에서 자동 계산되지 않습니다 (소득세법 §97①1호·§114⑦)"
              : undefined
        }
      >
        <CurrencyInput
          label=""
          value={props.acquisitionPrice}
          onChange={props.onAcquisitionPriceChange}
          required={props.isSeparateAcq}
          // 별개 취득에서는 잔액 규칙이 폐지되어 "미입력 시 자동 계산" 안내가 거짓이 된다.
          placeholder={props.isSeparateAcq ? undefined : "미입력 시 나머지에서 자동 계산"}
          // testid는 방식별로 분리한다 — 저장 필드는 같아도(Q3) E2E에서 두 모드를 구분해야 한다.
          data-testid={isApr ? `${tid}-${props.part}-appraisal-value` : `${tid}-${props.part}-acq-price`}
        />
      </FieldCard>
    );
  }
  if (props.mode === "salesCase") {
    return (
      <FieldCard
        field={props.part === "land" ? "landSalesCaseValue" : "buildingSalesCaseValue"}
        label={`${label} 매매사례가액`}
        hint={
          props.isSeparateAcq
            ? "매매사례 탐색 기간이 파트별 취득일 전후 3개월로 서로 달라 총액을 안분할 수 없습니다 (소득령 §176의2③1호)"
            : "미입력 시 취득시 기준시가 비율로 안분(소득령 §166⑥)"
        }
      >
        <CurrencyInput
          label=""
          value={props.salesCaseValue}
          onChange={props.onSalesCaseValueChange}
          required={props.isSeparateAcq}
          placeholder={props.isSeparateAcq ? undefined : "없으면 비워두세요"}
          data-testid={`${tid}-${props.part}-salescase-value`}
        />
      </FieldCard>
    );
  }
  // estimated — 실입력 칸은 두지 않고 **위치만 지시**한다(입력 칸을 여기 복제하면 dual-truth).
  if (props.estimatedNote !== undefined) {
    return (
      <ToneCard tone="amber" noDark bodyClassName="space-y-1">
        <div className="text-xs text-amber-900" data-testid={`${tid}-${props.part}-estimated-note`}>
          {props.estimatedNote}
        </div>
      </ToneCard>
    );
  }
  //
  // ⚠️ 방향은 "위"다. 축 A(양도시 기준시가)는 2026-07-29에 `LandBuildingSaleSplitSection`으로
  //    분리되며 **앞으로** 이동했고, 취득시 카드(PartAcqStdPrice)도 이 안내보다 앞에 렌더된다.
  //    종전 문구는 둘 다 "아래"라고 가리켜 사용자가 입력 위치를 찾지 못했다.
  // 2026-07-30부터 주택도 건물분 카드를 노출하므로(§163⑥2호가목 "취득당시" 요건 — 별개취득에는
  // 라목 결합 공시가 없다) 자산 종류로 갈리지 않는다. 종전 주택 분기(역산 서술)는 폐지.
  const acqSource = `위 「${label} 취득시 기준시가」 카드`;
  // 양도시 기준시가 카드는 배치에 따라 이 섹션 안(구분양도+환산) 또는 축 A(일괄양도)에 있다.
  // 없는 카드 이름을 가리키면 사용자가 입력 위치를 찾지 못한다(2026-07-30 배치 분리).
  const transferSource = props.saleStdInPart
    ? `위 「${label} 양도시 기준시가」 카드`
    : "위 「양도시 기준시가」 카드(양도가액 토지·건물 안분 방식 아래)";
  return (
    <ToneCard tone="amber" noDark bodyClassName="space-y-1">
      <p className="text-xs text-amber-900" data-testid={`${tid}-${props.part}-estimated-note`}>
        {label} 환산취득가 = {label} 양도가액 × <Frac top="취득시 기준시가" bottom="양도시 기준시가" />
        <br />· 취득시 기준시가 → {acqSource}
        <br />· 양도시 기준시가 → {transferSource}
      </p>
    </ToneCard>
  );
}
