/**
 * 검증 오류 → 입력칸 이동 E2E 케이스 — **Phase 3 (commercial)**. 규약은 `validation-field-jump-cases.ts` 헤더와 같다.
 * 케이스 이름은 **「commercial: 」 접두**로 시작한다(E2E `-g` 선택용).
 *
 * 대상: `transfer-tax-validate-commercial-asset.ts` — 상속 인터셉트 · 부수토지 판정 · 환산(호별고시).
 */
import { withPrimary, type FieldJumpCase } from "./validation-field-jump-cases";

const A = 0;

/** 상가 — 실거래가(환산 아님). 부수토지 판정 섹션은 취득 모드와 무관하게 뜬다. */
const cb = (asset: Record<string, unknown> = {}) => () => withPrimary({ assetKind: "commercial_building", ...asset });

/** 환산 — 호별고시 이후 취득(post_disclosure) · 통과하는 값에서 한 칸씩 비운다 */
const cbPost = (asset: Record<string, unknown>) =>
  cb({
    useEstimatedAcquisition: true,
    acquisitionDate: "2015-03-01",
    cbExclusiveArea: "50",
    cbSharedArea: "20",
    cbLandArea: "30",
    cbUnitPriceAtTransfer: "3000000",
    cbUnitPriceAtFirstOrAcq: "2000000",
    cbLandPricePerSqmAtTransfer: "5000000",
    cbLandPricePerSqmAtAcq: "3000000",
    ...asset,
  });

/** 환산 — 호별고시 이전 취득(pre_disclosure) · 2001~2004 취득(§164⑤·④ 단서 밖) */
const cbPre = (asset: Record<string, unknown>) =>
  cbPost({
    acquisitionDate: "2003-03-01",
    cbLandPricePerSqmAtAcq: "2000000",
    cbLandPricePerSqmAtFirst: "2500000",
    cbBuildingStdPriceAtAcq: "50000000",
    cbBuildingStdPriceAtFirst: "60000000",
    cbBuildingStdPriceAtTransfer: "80000000",
    ...asset,
  });

/** 상속 — 상속개시일 이후(post-deemed) · 평가액 입력 */
const cbInh = (asset: Record<string, unknown>) =>
  cb({
    acquisitionCause: "inheritance",
    acquisitionDate: "2015-03-01",
    decedentAcquisitionDate: "2005-01-01",
    publishedValueAtInheritance: "300000000",
    ...asset,
  });

