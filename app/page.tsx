'use client';

import React, { useState, useEffect } from 'react';

import { supabase } from '../lib/supabaseClient';

/* Supabase 배너 이미지 URL (Storage에서 복사한 URL) */
const BANNER_URL =
  'https://yuawxjypxfkwfcmalhbg.supabase.co/storage/v1/object/public/assets/16s%20floor%20layout.jpg';

/* GS 로고 이미지 URL (Supabase / public 등에서 복사해온 것) */
const LOGO_URL =
  'https://yuawxjypxfkwfcmalhbg.supabase.co/storage/v1/object/public/assets/GS.png'; 

/* 타입 정의 (DB 스키마에 맞게 필요시 조정) */
type Room = {
  id: number;
  name: string;
  capacity: number;
  is_active: boolean;
  display_order: number;
};

type Reservation = {
  id: number;
  room_id: number;
  title: string;
  reserver_name: string;
  reserver_team: string;
  start_time: string; // ISO 문자열
  end_time: string;   // ISO 문자열
  created_by?: string;
};

/* 월요일 계산 */
const getMonday = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

/* 한국 요일 */
const getKoreanDayName = (d: Date) => {
  return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
};

type ModalMode = 'create' | 'view' | 'edit';

export default function Home() {

  const [currentUserName, setCurrentUserName] = useState('');

// 🔹 앱 로드 시 localStorage에서 기존 이름 불러오기
  useEffect(() => {
    if (typeof window === 'undefined') return; // SSR 안전장치
    const saved = localStorage.getItem('roombook_username');
    if (saved) {
      setCurrentUserName(saved);
    }
  }, []);

  // 🔹 이름이 바뀔 때마다 localStorage에 저장
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentUserName) {
      localStorage.setItem('roombook_username', currentUserName);
    } else {
      // 이름을 지우면 localStorage에서도 제거 (선택 사항)
      localStorage.removeItem('roombook_username');
    }
  }, [currentUserName]);

  const currentYear = new Date().getFullYear();

  /* 선택된 날짜 (캘린더 기준) */
  const [selectedDate, setSelectedDate] = useState(new Date());

  /* 이번 주 월요일 계산 */
  const monday = getMonday(selectedDate);

  /* 주간 이동 */
  const goPrevWeek = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 7);
    setSelectedDate(d);
  };

  const goNextWeek = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 7);
    setSelectedDate(d);
  };

  /* 상단 날짜 표시 */
  const formattedDate = `${selectedDate.getFullYear()}년 ${
    selectedDate.getMonth() + 1
  }월 ${selectedDate.getDate()}일 (${getKoreanDayName(selectedDate)})`;

// 🔹 중복 예약 체크 함수 (같은 회의실 + 시간이 겹치면 true)
const hasTimeConflict = (
  roomId: number,
  startISO: string,
  endISO: string,
  excludeReservationId?: number,
) => {
  const newStart = new Date(startISO).getTime();
  const newEnd = new Date(endISO).getTime();

  return reservations.some((r) => {
    if (r.room_id !== roomId) return false;
    if (excludeReservationId && r.id === excludeReservationId) return false;

    const s = new Date(r.start_time).getTime();
    const e = new Date(r.end_time).getTime();

    // [s, e) 와 [newStart, newEnd) 가 겹치면 true
    return e > newStart && s < newEnd;
  });
};

const inferRepeatOption = (current: Reservation, all: Reservation[]) => {
  const baseStart = new Date(current.start_time);
  const baseTimeKey = `${baseStart.getHours()}:${baseStart.getMinutes()}`;

  const sameSeries = all.filter((r) => {
    if (r.id === current.id) return true; // 현재 포함
    if (r.room_id !== current.room_id) return false;
    if (r.title !== current.title) return false;
    if (r.reserver_name !== current.reserver_name) return false;
    if (r.reserver_team !== current.reserver_team) return false;

    const s = new Date(r.start_time);
    const timeKey = `${s.getHours()}:${s.getMinutes()}`;
    return timeKey === baseTimeKey;
  });

  if (sameSeries.length <= 1) {
    return { option: 'none' as const, endDate: baseStart.toISOString().slice(0, 10) };
  }

  const dates = sameSeries
    .map((r) => {
      const d = new Date(r.start_time);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    })
    .sort((a, b) => a.getTime() - b.getTime());

  const diffs = [];
  for (let i = 1; i < dates.length; i++) {
    diffs.push((dates[i].getTime() - dates[i - 1].getTime()) / 86400000);
  }

  const allDaily = diffs.every((d) => d === 1);
  const allWeekly = diffs.every((d) => d === 7);

  const endDate = dates[dates.length - 1].toISOString().slice(0, 10);

  if (allDaily) return { option: 'daily' as const, endDate };
  if (allWeekly) return { option: 'weekly' as const, endDate };
  return { option: 'none' as const, endDate: baseStart.toISOString().slice(0, 10) };
};



  /* 이번 주 월~금 */
  const weekdays = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  /* 회의실 목록 */
  const [rooms, setRooms] = useState<Room[]>([]);

  useEffect(() => {
    const loadRooms = async () => {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('rooms load error:', error.message);
      }
      if (data) setRooms(data as Room[]);
    };

    loadRooms();
  }, []);

    /* 전체 예약 불러오기 */
const [reservations, setReservations] = useState<Reservation[]>([]);

