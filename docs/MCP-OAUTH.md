# DailyNote ChatGPT MCP OAuth 연결 (개발자 사전 검증)

이 단계는 **사전 등록한 OAuth 공개 클라이언트**와 authorization-code + PKCE(S256)를 사용하는 개발자 연결 기능입니다. 사용자 비밀번호를 ChatGPT에 전달하지 않고 DailyNote 인증 페이지에서 로그인·동의합니다. 웹 화면은 바닐라 JavaScript, 서버는 Node.js 기본 모듈을 사용합니다.

## 서버 설정

운영 도메인에 HTTPS가 구성되어 있어야 합니다. 환경 변수는 서버 실행 환경에 안전하게 저장하고 GitHub에 올리지 마세요.

- `DAILYNOTE_PUBLIC_URL=https://your-dailynote-domain.example/` : HTTPS 공개 URL, 후행 슬래시 포함
- `DAILYNOTE_OAUTH_CLIENTS` : 사전 승인한 클라이언트 ID와 정확한 OAuth Redirect URI 목록을 담은 JSON

설정 형식(예시 값, 실제 ChatGPT의 client ID/redirect URI를 확인해서 넣어야 함):

```json
{
  "example-chatgpt-client": {
    "redirectUris": ["https://example.chatgpt.client/oauth/callback"]
  }
}
```

OAuth 서버는 이 설정이 없으면 503으로 비활성화됩니다. 임의 클라이언트 등록(DCR), 외부 클라이언트 메타데이터 가져오기, 비밀 클라이언트 인증은 지원하지 않습니다. UI에서 클라이언트를 등록하는 기능도 아직 없습니다.

## 공개하는 주소

- MCP: `https://<도메인>/api/mcp`
- Protected resource metadata: `https://<도메인>/.well-known/oauth-protected-resource`
- Authorization server metadata: `https://<도메인>/.well-known/oauth-authorization-server`
- 승인 로그인: `https://<도메인>/api/oauth/authorize`
- 토큰 교환: `https://<도메인>/api/oauth/token`

현재는 `mcp:read` 읽기 범위만 허용합니다. OAuth 토큰은 일반 DailyNote API에 직접 사용할 수 없고, MCP의 변경·관리자 쓰기 도구에도 사용할 수 없습니다. 연결 승인이 성공하면 약 1시간 유효한 액세스 토큰을 발급하며, 만료되면 재인증해야 합니다. Refresh Token, 동의 내역 관리/폐기 화면, 동적 클라이언트 등록은 후속 작업입니다.

## ChatGPT 연결 검증

1. 배포 환경에 공식 ChatGPT 클라이언트 정보와 정확한 Redirect URI를 등록합니다.
2. HTTPS 공개 메타데이터에 올바른 `resource`, `issuer`, S256, token endpoint, `none` 인증 방식이 표시되는지 확인합니다.
3. ChatGPT의 MCP/플러그인 연결 화면에서 위 MCP URL을 지정하고 OAuth 연결을 시작합니다.
4. DailyNote의 동의 화면에서 *예시 계정*으로 로그인/승인합니다.
5. ChatGPT에서 `system_test_health`, `worklog_list`를 호출해 읽기 권한과 사용자 분리를 확인합니다.
6. `worklog_create`는 OAuth 읽기 전용 범위에서 실행되지 않아야 합니다.

이 가이드는 **연결을 실제로 완료했다는 검증 기록이 아닙니다.** ChatGPT의 클라이언트 ID/Redirect URI 및 실제 외부 HTTPS 환경이 없는 경우 여기까지 자동 검증할 수 없습니다. 외부 배포는 라이선스·접근 제어·운영 승인 범위에 따라야 합니다.

## 보안·제약

- 인증 코드는 무작위 발급, 5분 만료, 한 번만 교환, PKCE S256 검증, client ID·redirect URI·resource 바인딩을 적용합니다. Redis 사용 시 `GETDEL`로 원자적으로 소비합니다.
- OAuth 비밀번호 입력은 HTTPS DailyNote 도메인에서만 진행해야 합니다.
- 연결 서버는 클라이언트 등록을 명시적 허용 목록으로 제한합니다.
- 사용자 계정의 활성·승인·비밀번호 초기화 상태를 토큰마다 재검증합니다.
- 사용자별 동의 내역·즉시 철회, 로그인 시도 제한, Refresh Token, 감사 기록 고도화가 필요하므로 광범위한 공개 배포 전에 추가 보안 검토를 권장합니다.
- 폐쇄망 DailyNote 인스턴스는 외부 ChatGPT에서 직접 접근할 수 없습니다. 기관 승인 없이 외부 공개나 터널을 설정하지 마세요.
