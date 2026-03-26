# 1. 파이썬 환경 빌리기
FROM python:3.9

# 2. 가상 컴퓨터 안에 /app 폴더를 만들고 거기로 이동하기 (질문하신 부분!)
WORKDIR /app

# 3. 내 컴퓨터의 모든 파일을 가상 컴퓨터의 /app 폴더로 복사하기
COPY . .

# 4. 필요한 라이브러리 설치하기
RUN pip install --no-cache-dir -r requirements.txt

# 5. 서버 실행하기 (8080 포트로 설정)
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]