# 로컬 파일 인식 의존성

사용자가 인터넷·별도 설치 없는 브라우저 OCR을 요청·승인하여 파일 인식용 라이브러리를 함께 배포합니다. UI와 업무 코드는 바닐라 JS를 유지합니다. 실행 중 CDN을 사용하지 않습니다. 파일은 필요할 때만 로딩합니다. 총 용량은 약 18MB이며 언어 데이터만의 용량과 다릅니다.

| 경로 | 버전·출처 | 라이선스 |
| --- | --- | --- |
| ocr/tesseract.min.js, worker.min.js | Tesseract.js 7.0.0 https://github.com/naptha/tesseract.js | Apache-2.0 |
| ocr/core/* | tesseract.js-core 7.0.0 https://github.com/naptha/tesseract.js-core | Apache-2.0 |
| ocr/lang/kor.traineddata.gz | tessdata_fast 한국어 https://github.com/tesseract-ocr/tessdata_fast (blob 60986d44497689f3abace0b148199476d93292e1) | Apache-2.0 |
| ocr/lang/eng.traineddata.gz | 로컬 Tesseract 5 배포의 영어 LSTM 데이터 | Apache-2.0 |
| xlsx/xlsx.full.min.js | SheetJS CE 0.20.3 https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js | Apache-2.0 |
| jszip/jszip.min.js | JSZip 3.10.1 https://github.com/Stuk/jszip | MIT 또는 GPL-3.0, 본 배포는 MIT 사용 |
| pdf/*.mjs | PDF.js 5.6.205 https://github.com/mozilla/pdf.js | Apache-2.0 |
| pdf/cmaps.zip | PDF.js 포함 Adobe CMaps | 각 파일 및 LICENSE-CMAPS 참조 |

OCR은 LSTM 전용 SIMD/relaxed SIMD/기본 호환 엔진 3개를 포함합니다. `.wasm.js` 파일에 WebAssembly가 내장되어 별도 wasm 다운로드가 없습니다. 모든 Worker·엔진·언어 데이터 경로를 명시적으로 같은 출처로 지정하고 캐시를 비활성화해 기존 외부 언어 파일 캐시에 의존하지 않습니다. 한국어·영어 데이터는 무손실 gzip으로 압축했습니다. Worker·추출 라이브러리는 UI 플러그인이 아닙니다.

`manifest.json`의 파일별 SHA-256·바이트 수로 반입 무결성을 확인할 수 있습니다. 배포 시 필요한 파일 일부를 빼거나 경로를 변경하지 마세요.
