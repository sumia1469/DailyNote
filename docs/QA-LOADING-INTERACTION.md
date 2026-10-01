# 공통 로딩 입력 차단 검증 (2026-10-02)

- 전체 로딩: 배경 클릭·터치·키보드·제출·메뉴 이동·스크롤 차단. 기존 inert 및 overflow 복원, 동적으로 추가된 body 자식도 잠금.
- 게시판·관리자 공지의 추가 페이징: GET과 외부 run을 background로 연결. 처음 조회와 조건 변경은 기본 전체 잠금.
- 메모 자동 저장·GET 알림 폴링: 기존 인라인 표시 유지. DELETE 등 변경 요청은 background를 전달해도 전체 잠금.
- 동시 요청·중복 종료·실패·취소·본문 파싱 실패·clear 이후 이전 종료 함수: Node VM 회귀 테스트 7개 통과.
- npm test: 60개 통과. npm run test:ui: 7개 통과.
- /loading-harness.html: 공통 모듈을 사용하는 전체/추가 로딩 및 클릭 확인 버튼 추가.
- scripts/verify-common-loading.cjs: 변경된 입력 차단 및 추가 로딩 계약에 맞춤.
- 실제 PC/모바일 브라우저 검증은 Chromium 설치 파일 다운로드가 실패하여 실행하지 못함. Node DOM 대역 검증은 실제 브라우저 검증을 대체하지 않음.
