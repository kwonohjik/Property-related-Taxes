"use client";

import { useState } from "react";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { computeDerivedAreas, round2 } from "@/lib/tax-engine/mixed-use-derived-areas";
import { residualArea } from "@/lib/tax-engine/area-utils";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  sectionNum?: number;
}

/**
 * 면적·부수토지·지역 통합 카드 (섹션 ①) — 겸용주택 면적의 **단일 소스**.
 *
 * - 전용/공통면적 입력 → 공통면적을 전용비율로 안분해 주택/상가 연면적 파생.
 * - 파생 6칸(연면적 2·정착면적 2·부수토지 2)은 모두 **직접 수정 가능**하며,
 *   수정값은 override로 store에 저장돼 후속 화면·엔진이 이 값을 조회한다.
 * - 부수토지 두 칸을 모두 수정해 합이 전체 토지와 다르면 validate가 계산을 차단한다
 *   (`lib/calc/transfer-tax-validate-mixed-area.ts` — 엔진의 4분기 중 rSet&&cSet 경로).
 * - PHD ON이면 부수토지 override는 배타(§164⑦ 법정 입력이 담당) → 두 칸 비활성.
 * - 수도권 배율 지역 토글(§168의12) 흡수.
 */
export function MixedUseAreaInputs({ asset, onChange, sectionNum }: Props) {
  const residential = parseDecimal(asset.residentialFloorArea);
  const commercial = parseDecimal(asset.nonResidentialFloorArea);
  const total = residential + commercial;
  const totalLand = parseDecimal(asset.mixedUseTotalLandArea);
  const footprint = parseDecimal(asset.buildingFootprintArea);

  /**
   * 상가 정착면적 편집 중 원문 버퍼.
   *
   * 이 칸의 store 축은 주택(`mixedResidentialFootprintOverride`)이라 값을 역산 저장한다.
   * 표시까지 역산 결과에서 되돌리면 사용자가 친 "46."이 숫자로 정규화(→"46")돼
   * **소수점을 입력할 수 없다** → 편집 중에는 원문을 그대로 보여준다.
   *
   * 무효화는 **자기검증**(`bufferValid`)으로 한다 — 버퍼를 역산해 현재 store 값이 안 나오면
   * store가 다른 경로로 움직였다는 뜻이므로 버려진다. 클리어 호출을 조작 지점마다 흩뿌리면
   * 이력 불러오기처럼 asset이 통째로 교체되는 경로를 놓쳐 stale 표시가 남는다.
   * (store→state 미러링 아님 — 편집 세션 로컬 원문. useEffect 없음)
   */
  const [commercialFootprintRaw, setCommercialFootprintRaw] = useState<string | null>(null);

  // ── three-state override (빈문자열=자동, "0"=적법한 0) ──
  // `parseDecimal`은 빈값에 0을 돌려주므로 **문자열 수준**에서 분기해야 한다.
  const landOv = asset.mixedResidentialLandAreaOverride ?? "";
  const commLandOv = asset.mixedCommercialLandAreaOverride ?? "";
  const fpOv = asset.mixedResidentialFootprintOverride ?? "";
  // 부수토지 override는 PHD 여부와 무관 (2026-07-15 배타 해제 — API·validate·사이드바 동일).
  // 종전 게이트의 명분("PHD의 preHousingDisclosure.landArea가 담당")은 그 필드가 ⑫ Zod에서
  // strip돼 엔진 미도달이라 성립하지 않았고, PHD ON에서 부수토지를 지정할 길을 없앨 뿐이었다.
  const hasLandOv = landOv.trim() !== "";
  const hasCommLandOv = commLandOv.trim() !== "";
  // 정착면적 override는 PHD 무관 (§168의12 배율초과 NBL 판정용 — 부수토지 축과 별개).
  const hasFpOv = fpOv.trim() !== "";

  const derived = computeDerivedAreas({
    residentialFloorArea: residential,
    nonResidentialFloorArea: commercial,
    buildingFootprintArea: footprint,
    totalLandArea: totalLand,
    ...(hasLandOv ? { residentialLandAreaOverride: parseDecimal(landOv) } : {}),
    ...(hasCommLandOv ? { commercialLandAreaOverride: parseDecimal(commLandOv) } : {}),
    ...(hasFpOv ? { residentialFootprintOverride: parseDecimal(fpOv) } : {}),
  });

  // 연면적 2칸이 전용/공통 소스에서 파생 중인가 — 직접 편집 시 전용/공통이 클리어돼 false로 전환.
  const floorDerived =
    parseDecimal(asset.residentialExclusiveArea) + parseDecimal(asset.commercialExclusiveArea) > 0;

  const areaComputable = total > 0;
  const fpComputable = areaComputable && footprint > 0;
  const landComputable = areaComputable && totalLand > 0;
  const commercialFootprint = residualArea(footprint, derived.residentialFootprintArea);

  /** 버퍼가 아직 현재 store 값을 만들어내는가 — 아니면 store가 다른 경로로 움직인 것이라 버린다. */
  const bufferValid =
    commercialFootprintRaw !== null &&
    commercialFootprintRaw.trim() !== "" &&
    String(residualArea(footprint, round2(parseDecimal(commercialFootprintRaw)))) === fpOv;

  // 표시값 = override 원문 우선, 없으면 파생값 (엔진이 같은 computeDerivedAreas로 동일 파생 —
  // 미전송과 전송이 같은 값이므로 dual-truth 아님. ui.design.md §2-4)
  const show = (raw: string, auto: number, computable: boolean) =>
    raw !== "" ? raw : computable ? String(auto) : "";

  // ── write 핸들러 (모두 같은 patch로 동시 write — useEffect → store 미러링 금지) ──

  /** 전용/공통 변경 → 연면적 파생. */
  const onExclusiveChange = (patch: Partial<AssetForm>) => {
    const next = { ...asset, ...patch };
    const exR = parseDecimal(next.residentialExclusiveArea);
    const exC = parseDecimal(next.commercialExclusiveArea);
    const common = parseDecimal(next.commonArea);
    const exTotal = exR + exC;
    if (exTotal > 0) {
      const r = round2(exR + (common * exR) / exTotal);
      const c = residualArea(exTotal + common, r); // 잔액흡수: 합 = 전용합+공통 보장
      onChange({ ...patch, residentialFloorArea: String(r), nonResidentialFloorArea: String(c) });
    } else {
      // 전용 둘 다 빈값이면 연면적 write 안 함 (legacy 이력 보존)
      onChange(patch);
    }
  };

  /**
   * 연면적 직접 편집 → 전용/공통 3필드 클리어 (ui.design.md §2-A2 "가").
   * 연면적은 파생이 아니라 **실필드**다. 전용/공통을 남겨두면 다음 전용 편집 때
   * 사용자가 친 연면적이 조용히 덮어써진다 → 편집 시점에 파생 소스를 끊는다.
   */
  const onFloorAreaChange = (patch: Partial<AssetForm>) => {
    onChange({
      ...patch,
      residentialExclusiveArea: "",
      commercialExclusiveArea: "",
      commonArea: "",
    });
  };

  /** 상가 정착면적 편집 → 주택분 역산 저장 (엔진 축은 주택). */
  const onCommercialFootprintChange = (v: string) => {
    setCommercialFootprintRaw(v);
    if (v.trim() === "") {
      onChange({ mixedResidentialFootprintOverride: "" });
      return;
    }
    // ⚠️ 건물 정착면적 미입력 시 역산은 음수가 된다(residualArea(0, 46) = −46).
    //    DecimalInput이 "−"를 입력 단계에서 제거하므로 그 칸은 타이핑으로 되돌릴 수 없다
    //    → store write를 건너뛰고 원문만 보관한다(건물 정착면적 입력 시 정상 역산으로 복귀).
    if (footprint <= 0) return;
    onChange({
      mixedResidentialFootprintOverride: String(residualArea(footprint, round2(parseDecimal(v)))),
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        {sectionNum !== undefined && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-micro font-bold text-slate-800 select-none">
            {sectionNum}
          </span>
        )}
        <p className="text-xs font-semibold text-slate-700">면적·부수토지·지역 정보</p>
      </div>

      {/* 면적 소그룹 (sky) — 용도변경 ON이면 1-A(취득시)와 시점 구분을 위해 "양도시" 명시 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
        <p className="text-xs font-semibold text-sky-700">
          {asset.hasPartialUsageChange ? "양도시 면적 (건축물대장 기준)" : "면적 (건축물대장 기준)"}
        </p>
        {asset.hasPartialUsageChange && (
          <p className="text-caption text-sky-700/80 leading-relaxed">
            ※ 이 카드의 면적·부수토지는 <span className="font-semibold">양도시</span> 기준입니다.
            취득시 면적은 <span className="font-semibold">③ 취득정보</span>의 1-A 「취득시점 자산 구성」에서
            자동 도출·수정합니다.
          </p>
        )}

        {/* 전용/공통 3열 한 행 — 연면적 자동 산출용 보조 입력 */}
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">주택 전용면적 (㎡)</label>
            <DecimalInput
              value={asset.residentialExclusiveArea}
              onChange={(v) => onExclusiveChange({ residentialExclusiveArea: v })}
              placeholder="주택 전용면적"
              unit="㎡"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">상가 전용면적 (㎡)</label>
            <DecimalInput
              value={asset.commercialExclusiveArea}
              onChange={(v) => onExclusiveChange({ commercialExclusiveArea: v })}
              placeholder="상가(비주택) 전용면적"
              unit="㎡"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">공통면적 (㎡)</label>
            <DecimalInput
              value={asset.commonArea}
              onChange={(v) => onExclusiveChange({ commonArea: v })}
              placeholder="공용(공통)면적"
              unit="㎡"
            />
          </div>
        </div>

        {/* 정착·전체토지 2열 한 행 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">건물 정착면적 (수평 투영, ㎡)</label>
            <DecimalInput
              value={asset.buildingFootprintArea}
              onChange={(v) =>
                // 건물 정착면적 변경 시 주택 정착 override 클리어 (stale 방지)
                onChange({ buildingFootprintArea: v, mixedResidentialFootprintOverride: "" })
              }
              placeholder="건축물대장의 건축면적"
              unit="㎡"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700">전체 토지 면적 (㎡)</label>
            <DecimalInput
              value={asset.mixedUseTotalLandArea}
              onChange={(v) =>
                // 전체 토지 변경 시 부수토지 override 양쪽 클리어 (stale 방지)
                onChange({
                  mixedUseTotalLandArea: v,
                  mixedResidentialLandAreaOverride: "",
                  mixedCommercialLandAreaOverride: "",
                })
              }
              placeholder="전체 토지 면적"
              unit="㎡"
            />
          </div>
        </div>

        {/* 계산 결과 6칸 — 전부 수정 가능 (쌍별 2열 × 3행) */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded-lg bg-sky-100/60 border border-sky-200"
          data-testid="mixed-derived-floor"
        >
          <FieldCard
            label="주택 연면적 (㎡)"
            stacked
            badge={floorDerived ? <AreaBadge manual={false} /> : undefined}
          >
            <DecimalInput
              value={asset.residentialFloorArea}
              onChange={(v) => onFloorAreaChange({ residentialFloorArea: v })}
              placeholder="주택 연면적"
              unit="㎡"
              data-testid="mixed-area-residential-floor"
            />
          </FieldCard>
          <FieldCard
            label="상가 연면적 (㎡)"
            stacked
            badge={floorDerived ? <AreaBadge manual={false} /> : undefined}
          >
            <DecimalInput
              value={asset.nonResidentialFloorArea}
              onChange={(v) => onFloorAreaChange({ nonResidentialFloorArea: v })}
              placeholder="상가 연면적"
              unit="㎡"
              data-testid="mixed-area-commercial-floor"
            />
          </FieldCard>

          <FieldCard
            label="주택 정착면적 (㎡)"
            stacked
            badge={
              <AreaBadge
                manual={hasFpOv}
                onReset={() => onChange({ mixedResidentialFootprintOverride: "" })}
              />
            }
          >
            <DecimalInput
              value={show(fpOv, derived.residentialFootprintArea, fpComputable)}
              onChange={(v) => onChange({ mixedResidentialFootprintOverride: v })}
              placeholder="주택 정착면적"
              unit="㎡"
              data-testid="mixed-area-residential-footprint"
            />
          </FieldCard>
          <FieldCard
            label="상가 정착면적 (㎡)"
            stacked
            badge={
              <AreaBadge
                manual={hasFpOv}
                onReset={() => onChange({ mixedResidentialFootprintOverride: "" })}
              />
            }
            hint="수정하면 주택 정착면적이 자동 조정됩니다."
          >
            <DecimalInput
              value={bufferValid ? commercialFootprintRaw! : fpComputable ? String(commercialFootprint) : ""}
              onChange={onCommercialFootprintChange}
              placeholder="상가 정착면적"
              unit="㎡"
              data-testid="mixed-area-commercial-footprint"
            />
          </FieldCard>

          <FieldCard
            label="주택 부수토지 (㎡)"
            stacked
            badge={
              <AreaBadge
                manual={hasLandOv}
                onReset={() => onChange({ mixedResidentialLandAreaOverride: "" })}
              />
            }
          >
            <DecimalInput
              value={show(landOv, derived.residentialLandArea, landComputable)}
              onChange={(v) => onChange({ mixedResidentialLandAreaOverride: v })}
              placeholder="주택 부수토지"
              unit="㎡"
              data-testid="mixed-area-residential-land"
            />
          </FieldCard>
          <FieldCard
            label="상가 부수토지 (㎡)"
            stacked
            badge={
              <AreaBadge
                manual={hasCommLandOv}
                onReset={() => onChange({ mixedCommercialLandAreaOverride: "" })}
              />
            }
          >
            <DecimalInput
              value={show(commLandOv, derived.commercialLandArea, landComputable)}
              onChange={(v) => onChange({ mixedCommercialLandAreaOverride: v })}
              placeholder="상가 부수토지"
              unit="㎡"
              data-testid="mixed-area-commercial-land"
            />
          </FieldCard>
        </div>

        {/* V2 — 부수토지 두 칸 모두 수정 + 합계 불일치 (validate가 계산도 차단) */}
        {hasLandOv && hasCommLandOv && landComputable && (
          <LandSumWarning
            sum={round2(parseDecimal(landOv) + parseDecimal(commLandOv))}
            totalLand={round2(totalLand)}
          />
        )}
      </div>

      {/* 지역 소그룹 (rose) */}
      <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-rose-700">부수토지 배율 지역</p>
          <LawArticleModal legalBasis="소득세법 시행령 §168의12" label="§168의12 배율" />
        </div>
        <ToggleCard
          tone="rose"
          title="수도권 지역"
          description="배율 3배·5배 구분 — 수도권 주·상·공: 3배 / 수도권 녹지·밖: 5배 / 도시 외: 10배 (시행령 §168의12)"
          checked={!!asset.mixedIsMetropolitanArea}
          onCheckedChange={(v) => onChange({ mixedIsMetropolitanArea: v })}
        />
      </div>
    </div>
  );
}

/**
 * 자동/수동 배지 + 리셋 — `LandPriceLookupField.tsx:138-155` 정본 패턴.
 * 배지·pill은 `text-micro`(10px) 정본 (components/calc/CLAUDE.md 라벨 타이포그래피).
 */
function AreaBadge({ manual, onReset }: { manual: boolean; onReset?: () => void }) {
  if (!manual) {
    return (
      <span className="rounded bg-green-100 px-1.5 py-0.5 text-micro font-medium text-green-700">
        자동
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-micro font-medium text-amber-700">
        수동
      </span>
      <button
        type="button"
        onClick={onReset}
        className="text-micro text-primary underline underline-offset-2 hover:no-underline"
      >
        ↻ 자동
      </button>
    </span>
  );
}

/**
 * 부수토지 합계 경고.
 * 톤은 **amber** — 이 카드에 이미 rose 소그룹("부수토지 배율 지역")이 있어
 * rose를 경고로 쓰면 섹션 성격과 2역 충돌한다(ui.design.md §2-5).
 */
function LandSumWarning({ sum, totalLand }: { sum: number; totalLand: number }) {
  if (sum === totalLand) return null;
  return (
    <p
      className="rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 text-xs font-medium text-amber-700"
      data-testid="mixed-area-land-sum-warning"
    >
      ⚠ 주택·상가 부수토지 합계 {sum.toFixed(2)}㎡가 전체 토지 면적 {totalLand.toFixed(2)}㎡와 다릅니다.
      두 칸 중 하나를 비우면 나머지가 자동으로 잔액을 흡수합니다.
    </p>
  );
}
