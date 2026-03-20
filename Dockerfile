# 1단계: 요리를 시작할 '기본 주방' 환경을 선택합니다. 
# python:3.11-slim은 꼭 필요한 기능만 담겨 있어 가볍고 빠릅니다. (맥북 용량 절약!)
FROM python:3.11-slim

# 2단계: 컨테이너 내부에서 우리가 작업할 '메인 조리대' 폴더를 지정합니다.
# 이후 실행되는 모든 명령어는 이 /app 폴더 안에서 일어납니다.
WORKDIR /app909

# 3단계: 요리에 필요한 '특수 도구'들을 리눅스 시스템에 설치합니다.
# build-essential(컴파일 도구), libpq-dev(PostgreSQL DB 연결 도구)는 Supabase 연결에 필수입니다.
# 설치 후 용량을 줄이기 위해 찌꺼기 파일들(apt/lists)은 바로 삭제합니다.
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# 4단계: 장 봐온 '재료 리스트'(.txt)만 먼저 조리대로 가져옵니다.
# 소스 코드를 가져오기 전에 이 파일을 먼저 복사해야 나중에 코드만 수정했을 때 빌드 속도가 빨라집니다. (캐시 활용)
COPY requirements.txt .

# 5단계: 리스트에 적힌 '재료(라이브러리)'들을 실제로 설치합니다.
# --no-cache-dir 옵션은 설치 파일 찌꺼기를 남기지 않아 이미지를 가볍게 유지해줍니다.
RUN pip install --no-cache-dir -r requirements.txt

# 6단계: 이제 내가 짠 '진짜 레시피(파이썬 소스 코드)' 전체를 조리대로 복사합니다.
# .dockerignore에 적힌 파일들은 제외하고 깔끔하게 코드만 들어옵니다.
COPY . .

# 7단계: 서버가 손님을 맞이할 '창구 번호(Port)'를 설정합니다.
# Render 같은 서비스에서 포트 번호를 바꿀 수 있도록 환경 변수 형태로 저장합니다.
ENV PORT=5909

# 8단계: 도커 엔진에게 "이 컨테이너는 5909번 창구를 열어둘 거야"라고 공식적으로 알려줍니다.
EXPOSE 5909

# 9단계: 마지막으로 주방 문을 열고 '서버 실행' 버튼을 누릅니다.
# 0.0.0.0으로 설정해 외부 접속을 허용하고, Render 프록시 설정을 믿겠다는 옵션을 추가했습니다.
# ${PORT:-5909}는 "환경 변수가 없으면 기본값으로 5909를 써라"라는 뜻입니다.
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-5909} --proxy-headers --forwarded-allow-ips '*'"]