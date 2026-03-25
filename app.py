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
from datetime import datetime, timedelta
# -----------------------------------------------------------------------------------

# .env 로드 및 설정
load_dotenv()
DATABASE_URL = os.getenv("DB_URL")

# Kakao API 호출에 사용될 애플리케이션 키. .env 파일에서 KAKAO_API_KEY 환경 변수를 로드합니다.
# 이 키는 Kakao Local API (주소 검색) 및 Kakao Navi API (길찾기) 호출 시 인증에 사용됩니다.
KAKAO_API_KEY = os.getenv("KAKAO_API_KEY")
KAKAO_RESTAPI = os.getenv("KAKAO_RESTAPI") # env에 넣을거임 


# --- [DB] SQLAlchemy 연결 설정 ---
engine = create_engine(DATABASE_URL, connect_args={"connect_timeout": 10})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
templates = Jinja2Templates(directory="frontend")  #html이나 js로 보낼건데 frontend 걔네 다 저 안에 있어

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
    user_id = Column(UUID(as_uuid=True), nullable=False)  # FK 제거
    feed_id = Column(BigInteger, ForeignKey('feeds.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    __table_args__ = (UniqueConstraint('user_id', 'feed_id', name='unique_user_feed_like'),)

class Comment(Base):
    __tablename__ = 'comments'
    id = Column(BigInteger, primary_key=True, index=True)
    feed_id = Column(BigInteger, ForeignKey('feeds.id'), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)  # FK 제거
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

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

# 댓글 작성 요청 데이터
class CommentInput(BaseModel):
    feed_id: int
    user_id: str
    content: str

class CommentUpdate(BaseModel):
    content: str

class LikeInput(BaseModel):
    feed_id: int
    user_id: str

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


@app.get("/map", response_class=HTMLResponse)
async def map_page(request: Request, user_data: dict = Depends(require_login)):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "kakao_key": os.getenv("KAKAO_RESTAPI"),  #이 부분 추가 
        "supabase_url": os.getenv("SUPABASE_URL"),
        "supabase_key": os.getenv("SUPABASE_ANON_KEY")
    })


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

# 기상청 api 키 불러오는 부분
@app.get("/api/weather")
async def get_weather():
    # 1. 기상청 API 설정 (환경변수에서 키 가져오기)
    service_key = os.getenv("WEATHER_API_KEY")
    nx, ny = 67, 134  # 대전 좌표

    # 2. 기상청 기준 시간에 맞춘 base_date, base_time 계산 로직
    def get_base_datetime():
        now = datetime.now()
        current_date = now.strftime("%Y%m%d")
        current_hour = now.hour
        
        # 기상청 단기예보 발표 시간 (02:00부터 3시간 간격)
        base_times = [2, 5, 8, 11, 14, 17, 20, 23]
        
        # 현재 시간보다 이전의 가장 가까운 발표 시각 찾기
        # (기상청 데이터는 정각 + 약 10분 뒤에 API로 제공되므로 현재 시각 기준으로 안전하게 판단)
        last_base_time = 23 # 기본값은 어제 23시
        
        # 00시~01시 사이라면 어제 날짜의 23시 데이터를 가져와야 함
        if current_hour < 2:
            base_date = (now - timedelta(days=1)).strftime("%Y%m%d")
            base_time = "2300"
        else:
            base_date = current_date
            # 현재 시간보다 작거나 같은 마지막 발표 시간 선택
            available_times = [t for t in base_times if t <= current_hour]
            last_base_time = available_times[-1]
            base_time = f"{last_base_time:02d}00"
            
        return base_date, base_time

    base_date, base_time = get_base_datetime()

    # 3. 기상청 API 호출
    url = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
    params = {
        "serviceKey": service_key,
        "numOfRows": 60,
        "pageNo": 1,
        "dataType": "JSON",
        "base_date": base_date,
        "base_time": base_time,
        "nx": nx,
        "ny": ny
    }

    try:
        # 🧪 디버깅용 로그 (서버 터미널에서 확인 가능)
        print(f"Weather Request -> Date: {base_date}, Time: {base_time}")
        
        response = requests.get(url, params=params)
        return response.json()
    except Exception as e:
        return {"error": str(e)}


# /community 특정 장소의 커뮤니티 화면 렌더링
@app.get("/community/{place_name}", response_class=HTMLResponse)
async def community_page_with_place(request: Request, place_name: str, category: Optional[str] = None):
    return templates.TemplateResponse("community.html", {
        "request": request, 
        "place_name": place_name,
        "supabase_url": os.getenv("SUPABASE_URL"),
        "supabase_key": os.getenv("SUPABASE_ANON_KEY")
    })

# /community 기본 커뮤니티 화면 렌더링
@app.get("/community", response_class=HTMLResponse)
async def community_page_default(request: Request):
    return templates.TemplateResponse("community.html", {
        "request": request,
        "place_name": "전체 커뮤니티",
        "supabase_url": os.getenv("SUPABASE_URL"),
        "supabase_key": os.getenv("SUPABASE_ANON_KEY")
    })


import uuid

