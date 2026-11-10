"use client";

/**
 * §99·§99의3 공용 — 종전 고급주택 판정 입력(리뷰 NH-02)과 최초 계약 여부(리뷰 NH-03·NH-17).
 *
 * 판정은 엔진(`new-99-luxury-house.ts`·`new-99-acquisition-cause.ts`) 단일 진실이다. 이 컴포넌트는 입력만 받는다.
 * - 주택 유형: 기준일 당시 소득세법 시행령 §156 2호(공동주택 — 다가구 포함, 하나의 매매단위로 1인에게 양도하는 다가구는 §155⑮로 단독)
 *   / 1호(단독주택). 단독이면 연면적·딸린 토지·하한·3호 시설을 묻는다(3호는 단독주택에만 — 리뷰 Q-2 b).
 * - 최초 계약 여부: 주택건설사업자로부터 매매로 취득한 갈래만 묻는다(상속·증여 — 이월과세 증여 포함 — 는 엔진이 불성립, 리뷰 Q-3).
 */

import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";

type Tri = "yes" | "no" | "unknown";
type FormTri = "" | Tri;

export interface New99LuxuryValue {
  houseType: "" | "apartment" | "detached";
  grossFloorAreaSqm: string;
  attachedLandAreaSqm: string;
  stdPriceFloorMet: FormTri;
  luxuryFacility: FormTri;
}

const triOptions = (prefix: string, yes: string, no: string, unknownDesc: string) => [
  { value: "yes" as const, label: "예", description: yes, testId: `${prefix}-yes` },
  { value: "no" as const, label: "아니오", description: no, testId: `${prefix}-no` },
  { value: "unknown" as const, label: "모름", description: unknownDesc, testId: `${prefix}-unknown` },
];

