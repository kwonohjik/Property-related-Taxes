/**
 * 재산세 폼 상태 → API 요청 본문 변환 (④ — 순수 함수, 테스트 anchor 대상).
 * `shared.ts` 800줄 분리(PSA-E4)로 이동 — `shared.ts`가 재수출하므로 import 경로는 그대로다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { getZoneAreaMultiplier } from "@/lib/tax-engine/local-tax-zone-multiplier";
import {
  landSplitBodyFields,
  landSplitRequiredFromForm,
} from "@/lib/calc/property-land-split-inputs";
import type { FormState } from "./shared";

/** 이 폼이 연 합산 칸 — 별도합산 필지는 ④와 같은 객체로 분류 면적을 미리 판정한다. */
export function landSplitRequired(form: FormState) {
  return landSplitRequiredFromForm({
    landTaxType: form.landTaxType,
    separateAggregateItem: form.landTaxType === "separate_aggregate" ? buildSeparateAggregateItem(form) : undefined,
  });
}

/** 별도합산 단일 필지 — 와이어 `separateAggregateItem`. ⑧의 합산 칸 요구 판정(미리보기)도 같은 객체를 쓴다. */
function buildSeparateAggregateItem(form: FormState) {
  const landArea = parseDecimal(form.saLandArea);
  const publishedTotal = parseAmount(form.publishedPrice) ?? 0;
  const officialLandPrice = landArea > 0 ? Math.floor(publishedTotal / landArea) : 0;

  return {
    id: "parcel-1",
    jurisdictionCode: "000000",
    landArea,
    officialLandPrice,
    zoningDistrict: form.saZoningDistrict,
    // 공장용지도 기준면적은 바닥면적 × 배율(§101①1호)이라 바닥면적을 함께 싣는다 — ⑧(위)이 요구하는
    // 값이다. 종전엔 공장용지일 때 이 값을 빼서 엔진이 「건축물 없음」으로 종합합산 처리했다.
    buildingFloorArea: parseDecimal(form.saBuildingFloorArea) || undefined,
    ...(form.saIsFactory ? { isFactory: true } : {}),
    ...(form.saDemolished
      ? { demolished: true, demolishedDate: form.saDemolishedDate || undefined }
      : {}),
  };
}

/**
 * recompute(§118 본문 — 직전 과세표준 재산정) 선택지를 여는 대상: 건축물·선박·항공기·토지(종합합산·별도합산).
 * Step 3 위젯·④ 변환·⑧(`validateStep(3)`)이 같은 술어를 쓴다(UI 통과↔변환 누락 모순 방지).
 * 별도합산은 엔진이 분류별(별도합산분·종합합산 이관분) 직전 세율로 재산정한다(`property-land-split-tax.ts`).
 */
export function isRecomputeTarget(form: FormState): boolean {
  return (
    form.objectType === "building" ||
    form.objectType === "vessel" ||
    form.objectType === "aircraft" ||
    (form.objectType === "land" &&
      (form.landTaxType === "comprehensive_aggregate" || form.landTaxType === "separate_aggregate"))
  );
}

