from flask import Flask, jsonify, render_template
from flask_cors import CORS



app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return render_template('index.html') 

# 새로 추가하는 API 엔드포인트
@app.route('/api/hello')
def api_hello():
    return jsonify({"message": "Success!"})

@app.route('/api/fail')
def api_fail():
    # 404 에러와 함께 메시지 전송
    return jsonify({"message": "요청하신 페이지를 찾을 수 없습니다!"}), 404


if __name__ == '__main__':
    app.run(debug=True, port=5001)