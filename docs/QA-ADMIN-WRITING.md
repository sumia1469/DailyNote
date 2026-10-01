# 관리자 사용자·파일 등록 화면 검증

- 기준: main c4f69db8dd8aa59af18db3abfa20f9514ff5aa73.
- 사용자 등록·수정과 관리자 파일 등록을 writing-forms.js/CSS에 연결하고 업로드 폼을 단일 form 구조로 변경.
- 비밀번호와 파일 선택은 입력 이력에서 제외. 저장 중 닫기·Escape·중복 제출 차단.
- npm test: 53개 통과. npm run test:ui: 7개 통과. JS 구문 검사와 git diff --check 통과.
- scripts/verify-admin-writing.cjs: PC 1440×1000·모바일 390×844, 키보드 뷰포트, 스크롤, 사용자 저장/실패 재시도, 파일 업로드/실패 재시도, 목록 복귀를 검증하도록 추가.
- 실제 브라우저 하네스 실행은 Chromium 실행 파일 부재로 차단. Playwright 설치 시 다운로드 파일이 유효한 ZIP이 아니어서 실패. 실제 렌더링·iOS 기기 검증·배포는 수행하지 않음.