#* DB_생성[API] 게시글 작성 (Create)
@app.post("/user_input")
async def user_input(data: UserInput, db: Session = Depends(get_db)):
    print(f"제목: {data.title}, 내용: {data.content}, 이미지: {data.image_url}")
    
    new_feed = Feed(          # Feed 모델에 값 담기
        title=data.title,
        content=data.content,
        user_id=uuid.UUID(data.user_id),
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

#* DB_수정 [API] 게시글 수정 (Update)
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

# GET [/get-data] - DB 싹 다 긁어서 반환(보냄)
# [API] 게시글 목록 조회 (Read)
# 댓글 수, 좋아요 수, 본인 좋아요 여부 포함
@app.get("/get_data")
async def get_data(user_id: Optional[str] = None, db: Session = Depends(get_db)):
    feeds = db.query(Feed).all()
    
    result = []
    for feed in feeds:
        # 댓글 수
        comment_count = db.query(Comment).filter(Comment.feed_id == feed.id).count()
        # 좋아요 수
        like_count = db.query(Like).filter(Like.feed_id == feed.id).count()
        
        # 내가 좋아요 눌렀는지 여부
        is_liked = False
        if user_id and user_id != "null" and user_id != "undefined":
            try:
                # user_id가 UUID 형식이므로 변환 시도
                uid = uuid.UUID(user_id)
                like_exists = db.query(Like).filter(Like.feed_id == feed.id, Like.user_id == uid).first()
                if like_exists:
                    is_liked = True
            except:
                pass

        # Feed 객체를 dict로 변환 후 추가 정보 병합
        feed_dict = {
            "id": feed.id,
            "user_id": str(feed.user_id),
            "title": feed.title,
            "content": feed.content,
            "image_url": feed.image_url,
            "category_code": feed.category_code,
            "created_at": feed.created_at,
            "comment_count": comment_count,
            "like_count": like_count,
            "is_liked": is_liked
        }
        result.append(feed_dict)
        
    return result

#* DB_삭제 버튼
@app.delete("/feed/{feed_id}")
async def delete_feed(feed_id: int, user_id: str, db: Session = Depends(get_db)):
    feed = db.query(Feed).filter(Feed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="게시글을 찾을 수 없습니다.")
    
    # 본인 확인 로직 추가 (UUID 문자열 비교)
    if str(feed.user_id) != user_id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")

    db.delete(feed)
    db.commit()
    return {"result": "success"}

# ------------------ 좋아요 (Like) API ------------------

@app.post("/likes")
async def add_like(data: LikeInput, db: Session = Depends(get_db)):
    # 이미 좋아요 했는지 확인
    existing_like = db.query(Like).filter(Like.feed_id == data.feed_id, Like.user_id == uuid.UUID(data.user_id)).first()
    if existing_like:
        return {"result": "already_liked"}
    
    new_like = Like(feed_id=data.feed_id, user_id=uuid.UUID(data.user_id))
    db.add(new_like)
    db.commit()
    return {"result": "success"}

@app.delete("/likes/{feed_id}")
async def remove_like(feed_id: int, user_id: str, db: Session = Depends(get_db)):
    like = db.query(Like).filter(Like.feed_id == feed_id, Like.user_id == uuid.UUID(user_id)).first()
    if not like:
        raise HTTPException(status_code=404, detail="좋아요 기록이 없습니다.")
    
    db.delete(like)
    db.commit()
    return {"result": "success"}
# ------------------ 댓글 (Comments) API ------------------

# [API] 댓글 작성
@app.post("/comments")
async def create_comment(data: CommentInput, db: Session = Depends(get_db)):
    new_comment = Comment(
        feed_id=data.feed_id,
        user_id=uuid.UUID(data.user_id),
        content=data.content
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)
    
    # 작성자 닉네임 조회
    user = db.query(Profile).filter(Profile.id == new_comment.user_id).first()
    return {
        "id": new_comment.id,
        "content": new_comment.content,
        "user_id": str(new_comment.user_id),
        "nickname": user.nickname if user else "Unknown",
        "created_at": new_comment.created_at
    }

# [API] 특정 게시글의 댓글 목록 조회
@app.get("/comments/{feed_id}")
async def get_comments(feed_id: int, db: Session = Depends(get_db)):
    results = db.query(Comment, Profile.nickname)\
        .outerjoin(Profile, Comment.user_id == Profile.id)\
        .filter(Comment.feed_id == feed_id)\
        .order_by(Comment.created_at.asc())\
        .all()
    
    comments_list = []
    for comment, nickname in results:
        comments_list.append({
            "id": comment.id,
            "feed_id": comment.feed_id,
            "user_id": str(comment.user_id),
            "content": comment.content,
            "created_at": comment.created_at,
            "nickname": nickname or "익명"  # profiles 없으면 익명
        })
    return comments_list
#join → outerjoin 으로 바꾸면 profiles에 없는 유저 댓글도 다 나와요!


# [API] 댓글 삭제
@app.delete("/comments/{comment_id}")
async def delete_comment(comment_id: int, user_id: str, db: Session = Depends(get_db)):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    if str(comment.user_id) != user_id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    
    db.delete(comment)
    db.commit()
    return {"result": "success"}






if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=5909)