from flask import Flask, jsonify, render_template
from flask_cors import CORS
import os
from flask_sqlalchemy import SQLAlchemy  
from flask_migrate import Migrate 
from sqlalchemy.dialects.postgresql import UUID # UUID 자료형 사용을 위함
from sqlalchemy.sql import func # func.now() 사용을 위함 
from dotenv import load_dotenv 


app = Flask(__name__, 
            template_folder='frontend/templates', 
            static_folder='frontend/static')


CORS(app)


load_dotenv() #env 파일을 함수 호출을 통해 os에 등록(불러옴)
database_url = os.getenv("DB_URL") 


#* DB 파일 경로 설정 (supabase 사용 시 여기만 변경)
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"connect_args": {"connect_timeout": 10}} #
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db = SQLAlchemy(app)  
migrate = Migrate(app, db)


#! 스키마
#* 2. Profiles (사용자 프로필) - auth.users와 1:1 관계
class Profile(db.Model):
    __tablename__ = 'profiles' # DB에 저장될 테이블 이름
    
    # id: Supabase의 인증 시스템(auth.users)과 연결되는 핵심 키입니다. 
    # 회원가입 시 생성된 UUID를 그대로 가져와서 PK(기본키)로 사용합니다.
    id = db.Column(UUID(as_uuid=True), primary_key=True)
    
    email = db.Column(db.Text, unique=True, nullable=False) # 이메일 (중복 불가)
    nickname = db.Column(db.Text, unique=True, nullable=False) # 닉네임 (중복 불가)
    profile_img_url = db.Column(db.Text) # 프로필 이미지 경로
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now()) # 생성일 (자동 입력)

#* 3. Feeds (게시글 및 장소 데이터)
class Feed(db.Model):
    __tablename__ = 'feeds' # DB에 저장될 테이블 이름
    
    # 게시글 고유 번호 (1, 2, 3... 자동으로 증가)
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    
    # 작성자 ID: 누가 썼는지 알기 위해 Profile 테이블의 id를 가져와서 기록합니다 (FK)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey('profiles.id'), nullable=False)
    
    title = db.Column(db.Text, nullable=False)   # 글 제목
    content = db.Column(db.Text, nullable=False) # 글 내용
    image_url = db.Column(db.Text)               # 첨부 사진 URL
    
    # -- 카카오맵 API 연동 데이터 --
    place_name = db.Column(db.Text)        # 장소 이름 (예: 스타벅스 강남점)
    road_address_name = db.Column(db.Text) # 도로명 주소
    latitude = db.Column(db.Float)         # 위도 (Y좌표)
    longitude = db.Column(db.Float)        # 경도 (X좌표)
    category_code = db.Column(db.String(10)) # 카테고리 코드 (음식점, 카페 등)
    
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now()) # 작성 시간

#* 4. Likes (좋아요 기능)
class Like(db.Model):
    __tablename__ = 'likes' # DB에 저장될 테이블 이름
    
    # 좋아요 기록 고유 번호
    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    
    # 누가 좋아요를 눌렀는지 (Profile 테이블 참조)
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey('profiles.id'), nullable=False)
    
    # 어떤 글에 좋아요를 눌렀는지 (Feed 테이블 참조)
    feed_id = db.Column(db.BigInteger, db.ForeignKey('feeds.id'), nullable=False)
    
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now()) # 누른 시간

    # 중복 방지: 한 사람이(user_id) 같은 글(feed_id)에 좋아요를 두 번 누를 수 없게 설정합니다.
    __table_args__ = (db.UniqueConstraint('user_id', 'feed_id', name='unique_user_feed_like'),)



#* DB 파일 생성 (처음 한 번만 실행됨)
with app.app_context():
    db.create_all()


#* 첫화면
@app.route('/')
def home():
    return render_template('login.html') 


#* 받은 데이터 DB에 저장
@app.route('/db_create', methods=['POST'])  # db_create 저요!!!
def db_create():
    data = request.get_json() #* fetch로 받아냄.
    input_content = data.get("message")
    
    # DB 장부에 추가
    add_data = Human(content = input_content) 
    db.session.add(add_data)
    db.session.commit() 
    
    return jsonify({"result": "success", "message": "DB에 잘 들어갔어요!"}) #* 받았으면 줘야함 


#* DB에서 데이터 읽은 뒤 브라우저로 보냄.  (GET이니까 답 안 받음)
@app.route('/db_read', methods=['GET'])  # db_read 어디있니!, 데이터를 일방적으로 보냄(GET) 
def db_read():
    db_all = Human.query.all()
    result = []
    for split_db in db_all : 
        result.append ({
            "id" : split_db.id,
            "content" : split_db.content,
            "age" : split_db.age
        })
    print(result)
    return jsonify(result) 



@app.route('/map')
def map_page():
    return render_template('map.html') 

@app.route('/community/<place_name>')
def community_page(place_name):
    return render_template('community.html', place_name=place_name) 

# 새로 추가하는 API 엔드포인트
@app.route('/api/hello')
def api_hello():
    return jsonify({"message": "Success!"})

@app.route('/api/fail')
def api_fail():
    # 404 에러와 함께 메시지 전송
    return jsonify({"message": "요청하신 페이지를 찾을 수 없습니다!"}), 404



if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5909))
    app.run(host="0.0.0.0", port=port, debug=True)
#debug=True 서버 새로고침 안 해도 자동 반영