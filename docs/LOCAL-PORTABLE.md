# DailyNote 로컬 포터블 사용법

## Windows

Windows 10/11 x64 PC에서 Node.js 설치·npm·인터넷 연결 없이 사용합니다.
설치용 EXE/MSI는 사용하지 않습니다. 압축 안의 runtime/node.exe는 서버를 실행하는 포터블 런타임입니다.

1. DailyNote-Windows-x64.zip 전체를 쓰기 가능한 폴더에 풉니다. ZIP 안에서 직접 실행하지 마세요.
2. Start_DailyNote.bat를 더블클릭합니다.
3. 첫 실행에만 관리자 아이디와 비밀번호를 입력합니다. 비밀번호는 표시하지 않으며 해시로 저장됩니다. 기존 계정은 초기화하지 않습니다.
4. 서버 준비가 끝나면 기본 브라우저로 http://127.0.0.1:3000을 엽니다.
5. Create_DailyNote_Shortcut.bat를 실행하면 바탕화면에 새 체크 노트 아이콘의 DailyNote.lnk가 생깁니다. 이후 바로가기만 누르면 서버를 실행합니다.

서버 창을 닫으면 서버가 종료됩니다. 정상 종료는 Ctrl+C입니다.
다시 실행했을 때 같은 설치의 서버가 실행 중이면 브라우저만 엽니다.
다른 앱이 포트를 쓰면 안내하고 종료합니다. config.json PORT를 변경하세요.
기본 주소는 내 PC 전용 127.0.0.1입니다. 다른 PC에서 접속하는 공용 서버 구성은 별도입니다.
업무 자료는 data/, 파일은 uploads/에 저장합니다. 재배포·업데이트 시 두 폴더를 덮어쓰거나 삭제하지 마세요.
실행 BAT는 클라우드 저장소 환경 변수를 배제하고 이 폴더의 로컬 자료를 사용합니다.
폴더를 옮겼다면 바로가기 생성 BAT를 다시 실행하세요. Windows Script Host가 차단된 환경에서는 Start_DailyNote.bat를 직접 실행하세요.
사이트 왼쪽 메뉴의 바로가기 만들기는 사용 안내와 생성 BAT 다운로드입니다. 브라우저에서 PC 파일을 자동 실행하거나 서버가 꺼졌을 때 웹 주소만으로 서버를 시작할 수는 없습니다.

## 개발자 패키징

연결된 빌드 환경에서 python scripts/build-portable.py를 실행합니다. 공식 Node.js 24.21.0 x64 ZIP을 내려받고 고정 SHA256을 확인합니다.
이미 받은 ZIP은 --runtime-zip 옵션으로 지정합니다. public 전체(오프라인 OCR/엑셀/PDF 엔진 포함), src, 실행 BAT, 바로가기 스크립트, 포터블 런타임, 라이선스를 포함합니다.
실제 사용자 data/uploads, 인증 정보, node_modules는 포함하지 않습니다. 사용자 PC에 Python이나 npm은 필요하지 않습니다.
Windows에서 BAT 실행·첫 관리자 생성·브라우저 자동 열기·바탕화면 아이콘·서버 재사용·Ctrl+C 종료를 최종 검증하세요.



## macOS (애플 실리콘·인텔)

1. GitHub → Actions → **Build portable macOS packages** → 성공한 최신 실행을 엽니다.
2. Artifacts에서 애플 실리콘은 `DailyNote-darwin-arm64`, 인텔은 `DailyNote-darwin-x64`를 받습니다. GitHub 로그인이 필요합니다.
3. Artifact ZIP을 풀고 그 안의 `DailyNote-macOS-arm64.zip` 또는 `DailyNote-macOS-x64.zip`도 풀어 쓰기 가능한 폴더에 둡니다.
4. `Start_DailyNote.command`를 더블클릭합니다. 첫 실행에 관리자 계정을 만들면 서버 준비 후 브라우저가 자동으로 열립니다.
5. 종료는 터미널에서 Ctrl+C입니다. 기존 서버가 같은 폴더에서 실행 중이면 브라우저만 엽니다.

맥 패키지에도 공식 Node.js 런타임이 들어 있으므로 사용자 맥에 Node.js·npm·Python을 설치하거나 인터넷에 접속할 필요가 없습니다. 기본 주소는 `http://127.0.0.1:3000`입니다. Windows와 Mac은 각각 자기 컴퓨터의 `data/`, `uploads/`에 자료를 저장하며 자동 공유하지 않습니다.

실행 권한 오류가 나면 터미널에서 압축을 푼 DailyNote 폴더로 이동한 뒤 `chmod +x Start_DailyNote.command`를 한 번 실행합니다. macOS가 다운로드한 실행 파일을 차단하는 경우 시스템 설정의 개인정보 보호 및 보안에서 출처를 확인한 후 실행을 허용하세요. 패키지는 코드 서명·공증된 macOS 앱이 아니므로 조직의 보안 정책에 따라 허용이 필요할 수 있습니다.

## Git 소스 ZIP과 배포 ZIP의 차이

Git의 **Code → Download ZIP** 또는 `git clone`에는 운영체제용 Node.js 바이너리가 없습니다. 맥에서 소스만 받은 경우 이미 설치한 Node.js 24가 있으면 `Start_DailyNote.command`가 이를 사용합니다. 런타임도 없고 Node.js도 없으면 안내 후 종료하며 시작할 때 인터넷에서 내려받지 않습니다. Windows BAT는 기존대로 `runtime/node.exe`가 포함된 Windows 포터블 ZIP을 사용합니다.

Node.js를 설치하지 않고 쓰려면 위 Actions의 **런타임 포함 배포 ZIP**을 받으세요. Windows는 **Build portable Windows package** 워크플로에서 Run workflow로 생성합니다. Mac은 main 갱신 시 자동으로 두 CPU용 패키지를 생성하며 Run workflow로도 생성할 수 있습니다. Artifact 보관 기간은 30일입니다.

## 맥 패키지 빌드

연결된 빌드 환경에서 다음 명령을 실행합니다. Python은 빌드 환경에만 필요합니다.

```bash
python scripts/build-portable.py --platform darwin-arm64
python scripts/build-portable.py --platform darwin-x64
```

Node.js 24.21.0 공식 tar.gz를 고정 SHA256과 비교하고 `runtime/darwin-CPU/bin/node`로 넣습니다. `--runtime-zip`에는 미리 받은 해당 CPU용 tar.gz도 지정할 수 있습니다. ZIP에 `.command`와 Node 바이너리의 실행 권한을 기록하고 제품 LICENSE와 Node LICENSE를 포함합니다. 기존 Windows 빌드 명령과 ZIP 형식은 유지합니다.

Linux 환경에서 실행 스크립트의 CPU 선택·공백 경로·환경 변수 정리와 브라우저 실행 인자를 검증했습니다. 실제 macOS Finder 더블클릭, 보안 허용, 브라우저 자동 열기와 터미널 종료는 macOS에서 최종 확인해야 합니다.
