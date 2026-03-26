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
        let currentPlaceName = null; // 현재 선택된 플레이스 (없으면 null = 전체보기)

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

            // [수정] localStorage에서 place_name 읽기
            const storedPlaceName = localStorage.getItem('place_name');

            if (storedPlaceName) {
                currentPlaceName = storedPlaceName;
                updateHeaderUI(true); // 플레이스 모드 UI
            } else {
                updateHeaderUI(false); // 전체 모드 UI
            }


            await fetchAllFeeds();
            fetchPopularPlaces(); // 인기 장소 불러오기
            console.log(all_feed);
        });

        // 헤더 UI 업데이트 함수
        function updateHeaderUI(isPlaceMode) {
            const titleEl = document.getElementById('header-title');
            if (isPlaceMode) {
                titleEl.innerText = currentPlaceName;
            } else {
                titleEl.innerText = '전체 커뮤니티';
            }
        }

        //* GET [/api/feed]
        // 서버에서 전체 게시글(피드) 싹 다 불러오기
        async function fetchAllFeeds() {
            try {
                // [수정] 엔드포인트를 /api/feed로 변경 (RESTful 규격)
                const res = await fetch(`/api/feed?user_id=${login_user_id || ''}`);
                
                if (!res.ok) {
                    throw new Error(`서버 응답 오류 (URL: /api/feed, 상태 코드: ${res.status})`);
                }

                const data = await res.json();

                // 데이터가 배열인지 확인하여 렌더링 오류 방지
                if (!Array.isArray(data)) {
                    console.error("수신된 데이터가 배열 형식이 아닙니다:", data);
                    all_feed = [];
                } else {
                    all_feed = data;
                }

                renderFeedList();
            } catch (err) {
                console.error(err);
                feed_div.innerHTML = `<p style="text-align:center; padding: 2rem; color: #ef4444;">피드를 불러오는데 실패했습니다.<br><small>${err.message}</small></p>`;
            }
        }

        // 불러온 데이터로 화면 그리기(피드)
        function renderFeedList() {
            feed_div.innerHTML = '';
            // [추가] 필터링 로직
            let filteredFeeds = all_feed;
            
            if (currentPlaceName) {
                console.log('currentPlaceName:', currentPlaceName);
                console.log(all_feed.map(f => f.place_name));

                // 플레이스 모드: 해당 장소 피드만 필터링
                filteredFeeds = all_feed.filter(feed => feed.place_name === currentPlaceName);
            } 
            // 전체 모드일 때 특별히 제외할 조건이 없다면 전체 표시 (또는 place_name 없는 것만 표시하려면 조건 추가)

            if (filteredFeeds.length === 0) {
                feed_div.innerHTML = '<p style="text-align:center; padding: 2rem; color: #64748b;">게시글이 없습니다.</p>';
                return;
            }


            const sortedFeeds = [...filteredFeeds].sort((a, b) => b.id - a.id);
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


            // 좋아요 버튼 (채워진 하트 vs 빈 하트)
            const heartIcon = feed.is_liked ? '❤️' : '🤍';
            const likeColor = feed.is_liked ? '#ef4444' : '#64748b';
            
            // 좋아요 수 & 댓글 수
            const likeCount = feed.like_count || 0;
            const commentCount = feed.comment_count || 0;

            // 버튼 HTML
            const likeBtnHtml = `
                <button onclick="event.stopPropagation(); toggleLike(${feed.id}, ${feed.is_liked})" style="background:none; border:none; cursor:pointer; font-size:1.1rem; color:${likeColor}; display:flex; align-items:center; gap:4px;">
                    <span>${heartIcon}</span> <span>${likeCount}</span>
                </button>
            `;

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
                            
                            <!-- 좋아요 & 댓글 수 표시 -->
                            <div style="display:flex; gap:12px; margin-left:8px; align-items:center;">
                                ${likeBtnHtml}
                                <span style="font-size:0.9rem; color:#64748b;">💬 ${commentCount}</span>
                            </div>
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
        btn_write_save.addEventListener('click', async () => {
            console.log("저장 버튼 클릭됨!")
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
                //* POST [/api/feed] 서버로 게시글 입력 받은 데이터 전송 (POST)
                const res = await fetch('/api/feed', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        title: title,
                        content: content,
                        user_id: login_user_id,
                        image_url: publicUrl, //아까 만든 url 넣음
                        category_code: document.getElementById('category-filter')?.value || null,
                        place_name: currentPlaceName // [추가] 현재 플레이스 이름 저장 (없으면 null)
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

            // 댓글 불러오기 호출
            fetchComments(feed.id);
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
                    if (selected_feed.image_url && selected_feed.image_url.includes('/public/images/')) {
                        try {
                            // URL에서 파일명만 추출 (URL 디코딩 포함)
                            const parts = selected_feed.image_url.split('/public/images/');
                            const oldPath = parts[parts.length - 1];
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
                const res = await fetch(`/api/feed/${selected_feed.id}`, {
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
                
                // 모달 (상세보기) 갱신
                openDetailModal(updatedFeed);
                // 수정 모달 닫기
                document.getElementById('edit-section').classList.add('hidden');

            } catch (err) {
                console.error(err);
                alert("수정 중 오류 발생");
            }
        });


        // ==========================================
        // [댓글 System] Logic
        // ==========================================
        
        // 1. 댓글 불러오기
        async function fetchComments(feedId) {
            const commentListDiv = document.getElementById('comment-list');
            commentListDiv.innerHTML = '<p style="color:#94a3b8; font-size:0.875rem;">댓글을 불러오는 중...</p>';

            try {
                const res = await fetch(`/api/comments/${feedId}`);
                if (!res.ok) throw new Error("댓글 조회 실패");
                const comments = await res.json();
                renderComments(comments);
            } catch (err) {
                console.error(err);
                commentListDiv.innerHTML = '<p>댓글을 불러오지 못했습니다.</p>';
            }
        }

        // 2. 댓글 렌더링
        function renderComments(comments) {
            const commentListDiv = document.getElementById('comment-list');
            commentListDiv.innerHTML = '';

            if (comments.length === 0) {
                commentListDiv.innerHTML = '<p style="color:#94a3b8; font-size:0.875rem;">아직 댓글이 없습니다.</p>';
                return;
            }

            comments.forEach(cmt => {
                const item = document.createElement('div');
                item.style.cssText = "padding-bottom: 0.75rem; border-bottom: 1px solid #f1f5f9;";
                
                // 작성일 포맷
                const dateStr = new Date(cmt.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                // 본인 댓글 확인
                const isMyComment = String(cmt.user_id) === String(login_user_id);
                const deleteBtn = isMyComment 
                    ? `<button onclick="deleteComment(${cmt.id}, ${cmt.feed_id})" style="color: #ef4444; font-size: 0.75rem; background:none; border:none; cursor:pointer; margin-left: auto;">삭제</button>` 
                    : '';

                item.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
                        <!-- 임시 아이콘 -->
                        <div style="width: 24px; height: 24px; background: #e2e8f0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.75rem;">👤</div>
                        <span style="font-weight: 600; font-size: 0.875rem;">${cmt.nickname}</span>
                        <span style="color: #94a3b8; font-size: 0.75rem;">${dateStr}</span>
                        ${deleteBtn}
                    </div>
                    <p style="font-size: 0.9rem; color: #334155; white-space: pre-wrap; padding-left: 2rem;">${cmt.content}</p>
                `;
                commentListDiv.appendChild(item);
            });
        }

        // 3. 댓글 저장
        document.getElementById('btn-save-comment').addEventListener('click', async () => {
            const contentArea = document.getElementById('comment_input');
            const content = contentArea.value.trim();

            if (!content) return alert("댓글 내용을 입력해주세요.");
            if (!login_user_id) return alert("로그인이 필요합니다.");

            if (!selected_feed) return;

            try {
                const res = await fetch('/api/comments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        feed_id: selected_feed.id,
                        user_id: login_user_id,
                        content: content
                    })
                });

                if (!res.ok) throw new Error("댓글 저장 실패");
                
                // 성공 시 입력창 비우고 목록 다시 불러오기
                contentArea.value = '';
                fetchComments(selected_feed.id);

            } catch (err) {
                console.error(err);
                alert("오류: " + err.message);
            }
        });

        // 4. 댓글 삭제 (window 객체에 할당하여 HTML onclick에서 접근 가능하게 함)
        window.deleteComment = async function(commentId, feedId) {
            if (!confirm("댓글을 삭제하시겠습니까?")) return;

            try {
                // user_id는 쿼리 파라미터로 전달 (보안상 좋진 않지만 현재 구조 유지)
                const res = await fetch(`/api/comments/${commentId}?user_id=${login_user_id}`, {
                    method: 'DELETE'
                });
                if (res.ok) {
                    fetchComments(feedId);
                } else {
                    alert("삭제 실패");
                }
            } catch (err) {
                console.error(err);
                alert("오류 발생");
            }
        }

        // [추가] 인기 장소 불러오기 (Right Sidebar)
        async function fetchPopularPlaces() {
            const widget = document.querySelector('.right-sidebar .widget');
            if (!widget) return;

            // 기존 하드코딩된 목록 제거 (제목 제외)
            const existingItems = widget.querySelectorAll('.popular-place');
            existingItems.forEach(el => el.remove());

            try {
                const res = await fetch('/api/popular-places');
                if (!res.ok) throw new Error('인기 장소 조회 실패');
                
                const places = await res.json();

                // 데이터가 없을 경우 처리
                if (places.length === 0) {
                    const emptyDiv = document.createElement('div');
                    emptyDiv.className = 'popular-place';
                    emptyDiv.style.justifyContent = 'center';
                    emptyDiv.innerHTML = '<p style="font-size: 0.875rem; color: var(--text-muted);">인기 장소가 없습니다.</p>';
                    widget.appendChild(emptyDiv);
                    return;
                }

                // 데이터 렌더링
                places.forEach(place => {
                    const div = document.createElement('div');
                    div.className = 'popular-place';
                    div.innerHTML = `
                        <div class="rank">${place.rank}</div>
                        <div style="flex: 1;">
                            <h4 style="font-size: 0.875rem;">${place.place_name}</h4>
                            <p style="font-size: 0.75rem; color: var(--text-muted);">좋아요 ${place.like_count}개</p>
                        </div>
                    `;
                    widget.appendChild(div);
                });
            } catch (err) {
                console.error(err);
            }
        }

        // 5. 좋아요 토글
        window.toggleLike = async function(feedId, isLiked) {
            if (!login_user_id) {
                alert("로그인이 필요합니다.");
                return;
            }

            try {
                let res;
                if (isLiked) {
                    // 좋아요 취소 (DELETE)
                    res = await fetch(`/api/likes/${feedId}?user_id=${login_user_id}`, { method: 'DELETE' });
                } else {
                    // 좋아요 추가 (POST)
                    res = await fetch('/api/likes', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ feed_id: feedId, user_id: login_user_id })
                    });
                }

                if (res.ok) {
                    // 성공 시 목록만 다시 불러와서 UI 갱신 (서버 데이터 기준)
                    fetchAllFeeds();
                } else {
                    alert("처리에 실패했습니다.");
                }
            } catch (err) {
                console.error(err);
            }
        }

        // 6. 모달 닫기 로직 수정 (숨김 처리 강화)
        function closeModal() {
            write_div_modal.classList.remove('show'); // 오버레이 숨김
            document.getElementById('write-section').classList.add('hidden');
            document.getElementById('view-section').classList.add('hidden');
            document.getElementById('edit-section').classList.add('hidden');
        }

        // 닫기 버튼 클릭 시 모달 닫기
        const btn_close_modal = document.querySelectorAll('.btn-close-modal');
        btn_close_modal.forEach(btn => {
            btn.onclick = closeModal;
        });

        // 모달 밖 클릭 시 닫기
        document.addEventListener('click', function(e) {
            const viewSection = document.getElementById('view-section');
            const writeSection = document.getElementById('write-section');
            if (e.target === viewSection) closeModal();
            if (e.target === writeSection) closeModal();
        }); 


                // 기존 닫기 버튼 이벤트 리스너가 closeModal 함수를 호출하도록 보장
        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.onclick = closeModal;
        });



        window.deleteFeed = async function(feedId) {
            if (!confirm("삭제하시겠습니까?")) return;
            try {
                const res = await fetch(`/api/feed/${feedId}?user_id=${login_user_id}`, { method: 'DELETE' });
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