export const COMMERCIAL_FIELD_JUMP_CASES: FieldJumpCase[] = [
  // ── 상속 인터셉트 ──
  { name: "commercial: 상속 acquisitionDate", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 취득일\(상속개시일\)을 입력하세요/, form: cbInh({ acquisitionDate: "" }) },
  { name: "commercial: 상속 decedentAcquisitionDate", field: "decedentAcquisitionDate", step: 0, assetIndex: A, message: /^자산: 피상속인 취득일을 입력하세요/, form: cbInh({ decedentAcquisitionDate: "" }) },
  // 평가방법 미선택 — 신고가액 칸이 아직 없어 평가방법 칸으로 간다(`PostDeemedInputs` 조건부 앵커)
  { name: "commercial: 상속 publishedValueAtInheritance (평가방법 전)", field: "publishedValueAtInheritance", step: 0, assetIndex: A, message: /^자산: 상속개시일 평가액\(상속세 신고가액\)/, form: cbInh({ publishedValueAtInheritance: "" }) },
  {
    name: "commercial: 상속 publishedValueAtInheritance (신고가액 칸)", field: "publishedValueAtInheritance", step: 0, assetIndex: A, message: /^자산: 상속개시일 평가액\(상속세 신고가액\)/,
    form: cbInh({ publishedValueAtInheritance: "", inheritanceValuationMethod: "appraisal" }),
  },
  {
    name: "commercial: 상속 cbAcqBuildingStdBy164_5 (§164⑥ 단서)", field: "cbAcqBuildingStdBy164_5", step: 0, assetIndex: A, message: /^자산: 취득당시\(상속개시일\) 건물 기준시가는 §164⑥ 단서/,
    form: cbInh({
      acquisitionDate: "1999-06-01",
      decedentAcquisitionDate: "1990-01-01",
      publishedValueAtInheritance: "",
      cbExclusiveArea: "50",
      cbSharedArea: "20",
      cbLandArea: "30",
      cbUnitPriceAtFirstOrAcq: "2000000",
      cbLandPricePerSqmAtAcq: "1000000",
      cbLandPricePerSqmAtFirst: "2000000",
      cbBuildingStdPriceAtAcq: "40000000",
      cbBuildingStdPriceAtFirst: "60000000",
    }),
  },

  // ── 부수토지 판정 ──
  { name: "commercial: 부수토지 cbTotalLandArea (미사용승인)", field: "cbTotalLandArea", step: 0, assetIndex: A, message: /^자산: 부수토지 판정 — 「허가·사용승인 미이행」/, form: cb({ cbUnapprovedBuilding: true }) },
  { name: "commercial: 부수토지 cbTotalLandArea", field: "cbTotalLandArea", step: 0, assetIndex: A, message: /^자산: 부수토지 판정 — 집합건물 전체 대지면적/, form: cb({ cbTotalBuildingFootprintArea: "100" }) },
  { name: "commercial: 부수토지 cbTotalBuildingFootprintArea", field: "cbTotalBuildingFootprintArea", step: 0, assetIndex: A, message: /^자산: 부수토지 판정 — 집합건물 전체 바닥면적/, form: cb({ cbTotalLandArea: "200" }) },
  { name: "commercial: 부수토지 cbZoneType", field: "cbZoneType", step: 0, assetIndex: A, message: /^자산: 부수토지 판정 — 용도지역/, form: cb({ cbTotalLandArea: "200", cbTotalBuildingFootprintArea: "100", cbZoneType: "" }) },

  // ── 환산(호별고시) ──
  { name: "commercial: 환산 acquisitionDate (era 판정)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 상업용건물·오피스텔 — 취득일을 입력하세요/, form: cbPost({ acquisitionDate: "", cbEra: "" }) },
  { name: "commercial: cbExclusiveArea", field: "cbExclusiveArea", step: 0, assetIndex: A, message: /^자산: 전용면적을 입력하세요/, form: cbPost({ cbExclusiveArea: "" }) },
  { name: "commercial: cbSharedArea", field: "cbSharedArea", step: 0, assetIndex: A, message: /^자산: 공유면적을 입력하세요/, form: cbPost({ cbSharedArea: "" }) },
  { name: "commercial: cbLandArea", field: "cbLandArea", step: 0, assetIndex: A, message: /^자산: 대지면적을 입력하세요/, form: cbPost({ cbLandArea: "" }) },
  { name: "commercial: cbUnitPriceAtTransfer", field: "cbUnitPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 ㎡당 호별고시가/, form: cbPost({ cbUnitPriceAtTransfer: "" }) },
  { name: "commercial: cbUnitPriceAtFirstOrAcq (취득시)", field: "cbUnitPriceAtFirstOrAcq", step: 0, assetIndex: A, message: /^자산: 취득시 ㎡당 호별고시가/, form: cbPost({ cbUnitPriceAtFirstOrAcq: "" }) },
  { name: "commercial: cbUnitPriceAtFirstOrAcq (최초고시)", field: "cbUnitPriceAtFirstOrAcq", step: 0, assetIndex: A, message: /^자산: 최초고시\(2005\) ㎡당 호별고시가/, form: cbPre({ cbUnitPriceAtFirstOrAcq: "" }) },
  { name: "commercial: cbLandPricePerSqmAtTransfer", field: "cbLandPricePerSqmAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 개별공시지가/, form: cbPost({ cbLandPricePerSqmAtTransfer: "" }) },
  { name: "commercial: cbBuildingStdPriceAtAcq", field: "cbBuildingStdPriceAtAcq", step: 0, assetIndex: A, message: /^자산: 취득시 건물 기준시가\(총액\)/, form: cbPre({ cbBuildingStdPriceAtAcq: "" }) },
  { name: "commercial: cbBuildingStdPriceAtFirst", field: "cbBuildingStdPriceAtFirst", step: 0, assetIndex: A, message: /^자산: 최초고시시\(2005\) 건물 기준시가/, form: cbPre({ cbBuildingStdPriceAtFirst: "" }) },
  { name: "commercial: cbBuildingStdPriceAtTransfer", field: "cbBuildingStdPriceAtTransfer", step: 0, assetIndex: A, message: /^자산: 양도시 건물 기준시가\(총액\)/, form: cbPre({ cbBuildingStdPriceAtTransfer: "" }) },
  { name: "commercial: cbLandPricePerSqmAtAcq (최초고시 전)", field: "cbLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 취득시 개별공시지가\(원\/㎡\)를 입력하세요/, form: cbPre({ cbLandPricePerSqmAtAcq: "" }) },
  {
    name: "commercial: cbLandPricePerSqmAtAcq (1990 이전)", field: "cbLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 취득일이 개별공시지가 고시\(1990\.8\.30\.\) 전입니다/,
    form: cbPre({ acquisitionDate: "1988-06-01", cbLandPricePerSqmAtAcq: "" }),
  },
  { name: "commercial: cbLandPricePerSqmAtFirst", field: "cbLandPricePerSqmAtFirst", step: 0, assetIndex: A, message: /^자산: 최초고시시\(2005\) 개별공시지가/, form: cbPre({ cbLandPricePerSqmAtFirst: "" }) },
  { name: "commercial: cbAcqBuildingStdBy164_5 (환산)", field: "cbAcqBuildingStdBy164_5", step: 0, assetIndex: A, message: /^자산: 취득당시 건물 기준시가는 §164⑥ 단서/, form: cbPre({ acquisitionDate: "1999-06-01" }) },
  {
    // 두 시점 기준시가합이 같다: 2,000,000×30 + 50,000,000 = 110,000,000 = 2,000,000×30 + 50,000,000
    name: "commercial: cbPrevStdPriceSum (§164⑧ 준용)", field: "cbPrevStdPriceSum", step: 0, assetIndex: A, message: /^자산: 취득당시 기준시가합과 최초고시당시 기준시가합이 같습니다/,
    form: cbPre({ cbLandPricePerSqmAtFirst: "2000000", cbBuildingStdPriceAtFirst: "50000000" }),
  },
  { name: "commercial: cbLandPricePerSqmAtAcq (호별고시 후)", field: "cbLandPricePerSqmAtAcq", step: 0, assetIndex: A, message: /^자산: 취득시 개별공시지가\(원\/㎡\)를 입력하세요/, form: cbPost({ cbLandPricePerSqmAtAcq: "" }) },
  { name: "commercial: 환산 acquisitionDate (명시 era)", field: "acquisitionDate", step: 0, assetIndex: A, message: /^자산: 취득일을 입력하세요/, form: cbPost({ acquisitionDate: "", cbEra: "post_disclosure" }) },
];
