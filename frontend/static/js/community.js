const supabase = window.supabase.createClient(  // ← 이걸로 교체
    window.SUPABASE_URL,
    window.SUPABASE_KEY
);
        const input_file = document.querySelector('#input-file'); // 이미지용 input
        const input_file_add = document.querySelector('#input-file-add'); // 추가 버튼

        // [ ] 선택된 파일을 담을 변수 (State 역할)
        let selectedFile = null;  //이미지 담김
        let publicUrl = null; // 나중에 DB 저장할 때 사용


        // *이미지 파일 입력 받음
        // ->  값이 '기존과 달라지면'(change) 실행
        input_file.addEventListener('change', async () => {
            selectedFile = input_file.files[0];  //입력 받은 사진을 file에 넣음
            
            
            if (!selectedFile) return;   // 파일이 없으면 함수 종료
            console.log("이미지를 넣어주세요")

            const fileExt = selectedFile.name.split('.').pop();  // 파일 확장자 추출
            const fileName = `${Date.now()}.${fileExt}`; // 파일명 생성: 현재 시간(밀리초) + 확장자(//*파일명 안 곂치게)

            const { data, error } = await supabase.storage  //에러나면 error에 뭔갈 담아줌
                .from('images')  // 저장할 버킷(스토리지)
                .upload(fileName, selectedFile); // (저장할 파일명, 실제 파일)

            if (error) {  //에러 시
                console.error("업로드 실패:", error.message);
                alert("업로드 실패: " + error.message);
                return;
            }

        //* 이미지 파일 받아다가 url 만듦
            const { data: urlData } = supabase.storage  //urlData 라는 이름으로 데이터 받음.
                .from('images')
                .getPublicUrl(fileName); //* url 생성(변환)

            publicUrl = urlData.publicUrl; //url 변수 저장
            console.log("이미지 URL 준비됨:", publicUrl);

            // 사진 미리보기
            const preview_img = document.querySelector('#preview-img');
            if (preview_img) {
                preview_img.innerHTML = `<img src="${publicUrl}" style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px; margin-top: 10px;">`;
            }
        });


/*  이미지 파일 선택
→ selectedFile에 이미지 저장
→ 스토리지에 업로드
→ 업로드된 파일로 URL(publicUrl) 생성
→ 미리보기로 이미지 표시

저장 버튼 클릭 시
URL(publicUrl) + 다른 입력값(input 등) → DB 저장  */



        // ==========================================
        // [JavaScript] CSR 로직 및 이벤트 핸들러
        // ==========================================
        let all_feed = [];
        let selected_feed = null;
        let login_user_id = null;
        let is_loading = false;

        const feed_div = document.getElementById('feed-div'); //피드 추가할 영역
        const write_div_modal = document.getElementById('write-div-modal'); //

