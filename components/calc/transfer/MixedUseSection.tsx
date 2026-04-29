"use client";

/**
 * 검용주택 분리계산 입력 섹션
 *
 * assetKind === "housing" 이고 isMixedUseHouse === true 일 때 하단 노출.
 * 소득세법 시행령 §160 ① 단서 — 2022.1.1 이후 양도분부터 강제 분리.
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { MixedUseAreaInputs } from "./mixed-use/MixedUseAreaInputs";
import { MixedUseStandardPriceInputs } from "./mixed-use/MixedUseStandardPriceInputs";
import { MixedUseResidencyInput } from "./mixed-use/MixedUseResidencyInput";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 — 2022.1.1 미만이면 경고 표시. PHD 양도시 시점 기준연도용. */
  transferDate?: string;
  /** 환산취득가 모드 여부 — PHD 토글 노출 조건 */
  useEstimatedAcquisition?: boolean;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

export function MixedUseSection({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  jibun,
}: Props) {
  const isAfter2022 = !transferDate || transferDate >= "2022-01-01";

  return (
    <div className="mt-4 border-t pt-4 space-y-2">
      {/* 검용주택 토글 — 활성화 시 토지/건물 분리도 자동 ON (SOT 일관성) */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded"
          checked={!!asset.isMixedUseHouse}
          onChange={(e) => {
            const checked = e.target.checked;
            onChange({
              isMixedUseHouse: checked,
              // 검용주택 ON: 토지/건물 분리 모드 자동 활성화 (취득시기 분리 일반화)
              ...(checked ? { hasSeperateLandAcquisitionDate: true } : {}),
            });
          }}
        />
        <span className="text-sm font-medium">검용주택 분리계산</span>
        <span className="text-xs text-muted-foreground">(주택+상가 복합건물, §160①단서)</span>
      </label>

      {asset.isMixedUseHouse && (
        <div className="mt-3 space-y-3">
          {/* 2022.1.1 이전 경고 */}
          {!isAfter2022 && (
            <div className="px-3 py-2 rounded-lg bg-red-50 text-red-800 text-sm">
              2022.1.1 이전 양도분은 검용주택 강제 분리계산 범위 외입니다.
              주택연면적과 상가연면적을 비교하여 단일 자산 모드로 계산하세요.
            </div>
          )}

          {/* 4-way 결합 모드 가이드 — 환산 + PHD 활성 시 노출 */}
          {useEstimatedAcquisition && asset.usePreHousingDisclosure && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 space-y-1">
              <p className="font-semibold">검용주택 + 환산취득가 + 토지/건물 분리 + §164⑤ 미공시 4-way 적용</p>
              <ol className="ml-4 list-decimal space-y-0.5 leading-relaxed">
                <li>양도가액을 면적·기준시가 비율로 주택/상가 안분</li>
                <li>주택부분: §164⑤ 3-시점 환산으로 취득시 주택가격 역산 → 토지/건물 보유연수 분리·표2 장특공제</li>
                <li>상가부분: §97 직접 환산 + 토지/건물 보유연수 분리·표1 장특공제</li>
                <li>주택부수토지 배율초과 면적은 비사업용토지로 이전(+10%p 가산)</li>
              </ol>
            </div>
          )}

          {/* ① 면적 정보 */}
          <MixedUseAreaInputs asset={asset} onChange={onChange} sectionNum={1} />

          {/* ② 양도시 기준시가 / ③ 취득시 기준시가 */}
          <MixedUseStandardPriceInputs
            asset={asset}
            onChange={onChange}
            transferDate={transferDate}
            useEstimatedAcquisition={useEstimatedAcquisition}
            transferSectionNum={2}
            acqSectionNum={3}
            jibun={jibun}
          />

          {/* ④ 거주 정보 */}
          <MixedUseResidencyInput asset={asset} onChange={onChange} sectionNum={4} />

          {/* ⑤ 수도권 여부 */}
          <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-[10px] font-bold text-rose-800 select-none">5</span>
              <p className="text-xs font-semibold text-rose-700">부수토지 배율 지역</p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded"
                checked={!!asset.mixedIsMetropolitanArea}
                onChange={(e) =>
                  onChange({ mixedIsMetropolitanArea: e.target.checked })
                }
              />
              <span className="text-sm font-medium">수도권 지역 (배율 3배·5배 구분)</span>
            </label>
            <p className="text-xs text-muted-foreground ml-6">
              수도권 주·상·공: 3배 / 수도권 녹지·밖: 5배 / 도시 외: 10배 (시행령 §168의12)
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
