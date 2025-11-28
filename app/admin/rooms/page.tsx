'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient'; // 경로 안 맞으면 조정 필요

type Room = {
  id: number;
  name: string;
  capacity: number;
  is_active: boolean;
  display_order: number;
};

export default function AdminRoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCapacity, setNewRoomCapacity] = useState<number | ''>('');
  const [newRoomOrder, setNewRoomOrder] = useState<number | ''>('');

  const loadRooms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error('rooms load error:', error.message);
      alert('회의실 목록을 불러오지 못했습니다.');
    } else if (data) {
      setRooms(data as Room[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const handleToggleActive = async (room: Room) => {
    setSavingId(room.id);
    const { error } = await supabase
      .from('rooms')
      .update({ is_active: !room.is_active })
      .eq('id', room.id);

    if (error) {
      alert('활성 상태 변경 실패: ' + error.message);
    } else {
      await loadRooms();
    }
    setSavingId(null);
  };

  const handleRoomFieldChange = (
    id: number,
    field: keyof Room,
    value: string | number | boolean,
  ) => {
    setRooms((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );
  };

  const handleSaveRoom = async (room: Room) => {
    setSavingId(room.id);
    const { error } = await supabase
      .from('rooms')
      .update({
        name: room.name,
        capacity: room.capacity,
        is_active: room.is_active,
        display_order: room.display_order,
      })
      .eq('id', room.id);

    if (error) {
      alert('저장 실패: ' + error.message);
    } else {
      alert('저장되었습니다.');
      await loadRooms();
    }
    setSavingId(null);
  };

  const handleDeleteRoom = async (room: Room) => {
    const ok = window.confirm(
      `"${room.name}" 회의실을 삭제하시겠습니까?\n기존 예약 데이터가 있다면 영향을 줄 수 있습니다.`,
    );
    if (!ok) return;

    setSavingId(room.id);
    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('id', room.id);

    if (error) {
      alert('삭제 실패: ' + error.message);
    } else {
      await loadRooms();
    }
    setSavingId(null);
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) {
      alert('회의실 이름을 입력해주세요.');
      return;
    }
    if (newRoomCapacity === '' || newRoomCapacity <= 0) {
      alert('수용 인원을 올바르게 입력해주세요.');
      return;
    }

    const displayOrder =
      newRoomOrder === ''
        ? (rooms[rooms.length - 1]?.display_order ?? 0) + 1
        : newRoomOrder;

    const { error } = await supabase.from('rooms').insert({
      name: newRoomName.trim(),
      capacity: Number(newRoomCapacity),
      is_active: true,
      display_order: Number(displayOrder),
    });

    if (error) {
      alert('회의실 추가 실패: ' + error.message);
    } else {
      setNewRoomName('');
      setNewRoomCapacity('');
      setNewRoomOrder('');
      await loadRooms();
    }
  };

  return (
    <main
      style={{
        padding: '20px',
        fontFamily: 'sans-serif',
        maxWidth: '900px',
        margin: '0 auto',
      }}
    >
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 700,
          marginBottom: '8px',
        }}
      >
        회의실 관리 (Admin)
      </h1>
      <div
        style={{
          fontSize: '12px',
          color: '#6b7280',
          marginBottom: '16px',
        }}
      >
        rooms 테이블의 회의실 정보를 조회/수정/추가하는 페이지입니다.
      </div>

      {/* 새 회의실 추가 */}
      <section
        style={{
          marginBottom: '20px',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          background: '#f9fafb',
        }}
      >
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          새 회의실 추가
        </h2>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            type="text"
            placeholder="회의실 이름"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            style={{
              flex: 2,
              minWidth: '150px',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <input
            type="number"
            placeholder="수용 인원"
            value={newRoomCapacity}
            onChange={(e) =>
              setNewRoomCapacity(
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
            style={{
              flex: 1,
              minWidth: '100px',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <input
            type="number"
            placeholder="표시 순서 (선택)"
            value={newRoomOrder}
            onChange={(e) =>
              setNewRoomOrder(
                e.target.value === '' ? '' : Number(e.target.value),
              )
            }
            style={{
              flex: 1,
              minWidth: '100px',
              padding: '6px 8px',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
            }}
          />
          <button
            onClick={handleAddRoom}
            style={{
              padding: '8px 14px',
              borderRadius: '6px',
              border: 'none',
              background: '#16a34a',
              color: 'white',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            추가
          </button>
        </div>
      </section>

      {/* 회의실 목록 */}
      <section>
        <h2
          style={{
            fontSize: '16px',
            fontWeight: 600,
            marginBottom: '8px',
          }}
        >
          회의실 목록
        </h2>

        {loading ? (
          <div style={{ fontSize: '14px' }}>불러오는 중...</div>
        ) : rooms.length === 0 ? (
          <div style={{ fontSize: '14px', color: '#6b7280' }}>
            등록된 회의실이 없습니다.
          </div>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  background: '#f3f4f6',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <th style={{ padding: '8px', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>이름</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>수용 인원</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>표시 순서</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>활성</th>
                <th style={{ padding: '8px', textAlign: 'center' }}>작업</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.id}
                  style={{ borderBottom: '1px solid #f3f4f6' }}
                >
                  <td style={{ padding: '6px 8px' }}>{room.id}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <input
                      type="text"
                      value={room.name}
                      onChange={(e) =>
                        handleRoomFieldChange(room.id, 'name', e.target.value)
                      }
                      style={{
                        width: '100%',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <input
                      type="number"
                      value={room.capacity}
                      onChange={(e) =>
                        handleRoomFieldChange(
                          room.id,
                          'capacity',
                          Number(e.target.value || 0),
                        )
                      }
                      style={{
                        width: '80px',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        textAlign: 'right',
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                    <input
                      type="number"
                      value={room.display_order}
                      onChange={(e) =>
                        handleRoomFieldChange(
                          room.id,
                          'display_order',
                          Number(e.target.value || 0),
                        )
                      }
                      style={{
                        width: '80px',
                        padding: '4px 6px',
                        borderRadius: '4px',
                        border: '1px solid #d1d5db',
                        textAlign: 'right',
                      }}
                    />
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleToggleActive(room)}
                      disabled={savingId === room.id}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        border: 'none',
                        fontSize: '12px',
                        cursor: 'pointer',
                        background: room.is_active ? '#bbf7d0' : '#e5e7eb',
                        color: room.is_active ? '#166534' : '#4b5563',
                      }}
                    >
                      {room.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleSaveRoom(room)}
                      disabled={savingId === room.id}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#2563eb',
                        color: 'white',
                        fontWeight: 500,
                        cursor: 'pointer',
                        marginRight: '6px',
                      }}
                    >
                      저장
                    </button>
                    <button
                      onClick={() => handleDeleteRoom(room)}
                      disabled={savingId === room.id}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#dc2626',
                        color: 'white',
                        fontWeight: 500,
                        cursor: 'pointer',
                      }}
                    >
                      삭제
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
