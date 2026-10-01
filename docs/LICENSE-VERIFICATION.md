# 무료 사용자 수 제한 검증 기록

2026-10-02 한국 시간에 검증했습니다. 기준은 `03f341570bf9b75150ca0109d7455582c9f8c179`이며 사용자 제한 구현, 공유게시판, 프로필·설정 메뉴와 공통 로딩·글쓰기 화면 변경을 포함합니다.

## 확인한 결과

- `npm test`: 47개 통과. 기존 초과 설치, API 권한, 승인·재활성화, JSON 저장 동시성·저장 실패 및 공지 회귀 검증을 포함합니다.
- `npm run test:ui`: 공통 UI 계약 7개 통과.
- `npm run test:browser`: 실제 Chromium에서 기존 PC 1440×1000·모바일 390×844 화면 흐름과 22개 캡처 검증 통과. 공통 메뉴 변경에 맞춰 기존 엑셀 다운로드 검증의 접근성 선택자를 menuitem으로 갱신했습니다.
- `npm run test:license:browser`: 같은 PC·모바일 크기에서 7명인 이전 설치의 관리자 복구, 6명 상태의 신규 활성 등록·가입 승인·재활성화 거부, 문의 주소, 오류 시 팝업·아이디·비밀번호 입력 유지, 비활성화 후 빈자리 재사용 통과. 복구 후 일반 사용자 로그인과 기존 업무 자료 보존도 확인했습니다.
- `npm run test:license:redis`: 격리된 실제 Redis 6.2.17에서 통과. 활성 5명일 때 12개 HTTP 등록 요청을 동시에 보내 1개만 성공하고 11개는 403으로 거부됐습니다. 가입 승인과 재활성화를 동시에 요청해도 한 작업만 성공했습니다. Redis에 저장된 활성·승인 인원은 6명입니다. 이전 approval 누락·null·빈 문자열·false·0 계정도 서버와 동일하게 포함하며, 이 호환성 검증에서 발견한 Redis 집계 누락을 수정한 후 재통과했습니다. 초과 설치 복구, 비인증 상태 조회 거부, 클라이언트 한도 변경 무시, 가입 차단·자료 보존도 확인했습니다.

운영 Redis나 실제 사용자 자료는 사용하지 않았습니다. Redis 검증은 임시 서버와 로컬 REST 어댑터를 통해 애플리케이션의 Upstash REST 전송 및 실제 Lua EVAL을 실행합니다. 운영 Upstash 인프라와 Node redis 패키지의 네이티브 연결 경로를 별도로 검증한 결과는 아닙니다.

## 개발 환경에서 재실행

프로덕션 프런트엔드에 의존성을 추가하지 않습니다. 브라우저 검증은 개발용 Playwright·Chromium, Redis 검증은 로컬 redis-server 실행 파일이 필요합니다.

```sh
npm test
npm run test:ui
PLAYWRIGHT_MODULE_PATH=/path/to/playwright BROWSER_EXECUTABLE_PATH=/path/to/chromium npm run test:license:browser
REDIS_SERVER_EXECUTABLE=/path/to/redis-server npm run test:license:redis
```

Playwright와 브라우저가 기본 경로에 설치됐다면 해당 환경 변수를 생략할 수 있습니다. Redis 실행 파일을 지정하지 않으면 PATH의 `redis-server`를 사용합니다. `UI_CAPTURE_DIR`에 캡처 저장 경로를 지정할 수 있으며 지정하지 않으면 테스트 종료 후 임시 캡처와 예시 데이터를 삭제합니다.

Redis 하네스는 기존 REDIS_URL·UPSTASH 환경 변수를 지우고 무작위 로컬 포트와 임시 디렉터리에 자체 Redis를 시작합니다. 디스크 저장을 끄며 테스트 종료 시 서버와 임시 자료를 정리합니다. 별도 라이선스 발급·등록이나 무료 한도 확장 기능은 추가하지 않았습니다.
