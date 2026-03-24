from fastapi import FastAPI, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, BigInteger, Text, DateTime, Float, String, ForeignKey, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import os
import requests
from dotenv import load_dotenv
from pydantic import BaseModel
from dependencies import require_login
from fastapi import FastAPI, Depends, HTTPException, Request, status  # ← status 추가!
from fastapi.responses import JSONResponse, HTMLResponse, RedirectResponse  # ← RedirectResponse 추가!
from fastapi.templating import Jinja2Templates
from typing import Optional 
# -----------------------------------------------------------------------------------

# .env 로드 및 설정
load_dotenv()
DATABASE_URL = os.getenv("DB_URL")

# Kakao API 호출에 사용될 애플리케이션 키. .env 파일에서 KAKAO_API_KEY 환경 변수를 로드합니다.
# 이 키는 Kakao Local API (주소 검색) 및 Kakao Navi API (길찾기) 호출 시 인증에 사용됩니다.
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")


# --- [DB] SQLAlchemy 연결 설정 ---
engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 10})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# [의존성 주입]
# API 요청 시 DB 세션을 열고, 응답 후 자동으로 닫습니다(종료 관리)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ---------------------------------- DB 스키마 --------------------------------------
class Profile(Base):
    __tablename__ = 'profiles'
    id = Column(UUID(as_uuid=True), primary_key=True)
    email = Column(Text, unique=True, nullable=False)
    nickname = Column(Text, unique=True, nullable=False)
    profile_img_url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Feed(Base):
    __tablename__ = 'feeds'
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('profiles.id'), nullable=False)
    title = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    image_url = Column(Text)
    place_name = Column(Text)
    road_address_name = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    category_code = Column(String(10))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Like(Base):
    __tablename__ = 'likes'
    id = Column(BigInteger, primary_key=True, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('profiles.id'), nullable=False)
    feed_id = Column(BigInteger, ForeignKey('feeds.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('user_id', 'feed_id', name='unique_user_feed_like'),)

# ----------------------------------------------------------------------------------------

# DB 테이블 생성
Base.metadata.create_all(bind=engine)

# --- [FastAPI 앱 설정] ---
app = FastAPI()


# 에러나면 가로채서 처리함
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):

    #  401 에러 → 로그인 페이지로 리다이렉트(보내버림)
    if exc.status_code == 401:  
        return RedirectResponse(url="/", status_code=303)
    
    # 다른 에러는 기본 처리(안내 메시지)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )


# CORS 설정 - 다른 곳에서 데이터 요청 시 받아주는 애
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  #다 허용
    allow_methods=["*"],  #GET, POST, PUT, DELETE 허용
    allow_headers=["*"],  #헤더 정보(쿠키, 인증 토큰 등) 허용
)

# 정적 파일 및 템플릿 설정
app.mount("/static", StaticFiles(directory="frontend/static"), name="static")
templates = Jinja2Templates(directory="frontend/templates")


# ------------------ Pydantic 모델 (입력 데이터 양식) ------------------
# 클라이언트로부터 메시지를 받을 때 사용되는 모델
class MessageRequest(BaseModel):
    message: str

# [추가됨] 클라이언트로부터 주소 문자열을 받을 때 사용되는 모델 (`/api/geocode` 엔드포인트)
class GeocodeRequest(BaseModel):
    address: str

# [추가됨] 클라이언트로부터 경로 탐색을 위한 출발지/도착지 좌표를 받을 때 사용되는 모델 (`/api/route` 엔드포인트)
class RouteRequest(BaseModel):
    startX: float # 출발지 경도
    startY: float # 출발지 위도
    endX: float   # 도착지 경도
    endY: float   # 도착지 위도

# [추가됨] 클라이언트로부터 경로를 구성하는 좌표 리스트를 받을 때 사용되는 모델 (`/api/shops` 엔드포인트)
# 이 모델은 경로 주변의 상점을 검색할 때 사용될 수 있습니다.
class ShopsRequest(BaseModel):
    coordinates: list
