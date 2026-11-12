# 3. Design Tokens

**Thiết kế đề xuất · 07/11/2026.** SCRUM-25 triển khai tập token tối thiểu cho auth ở `apps/web/src/styles/tokens.css`; chưa triển khai toàn bộ catalog hoặc media theme. Palette/scale ở [foundations](foundations.md) vẫn cần review theo từng consumer. Xem [bằng chứng auth](../../test-evidence/2026-11-12-scrum-25-auth-ui.md).

## Ba tầng, một hướng tham chiếu

| Tầng      | Ví dụ                                                     | Consumer                                 |
| --------- | --------------------------------------------------------- | ---------------------------------------- |
| Primitive | `--cl-palette-accent-700`, `--cl-space-4`                 | Chỉ semantic/component token             |
| Semantic  | `--cl-color-text-primary`, `--cl-color-action-primary-bg` | UI và layout                             |
| Component | `--cl-button-primary-bg`, `--cl-dialog-radius`            | Chỉ thêm khi có nhu cầu override ổn định |

Tên semantic nói mục đích, không nói mã màu hoặc màn. Không dùng `greenButton`, `hostColor`, `page3Spacing`. Enum quyền/nghiệp vụ không là design token. Không sinh một component token cho mọi CSS declaration nếu semantic token đã đủ.

## Danh mục tối thiểu đề xuất

| Nhóm         | Semantic token                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Surface      | `--cl-color-canvas`, `--cl-color-surface`, `--cl-color-surface-subtle`                           |
| Text         | `--cl-color-text-primary`, `--cl-color-text-secondary`, `--cl-color-text-on-action`              |
| Border/focus | `--cl-color-border-subtle`, `--cl-color-border-control`, `--cl-color-focus-ring`                 |
| Action       | `--cl-color-action-primary-bg`, `--cl-color-action-primary-hover`, `--cl-color-action-danger-bg` |
| Feedback     | Các cặp `--cl-color-feedback-{error,warning,success,info}-{bg,text,border}`                      |
| Chữ          | `--cl-font-sans`, `--cl-font-size-body`, `--cl-font-size-caption`, `--cl-line-height-body`       |
| Hình học     | `--cl-space-*`, `--cl-radius-control`, `--cl-radius-dialog`, `--cl-control-height`               |
| Lớp nổi      | `--cl-shadow-popover`, `--cl-shadow-dialog`, `--cl-z-popover`, `--cl-z-modal`, `--cl-z-toast`    |

Các số của spacing phải được mô tả: đề xuất `space-1 = 0.25rem`, `space-2 = 0.5rem`, `space-4 = 1rem`. Không trộn `space-4 = 4px` trong module khác. Z-index theo quan hệ layer được catalog ghi nhận; portal phải giữ semantic surface của nơi mở, không tự tăng z-index vô hạn để sửa overlap.

## Ví dụ ánh xạ CSS

Ví dụ để review cấu trúc, chưa là patch có sẵn trong app:

```css
:root {
  --cl-palette-accent-700: #0d7c62;
  --cl-palette-ink: #17201e;
  --cl-color-surface: #ffffff;
  --cl-color-text-primary: var(--cl-palette-ink);
  --cl-color-action-primary-bg: var(--cl-palette-accent-700);
  --cl-color-text-on-action: #ffffff;
  --cl-space-4: 1rem;
  --cl-radius-control: 0.5rem;
}

[data-surface='media'] {
  --cl-color-surface: #17201e;
  --cl-color-text-primary: #ffffff;
}
```

Media surface phải khai báo đủ text-secondary/border/feedback/focus trước dùng thật; ví dụ hai field không chứng minh theme hoàn chỉnh. Dialog portal dùng surface token rõ ràng thay vì vô tình nhận màu của body. Không thêm nút đổi theme hoặc persist dark mode từ ví dụ này.

## Tích hợp Tailwind và CSS

Nguồn token auth hiện ở `apps/web/src/styles/tokens.css`, import một lần từ global CSS; các nhóm chưa được consumer dùng vẫn là đề xuất. Tailwind mapping, nếu cần, tham chiếu cùng custom properties; không giữ bảng HEX thứ hai trong TS hoặc từng feature. Cú pháp mapping phải kiểm với Tailwind đang pin khi triển khai, không đổi package của repo theo export.

Feature dùng semantic token qua class/CSS variable. CSS của canvas có thể nhận màu bút từ lựa chọn hợp lệ của domain; palette vẽ không tự đồng nhất với palette brand. Hình học nguồn video/DPR nằm trong renderer.

## Thay đổi và tương thích

1. Xác định token/consumer và mục đích; thay semantic nghĩa là kiểm mọi surface dùng nó.
2. Review trước–sau ở Workspace, media và dialog; đo contrast của cặp màu thực.
3. Rename token có mapping cũ→mới và chuyển các consumer trong cùng PR hoặc giai đoạn deprecation ghi rõ; không xóa âm thầm.
4. Thay giá trị không đổi tên vẫn có thể làm vỡ layout/contrast, cần kiểm như thay component.
5. Tên Figma variable và CSS token có bảng ánh xạ khi team có library thật; hiện export CSS không chứng minh đã có Figma variable library.

Không dùng token để cố định quota file, TTL, deadline hoặc thời gian fade chưa chốt. Những giá trị đó thuộc contract/config của miền, được server xác nhận.