// //?  DOM : html을 읽어서 js가 건들 수 있는 객체로 변한것
// -> 사용 여부 확인 필요
//         --- [초기화] DOM 로드 시 로그인 체크 및 데이터 로딩 ---
        window.addEventListener('DOMContentLoaded', async () => {
            // localStorage 대신 supabase에게 직접 물어봅니다.
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                alert("로그인이 필요합니다."); 
                window.location.href = "/"; // 로그인 페이지로 보냄
                return;
            }

            // 로그인 성공했다면 ID 저장
            login_user_id = user.id;
            console.log("Logged in user:", login_user_id);

            await fetchAllFeeds();
        });


        //* GET [/get-data]
        // 서버에서 전체 게시글(피드) 싹 다 불러오기
        async function fetchAllFeeds() {
            try {
                const res = await fetch('/get_data');
                all_feed = await res.json(); 
                renderFeedList();
            } catch (err) {
                console.error(err);
                feed_div.innerHTML = "피드를 불러오는데 실패했습니다.";
            }
        }

        // 불러온 데이터로 화면 그리기(피드)
        function renderFeedList() {
            feed_div.innerHTML = '';
            if (all_feed.length === 0) {  //가져온 피드가 없다면
                feed_div.innerHTML = '<p style="text-align:center; padding: 2rem; color: #64748b;">게시글이 없습니다.</p>';
                return;
            }

            // 피드 최신순 정렬 (ID 기준 역순 가정)
            const sortedFeeds = [...all_feed].sort((a, b) => b.id - a.id);
            sortedFeeds.forEach(feed => {
                const feedCard = each_feed(feed);
                feed_div.appendChild(feedCard);
            });
        }

        // '개별 게시글(카드)' DOM 생성 함수 
        function each_feed(feed) {
            const div = document.createElement('div'); //div 만듦
            div.className = 'post-card'; //클래스명 (유니폼)
            div.id = `feed-${feed.id}`; //아이디
            
            // 내용 앞 100자 정도로 확장 (한 줄 배치이므로 더 많이 보여줌)
            const shortContent = feed.content.length > 100 ? feed.content.substring(0, 100) + '...' : feed.content;

            // 이미지가 있으면 이미지 영역 생성, 없으면 아예 생성 안 함
            let imgTag = '';
            if (feed.image_url) {
                imgTag = `
                    <div class="post-img-container">
                        <img src="${feed.image_url}" alt="image" class="post-thumb">
                    </div>
                `;
            }


            // 삭제 버튼 (제목 옆 배치를 위해 클래스 유지)
            const deleteBtn = String(feed.user_id) === String(login_user_id) 
                ? `<button class="btn-delete-feed" onclick="event.stopPropagation(); deleteFeed(${feed.id})">
                    <svg width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/>
                        <path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/>
                    </svg>
                   </button>` 
                : '';


            div.innerHTML = `
                ${imgTag}
                <div class="post-content">
                    <div class="post-header">
                        <h3 class="post-title">${feed.title}</h3>
                        ${deleteBtn}
                    </div>
                    <p class="post-text">${shortContent}</p>
                    <div class="post-footer">
                        <div class="post-meta-left">
                            ${feed.category_code ? `<span class="badge">${feed.category_code}</span>` : ''}
                            <span class="post-date">${new Date(feed.created_at || Date.now()).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
            `;

            // 카드 클릭 시 상세 모달 열기 이벤트 연결
            div.addEventListener('click', () => openDetailModal(feed));
            return div;
        }

        //!--- 버튼 클릭 시 모달 on, off ---
        const btn_open_write = document.getElementById('btn-open-write')  //게시글 작성 버튼
        btn_open_write.addEventListener('click', () => {
            console.log("누름")
            // 작성 모달을 감싸는 영역(모달)만 표시하고 나머지는 숨김
            write_div_modal.classList.add('show');
                        document.getElementById('write-section').classList.remove('hidden'); // 게시글 작성 모달 띄워
            document.getElementById('view-section').classList.add('hidden'); //상세 모달 숨겨
            document.getElementById('edit-section').classList.add('hidden'); //수정 모달 숨겨
            
            // 초기화
            document.getElementById('input_title').value = '';  // 제목
            document.getElementById('input_content').value = '';  // 내용
            document.getElementById('input-file').value = '';  // 이미지
            const preview_img = document.getElementById('preview-img');
            if (preview_img) preview_img.innerHTML = '';
        }); 
        // 저장 버튼 클릭
        const btn_write_save = document.getElementById('btn-write-save')
            console.log("저장 버튼 클릭됨!")
            btn_write_save.addEventListener('click', async () => {
            const title = document.getElementById('input_title').value;
            const content = document.getElementById('input_content').value;
            const fileInput = document.getElementById('input-file');
            const file = fileInput.files[0];
            if(!title || !content) return alert("제목과 내용을 입력하세요.");  //제목 또는 내용이 없으면 안내 메시지


            const { data: { user }, error } = await supabase.auth.getUser();
            console.log("user:", user);
            console.log("error:", error);

            // 2. 유저가 없으면(로그인 안 됨) 중단
            if (error || !user) {
                alert("로그인이 필요합니다!");
                return;
            }


            // const login_user_id = user.id; // auth.js에 있는데 supabase.js의 도움을 받아 UUID 데려옴
            



            try {
                //* POST [/user_input] 서버로 게시글 입력 받은 데이터 전송 (POST)
                const res = await fetch('/user_input', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        title: title,
                        content: content,
                        user_id: login_user_id,
                        image_url: publicUrl, //아까 만든 url 넣음
                        category_code: document.getElementById('category-filter')?.value || null
                    })
                });

                if(!res.ok) throw new Error("저장 실패"); //응답 상태가 200이 아니면 저장실패
                const newFeed = await res.json(); // 저장 했으면 newFeed에 넣어라

                // 3. 화면 즉시 갱신 (서버 재요청 없이 리스트 맨 앞에 추가)
                all_feed.unshift(newFeed);
                renderFeedList(); // 전체 다시 그려 정렬 유지
                
                closeModal();

            } catch (err) {
                console.error(err);
                alert("오류 발생: " + err.message);
            }
        });


        //* -- [상세보기] 게시글 상세 모달 열기 ---
        function openDetailModal(feed) {
            console.log("feed.user_id:", feed.user_id);
            console.log("login_user_id:", login_user_id);
            selected_feed = feed;
            write_div_modal.classList.add('show'); //작성 모달을 감싸는 영역(모달)
            
            // 상세보기 영역 표시
            const viewSec = document.getElementById('view-section');
            viewSec.classList.remove('hidden');

            document.getElementById('write-section').classList.add('hidden'); // 게시글 작성 모달
            document.getElementById('edit-section').classList.add('hidden'); //수정 모달
            document.getElementById('view_title').innerText = feed.title; //상세 모달
            document.getElementById('view_content').innerText = feed.content; //상세 모달 안 내용
            
            // 사진 띄워주는
            const imgArea = document.getElementById('view_img_area');
            imgArea.innerHTML = feed.image_url ? `<img src="${feed.image_url}" style="width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:12px;">` : '';


            // 작성자 본인 확인 (로그인된 ID와 게시글 작성자 ID 비교) - 수정 버튼
            const btnEdit = document.getElementById('btn-to-edit');
            
            // user_id 비교 (문자열 변환하여 비교)
            if (String(feed.user_id) === String(login_user_id)) {
                btnEdit.classList.remove('hidden');
            } else {
                btnEdit.classList.add('hidden');
            }
        }

        // --- [수정] 게시글 수정 모드 진입 및 저장 (PATCH) ---
        document.getElementById('btn-to-edit').addEventListener('click', () => {
            document.getElementById('view-section').classList.add('hidden');
            document.getElementById('edit-section').classList.remove('hidden');

            // 초기값 세팅
            document.getElementById('edit_title').value = selected_feed.title;
            document.getElementById('edit_content').value = selected_feed.content;
            document.getElementById('edit_file').value = '';
        });

        // 수정 취소 (상세보기로 복귀)
        document.getElementById('btn-edit-cancel').addEventListener('click', () => {
            document.getElementById('edit-section').classList.add('hidden');
            document.getElementById('view-section').classList.remove('hidden');
        });

        // 수정 완료 저장
        document.getElementById('btn-edit-save').addEventListener('click', async () => {
            const newTitle = document.getElementById('edit_title').value;
            const newContent = document.getElementById('edit_content').value;
            const newFile = document.getElementById('edit_file').files[0];

            try {
                let edit_img_url = selected_feed.image_url;

                // 1. 파일이 변경되었다면: 기존 이미지 삭제 후 새 이미지 업로드
                if (newFile) {
                    // 기존 이미지가 있다면 삭제 시도 (선택 사항, 에러 무시)
                    if (selected_feed.image_url) {
                        try {
                            const oldPath = selected_feed.image_url.split('/public/images/')[1]; // URL 구조에 따라 파싱 필요
                            if(oldPath) {
                                // URL 디코딩 필요할 수 있음
                                const decodedPath = decodeURIComponent(oldPath);
                                await supabase.storage.from('images').remove([decodedPath]);
                            }
                        } catch(e) { console.log("기존 이미지 삭제 실패/무시", e); }
                    }
                    
                    // 새 파일 업로드
                    const fileName = `feed/${Date.now()}_updated_${newFile.name}`;
                    const { error } = await supabase.storage.from('images').upload(fileName, newFile);
                    if (error) throw error;
                    const { data: urlData } = supabase.storage.from('images').getPublicUrl(fileName);
                    edit_img_url = urlData.publicUrl;
                }

                // 2. 서버에 수정 요청 (PATCH)
                const res = await fetch(`/feed/${selected_feed.id}`, {
                    method: 'PATCH',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        title: newTitle,
                        content: newContent,
                        image_url: edit_img_url,
                    })
                });
                if(!res.ok) throw new Error("수정 실패");

                const updatedFeed = await res.json();

                // 3. 클라이언트 데이터 및 UI 즉시 갱신
                selected_feed = updatedFeed; // 현재 선택된 피드 갱신
                
                // 리스트 갱신을 위해 데이터 업데이트 후 다시 렌더링
                const idx = all_feed.findIndex(f => f.id === updatedFeed.id);
                if (idx !== -1) all_feed[idx] = updatedFeed;
                renderFeedList();
                
                // 모달 상세 뷰 갱신 후 복귀
                openDetailModal(updatedFeed);

            } catch (err) {
                console.error(err);
                alert("수정 중 오류 발생");
            }
        });

        // --- [공통] 모달 닫기 ---
        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', closeModal);
        });

        function closeModal() {  //모달 닫기
            write_div_modal.classList.remove('show');
        }

        // 모달 외부 클릭 시 닫기
        window.addEventListener('click', (e) => {
            if (e.target === write_div_modal) {
                closeModal();
            }
        });


        
        // --- 삭제 ---
        window.deleteFeed = async function(feedId) {
            if (!confirm("삭제하시겠습니까?")) return;
            try {
                const res = await fetch(`/feed/${feedId}?user_id=${login_user_id}`, { method: 'DELETE' });
                if (res.ok) {
                    all_feed = all_feed.filter(f => f.id !== feedId);
                    renderFeedList();
                    alert("삭제되었습니다.");
                } else {
                    const data = await res.json();
                    alert("삭제 실패: " + (data.detail || "권한이 없습니다."));
                }
            } catch (err) {
                console.error(err);
                alert("삭제 중 오류가 발생했습니다.");
            }
        }