# --- [Pydantic 모델] 요청 데이터 검증 스키마 ---


# 게시글 작성 요청 데이터 (POST)
class UserInput(BaseModel):
    title: str 
    content: str
    user_id: str # 작성자 ID (클라이언트에서 전달받음)
    image_url: Optional[str] = None # 이미지 URL (없을 수도 있음)
    category_code : Optional[str] = None

# 게시글 수정 요청 데이터 (PATCH)
class FeedUpdate(BaseModel):
    title: str
    content: str
    image_url: Optional[str] = None
    category_code : Optional[str] = None

# ----------------------------------------------------------------------------------------

# 라우트 (API)

# ✅ Supabase Auth: 로그인 페이지
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
        "login.html", 
        {
            "request": request,
            "supabase_url": os.getenv('SUPABASE_URL'),      # ← 추가!
            "supabase_key": os.getenv('SUPABASE_ANON_KEY')  # ← 추가!
        }
    )

# ✅ Supabase Auth: 회원가입 페이지
@app.get("/signup", response_class=HTMLResponse)
async def signup(request: Request):
    return templates.TemplateResponse(
        "signup.html", 
        {
            "request": request,
            "supabase_url": os.getenv('SUPABASE_URL'),      # ← 추가!
            "supabase_key": os.getenv('SUPABASE_ANON_KEY')  # ← 추가!
        }
    )



#! 삭제 해도 괜찮을 것 같은데.
# 테스트용 DB 생성 API
# @app.post("/db_create")
# async def db_create(data: MessageRequest, db: Session = Depends(get_db)):
#     return {"result": "success", "message": f"'{data.message}' 잘 받았어요!"}

# @app.get("/db_read")
# async def db_read(db: Session = Depends(get_db)):
#     feeds = db.query(Feed).all()
#     return feeds


@app.get("/map", response_class=HTMLResponse)
async def map_page(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# Kakao Maps API 키를 클라이언트에 제공하는 엔드포인트
# 이 키는 map.js에서 Kakao 지도 SDK를 동적으로 로드하는 데 사용됩니다.
@app.get("/api/kakaomap-key")
async def get_kakao_map_key():
    return {"kakao_map_key": KAKAO_API_KEY}

# [추가됨] 주소 문자열을 좌표로 변환하는 Geocoding API 엔드포인트
# 클라이언트(navigation.js)로부터 주소(address)를 받아 Kakao Local API를 호출하여
# 해당 주소의 위도(lat)와 경도(lng)를 반환합니다.
@app.post("/api/geocode")
async def geocode(req: GeocodeRequest):
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}"}
    params = {"query": req.address} # 클라이언트가 보낸 주소를 쿼리 파라미터로 사용

    # Kakao Local API 호출
    response = requests.get(url, headers=headers, params=params)
    data = response.json()

    # 응답에서 첫 번째 검색 결과의 좌표를 추출하여 반환
    if data['documents']:
        doc = data['documents'][0]
        return {"lat": float(doc['y']), "lng": float(doc['x'])}
    
    # 주소를 찾을 수 없는 경우 404 에러 반환
    raise HTTPException(status_code=404, detail="주소를 찾을 수 없습니다.")

# [추가됨] 출발지/도착지 좌표를 받아 최단 경로를 탐색하는 API 엔드포인트
# 클라이언트(navigation.js)로부터 출발지/도착지 좌표를 받아 Kakao Navi API를 호출하여
# 최단 경로 정보를 반환합니다.
@app.post("/api/route")
async def get_route(req: RouteRequest):
    url = "https://apis-navi.kakaomobility.com/v1/directions"
    headers = {"Authorization": f"KakaoAK {KAKAO_API_KEY}", "Content-Type": "application/json"}
    # Kakao Navi API 요청 본문 구성
    data = {
        "origin": {"x": req.startX, "y": req.startY},      # 출발지 좌표 (경도, 위도)
        "destination": {"x": req.endX, "y": req.endY},    # 도착지 좌표 (경도, 위도)
    }

    # Kakao Navi API 호출
    response = requests.post(url, headers=headers, json=data)
    # Kakao Navi API의 응답을 클라이언트에 그대로 전달
    return response.json()

