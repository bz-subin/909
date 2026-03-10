from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return "Flask 서버가 실행 중입니다!"

# 새로 추가하는 API 엔드포인트
@app.route('/api/hello')
def api_hello():
    return jsonify({"message": "Success!"})


if __name__ == '__main__':
    app.run(debug=True, port=5000)