export function New99LuxuryHouseFields({
  reductionType,
  testidPrefix,
  value,
  onChange,
  floorLabel,
}: {
  /** 감면 타입 — data-field 키 `reduction.<타입>.<속성><접미사>` (validate ⑧ 키와 같은 모양 — 앵커 커버리지 게이트) */
  reductionType: "new_99" | "new_99_3";
  /** 키 접미사 — validate(⑧) 필드 키와 같다 (`99`·`993`) */
  testidPrefix: string;
  value: New99LuxuryValue;
  onChange: (patch: Partial<New99LuxuryValue>) => void;
  /** 단독주택 하한 문구 — 기준일이 2000.12.31. 이전이면 취득세 시가표준액 2천만원, 그 뒤면 기준시가 4천만원 */
  floorLabel: string;
}) {
  const suffix = testidPrefix;
  return (
    <div className="space-y-2" data-testid={`new${suffix}-luxury-fields`}>
      <div data-field={`reduction.${reductionType}.houseType${suffix}`}>
        <p className="mb-1 text-sm font-medium">주택 유형 (고급주택 판정 — 기준일 당시 소득세법 시행령 §156)</p>
        <RadioCardGroup
          name={`new${suffix}-house-type`}
          tone="amber"
          layout="stack"
          value={value.houseType}
          onChange={(v) => onChange({ houseType: v })}
          options={[
            {
              value: "apartment" as const,
              label: "공동주택",
              description: "아파트·연립·다세대, 가구별로 나누어 양도하는 다가구주택 — 전용면적 기준(§156 2호)",
              testId: `new${suffix}-house-type-apartment`,
            },
            {
              value: "detached" as const,
              label: "단독주택",
              description: "하나의 매매단위로 1인에게 양도하는 다가구주택 포함(소득세법 시행령 §155⑮) — 연면적·딸린 토지·시설 기준(§156 1호·3호)",
              testId: `new${suffix}-house-type-detached`,
            },
          ]}
        />
      </div>
      {value.houseType === "detached" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">연면적 (㎡)</label>
            <DecimalInput
              data-field={`reduction.${reductionType}.grossFloorAreaSqm${suffix}`}
              value={value.grossFloorAreaSqm}
              onChange={(v) => onChange({ grossFloorAreaSqm: v })}
            />
            <p className="mt-1 text-caption text-muted-foreground">주택으로 보는 부분과 주거전용 지하실을 포함합니다 — 264㎡ 이상이면 면적 기준 충족 · 딸린 토지가 이 연면적의 2배를 넘으면 결과에 확인 필요 고지가 나옵니다 (조특법 §99①·§99의3①)</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">딸린 토지 면적 (㎡)</label>
            <DecimalInput
              data-field={`reduction.${reductionType}.attachedLandAreaSqm${suffix}`}
              value={value.attachedLandAreaSqm}
              onChange={(v) => onChange({ attachedLandAreaSqm: v })}
            />
            <p className="mt-1 text-caption text-muted-foreground">주택에 부수되는 토지 전체 면적 — 감면 대상 부수토지(건물 연면적 2배 이내)로 줄이지 않습니다. 495㎡ 이상이면 면적 기준 충족</p>
          </div>
          <div className="sm:col-span-2" data-field={`reduction.${reductionType}.stdPriceFloorMet${suffix}`}>
            <p className="mb-1 text-sm font-medium">주택의 {floorLabel}인가요?</p>
            <RadioCardGroup
              name={`new${suffix}-std-floor`}
              tone="amber"
              layout="inline"
              value={value.stdPriceFloorMet}
              onChange={(v) => onChange({ stdPriceFloorMet: v })}
              options={triOptions(`new${suffix}-std-floor`, "하한 이상", "하한 미만 — 면적·가액 기준을 넘어도 고급주택이 아닙니다", "고급주택으로 보고 결과에 확인 필요로 표시합니다")}
            />
          </div>
          <div className="sm:col-span-2" data-field={`reduction.${reductionType}.luxuryFacility${suffix}`}>
            <p className="mb-1 text-sm font-medium">엘리베이터·에스컬레이터·67㎡ 이상 수영장 중 하나라도 설치돼 있나요?</p>
            <RadioCardGroup
              name={`new${suffix}-facility`}
              tone="amber"
              layout="inline"
              value={value.luxuryFacility}
              onChange={(v) => onChange({ luxuryFacility: v })}
              options={triOptions(`new${suffix}-facility`, "가액과 관계없이 고급주택(§156 3호)", "설치 안 됨", "고급주택으로 보고 결과에 확인 필요로 표시합니다")}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 딸린 토지 «건물 연면적의 2배 이내» 확인용 선택 입력 — 종전 고급주택 판정 구간 밖(위 `New99LuxuryHouseFields`가 안 보이는 경우)의 §99의3에서 쓴다
 * (리뷰 NH-22 · 계획서 Q-2 a · Q-4 a). 같은 필드 키(`grossFloorAreaSqm`·`attachedLandAreaSqm`)를 재사용하므로 고급주택 구간 안팎에서 한 값이다.
 * 입력은 선택이다 — 한쪽이라도 비면 판정하지 않고, 계산은 어느 쪽이든 바뀌지 않는다(안분 방법이 법령에 없다).
 */
export function New99AppurtenantLandFields({
  reductionType,
  testidPrefix,
  grossFloorAreaSqm,
  attachedLandAreaSqm,
  onChange,
}: {
  reductionType: "new_99" | "new_99_3";
  testidPrefix: string;
  grossFloorAreaSqm: string;
  attachedLandAreaSqm: string;
  onChange: (patch: { grossFloorAreaSqm?: string; attachedLandAreaSqm?: string }) => void;
}) {
  const suffix = testidPrefix;
  return (
    <div className="space-y-2" data-testid={`new${suffix}-appurtenant-land-fields`}>
      <p className="text-xs font-medium">딸린 토지 범위 확인 (선택 · 단독주택만)</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">건물 연면적 (㎡)</label>
          <DecimalInput
            data-field={`reduction.${reductionType}.grossFloorAreaSqm${suffix}`}
            value={grossFloorAreaSqm}
            onChange={(v) => onChange({ grossFloorAreaSqm: v })}
          />
          <p className="mt-1 text-xs text-muted-foreground">전체 층의 합계입니다</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">딸린 토지 면적 (㎡)</label>
          <DecimalInput
            data-field={`reduction.${reductionType}.attachedLandAreaSqm${suffix}`}
            value={attachedLandAreaSqm}
            onChange={(v) => onChange({ attachedLandAreaSqm: v })}
          />
          <p className="mt-1 text-xs text-muted-foreground">주택에 부수되는 토지 전체 면적</p>
        </div>
      </div>
      <p className="text-caption text-muted-foreground" data-testid={`new${suffix}-appurtenant-land-hint`}>
        신축주택에는 건물 연면적의 2배 이내의 딸린 토지만 포함됩니다 (조특법 §99의3①). 토지가 2배를 넘으면 결과에 확인 필요 고지가 나옵니다 —
        초과분을 안분하는 방법이 법령에 없어 계산에는 반영하지 않습니다. 공동주택은 입력하지 마세요.
      </p>
    </div>
  );
}

/**
 * 최초 계약 여부 — 주택건설사업자 갈래 · 매매 취득에서만 렌더한다(호출자가 `needsFirstContractAnswer`로 가린다).
 * 호출자가 `data-field` 앵커(문자열 그대로)로 감싼다 — validate(⑧) 키와 정적 대조된다.
 */
export function New99FirstContractField({
  testidPrefix,
  value,
  onChange,
  lawLabel,
}: {
  testidPrefix: string;
  value: FormTri;
  onChange: (v: Tri) => void;
  /** 「조세특례제한법 §99①2호」 등 */
  lawLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">주택건설업자와 최초로 매매계약을 체결하고 계약금을 낸 사람이 본인인가요?</p>
      <RadioCardGroup
        name={`${testidPrefix}-first-contract`}
        tone="amber"
        layout="stack"
        value={value}
        onChange={onChange}
        data-testid={`${testidPrefix}-first-contract`}
        options={triOptions(
          `${testidPrefix}-first-contract`,
          "본인이 분양계약을 체결하고 계약금을 냈다",
          "분양권을 사서(승계·전매) 취득했다 — 적용되지 않습니다",
          "적용하지 않고 결과에 확인 필요로 표시합니다",
        )}
      />
      <p className="text-caption text-muted-foreground">«주택건설업자와 최초로 매매계약을 체결하고 계약금을 납부한 자가 취득»한 주택만 대상입니다 ({lawLabel})</p>
    </div>
  );
}
