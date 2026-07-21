/**
 * 겸용주택 API 페이로드 빌더 — `callTransferTaxAPI`에서 추출 (800줄 정책).
 *
 * ⚠️ **명시 필드 매핑**(spread 아님) — 신규 엔진 필드는 여기 추가하지 않으면 침묵 strip
 * (memory `feedback_explicit_prop_mapping_strip`). ⑫ Zod(`lib/api/transfer-tax-schema-mixed-use.ts`)도 함께.
 *
 * ⚠️ three-state override는 **문자열 수준 분기**(`(x ?? "").trim() !== ""`) 후 조건부 주입.
 *    `parseFloat`/`parseDecimal`은 빈값에 0을 돌려주므로 먼저 파싱하면 계약이 깨진다.
 *    `?.trim()` 금지 — undefined일 때 `undefined !== ""` → true가 되어 0을 전송한다.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { deriveResidencePeriodMonths } from "@/lib/stores/calc-wizard-asset-residence";
import { consolidateResidenceMonths } from "@/lib/tax-engine/transfer-tax-exemption";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "./transfer-pre1990-phd-bridge";

/** 겸용주택 mixedUse 페이로드. 비-겸용이면 undefined. */
export function buildMixedUsePayload(primary: AssetForm, form: TransferFormData) {
  const isMixed = primary.assetKind === "housing" && primary.isMixedUseHouse;
  if (!isMixed) return undefined;

  // 겸용 매매 실거래가 직접 안분 게이트 (법 §100², R1) — 필드·값 파생에 공용(중복 제거).
  const isMixedActualAcquisition =
    primary.acquisitionCause === "purchase" &&
    !primary.useEstimatedAcquisition &&
    !primary.isAppraisalAcquisition &&
    !primary.isSalesCaseAcquisition;

  // 거주 개월 단일 소스 — 실거주(공제율)와 §154⑧3호 통산(표2 대상 판정) 둘 다 여기서 도출.
  const resMonths = deriveResidencePeriodMonths(
    primary,
    form.transferDate,
    form.residencePeriodMonths,
  );

  return {
    isMixedUseHouse: true as const,
    // 면적은 소수점 (예: 333.06㎡) — parseAmount(parseInt)는 절단 발생, parseFloat 필수
    residentialFloorArea: parseFloat(primary.residentialFloorArea) || 0,
    nonResidentialFloorArea: parseFloat(primary.nonResidentialFloorArea) || 0,
    buildingFootprintArea: parseFloat(primary.buildingFootprintArea) || 0,
    totalLandArea: parseFloat(primary.mixedUseTotalLandArea) || 0,
    // 주택 부수토지 override — three-state(빈값→undefined, 0→0 보존).
    // ⚠️ `?? ""` 선행 필수 — `x?.trim() !== ""`는 x가 undefined일 때 `undefined !== ""` → true가 되어
    //    override 미설정인데도 분기에 진입, `parseFloat(undefined) || 0` → 0을 전송한다.
    //
    // PHD 여부와 무관하게 전송한다(2026-07-15 배타 해제). 종전 PHD OFF 게이트의 명분은
    // "PHD 쪽 `preHousingDisclosure.landArea`가 담당"이었으나 그 필드는 ⑫ Zod
    // (`transfer-tax-schema-mixed-use.ts` phdForMixedUseSchema — landArea 미포함)가 strip해
    // 엔진에 도달한 적이 없다 → PHD ON이면 사용자가 부수토지를 **어디서도 지정할 수 없었다**.
    // 부수토지 면적은 §164⑦이 정하는 값이 아니라 건축물대장·등기의 사실관계이며,
    // 엔진(transfer-tax-mixed-use-helpers.ts:167-169)이 derived.residentialLandArea를 쓰므로
    // 게이트만 걷으면 PHD 계산에 그대로 관철된다.
    ...((primary.mixedResidentialLandAreaOverride ?? "").trim() !== ""
      ? { residentialLandAreaOverride: parseFloat(primary.mixedResidentialLandAreaOverride) || 0 }
      : {}),
    // 상가 부수토지 override — 주택과 동일 축(three-state·PHD 무관).
    ...((primary.mixedCommercialLandAreaOverride ?? "").trim() !== ""
      ? { commercialLandAreaOverride: parseFloat(primary.mixedCommercialLandAreaOverride) || 0 }
      : {}),
    // 주택 정착면적 override — PHD 무관(§168의12 배율초과 NBL 판정용, 부수토지 축과 별개).
    ...((primary.mixedResidentialFootprintOverride ?? "").trim() !== ""
      ? { residentialFootprintOverride: parseFloat(primary.mixedResidentialFootprintOverride) || 0 }
      : {}),
    landAcquisitionDate: primary.landAcquisitionDate || primary.acquisitionDate,
    buildingAcquisitionDate: primary.acquisitionDate,
    transferStandardPrice: {
      housingPrice: parseAmount(primary.mixedTransferHousingPrice) || 0,
      commercialBuildingPrice: parseAmount(primary.mixedTransferCommercialBuildingPrice) || 0,
      // PHD ③ 양도시 공시지가 fallback — 주택·상가 부수토지는 동일 필지(단가 공유).
      // 취득측(아래 acquisitionStandardPrice)과 대칭. UI 표시·사이드바도 동일 우선순위.
      landPricePerSqm:
        parseAmount(primary.mixedTransferLandPricePerSqm) ||
        parseAmount(primary.phdLandPricePerSqmAtTransfer) ||
        0,
    },
    acquisitionStandardPrice: {
      housingPrice: parseAmount(primary.mixedAcqHousingPrice) || undefined,
      commercialBuildingPrice: (() => {
        const direct = parseAmount(primary.mixedAcqCommercialBuildingPrice);
        if (direct > 0) return direct;
        // house_to_commercial Case A: PHD 전체 건물 기준시가 × (상가면적 / 전체면적) 자동 안분
        const phdBuilding = parseAmount(primary.phdBuildingStdPriceAtAcq);
        const residentialArea = parseFloat(primary.residentialFloorArea) || 0;
        const nonResidentialArea = parseFloat(primary.nonResidentialFloorArea) || 0;
        const totalFloor = residentialArea + nonResidentialArea;
        if (phdBuilding > 0 && totalFloor > 0) {
          return Math.floor(phdBuilding * nonResidentialArea / totalFloor);
        }
        return 0;
      })(),
      // PHD ① 취득시 공시지가 fallback (마지막 항: 1990.8.30. 이전 취득 토지 환산 — useEffect→store 미러링 제거 대체)
      landPricePerSqm:
        parseAmount(primary.mixedAcqLandPricePerSqm) ||
        parseAmount(primary.phdLandPricePerSqmAtAcq) ||
        (derivePre1990PhdLandPricePerSqmAtAcq(primary, form.transferDate) ?? 0),
    },
    usePreHousingDisclosure: primary.usePreHousingDisclosure,
    // PHD 페이로드는 모든 필수 필드(.positive() 제약)가 채워졌을 때만 전송.
    // 누락 시 schema의 z.number().int().positive() 검증에서 0으로 실패하기 때문.
    preHousingDisclosure: (() => {
      // 겸용주택 PHD: phdLandPricePerSqm* 미설정 시 섹션 2의 mixed 값으로 fallback
      const landSqmAtAcq =
        parseAmount(primary.phdLandPricePerSqmAtAcq) ||
        parseAmount(primary.mixedAcqLandPricePerSqm) ||
        (derivePre1990PhdLandPricePerSqmAtAcq(primary, form.transferDate) ?? 0);
      const landSqmAtTransfer =
        parseAmount(primary.phdLandPricePerSqmAtTransfer) ||
        parseAmount(primary.mixedTransferLandPricePerSqm);
      return primary.usePreHousingDisclosure &&
        primary.phdFirstDisclosureDate &&
        parseAmount(primary.phdFirstDisclosureHousingPrice) > 0 &&
        landSqmAtAcq > 0 &&
        parseAmount(primary.phdLandPricePerSqmAtFirst) > 0 &&
        landSqmAtTransfer > 0 &&
        (parseAmount(primary.phdTransferHousingPrice) > 0 ||
          parseAmount(primary.mixedTransferHousingPrice) > 0)
        ? {
            firstDisclosureDate: primary.phdFirstDisclosureDate,
            firstDisclosureHousingPrice: parseAmount(primary.phdFirstDisclosureHousingPrice),
            landPricePerSqmAtAcquisition: landSqmAtAcq,
            buildingStdPriceAtAcquisition:
              parseAmount(primary.phdBuildingStdPriceAtAcq) || 0,
            landPricePerSqmAtFirstDisclosure: parseAmount(primary.phdLandPricePerSqmAtFirst),
            buildingStdPriceAtFirstDisclosure:
              parseAmount(primary.phdBuildingStdPriceAtFirst) || 0,
            transferHousingPrice:
              parseAmount(primary.phdTransferHousingPrice) ||
              parseAmount(primary.mixedTransferHousingPrice),
            landPricePerSqmAtTransfer: landSqmAtTransfer,
            buildingStdPriceAtTransfer:
              parseAmount(primary.phdBuildingStdPriceAtTransfer) || 0,
            // 주택부수토지 면적은 여기서 보내지 않는다 — ①카드 override(residentialLandAreaOverride)가
            // 단일 소스이며, 엔진은 derived.residentialLandArea로 그 값을 쓴다.
            // (종전 `landArea` 전송은 phdForMixedUseSchema에 필드가 없어 Zod가 strip하는 죽은 경로였다.
            //  그 소스이던 phdResidentialLandArea는 migrate가 ①카드로 이관 후 비운다.)
            // Case A 4부분 안분 — 취득시·최초공시 상가건물 기준시가 + 총양도가액 함께 충족 시 활성화.
            // 취득시 상가건물은 메인 mixedAcqCommercialBuildingPrice fallback 인식 (UI 통합 후 단일 필드).
            // 최초공시 상가건물은 PHD-only 필드 (일반 겸용주택 흐름에 없음).
            ...((parseAmount(primary.phdCommercialBuildingStdPriceAtAcq) ||
                 parseAmount(primary.mixedAcqCommercialBuildingPrice)) > 0 &&
                parseAmount(primary.phdCommercialBuildingStdPriceAtFirst) > 0
              ? {
                  commercialBuildingStdPriceAtAcq:
                    parseAmount(primary.phdCommercialBuildingStdPriceAtAcq) ||
                    parseAmount(primary.mixedAcqCommercialBuildingPrice),
                  commercialBuildingStdPriceAtFirstDisclosure: parseAmount(primary.phdCommercialBuildingStdPriceAtFirst),
                  totalTransferPriceForFourPart: parseAmount(form.contractTotalPrice),
                }
              : {}),
          }
        : undefined;
    })(),
    // 거주기간 단일 소스 — 보유상황(입주일·퇴거일/개월) 거주에서 도출.
    // 메인 엔진과 동일 whole-year 산식(Math.floor(months/12), transfer-tax-helpers.ts:466·505)로 정합.
    residencePeriodYears: Math.floor(resMonths / 12),  // 실거주 (표2 거주분 공제율)
    // §154⑧3호 표2 '대상 판정'용 통산 거주 연수 — 동일세대 상속이면 실거주 + 상속개시 전 통산 거주.
    // 규칙은 엔진 `consolidateResidenceMonths` 재사용(단일 소스). 비상속·별도세대면 실거주로 identity.
    table2ResidencePeriodYears: Math.floor(
      consolidateResidenceMonths(resMonths, {
        acquisitionCause: primary.acquisitionCause,
        decedentSameHouseholdBeforeInheritance: primary.decedentSameHouseholdBeforeInheritance,
        decedentCohabitationResidenceMonths:
          parseInt(primary.decedentCohabitationResidenceMonths) || 0,
      }) / 12,
    ),
    isMetropolitanArea: primary.mixedIsMetropolitanArea,
    zoneType: "residential" as const,
    // 🚨 Critical (이슈 8-A): 1세대 1주택 비과세 요건 충족 여부 (다주택자 분기)
    // 소득세법 §89①3 — 1세대 + 1주택. 일시적 2주택 특례 적용 시에도 비과세 요건 충족으로 본다.
    // ⚠️ form.isOneHousehold 사용 — Step4 "1세대 해당" 토글은 form-level에만 쓰고 asset-level로 동기화되지 않음.
    //    primary.isOneHousehold(기본 false·미동기화)를 읽으면 겸용주택은 토글 ON에도 항상 비과세 미적용.
    //    일반 엔진(:467)과 동일하게 form.isOneHousehold를 단일 소스로 사용.
    isOneHouseExempt:
      form.isOneHousehold &&
      (form.householdHousingCount === "1" ||
        (form.householdHousingCount === "2" && form.temporaryTwoHouseSpecial === true)),
    // ④ §164⑨1호 공익수용 특례 (계획 P7/D8) — 목별 독립: 주택분(P5 필드 재사용)·상가분(신규 2필드).
    // 엔진이 수용·환산·2009.02.04·후보>0 게이트 판정 — 여기선 원값 전달(침묵 strip 방지).
    transferCause: primary.transferCause,
    housingCompensationTotal: parseAmount(primary.housingCompensationTotal) || undefined,
    housingCompensationBasisTotal: parseAmount(primary.housingCompensationBasisTotal) || undefined,
    commercialLandCompensationTotal: parseAmount(primary.mixedCommercialLandCompensationTotal) || undefined,
    commercialLandCompensationBasisTotal: parseAmount(primary.mixedCommercialLandCompensationBasisTotal) || undefined,
    // 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (엔진 정합, 정본 계약 plan §4.5).
    // E1 날짜 게이트 필수: 게이트 없으면 pre-1985 상속에 post-deemed 로직 오적용
    // (§176조의2④ pre-deemed 미반영). pre-1985는 게이트 false → 기존 환산 fallback(회귀-safe).
    acquisitionByInheritance:
      primary.acquisitionCause === "inheritance" &&
      (primary.acquisitionDate ?? "") >= "1985-01-01",
    // 증여 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (D1=옵션B, 상속과 상호배타).
    // pre-1985 게이트: false면 기존 환산 fallback(회귀-safe, §176조의2④).
    acquisitionByGift:
      primary.acquisitionCause === "gift" &&
      (primary.acquisitionDate ?? "") >= "1985-01-01",
    // reported 값(B1) — 엔진은 동일 필드 소비. ⚠️ blind || 금지: 취득원인 전환 시 반대편 override 폼필드가
    // 클리어되지 않으므로(stale), **현재 acquisitionCause에 종속**해 선택(상속→상속필드·증여→증여필드).
    housingInheritedValue:
      (primary.acquisitionCause === "gift"
        ? parseAmount(primary.mixedHousingGiftValueOverride)
        : parseAmount(primary.mixedHousingInheritedValueOverride)) || undefined,
    commercialInheritedValue:
      (primary.acquisitionCause === "gift"
        ? parseAmount(primary.mixedCommercialGiftValueOverride)
        : parseAmount(primary.mixedCommercialInheritedValueOverride)) || undefined,
    housingInheritedExpense:
      (primary.acquisitionCause === "gift"
        ? parseAmount(primary.mixedHousingGiftExpense)
        : parseAmount(primary.mixedHousingInheritedExpense)) || undefined,
    commercialInheritedExpense:
      (primary.acquisitionCause === "gift"
        ? parseAmount(primary.mixedCommercialGiftExpense)
        : parseAmount(primary.mixedCommercialInheritedExpense)) || undefined,
    // 매매 취득 실거래가 직접 안분 (법 §100²·§97①1호가목, R1) — 겸용 매매 + 실거래가 모드.
    // 상속·증여(byInheritance/byGift)와 상호배타(취득원인 purchase라 자동 배타). 환산/감정/매매사례 모드는 제외.
    useActualAcquisition: isMixedActualAcquisition,
    acquisitionActualTotalPrice: isMixedActualAcquisition
      ? parseAmount(primary.fixedAcquisitionPrice) || undefined
      : undefined,
    // 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10)
    partialUsageChange:
      primary.hasPartialUsageChange && primary.partialChangeDirection
        ? {
            direction: primary.partialChangeDirection,
            acqResidentialArea: parseFloat(primary.partialChangeAcqResidentialArea) || undefined,
            acqCommercialArea: parseFloat(primary.partialChangeAcqCommercialArea) || undefined,
            // 집행기준 89-154-24 취지 — 용도변경일 입력 시 LTHD 시간 비례 분할
            // 문자열 그대로 전송 → route handler가 date-coerce로 Date 변환 (정책: API 변환에서 new Date() 금지)
            usageChangeDate: primary.partialChangeDate || undefined,
          }
        : undefined,
  };
}