/** 폼 상태 → API 요청 본문 변환 (순수 함수 — 테스트 anchor 대상) */
export function buildPropertyTaxRequestBody(form: FormState): Record<string, unknown> {
  const body: Record<string, unknown> = {
    objectType: form.objectType,
    publishedPrice: parseAmount(form.publishedPrice) ?? 0,
    // 1세대1주택 토글은 주택 화면에만 있다 — 다른 물건으로 바꾼 뒤 남은 값(stale)을 보내면 ⑫가 400이 된다(막다른 길)
    isOneHousehold: form.objectType === "housing" && form.isOneHousehold,
    isUrbanArea: form.isUrbanArea,
  };

  // 주택 과세표준상한제(§110③) — 직전연도 공시가격 (주택 + 값>0 시에만 전송)
  if (form.objectType === "housing") {
    const priorPrice = parseAmount(form.priorYearPublishedPrice);
    if (priorPrice !== null && priorPrice > 0) {
      body.priorYearPublishedPrice = priorPrice;
    }
    // 주택 건물분 소방분(§146④ 단서) — 건축물 부분 시가표준액 (값>0 시에만 전송)
    const bldgValue = parseAmount(form.housingBuildingValue);
    if (bldgValue !== null && bldgValue > 0) {
      body.housingBuildingValue = bldgValue;
    }
    // 주택 세부담상한 경과조치(부칙 제15조) — 토글 ON + 직전본세 값>0 시에만 전송 (게이트=필드 존재 → 종부세 호출 불변)
    if (form.housingTaxCapEnabled) {
      const prevHousingTax = parseAmount(form.housingPreviousYearTax);
      if (prevHousingTax !== null && prevHousingTax > 0) {
        body.previousYearHousingBaseTax = prevHousingTax;
      }
      // v2 도시지역분 세부담상한(§118 본문) — 도시지역 + 직전 도시지역분 값>0 시에만 전송
      if (form.isUrbanArea) {
        const prevUrban = parseAmount(form.housingPreviousUrbanTax);
        if (prevUrban !== null && prevUrban > 0) {
          body.previousYearHousingUrbanTax = prevUrban;
        }
      }
    }
  }

  if (form.objectType === "building") {
    body.buildingType = form.buildingType;
    // 화재위험 중과 (§146③2호·2의2호) — building + ≠none 만 전송
    if (form.fireHazardClass && form.fireHazardClass !== "none") {
      body.fireHazardClass = form.fireHazardClass;
    }
  }

  // 선박 유형 — §111①4호 가목 고급선박(5%) / 나목 일반선박(0.3%)
  if (form.objectType === "vessel") {
    body.vesselType = form.vesselType;
  }

  if (form.objectType === "land" && form.landTaxType) {
    body.landTaxType = form.landTaxType;

    if (form.landTaxType === "separate_aggregate") {
      body.separateAggregateItem = buildSeparateAggregateItem(form);
    }

    if (form.landTaxType === "separated") {
      const st: Record<string, unknown> = {};
      switch (form.stSeparatedType) {
        case "farmland":      st.isFarmland = true; break;
        case "livestock":
          st.isLivestockFarm = true;
          // §102①3호 면적 한도 — 미입력은 엔진이 던진다(추정 금지). validate가 먼저 막는다.
          st.pastureTotalLandArea = parseDecimal(form.stPastureTotalLandArea) ?? undefined;
          st.pastureLivestockType = form.stPastureLivestockType || undefined;
          st.pastureLivestockCount = parseDecimal(form.stPastureLivestockCount) ?? undefined;
          st.pastureHasFacility = form.stPastureHasFacility;
          st.pastureHasGrassland = form.stPastureHasGrassland;
          st.pastureHasFodder = form.stPastureHasFodder;
          st.pastureIsUrbanArea = form.stPastureIsUrbanArea;
          st.pastureOwnedBefore1990 = form.stPastureOwnedBefore1990;
          break;
        case "forest":        st.isProtectedForest = true; break;
        case "factory": {
          st.isFactoryLand = true;
          if (form.stFactoryLocation) st.factoryLocation = form.stFactoryLocation;
          // §102①1호 면적 한도 — 미입력은 엔진이 던진다(추정 금지). validate가 먼저 막는다.
          st.factoryTotalLandArea = parseDecimal(form.stFactoryTotalLandArea) ?? undefined;
          st.factoryFloorArea = parseDecimal(form.stFactoryFloorArea) ?? undefined;
          st.factoryAreaRatePercent = parseDecimal(form.stFactoryAreaRatePercent) ?? undefined;
          st.factoryIsRestrictedZone = form.stFactoryIsRestrictedZone;
          st.factoryAdditionalRecognizedArea =
            parseDecimal(form.stFactoryAdditionalRecognizedArea) ?? undefined;
          // 별표6 3호바 — 표(비고 2-나·다·라)와 10% 상한은 엔진이 산출한다 (E4-06).
          st.factoryEmployeeSportsFacility = {
            employeeCount: parseDecimal(form.stFactorySportsEmployeeCount) ?? undefined,
            entityType:
              form.stFactorySportsEntityType === "corporation" ||
              form.stFactorySportsEntityType === "individual"
                ? form.stFactorySportsEntityType
                : undefined,
            playgroundArea: parseDecimal(form.stFactorySportsPlaygroundArea) ?? undefined,
            tennisCourtArea: parseDecimal(form.stFactorySportsCourtArea) ?? undefined,
            indoorFloorArea: parseDecimal(form.stFactorySportsIndoorFloorArea) ?? undefined,
            indoorZoneMultiplier: form.stFactorySportsZoningDistrict
              ? getZoneAreaMultiplier(form.stFactorySportsZoningDistrict)?.multiplier
              : undefined,
          };
          st.factoryIsUnpermitted = form.stFactoryIsUnpermitted;
          break;
        }
        case "saltfield":     st.isSaltField = true; break;
        case "terminal":      st.isTerminalOrParking = true; break;
        case "golf_member":   st.isGolfCourse = true; st.golfCourseType = "member"; break;
        case "entertainment": st.isHighClassEntertainment = true; break;
      }
      body.separateTaxationItem = st;
    }
  }

  // 같은 관할구역 합산 입력(§113①) — 이 필지가 그 분류 면적을 가질 때만 전송(요구 술어 = ⑫ Zod와 동일)
  if (form.objectType === "land") Object.assign(body, landSplitBodyFields(landSplitRequired(form), form));

  // 주택은 세부담상한 미적용 (지방세법 §122 단서) — 전년도 세액 미전송 (엔진·UI 동기화)
  if (form.objectType !== "housing") {
    if (form.taxCapMode === "recompute" && isRecomputeTarget(form)) {
      const prevBase = parseAmount(form.previousYearTaxBase);
      if (prevBase !== null && prevBase > 0) {
        body.taxCapMode = "recompute";
        body.previousYearTaxBase = prevBase;
      }
    } else {
      const prevTax = parseAmount(form.previousYearTax);
      if (prevTax !== null && prevTax > 0) {
        body.previousYearTax = prevTax;
      }
    }
  }

  // ── 납세의무자(§107) — ownershipType 입력 시에만 전송 ──
  // 미입력(undefined / "sole") → taxpayerInfo 미포함 → 엔진 납세의무자 판정 생략
  if (form.ownershipType && form.ownershipType !== "sole") {
    // ── §107①2호: 건물·부속토지 소유자 분리 (house_split 전용 분기) ──
    if (form.ownershipType === "house_split") {
      const buildingOwner = form.buildingOwner.trim();
      const landOwner = form.landOwner.trim();
      if (buildingOwner || landOwner) {
        body.taxpayerInfo = {
          registeredOwner: buildingOwner || landOwner, // 형식 충족 (대표는 엔진이 시가표준액으로 판정)
          isHouseSplit: true,
          buildingOwner: buildingOwner || undefined,
          landOwner: landOwner || undefined,
          landStdValue: parseAmount(form.landStdValue) ?? undefined,
        };
        // 건축물 시가표준액 — 기존 housingBuildingValue 재사용 (§146④와 동일 필드)
        const bldgValue = parseAmount(form.housingBuildingValue);
        if (bldgValue !== null && bldgValue > 0) {
          body.housingBuildingValue = bldgValue;
        }
      }
    } else {
    const registeredOwner = form.registeredOwner.trim();
    if (registeredOwner) {
      const info: Record<string, unknown> = { registeredOwner };

      if (form.ownershipType === "co" && form.coOwners && form.coOwners.length > 0) {
        info.coOwnershipShares = form.coOwners
          .filter((c) => c.id.trim() && !isNaN(parseFloat(c.ratio)) && parseFloat(c.ratio) > 0)
          .map((c) => ({ ownerId: c.id.trim(), shareRatio: parseFloat(c.ratio) }));
      }

      if (form.ownershipType === "trust") {
        info.isTrust = true;
        const settlor = form.settlor.trim();
        if (settlor) info.settlor = settlor;
      }

      if (form.ownershipType === "inherit") {
        info.isInheritanceUnregistered = true;
        // 행 기반 → {name, shareRatio?, birthDate?}[] (빈 필드 생략). 엔진 selectMainHeir가 §53 판정.
        const heirs = form.heirs
          .filter((h) => h.name.trim())
          .map((h) => {
            const heir: { name: string; shareRatio?: number; birthDate?: string } = {
              name: h.name.trim(),
            };
            const share = parseFloat(h.shareRatio);
            if (!isNaN(share) && share > 0) heir.shareRatio = share;
            if (h.birthDate.trim()) heir.birthDate = h.birthDate.trim();
            return heir;
          });
        if (heirs.length > 0) info.heirs = heirs;
      }

      // ── 기타 6종 §107 ──
      if (form.ownershipType === "clan") {
        // 종중재산 미신고 §107②3호 — 공부상 소유자가 납세의무자 (isClanProperty=true)
        info.isClanProperty = true;
      }

      if (form.ownershipType === "installment") {
        // 연부 매수계약자 §107②4호
        const buyer = form.installmentBuyer.trim();
        if (buyer) info.installmentBuyer = buyer;
      }

      if (form.ownershipType === "project") {
        // 환지 체비지·보류지 사업시행자 §107②6호
        const operator = form.projectOperator.trim();
        if (operator) info.projectOperator = operator;
      }

      if (form.ownershipType === "import") {
        // 외국인 항공기·선박 수입자 §107②7호
        const imp = form.importer.trim();
        if (imp) info.importer = imp;
      }

      if (form.ownershipType === "bankruptcy") {
        // 파산재단 §107②8호 — 공부상 소유자가 납세의무자 (isBankruptcyEstate=true)
        info.isBankruptcyEstate = true;
      }

      if (form.ownershipType === "unclear") {
        // 소유권 귀속 불명 시 사용자 §107③
        const unclear = form.unclearUser.trim();
        if (unclear) info.ownershipUnclearUser = unclear;
      }

      // 사실상 소유자 불일치
      const actualOwner = form.actualOwner.trim();
      if (actualOwner && actualOwner !== registeredOwner) {
        info.actualOwner = actualOwner;
      }

      body.taxpayerInfo = info;
    }
    } // end else (house_split 이외)
  }

  return body;
}