# [추가됨] 경로 주변의 상점 데이터를 제공하는 API 엔드포인트 (현재 플레이스홀더)
# 클라이언트(category.js)로부터 경로를 구성하는 좌표 리스트를 받아,
# 해당 경로 주변에 위치한 상점들의 정보를 반환합니다.
# 현재는 예시 데이터를 반환하며, 실제 구현에서는 DB 쿼리 로직이 필요합니다.
@app.post("/api/shops")
async def get_shops(req: ShopsRequest):
    # 이 부분은 실제 데이터베이스 쿼리 로직으로 대체되어야 합니다.
    # 예시: 경로의 좌표들을 기반으로 특정 반경 내의 상점을 DB에서 조회
    print(f"Received coordinates for shop search: {len(req.coordinates)} points")
    
    # 현재는 더미 데이터를 반환합니다.
    return [
        {"name": "더미 상점 1", "lat": 36.35, "lng": 127.38, "category": "맛집"},
        {"name": "더미 상점 2", "lat": 36.36, "lng": 127.39, "category": "카페"},
        {"name": "더미 상점 3", "lat": 36.34, "lng": 127.37, "category": "여행지"},
    ]




#!--------------------------------------------------------------------------------------------------sb

# /test 입력 화면 렌더링
@app.get("/test", response_class=HTMLResponse)
async def test(request: Request):
    return templates.TemplateResponse("test.html", {"request": request}) #지금 이 주소에서 이 test.html 화면을 보여줄게


# /community 특정 장소의 커뮤니티 화면 렌더링
@app.get("/community/{place_name}", response_class=HTMLResponse)
async def community_page(request: Request, place_name: str, category: Optional[str] = None):
    return templates.TemplateResponse("community.html", { #지금 이 주소에서 이 community.html 화면을 보여줄게
        "request": request, 
        "place_name": place_name,
        "category": category  #! 추가
    })

# [API] 게시글 작성 (Create)
@app.post("/user_input")
async def user_input(data: UserInput, db: Session = Depends(get_db)):
    print(f"제목: {data.title}, 내용: {data.content}, 이미지: {data.image_url}")
    
    new_feed = Feed(          # Feed 모델에 값 담기
        title=data.title,
        content=data.content,
        user_id=data.user_id,
        image_url=data.image_url,
        category_code=data.category_code
    )
    
    db.add(new_feed)     # DB에 올리기
    db.commit()          # 저장 확정
    db.refresh(new_feed) # 자동값 반영
    
    return {
        "id": new_feed.id,
        "user_id": str(new_feed.user_id),
        "title": new_feed.title,
        "content": new_feed.content,
        "image_url": new_feed.image_url,
        "category_code": new_feed.category_code
    }

# [API] 게시글 수정 (Update)
@app.patch("/feed/{feed_id}")
async def update_feed(feed_id: int, data: FeedUpdate, db: Session = Depends(get_db)):
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    
    if not feed:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    feed.title = data.title
    feed.content = data.content
    feed.image_url = data.image_url
    
    db.commit()
    db.refresh(feed)
    
    return {
        "id": feed.id,
        "user_id": str(feed.user_id),
        "title": feed.title,
        "content": feed.content,
        "image_url": feed.image_url,
        "category_code" : feed.category_code
    }

# [API] 게시글 목록 조회 (Read)
@app.get("/get_data")
async def get_data(db: Session = Depends(get_db)):
    feeds = db.query(Feed).all()
    return feeds

# 삭제 버튼
@app.delete("/feed/{feed_id}")
async def delete_feed(feed_id: int, db: Session = Depends(get_db)):
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    db.delete(feed)
    db.commit()
    return {"result": "success"}

#!--------------------------------------------------------------------------------------------------sb


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5909)