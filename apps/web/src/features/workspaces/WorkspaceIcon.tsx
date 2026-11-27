const shapes = {
  hash: 'M5 9h14M4 15h14M10 3 8 21M16 3l-2 18',
  lock: 'M5 10h14v10H5zM8 10V7a4 4 0 0 1 8 0v3',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm6 9 6 6 6-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  search: 'M21 21l-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  people:
    'M16 18v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1m14-5a4 4 0 0 1 4 4v1M13 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm4-3a3 3 0 0 1 0 6',
  close: 'm6 6 12 12M18 6 6 18',
  menu: 'M4 6h16M4 12h16M4 18h16',
  moon: 'M21 13a9 9 0 1 1-10-10 7 7 0 0 0 10 10Z',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2m11-5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  chat: 'M20 5H4v12h4v4l4-4h8z',
  check: 'm5 12 4 4L19 6',
  minimize: 'M5 12h14',
  refresh: 'M20 7v5h-5M19.8 12a8 8 0 1 0-2.2 5.5',
  settings: 'M4 6h16M4 12h16M4 18h16M8 4v4M16 10v4M10 16v4',
  pin: 'm9 4 11 11-2 2-5-1-4 2-1-1 2-4-1-5zM9 17l-5 4',
  phoneOff: 'M3 16v-4c4-5 14-5 18 0v4h-5v-3a12 12 0 0 0-8 0v3z',
};

export function WorkspaceIcon({ name }: { name: keyof typeof shapes }) {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-channel-icon={name === 'video' ? 'phone' : name}
    >
      <path d={shapes[name]} />
    </svg>
  );
}