// ✅ 같은 반복 시리즈(묶음) 찾기: 같은 회의실/제목/예약자/팀/시작시간(시:분)
const getSameSeries = (current: Reservation, all: Reservation[]) => {
  const baseStart = new Date(current.start_time);
  const baseTimeKey = `${baseStart.getHours()}:${baseStart.getMinutes()}`;

  return all.filter((r) => {
    if (r.room_id !== current.room_id) return false;
    if (r.title !== current.title) return false;
    if (r.reserver_name !== current.reserver_name) return false;
    if (r.reserver_team !== current.reserver_team) return false;

    const s = new Date(r.start_time);
    const timeKey = `${s.getHours()}:${s.getMinutes()}`;
    return timeKey === baseTimeKey;
  });
};

// ✅ 특정 예약 id 목록(excludeIds)을 제외하고 시간 겹침(중복) 체크
const hasTimeConflictExcludeIds = (
  all: Reservation[],
  roomId: number,
  startISO: string,
  endISO: string,
  excludeIds: number[],
) => {
  const newStart = new Date(startISO).getTime();
  const newEnd = new Date(endISO).getTime();

  return all.some((r) => {
    if (r.room_id !== roomId) return false;
    if (excludeIds.includes(r.id)) return false;

    const s = new Date(r.start_time).getTime();
    const e = new Date(r.end_time).getTime();
    return e > newStart && s < newEnd;
  });
};


const loadReservations = async () => {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .order('start_time', { ascending: true }); // 전체를 시간순으로

  if (error) {
    console.error('reservations load error:', error.message);
  }
  if (data) setReservations(data as Reservation[]);
};

useEffect(() => {
  loadReservations();
}, []);


  /* 🔍 검색 상태 – 반드시 filteredReservations보다 위에 있어야 함 */
  const [searchQuery, setSearchQuery] = useState('');

  /* 검색 결과 전체 보기 여부 (false면 상위 10개만) */
  const [showAllSearchResults, setShowAllSearchResults] = useState(false);

  /* 시간 슬롯 (30분 간격) */
  const timeSlots: string[] = [];
  for (let hour = 8; hour <= 18; hour++) {
    timeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    if (hour !== 18) timeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }

  const slotToMinute = (slot: string) => {
    const [h, m] = slot.split(':').map(Number);
    return h * 60 + m;
  };


  
  const now = new Date();
  const currentHour = now.getHours();
  const currentMin = now.getMinutes();
  const currentTotalMin = currentHour * 60 + currentMin;

  /* 🔴 오늘일 때만 현재시간 라인 보이게 */
  const isTodaySelected =
    selectedDate.toDateString() === new Date().toDateString();

  /* 🔍 검색어 적용된 예약 목록 */
  const filteredReservations = reservations.filter((r) => {
    if (!searchQuery.trim()) return true; // 검색어 없으면 전부 표시

    const q = searchQuery.toLowerCase();
    const title = (r.title || '').toLowerCase();
    const name = (r.reserver_name || '').toLowerCase();
    const team = (r.reserver_team || '').toLowerCase();

    return (
      title.includes(q) ||
      name.includes(q) ||
      team.includes(q)
    );
  });

useEffect(() => {
  if (!searchQuery.trim()) {
    setShowAllSearchResults(false);
  }
}, [searchQuery]);



  /* ------------------------- 모달 상태 ------------------------- */
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalRoom, setModalRoom] = useState<Room | null>(null);
  const [modalStart, setModalStart] = useState('');
  const [modalEnd, setModalEnd] = useState('');
  const [modalTitle, setModalTitle] = useState('');
  const [modalName, setModalName] = useState('');
  const [modalTeam, setModalTeam] = useState('');
  const [repeatOption, setRepeatOption] =
    useState<'none' | 'daily' | 'weekly'>('none');

  const [modalStartDate, setModalStartDate] = useState('');
  const [modalEndDate, setModalEndDate] = useState('');

  const [selectedReservation, setSelectedReservation] =
    useState<Reservation | null>(null);

  const [modalMode, setModalMode] = useState<ModalMode>('create');

  const resetModalFields = () => {
    setSelectedReservation(null);
    setModalTitle('');
    setModalName('');
    setModalTeam('');
    setModalStart('');
    setModalEnd('');
    setRepeatOption('none');
    setModalStartDate('');
    setModalEndDate('');
    setModalMode('create');
  };

