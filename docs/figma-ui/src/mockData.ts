export type Role = 'MEMBER' | 'ADMIN' | 'OWNER';
export type ChannelKind = 'TEXT' | 'LIVE';
export type Access = 'WORKSPACE' | 'PRIVATE';
export type MessageStatus = 'sent' | 'sending' | 'error';

export type Member = {
  id: string;
  name: string;
  initials: string;
  color: string;
  online?: boolean;
  title: string;
};

export type Attachment = {
  id: string;
  name: string;
  type: 'image' | 'file';
  size?: string;
  previewUrl?: string;
};

export type Reply = {
  id: string;
  authorId: string;
  time: string;
  text: string;
};

export type Message = {
  id: string;
  authorId: string;
  time: string;
  text: string;
  attachment?: Attachment;
  replies?: Reply[];
  status?: MessageStatus;
};

export type Channel = {
  id: string;
  name: string;
  kind: ChannelKind;
  access: Access;
  memberIds?: string[];
  description: string;
};

export const currentUserId = 'minh';

export const members: Member[] = [
  {
    id: 'minh',
    name: 'Minh Anh',
    initials: 'MA',
    color: 'bg-teal-600',
    online: true,
    title: 'Thành viên',
  },
  {
    id: 'lan',
    name: 'Lan Chi',
    initials: 'LC',
    color: 'bg-violet-500',
    online: true,
    title: 'Nhóm trưởng',
  },
  {
    id: 'khoa',
    name: 'Gia Khoa',
    initials: 'GK',
    color: 'bg-sky-600',
    online: true,
    title: 'Thành viên',
  },
  { id: 'vy', name: 'Thảo Vy', initials: 'TV', color: 'bg-amber-600', title: 'Thành viên' },
  {
    id: 'nam',
    name: 'Hoàng Nam',
    initials: 'HN',
    color: 'bg-rose-500',
    online: true,
    title: 'Thành viên',
  },
];

export const initialChannels: Channel[] = [
  {
    id: 'general',
    name: 'general',
    kind: 'TEXT',
    access: 'WORKSPACE',
    description: 'Trao đổi chung của Nhóm 5',
  },
  {
    id: 'bai-tap',
    name: 'bài-tập',
    kind: 'TEXT',
    access: 'WORKSPACE',
    description: 'Cùng giải đáp và cập nhật bài tập',
  },
  {
    id: 'presentation',
    name: 'Chuẩn bị thuyết trình',
    kind: 'TEXT',
    access: 'PRIVATE',
    memberIds: ['minh', 'lan', 'vy'],
    description: 'Nội dung chuẩn bị riêng của nhóm thuyết trình',
  },
  {
    id: 'live-room',
    name: 'Phòng học chung',
    kind: 'LIVE',
    access: 'WORKSPACE',
    description: 'Cùng học và trao đổi trực tiếp',
  },
];

export const initialMessages: Record<string, Message[]> = {
  general: [
    {
      id: 'm1',
      authorId: 'lan',
      time: '09:12',
      text: 'Chào cả nhóm, mình đã tổng hợp yêu cầu cho bài giữa kỳ. Mọi người xem qua rồi mình chốt phần việc nhé.',
    },
    {
      id: 'm2',
      authorId: 'khoa',
      time: '09:18',
      text: 'Mình phác thảo luồng chính như bên dưới. Phần đăng nhập sẽ dẫn thẳng vào trang tổng quan sau khi xác thực.',
      attachment: { id: 'a1', name: 'so-do-luong-he-thong.png', type: 'image', size: '1,2 MB' },
      replies: [
        {
          id: 'r1',
          authorId: 'lan',
          time: '09:24',
          text: 'Luồng này rõ rồi. Bạn thêm giúp mình nhánh quên mật khẩu nhé.',
        },
        {
          id: 'r2',
          authorId: 'minh',
          time: '09:27',
          text: 'Mình sẽ dựa vào sơ đồ này để chia component giao diện.',
        },
        {
          id: 'r3',
          authorId: 'khoa',
          time: '09:31',
          text: 'Được, trưa nay mình cập nhật bản mới.',
        },
      ],
    },
    {
      id: 'm3',
      authorId: 'vy',
      time: '10:06',
      text: 'Mình gửi tài liệu đặc tả đã chỉnh theo góp ý hôm qua. Trang 4 có bảng phân công mới.',
      attachment: { id: 'a2', name: 'dac-ta-yeu-cau-v2.pdf', type: 'file', size: '2,4 MB' },
    },
    {
      id: 'm4',
      authorId: 'nam',
      time: '10:18',
      text: 'Mình đang rà lại phần tiêu chí nghiệm thu, khoảng 15 phút nữa sẽ gửi bản cập nhật.',
      status: 'sending',
    },
    {
      id: 'm5',
      authorId: 'minh',
      time: '10:22',
      text: 'Mình đã thử đẩy bản giao diện mới nhưng kết nối bị gián đoạn.',
      status: 'error',
    },
  ],
  presentation: [
    {
      id: 'p1',
      authorId: 'vy',
      time: 'Hôm qua, 16:40',
      text: 'Mình đã rút phần mở đầu xuống còn khoảng một phút. Minh xem giúp mình cách chuyển sang phần demo nhé.',
    },
    {
      id: 'p2',
      authorId: 'minh',
      time: 'Hôm qua, 16:53',
      text: 'Ổn rồi, mình sẽ thêm một câu dẫn ngắn trước khi mở prototype.',
    },
  ],
  'bai-tap': [],
};

export const initialDmMessages: Record<string, Message[]> = {
  lan: [
    {
      id: 'd1',
      authorId: 'lan',
      time: '08:45',
      text: 'Minh ơi, chiều nay bạn có thể cùng mình duyệt phần trình bày không?',
    },
    { id: 'd2', authorId: 'minh', time: '08:51', text: 'Được nhé, khoảng 15:30 mình rảnh.' },
  ],
  khoa: [
    {
      id: 'd3',
      authorId: 'khoa',
      time: 'Hôm qua',
      text: 'Mình gửi bạn ảnh bản phác thảo mới để tham khảo nhé.',
    },
    {
      id: 'd4',
      authorId: 'khoa',
      time: 'Hôm qua',
      text: '',
      attachment: { id: 'da1', name: 'phac-thao-man-hinh.png', type: 'image', size: '860 KB' },
    },
  ],
  vy: [],
  nam: [
    { id: 'd5', authorId: 'nam', time: 'Thứ Hai', text: 'Cảm ơn bạn đã góp ý phần kiểm thử nhé.' },
  ],
};
