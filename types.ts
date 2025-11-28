export type Room = {
    id: string;
    floor_id: string;
    name: string;
    display_order: number;
    capacity: number | null;
    is_active: boolean;
    created_at: string;
  };
  