/* 🔹 시간 포맷 헬퍼 */
  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes(),
    ).padStart(2, '0')}`;

// 🔹 주어진 날짜(YYYY-MM-DD)와 시간(HH:MM)이 "지금보다 과거인지" 판단
const isPastDateTime = (dateStr: string, timeStr: string) => {
  if (!dateStr || !timeStr) return false;

  const [h, m] = timeStr.split(':').map(Number);
  const dt = new Date(dateStr);
  dt.setHours(h, m, 0, 0);

  const now = new Date();
  const graceMs = 30 * 60 * 1000; // 30분 유예

  // 시작시각 + 30분 < 지금  → 너무 지난 회의로 보고 예약 불가
  return dt.getTime() + graceMs < now.getTime();
};


// 🔹 검색용 정렬: 오늘 → 미래 → 과거
const sortReservationsForSearch = (items: Reservation[]) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayList: Reservation[] = [];
  const futureList: Reservation[] = [];
  const pastList: Reservation[] = [];

  items.forEach((r) => {
    const d = new Date(r.start_time);
    const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

    if (dayOnly.getTime() === today.getTime()) {
      todayList.push(r);
    } else if (dayOnly > today) {
      futureList.push(r);
    } else {
      pastList.push(r);
    }
  });

  const asc = (a: Reservation, b: Reservation) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
  const desc = (a: Reservation, b: Reservation) =>
    new Date(b.start_time).getTime() - new Date(a.start_time).getTime();

  todayList.sort(asc);   // 오늘: 시간 빠른 순
  futureList.sort(asc);  // 미래: 시간 빠른 순
  pastList.sort(desc);   // 과거: 최근 → 오래된 순

  return [...todayList, ...futureList, ...pastList];
};



  /* 🔹 검색 결과 클릭 시: 해당 날짜로 이동 + 상세 모달 열기 */
  const handleSearchItemClick = (res: Reservation) => {
    const st = new Date(res.start_time);
    const et = new Date(res.end_time);

    // 1) 캘린더를 해당 날짜로 이동
    setSelectedDate(st);

    // 2) 예약된 회의실 찾기
    const room = rooms.find((r) => r.id === res.room_id) || null;
    setModalRoom(room);

    // 3) 모달에 값 채워넣기
    setSelectedReservation(res);
    setModalTitle(res.title);
    setModalName(res.reserver_name);
    setModalTeam(res.reserver_team);
    setModalStart(formatTime(st));
    setModalEnd(formatTime(et));
    setModalStartDate(st.toISOString().slice(0, 10));
    setModalEndDate(et.toISOString().slice(0, 10));
    setRepeatOption('none'); // 검색에서 들어온 건 단일 예약으로 취급

    // 4) 상세 보기 모드로 모달 열기
    setModalMode('view');
    setIsModalOpen(true);
  };

// 🔹 반복 여부 텍스트 만들기
const getRepeatDisplay = (
  current: Reservation | null,
  all: Reservation[],
): string => {
  if (!current) return '없음';

  const baseStart = new Date(current.start_time);
  const baseTimeKey = `${baseStart.getHours()}:${baseStart.getMinutes()}`;

  // 같은 시리즈로 볼 예약들: 같은 회의실 + 제목 + 예약자/팀 + 시작시간(시:분)
  const sameSeries = all.filter((r) => {
    if (r.id === current.id) return false;
    if (r.room_id !== current.room_id) return false;
    if (r.title !== current.title) return false;
    if (r.reserver_name !== current.reserver_name) return false;
    if (r.reserver_team !== current.reserver_team) return false;

    const s = new Date(r.start_time);
    const timeKey = `${s.getHours()}:${s.getMinutes()}`;
    return timeKey === baseTimeKey;
  });

  const totalCount = sameSeries.length + 1;
  if (sameSeries.length === 0) return '없음';

  // 날짜만 뽑아서 정렬
  const dates = [...sameSeries, current]
    .map((r) => {
      const d = new Date(r.start_time);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    })
    .sort((a, b) => a.getTime() - b.getTime());

  // 연속된 날짜 차이(일 단위)
  const diffs: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const diffDays =
      (dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24);
    diffs.push(diffDays);
  }

  const allDaily = diffs.every((d) => d === 1);
  const allWeekly = diffs.every((d) => d === 7);

  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const rangeText = `${startDate.getMonth() + 1}월 ${startDate.getDate()}일 ~ ${
    endDate.getMonth() + 1
  }월 ${endDate.getDate()}일`;

  if (allDaily) return `매일 · ${rangeText} · 총 ${totalCount}회`;
  if (allWeekly) return `매주 · ${rangeText} · 총 ${totalCount}회`;
  return `여러 날짜 · ${rangeText} · 총 ${totalCount}회`;
};


  /* ------------------------- 렌더링 ------------------------- */
  return (
    <main
      style={{
        padding: '20px',
        fontFamily: 'sans-serif',
        maxWidth: '1100px',
        margin: '0 auto',
      }}
    >
      
      {/* 🔹 최상단 헤더 (로고 + 제목 + 검색창) */}
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      marginBottom: '16px',
    }}
  >
    {/* 로고 + 제목 */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        whiteSpace: 'nowrap',
      }}
    >
      <img
        src={LOGO_URL}
        alt="GS 로고"
        style={{ width: '32px', height: '32px', borderRadius: '9999px' }}
      />
      <span style={{ fontSize: '20px', fontWeight: 700 }}>
        16층 남측 회의실 예약
      </span>
    </div>

    {/* 검색창 + 검색 결과 드롭다운 */}
<div style={{ flex: 1 }}>
  <div
    style={{
      position: 'relative',
      maxWidth: '700px',
      marginLeft: 'auto',
    }}
  >
    {/* 🔍 아이콘 있는 검색창 */}
    <span
      style={{
        position: 'absolute',
        left: '12px',
        top: '50%',
        transform: 'translateY(-50%)',
        fontSize: '16px',
        color: '#9ca3af',
      }}
    >
      🔍
    </span>
    <input
      type="text"
      placeholder="회의 검색 (제목 / 예약자 / 소속팀)..."
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      style={{
        width: '100%',
        padding: '10px 16px 10px 36px',
        borderRadius: '9999px',
        border: '1px solid #d1d5db',
        fontSize: '14px',
        outline: 'none',
      }}
    />

    {/* 🔽 검색 결과 리스트 (검색어 있을 때만 노출) */}
    {searchQuery.trim() && (
  <div
    style={{
      position: 'absolute',
      top: '44px',
      left: 0,
      right: 0,
      maxHeight: '320px',
      overflowY: 'auto',
      background: 'white',
      border: '1px solid #e5e7eb',
      boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
      borderRadius: '12px',
      padding: '4px 0',
      zIndex: 50,
    }}
  >
    {filteredReservations.length === 0 ? (
      <div
        style={{
          padding: '10px 14px',
          fontSize: '13px',
          color: '#6b7280',
        }}
      >
        검색 결과가 없습니다.
      </div>
    ) : (
      <>
        {(() => {
          // 🔹 상위 10개 또는 전체
          // 🔹 먼저 오늘/미래/과거 순으로 정렬
          const ordered = sortReservationsForSearch(filteredReservations);

          // 🔹 그 다음 상위 10개만 또는 전체
          const list = showAllSearchResults
            ? ordered
            : ordered.slice(0, 10);

          return list.map((res) => {
            const st = new Date(res.start_time);
            const et = new Date(res.end_time);
            const room = rooms.find((r) => r.id === res.room_id);
            const dateLabel = `${st.getMonth() + 1}월 ${st.getDate()}일 (${getKoreanDayName(
              st,
            )})`;
            const timeLabel = `${formatTime(st)} ~ ${formatTime(et)}`;

            // 오늘/향후/지난 배지 계산 (이미 쓰고 있는 로직이면 그대로 재사용)
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const resDate = new Date(st);
            resDate.setHours(0, 0, 0, 0);

            let badgeText = '';
            let badgeBg = '';
            let badgeColor = '';

            if (resDate.getTime() === today.getTime()) {
              badgeText = '오늘';
              badgeBg = '#dcfce7';
              badgeColor = '#15803d';
            } else if (resDate > today) {
              badgeText = '향후';
              badgeBg = '#dbeafe';
              badgeColor = '#1d4ed8';
            } else {
              badgeText = '지난';
              badgeBg = '#e5e7eb';
              badgeColor = '#4b5563';
            }

            return (
              <button
                key={res.id}
                onClick={() => {
                  handleSearchItemClick(res);
                  // 클릭 후 검색어 유지/초기화는 취향대로
                  // setSearchQuery('');
                }}
                style={{
                  width: '100%',
                  padding: '8px 14px',
                  textAlign: 'left',
                  border: 'none',
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                {/* 위쪽: 배지 + 제목 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '2px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '9999px',
                      backgroundColor: badgeBg,
                      color: badgeColor,
                      fontWeight: 600,
                    }}
                  >
                    {badgeText}
                  </span>
                  <span
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#111827',
                    }}
                  >
                    {res.title}
                  </span>
                </div>

                {/* 가운데: 회의실 + 날짜/시간 */}
                <div
                  style={{
                    fontSize: '12px',
                    color: '#4b5563',
                    marginBottom: '2px',
                  }}
                >
                  {room ? room.name : '회의실'} · {dateLabel} · {timeLabel}
                </div>

                {/* 아래: 예약자 / 소속팀 */}
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  예약자: {res.reserver_name || '-'} /{' '}
                  {res.reserver_team || '-'}
                </div>
              </button>
            );
          });
        })()}

        {/* 🔹 더보기 / 간단히 버튼 */}
        {filteredReservations.length > 10 && (
          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              marginTop: '4px',
              paddingTop: '4px',
              textAlign: 'center',
            }}
          >
            <button
              onClick={() =>
                setShowAllSearchResults((prev) => !prev)
              }
              style={{
                border: 'none',
                background: 'transparent',
                color: '#2563eb',
                fontSize: '12px',
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              {showAllSearchResults
                ? '간단히 보기'
                : `더보기 (${filteredReservations.length - 10}개)`}
            </button>
          </div>
        )}
      </>
    )}
  </div>
  
)}

  </div>
</div>

  </div>



      {/* ---------- 상단 날짜 + 배너 + 주간 이동 UI ---------- */}
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <input
          type="date"
          value={selectedDate.toISOString().slice(0, 10)}
          onChange={(e) => setSelectedDate(new Date(e.target.value))}
          style={{
            fontSize: '22px',
            fontWeight: 'bold',
            border: 'none',
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: '6px',
          }}
        />

        <div
          style={{
            fontSize: '20px',
            fontWeight: '600',
            marginBottom: '10px',
          }}
        >
          {formattedDate}
        </div>

    

        {/* 주간 이동 + 오늘 버튼 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '10px',
          }}
        >
          <button
            onClick={goPrevWeek}
            style={{
              background: '#f4f4f4',
              border: '1px solid #ccc',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            ◀ 지난 주
          </button>

          <button
            onClick={() => setSelectedDate(new Date())}
            style={{
              background: '#e0f2fe',
              border: '1px solid #38bdf8',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            오늘
          </button>

          <button
            onClick={goNextWeek}
            style={{
              background: '#f4f4f4',
              border: '1px solid #ccc',
              padding: '8px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            다음 주 ▶
          </button>
        </div>


        {/* 주간 버튼 (월/일 + 오늘 강조) */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '20px',
          }}
        >
          {weekdays.map((day, idx) => {
            const isSelected = day.toDateString() === selectedDate.toDateString();
            const isToday = day.toDateString() === new Date().toDateString();

            const label = ['월', '화', '수', '목', '금'][idx];
            const month = day.getMonth() + 1;
            const date = day.getDate();

            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(day)}
                style={{
                  padding: '10px 16px',
                  borderRadius: '8px',
                  border: isSelected ? '2px solid #0070f3' : '1px solid #ccc',
                  background: isToday
                    ? '#dbeafe'
                    : isSelected
                    ? '#e6f0ff'
                    : '#f7f7f7',
                  fontWeight: isToday || isSelected ? 700 : 400,
                  cursor: 'pointer',
                  minWidth: '80px',
                  color: isToday ? '#1e40af' : 'black',
                }}
              >
                {label}({month}/{date})
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------- 캘린더 본문 ---------- */}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `100px repeat(${rooms.length}, 1fr)`,
          position: 'relative',
          borderTop: '1px solid #ccc',
        }}
      >
        {/* 상단 빈칸 */}
        <div></div>

        {/* 회의실 헤더 */}
        {rooms.map((room) => (
          <div
            key={room.id}
            style={{
              textAlign: 'center',
              padding: '8px',
              fontWeight: 'bold',
              borderLeft: '1px solid #ddd',
              borderBottom: '1px solid #ddd',
              background: '#f5f5f5',
            }}
          >
            {room.name} ({room.capacity}인)
          </div>
        ))}

        {timeSlots.map((slot) => {
          const slotStart = slotToMinute(slot);
          const slotEnd = slotStart + 30;

          const isFullHour = slot.endsWith(':00');
          const isCurrent =
            isTodaySelected &&
            currentTotalMin >= slotStart &&
            currentTotalMin < slotEnd;

          let offsetPx = 0;
          if (isCurrent) {
            offsetPx = ((currentTotalMin - slotStart) / 30) * 35;
          }

          return (
            <React.Fragment key={slot}>
              {/* 시간 라벨 */}
              <div
                style={{
                  height: '35px',
                  borderBottom: '1px solid #eee',
                  paddingLeft: '6px',
                  fontSize: '12px',
                  position: 'relative',
                  backgroundColor: isFullHour ? '#f3f4f6' : '#ffffff',
                }}
              >
                {slot}

                {isCurrent && (
                  <div
                    style={{
                      position: 'absolute',
                      top: `${offsetPx - 1}px`,
                      left: '-60px',
                      fontSize: '11px',
                      color: 'red',
                      fontWeight: 600,
                    }}
                  >
                    현재 {currentHour}:{String(currentMin).padStart(2, '0')}
                  </div>
                )}
              </div>

                            {/* 회의실 × 슬롯 */}
              {rooms.map((room) => (
                <div
                  key={`${room.id}-${slot}`}
                  onClick={() => {
                    const dateStr = selectedDate.toISOString().slice(0, 10);

                    // ✅ 이미 지난 시간대라면 새 예약 생성 막기
                    if (isPastDateTime(dateStr, slot)) {
                      alert('이미 지난 시간은 예약할 수 없습니다.');
                      return;
                    }

                    // 빈 칸 클릭 → 새 예약 모드
                    resetModalFields();
                    setModalRoom(room);
                    setModalStart(slot);

                    // 🔹 기본 종료시간 = 시작시간 + 30분 (18:00 이후로 넘어가면 18:00에 클램프)
                    const [h, m] = slot.split(':').map(Number);
                    const startMinutes = h * 60 + m;
                    const latestMinutes = 18 * 60; // 18:00
                    let endMinutes = startMinutes + 30;

                    if (endMinutes > latestMinutes) {
                    endMinutes = latestMinutes;
                    }

                    const endH = String(Math.floor(endMinutes / 60)).padStart(2, '0');
                    const endM = String(endMinutes % 60).padStart(2, '0');

                    setModalEnd(`${endH}:${endM}`);
                    setModalStartDate(dateStr);
                    setModalEndDate(dateStr);
                    setModalMode('create');
                    setIsModalOpen(true);
                  }}
                  style={{
                    height: '35px',
                    borderLeft: '1px solid #eee',
                    borderBottom: '1px solid #eee',
                    position: 'relative',
                    background: isFullHour ? '#fafafa' : 'white',
                    cursor: 'pointer',
                    overflow: 'visible',
                  }}
                >
                  {/* 현재 시간 빨간선 (오늘 & 해당 슬롯일 때만) */}
                  {isCurrent && (
                    <div
                      style={{
                        position: 'absolute',
                        top: `${offsetPx}px`,
                        left: 0,
                        right: 0,
                        height: '2px',
                        background: 'red',
                        zIndex: 10,
                      }}
                    ></div>
                  )}

                  {/* 예약 블록 */}
                  {filteredReservations
                    .filter((r) => r.room_id === room.id)
                    .map((r) => {
                      const st = new Date(r.start_time);
                      const et = new Date(r.end_time);

                      if (st.toDateString() !== selectedDate.toDateString())
                        return null;

                      const startMin =
                        st.getHours() * 60 + st.getMinutes();
                      const endMin =
                        et.getHours() * 60 + et.getMinutes();

                      const overlaps =
                        endMin > slotStart && startMin < slotEnd;
                      if (!overlaps) return null;

                      // 이 셀을 이 예약의 대표(앵커)로 쓸지?
                      const isAnchor =
                        startMin >= slotStart && startMin < slotEnd;
                      if (!isAnchor) return null;

                      const topOffset =
                        ((startMin - slotStart) / 30) * 35;
                      const heightPx =
                        ((endMin - startMin) / 30) * 35;

                      const isPast = et < new Date();

                      const bgColor = isPast ? '#d1d5db' : '#4285F4';
                      const borderColor = isPast ? '#9ca3af' : '#1a56db';
                      const textColor = isPast ? '#374151' : '#fff';

                      return (
                        <div
                          key={r.id}
                          onClick={(e) => {
                            // 예약 블록 클릭 → 상세 보기 모드
                            e.stopPropagation();
                            setSelectedReservation(r);
                            setModalRoom(room);
                            setModalTitle(r.title);
                            setModalName(r.reserver_name);
                            setModalTeam(r.reserver_team);
                            setModalStart(
                              `${String(st.getHours()).padStart(
                                2,
                                '0'
                              )}:${String(st.getMinutes()).padStart(2, '0')}`
                            );
                            setModalEnd(
                              `${String(et.getHours()).padStart(
                                2,
                                '0'
                              )}:${String(et.getMinutes()).padStart(2, '0')}`
                            );
                            const dateStr = st.toISOString().slice(0, 10);
                            setModalStartDate(dateStr);
                            setModalEndDate(dateStr);
                            setRepeatOption('none');
                            setModalMode('view');
                            setIsModalOpen(true);
                          }}
                          style={{
                            position: 'absolute',
                            top: `${topOffset}px`,
                            left: '3px',
                            right: '3px',
                            height: `${heightPx}px`,
                            background: bgColor,
                            borderLeft: `4px solid ${borderColor}`,
                            borderRadius: '4px',
                            padding: '4px 6px',
                            color: textColor,
                            fontSize: '11px',
                            overflow: 'hidden',
                            zIndex: 20,
                          }}
                        >
                          <b>{r.title}</b>
                          <div style={{ fontSize: '10px', opacity: 0.85 }}>
                            {r.reserver_name} / {r.reserver_team}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}

            </React.Fragment>
          );
        })}
      </div>

      {/* 🔹 날짜와 주간 이동 버튼 사이에 Supabase 배너 이미지 추가 */}
        <div
          style={{
            marginBottom: '10px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <img
            src={BANNER_URL}
            alt="16층 회의실 레이아웃"
            style={{
              maxWidth: '100%',
              maxHeight: '500px',
              objectFit: 'contain',
              borderRadius: '8px',
            }}
          />
        </div>

{/* 푸터 */}
  <div
    style={{
      marginTop: '24px',
      textAlign: 'center',
      fontSize: '11px',
      color: '#9ca3af',
    }}
  >
    © {currentYear} GS E&C·Oil and Gas Business Team·Joonseo Jang. All rights reserved.
  </div>

      {/* ---------- 모달 ---------- */}
      {isModalOpen && (
        <div
          onClick={() => {
            setIsModalOpen(false);
            resetModalFields();
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              padding: '20px',
              width: '360px',
              borderRadius: '10px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
            }}
          >
            {/* 상세 보기 모드 */}
            {modalMode === 'view' && selectedReservation && modalRoom && (
             
              
              <>
                <h3
                  style={{
                    marginBottom: '16px',
                    fontSize: '18px',
                    fontWeight: 600,
                  }}
                >
                  예약 상세 정보
                </h3>

                {/* 회의 제목 */}
                <div style={{ marginBottom: '10px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '2px',
                    }}
                  >
                    회의 제목
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 500 }}>
                    {selectedReservation.title}
                  </div>
                </div>

                {/* 예약자 */}
                <div style={{ marginBottom: '10px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '2px',
                    }}
                  >
                    예약자
                  </div>
                  <div style={{ fontSize: '14px' }}>
                    {selectedReservation.reserver_name} /{' '}
                    {selectedReservation.reserver_team}
                  </div>
                </div>

                {/* 회의실 */}
                <div style={{ marginBottom: '10px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '2px',
                    }}
                  >
                    회의실
                  </div>
                  <div style={{ fontSize: '14px' }}>
                    {modalRoom.name} ({modalRoom.capacity}인)
                  </div>
                </div>

                {/* 시간 */}
                <div style={{ marginBottom: '16px' }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginBottom: '2px',
                    }}
                  >
                    시간
                  </div>
                  {(() => {
                    const st = new Date(selectedReservation.start_time);
                    const et = new Date(selectedReservation.end_time);

                    const sDate = `${st.getMonth() + 1}월 ${st.getDate()}일`;
                    const eDate = `${et.getMonth() + 1}월 ${et.getDate()}일`;
                    const sTime = `${String(st.getHours()).padStart(
                      2,
                      '0'
                    )}:${String(st.getMinutes()).padStart(2, '0')}`;
                    const eTime = `${String(et.getHours()).padStart(
                      2,
                      '0'
                    )}:${String(et.getMinutes()).padStart(2, '0')}`;

                    return (
                      <>
                        <div style={{ fontSize: '14px' }}>
                          {sDate} ~ {eDate}
                        </div>
                        <div style={{ fontSize: '14px' }}>
                          {sTime} ~ {eTime}
                        </div>
                      </>
                    );
                  })()}
                </div>

{/* 반복 */}
<div style={{ marginBottom: '16px' }}>
  <div
    style={{
      fontSize: '12px',
      color: '#6b7280',
      marginBottom: '2px',
    }}
  >
    반복
  </div>
  <div style={{ fontSize: '14px' }}>
    {getRepeatDisplay(selectedReservation, reservations)}
  </div>
</div>




                {/* 버튼 영역 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    justifyContent: 'space-between',
                  }}
                >
                  <button
                    onClick={() => {
                    // ✅ 현재 예약이 반복인지 추정해서 edit 폼에 세팅
                    const inferred = inferRepeatOption(selectedReservation, reservations); // 아래 함수 추가
                    setRepeatOption(inferred.option);
                    setModalEndDate(inferred.endDate); // YYYY-MM-DD
                    setModalMode('edit');
                    setModalStartDate(selectedReservation.start_time.slice(0, 10));

                  }}

                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#2563eb',
                      color: 'white',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    예약 변경
                  </button>

                  <button
                    onClick={async () => {
                      if (!selectedReservation) return;
                      const ok = window.confirm('이 예약을 취소하시겠습니까?');
                      if (!ok) return;

                      const { error } = await supabase
                        .from('reservations')
                        .delete()
                        .eq('id', selectedReservation.id);

                      if (error) {
                        alert('예약 취소 실패: ' + error.message);
                      } else {
                        alert('예약이 취소되었습니다.');
                        setIsModalOpen(false);
                        resetModalFields();
                        await loadReservations();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#dc2626',
                      color: 'white',
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    예약 취소
                  </button>
                </div>

                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    resetModalFields();
                  }}
                  style={{
                    marginTop: '10px',
                    width: '100%',
                    padding: '8px',
                    borderRadius: '6px',
                    border: '1px solid #e5e7eb',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  닫기
                </button>
              </>
            )}

            {/* 생성/수정 폼 모드 */}
            {modalMode !== 'view' && (
              <>
                <h3
                  style={{
                    marginBottom: '12px',
                    fontSize: '18px',
                    fontWeight: '600',
                  }}
                >
                  {modalMode === 'edit' ? '예약 변경' : '예약 만들기'}
                </h3>

                <div style={{ fontSize: '14px', marginBottom: '12px' }}>
                  <b>회의실:</b> {modalRoom?.name} ({modalRoom?.capacity}인)
                </div>

                {/* 시작 / 종료 날짜 */}
                <label>시작 날짜</label>
                <input
                  type="date"
                  value={modalStartDate}
                  onChange={(e) => setModalStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                />

                <label>종료 날짜</label>
                <input
                  type="date"
                  value={modalEndDate}
                  onChange={(e) => setModalEndDate(e.target.value)}
                  disabled={repeatOption === 'none'}
                  min={modalStartDate || undefined}
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                    backgroundColor:
                      repeatOption === 'none' ? '#f3f4f6' : 'white',
                  }}
                />

                {/* 회의명 */}
                <label>회의명</label>
                <input
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  placeholder="예: NUP 정기회의"
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                />

                {/* 예약자 이름 */}
                <label>예약자 이름</label>
                <input
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder="예: 홍길동"
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                />

                {/* 소속팀 */}
                <label>예약자 소속팀</label>
                <input
                  value={modalTeam}
                  onChange={(e) => setModalTeam(e.target.value)}
                  placeholder="예: O&G사업팀"
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                />

                {/* 반복 */}
                <label>반복</label>
                <select
                  value={repeatOption}
                  onChange={(e) =>
                    setRepeatOption(
                      e.target.value as 'none' | 'daily' | 'weekly'
                    )
                  }
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                >
                  <option value="none">없음</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                </select>

                {/* 시간 선택 (10분 단위) */}
                <label>시작시간</label>
                <select
                  value={modalStart}
                  onChange={(e) => setModalStart(e.target.value)}
                  style={{
                    width: '100%',
                    marginBottom: '10px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                >
                  <option value="">시간 선택</option>
                  {Array.from({ length: 61 }, (_, i) => {
                    const totalMin = 8 * 60 + i * 10;
                    if (totalMin > 18 * 60) return null;
                    const h = String(Math.floor(totalMin / 60)).padStart(
                      2,
                      '0'
                    );
                    const m = String(totalMin % 60).padStart(2, '0');
                    return (
                      <option key={i} value={`${h}:${m}`}>
                        {`${h}:${m}`}
                      </option>
                    );
                  })}
                </select>

                <label>종료시간</label>
                <select
                  value={modalEnd}
                  onChange={(e) => setModalEnd(e.target.value)}
                  style={{
                    width: '100%',
                    marginBottom: '16px',
                    padding: '6px',
                    border: '1px solid #ccc',
                    borderRadius: '6px',
                  }}
                >
                  <option value="">시간 선택</option>
                  {Array.from({ length: 61 }, (_, i) => {
                    const totalMin = 8 * 60 + i * 10;
                    if (totalMin > 18 * 60) return null;
                    const h = String(Math.floor(totalMin / 60)).padStart(
                      2,
                      '0'
                    );
                    const m = String(totalMin % 60).padStart(2, '0');
                    return (
                      <option key={i} value={`${h}:${m}`}>
                        {`${h}:${m}`}
                      </option>
                    );
                  })}
                </select>

                {/* 생성 / 수정 공용 버튼 */}
                <button
                  onClick={async () => {
    // 1️⃣ 공통 검증
    if (!modalRoom) {
      alert('회의실 정보가 없습니다.');
      return;
    }
    if (!modalTitle || !modalStart || !modalEnd) {
      alert('회의명, 시간 등 모든 값을 입력해주세요.');
      return;
    }
    if (!modalStartDate) {
      alert('시작 날짜를 선택해주세요.');
      return;
    }
    if (repeatOption !== 'none' && !modalEndDate) {
      alert('종료 날짜를 선택해주세요.');
      return;
    }

    const [sH, sM] = modalStart.split(':').map(Number);
    const [eH, eM] = modalEnd.split(':').map(Number);
    const startMin = sH * 60 + sM;
    const endMin = eH * 60 + eM;

    if (endMin <= startMin) {
      alert('종료시간은 시작시간보다 늦어야 합니다.');
      return;
    }

    const startDateObj = new Date(modalStartDate);
    const endDateObj =
      repeatOption === 'none'
        ? new Date(modalStartDate)
        : new Date(modalEndDate);

    if (endDateObj < startDateObj) {
      alert('종료 날짜는 시작 날짜 이후여야 합니다.');
      return;
    }

    // 🔴 과거 시간대 방지: 시작 날짜+시간이 지금보다 이전이면 막기
    const now = new Date();
    const startDateTime = new Date(
      `${modalStartDate}T${modalStart}:00+09:00`,
    );

    if (startDateTime.getTime() < now.getTime()) {
      alert('이미 지난 시간대에는 예약할 수 없습니다.');
      return;
    }


    if (modalMode === 'edit' && selectedReservation) {
  const dateStr = startDateObj.toISOString().slice(0, 10);
  const startISO = `${dateStr}T${modalStart}:00+09:00`;
  const endISO = `${dateStr}T${modalEnd}:00+09:00`;

  // ✅ 반복이 '없음'이면 기존처럼 1건 업데이트
  if (repeatOption === 'none') {
    if (hasTimeConflict(modalRoom.id, startISO, endISO, selectedReservation.id)) {
      alert('이미 해당 시간에 이 회의실에 예약이 있습니다. 다른 시간대를 선택해주세요.');
      return;
    }

    const { error } = await supabase
      .from('reservations')
      .update({
        room_id: modalRoom.id,
        title: modalTitle,
        reserver_name: modalName,
        reserver_team: modalTeam,
        start_time: startISO,
        end_time: endISO,
      })
      .eq('id', selectedReservation.id);

    if (error) alert('예약 변경 실패: ' + error.message);
    else {
      alert('예약이 변경되었습니다.');
      setIsModalOpen(false);
      resetModalFields();
      await loadReservations();
    }
    return;
  }

  // ✅ 반복이면: "시리즈"를 찾아 삭제 후 재생성
  const series = getSameSeries(selectedReservation, reservations); // 아래 함수 추가
  const seriesIds = series.map((r) => r.id);

  // 1) 새 규칙의 날짜 목록 만들기 (create 로직 재사용)
  const dates: string[] = [];
  const cursor = new Date(startDateObj);
  while (cursor <= endDateObj) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + (repeatOption === 'daily' ? 1 : 7));
  }

  // 2) 새로 만들 records와 중복 체크(기존 시리즈는 제외해야 하므로 exclude ids 반영 필요)
  for (const d of dates) {
    const sISO = `${d}T${modalStart}:00+09:00`;
    const eISO = `${d}T${modalEnd}:00+09:00`;

    // hasTimeConflict는 "특정 id 하나만 exclude"라서,
    // 시리즈 전체 제외 버전이 필요함 → 아래 함수로 해결
    if (hasTimeConflictExcludeIds(reservations, modalRoom.id, sISO, eISO, seriesIds)) {

      alert(`${d} ${modalStart}~${modalEnd} 에 이미 예약이 있습니다. 다른 시간대를 선택해주세요.`);
      return;
    }
  }

  // 3) 기존 시리즈 삭제
  const { error: delErr } = await supabase
    .from('reservations')
    .delete()
    .in('id', seriesIds);

  if (delErr) {
    alert('기존 반복 예약 삭제 실패: ' + delErr.message);
    return;
  }

  // 4) 새 시리즈 insert
  const records = dates.map((d) => ({
    room_id: modalRoom.id,
    title: modalTitle,
    reserver_name: modalName,
    reserver_team: modalTeam,
    start_time: `${d}T${modalStart}:00+09:00`,
    end_time: `${d}T${modalEnd}:00+09:00`,
    created_by: 'manual',
  }));

  const { error: insErr } = await supabase.from('reservations').insert(records);

  if (insErr) {
    alert('반복 예약 변경 실패: ' + insErr.message);
  } else {
    alert('반복 예약이 변경되었습니다.');
    setIsModalOpen(false);
    resetModalFields();
    await loadReservations();
  }
  return;
}


    // 3️⃣ 생성 모드 (반복 포함)
    const dates: string[] = [];
    const cursor = new Date(startDateObj);

    while (cursor <= endDateObj) {
      dates.push(cursor.toISOString().slice(0, 10));
      if (repeatOption === 'daily') {
        cursor.setDate(cursor.getDate() + 1);
      } else if (repeatOption === 'weekly') {
        cursor.setDate(cursor.getDate() + 7);
      } else {
        break;
      }
    }
    if (dates.length === 0) {
      dates.push(startDateObj.toISOString().slice(0, 10));
    }

    // 🔍 각 날짜별로 먼저 중복 체크
    for (const dateStr of dates) {
      const startISO = `${dateStr}T${modalStart}:00+09:00`;
      const endISO = `${dateStr}T${modalEnd}:00+09:00`;

      if (hasTimeConflict(modalRoom.id, startISO, endISO)) {
        alert(
          `${dateStr} ${modalStart}~${modalEnd} 에 이미 이 회의실에 예약이 있습니다. 다른 시간대를 선택해주세요.`,
        );
        return;
      }
    }

    // ✅ 중복 없으면 실제 insert
    const records = dates.map((dateStr) => ({
      room_id: modalRoom.id,
      title: modalTitle,
      reserver_name: modalName,
      reserver_team: modalTeam,
      start_time: `${dateStr}T${modalStart}:00+09:00`,
      end_time: `${dateStr}T${modalEnd}:00+09:00`,
      created_by: 'manual',
    }));

    const { error } = await supabase.from('reservations').insert(records);

    if (error) {
      alert('예약 실패: ' + error.message);
    } else {
      alert('예약 완료!');
      setIsModalOpen(false);
      resetModalFields();
      await loadReservations(); // ⬅️ 이것도 인자 없이
    }
  }}
  style={{
    width: '100%',
    padding: '10px',
    background: '#0070f3',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 600,
  }}
>
  {modalMode === 'edit' ? '변경 저장' : '예약하기'}
</button>

{/* 🔹 닫기 버튼 추가 */}
    <button
      onClick={() => {
        setIsModalOpen(false);
        resetModalFields();
      }}
      style={{
        marginTop: '8px',
        width: '100%',
        padding: '8px',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
        background: 'white',
        cursor: 'pointer',
        fontSize: '13px',
      }}
    >
      닫기
    </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
