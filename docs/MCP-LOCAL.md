# DailyNote MCP 2단계: 폐쇄망 로컬 연결 및 격리 테스트

## 로컬 MCP 연결기

Node.js 18 이상에서 추가 npm 패키지 없이 `scripts/mcp-stdio.cjs`를 실행할 수 있습니다. Claude Code 등 **stdio MCP를 지원하는 로컬 AI 클라이언트**에 연결합니다.

1. 기존 DailyNote 서버를 localhost에서 실행합니다.
2. DailyNote에 로그인해 얻은 **개인 로그인 세션**을 클라이언트의 비밀 환경 변수 `DAILYNOTE_MCP_TOKEN`에 주입합니다. 토큰을 프롬프트·설정 저장소·명령 기록에 기재하지 마세요. 24시간 등 세션 만료 후 갱신이 필요합니다.
3. MCP 클라이언트 실행 명령은 `node /절대경로/DailyNote/scripts/mcp-stdio.cjs`입니다.
4. 선택: `DAILYNOTE_MCP_URL=http://127.0.0.1:3000/api/mcp` (기본값), `DAILYNOTE_MCP_TOKEN` (필수).

예시 클라이언트 구성(환경 변수 값은 기기별 비밀 보관 기능에서 주입):

```json
{
  "mcpServers": {
    "dailynote": {
      "command": "node",
      "args": ["/absolute/path/to/DailyNote/scripts/mcp-stdio.cjs"]
    }
  }
}
```

연결기는 stdin에서 한 줄에 JSON-RPC 메시지 한 건을 받고 서버로 전달한 뒤 stdout으로 JSON-RPC 메시지만 반환합니다. 토큰은 stdout으로 출력하지 않습니다. **네트워크가 없는 폐쇄망이라도 Node.js와 로컬 DailyNote 서버는 필요**하지만 외부 인터넷은 필요하지 않습니다. 기본 연결은 localhost만 허용하고, 원격 연결은 HTTPS 및 `DAILYNOTE_MCP_ALLOW_REMOTE=1`을 모두 요구합니다. 방화벽·기관 망 분리 정책을 우회하지 않습니다.

## 격리형 Test MCP

`DAILYNOTE_MCP_TEST_MODE=1`을 설정한 개발용 서버(로컬 JSON 모드, NODE_ENV가 production이 아님)의 **관리자 계정**에서만 `system_test_regression` 도구가 보입니다.

- `suite: "mcp"`: MCP 인증·권한·소유권 및 프로토콜 단위/통합 테스트
- `suite: "ui"`: 바닐라 JS 화면 계약 테스트 (실제 픽셀 기반 브라우저 테스트와 다름)

고정된 테스트 파일만 실행하며 임시 `DATA_DIR`·`UPLOAD_DIR`을 쓰고 Redis/Upstash/Vercel 환경 변수를 자식 프로세스에서 제거합니다. 결과는 성공 여부·경과 시간·건수 요약만 돌려주며 실행 후 임시 파일을 삭제합니다. 30초 재실행 제한과 동시 실행 차단을 적용합니다. 서버가 Redis/Vercel/production이면 도구 자체를 숨깁니다. **실제 브라우저 회귀 테스트는 별도의 GitHub Actions나 로컬 UI 하네스로 유지**합니다.

## 아직 연결하지 않은 범위

원격 ChatGPT 및 Claude 계정 연결을 위한 OAuth 2.1 Authorization Server, 사용자 동의·권한 범위, 연결 해제/토큰 폐기는 별도 단계입니다. 개인 로그인 세션을 외부 MCP 마켓플레이스에 붙여넣으면 안 됩니다. 인증 서버 완성 전까지 ChatGPT 커스텀 커넥터 연결 완료로 간주하지 않습니다.

