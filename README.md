# dailyNote

사진으로 복원한 일일 업무일지의 실행용 사본입니다. 로그인, 사용자 관리 API, 알림, 파일 업로드·다운로드·삭제, 업무일지 등록·수정·삭제와 날짜 조회를 제공합니다.

## 로컬 실행

Node.js 24 권장. Redis 연결용 npm 의존성을 설치하세요 (`npm install`).

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD='사용할-12자-이상-비밀번호' npm run init
npm start
```

http://localhost:3000 에서 초기 계정으로 로그인합니다. 초기화는 기존 사용자를 덮어쓰지 않습니다. `.env.example`은 참고용이며 환경 변수는 실행 환경에서 설정해야 합니다.

```bash
npm test
```

로컬 데이터는 `data/`, 업로드 파일은 `uploads/`에 저장됩니다. 두 폴더와 비밀 설정은 Git에서 제외합니다.

## Vercel 배포

GitHub 저장소를 가져오고 Framework Preset은 Other, Output Directory는 public로 선택합니다. API 함수와 rewrite는 vercel.json에 정의되어 있습니다.

Vercel에서 JSON 파일에 영구 저장하지 않습니다. Redis를 연결하고 다음 값을 Production 및 Preview 환경 변수에 설정합니다.

- REDIS_URL (`redis://` 또는 TLS용 `rediss://` 연결 문자열, 별도 REST 토큰 불필요)
- 기존 Upstash REST 연결도 지원: REDIS_URL 대신 UPSTASH_REDIS_REST_URL 및 UPSTASH_REDIS_REST_TOKEN 설정
- ADMIN_USERNAME
- ADMIN_PASSWORD (12자 이상)

첫 API 요청이 초기 계정을 한 번 생성합니다. 기존 계정이 있으면 덮어쓰지 않습니다. Redis에 사용자·일지·알림·파일 정보를 저장하고 세션은 TTL로 만료합니다. 파일은 테스트용 최대 3 MB이며 Redis에 Base64로 저장합니다. 저장소 미설정 상태에서는 API가 503을 반환하여 임시 파일에 데이터가 저장되는 것을 방지합니다.

## 검증 및 한계

자동 테스트로 로그인 성공/실패, 인증 누락, 업무일지 CRUD와 파일 저장, 타 사용자 일지 수정·삭제 차단, 알림 읽음, 비밀번호 변경, 파일 업로드·다운로드·삭제를 검증했습니다. REDIS_URL을 사용하는 실제 Redis 서버에서도 같은 로그인·일지·파일 테스트를 통과했습니다. 비어 있는 테스트 전용 Redis에서 `REDIS_TEST_URL=redis://localhost:6379/15 npm test`로 재현할 수 있습니다. Vercel 실제 배포와 Redis 연결, 브라우저 화면 검증은 아직 완료되지 않았습니다.

원본처럼 인증된 사용자는 사용자 관리 API에 접근할 수 있습니다. 여러 사용자 운영 전 관리자 역할과 권한을 추가해야 합니다. JSON 로컬 저장 방식은 단일 프로세스 개발용입니다. 실제 사용자 데이터·원본 업로드 문서·계정은 포함하지 않습니다.

사진으로 확인되지 않은 원본 .env.example, config.json, make-hash.js, mariaDB.sql, README, 데이터 JSON, Windows 실행 파일은 원본 복원에 포함되지 않았습니다. 필요한 초기 계정 생성과 설정 예시는 실행용으로 새로 작성했습니다. db.js는 보관된 미사용 MariaDB 보조 모듈입니다.
