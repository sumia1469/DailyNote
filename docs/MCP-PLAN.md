# DailyNote MCP 기획 및 1단계 구현 (2026-11-04)

## 목표

ChatGPT, Claude, 개발용 AI 클라이언트가 DailyNote 사용자/관리자 작업을 **기존 권한과 소유권 규칙 그대로** 호출할 수 있도록 한다. 브라우저는 계속 바닐라 JavaScript, 서버는 기존 Node.js HTTP 구조를 사용하고 새 런타임 종속성을 추가하지 않는다.

## 구조

```text
MCP client (Claude, ChatGPT, local agent)
  └─ POST /api/mcp (Bearer DailyNote 로그인 세션)
       └─ src/mcp.js: JSON-RPC, 입력 검증, 도구별 권한 검사
            └─ 기존 handleApi() 호출
                 └─ 사용자 소유권, 관리자 권한, 라이선스, 감사 로그
```

1단계는 HTTP JSON 응답을 사용하는 무상태 MCP로 구현한다. 최신 무상태 클라이언트와 기존 initialize 호출을 모두 수용한다. `tools/list`와 `tools/call`을 지원하며 리소스/프롬프트/SSE/구독은 제공하지 않는다. 도구 결과가 클 경우 항목 수를 제한하고 축약 상태를 표시한다.

## 제공 도구

| 범위 | 도구 | 권한 |
|---|---|---|
| System | system_whoami, system_test_health, system_test_permissions | 로그인 |
| User | worklog_list, worklog_create, worklog_update | worklogRead/Create/Edit |
| User | memo_list, memo_get, memo_create | memoRead/Create |
| User | calendar_list | calendarRead |
| User | file_list | fileRead |
| User | notification_list | notificationRead |
| Admin | admin_users_list | users |
| Admin | admin_files_list | files |
| Admin | admin_notices_list | notifications |
| Admin | admin_logs_list | logs |
| Admin (선택) | admin_user_approve, admin_notice_create | 각 관리자 권한 + 추가 활성화 + confirm |

관리자 쓰기 도구는 기본 비활성화. 서버 환경변수 `DAILYNOTE_MCP_ADMIN_WRITES=1`로 활성화할 때만 노출하고 각 호출에 `confirm:true`를 요구한다. **이 플래그는 AI의 독립적인 인간 승인 증명이 아니다.** 실제 운영에서 해당 도구를 노출할 때는 클라이언트의 명시적 도구 승인과 별도 관리 절차를 반드시 적용한다. 삭제/백업복원/비밀번호 초기화/권한 변경/파일 바이너리 전달 도구는 1단계에 넣지 않는다.

## 인증·보안

- 별도 범용 관리자 API 키를 만들지 않는다. `Authorization: Bearer <DailyNote 세션>`으로 인증한다.
- MCP 및 내부 재호출 모두 사용자/관리자 권한과 소유권을 검사한다.
- 관리자 도구는 해당 권한이 없는 사용자에게 목록에 나타나지 않는다.
- `Origin`이 있으면 요청 Host와 일치하는지만 허용한다. 외부 웹 브라우저에서 임의로 호출할 수 있도록 CORS를 열지 않는다.
- 임시 비밀번호 변경이 필요한 계정은 사용하지 못한다.
- 로그인 토큰과 요청 본문을 도구 결과, 로그, 문서에 출력하지 않는다.
- 폐쇄망 로컬 환경에서 외부 클라우드 AI가 접속하려면 승인된 네트워크 경로/보안 터널이 필요하다. 망 분리 정책을 우회하지 않는다.

## 테스트 MCP

- `system_test_health`: 기존 라이선스 API를 읽고 정상 동작 여부/라이선스 상태만 응답한다.
- `system_test_permissions`: 현재 사용자에게 공개된 MCP 도구를 보여 주고 권한 구성을 검토한다.
- 위 진단은 운영 데이터를 쓰지 않는다. CRUD/파일 업로드·복구 등 변경 테스트는 별도 격리된 CI 데이터에서 실행한다.
- 회귀 테스트는 `test/mcp.test.js` 및 기존 `npm test`, `npm run test:ui`, GitHub Actions에서 수행한다.

## 클라이언트 연결 단계

1. DailyNote에 로그인해 세션을 얻는다(로그인 토큰을 AI 프롬프트에 직접 붙여넣지 않는다).
2. HTTP MCP 클라이언트가 인증 헤더를 안전하게 주입하도록 구성하고 `https://<도메인>/api/mcp`에 연결한다.
3. `tools/list`와 `system_test_health`로 연결/권한 확인 후 사용자 도구를 호출한다.
4. ChatGPT 플러그인의 일반 사용자 배포에는 OAuth 인증·토큰 갱신·승인 화면이 추가로 필요하다. 현재 DailyNote 세션만 지원하는 **1단계 MCP를 곧바로 ChatGPT 플러그인에 연결 완료한 것으로 간주하지 않는다.**
5. Claude Code/기타 클라이언트에서도 실제 HTTP 인증 헤더 지원 여부에 맞춰 설정한다.

## 2단계 권장 작업

- ChatGPT/Claude용 OAuth 2.1 서버와 사용자 연결/해제 UX
- 폐쇄망 로컬 stdio/보안터널 전송 옵션
- 테스트 데이터 격리 환경에서만 실행 가능한 `test_regression` 및 상세 결과 조회
- 사용자 승인·변경 내역 검토 UI, 세분화된 도구 범위, 요청 제한
- 캘린더·게시판·파일 등의 추가 작성/수정 도구
- 에러율/실행시간/도구 사용 감사 로그 대시보드

## 검증 기준

- 인증 누락/변조/비활성 계정 거부
- 사용자 권한별 도구 노출 및 호출 거부
- 기존 API 소유권 검증 유지, 관리자 쓰기 기본 차단
- 인수 형식/길이 검증과 오류 응답
- 운영 데이터 변경 없는 테스트 도구
- 기존 웹 사용자 화면·로컬 실행 회귀 없음
