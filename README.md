# curly 〜

> Một **Postman clone** gọn nhẹ chạy thẳng trên trình duyệt. Nhập URL, chọn method, bấm **Send** — xem status, thời gian, body JSON. Tên lấy cảm hứng từ `curl`.

**Stack:** React + Vite + TypeScript + axios. Không backend, không đăng nhập — mở là dùng.

## Tính năng

- Method GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS + ô URL (Enter để Send)
- Tab **Params** (query string), **Headers**, **Body** (none / JSON / raw) — tự thêm dòng mới khi gõ
- **Response**: status có màu, thời gian (ms), size, body JSON format đẹp, tab response headers
- **Lịch sử** request lưu trong `localStorage`, bấm để nạp lại

## Chạy nhanh

```bash
npm install
npm run dev      # http://localhost:5200
```

Lệnh khác:

```bash
npm run build      # build production -> dist/
npm run preview    # xem thử bản build
npm run typecheck  # kiểm tra type
```

## Cấu trúc

```
src/
  config/apiClient.ts   # axios instance + build request (params/headers/body), đo thời gian & size
  components/
    KeyValueEditor.tsx  # bảng key-value dùng cho Params & Headers
    ResponseView.tsx    # hiển thị status / body / headers
    HistoryPanel.tsx    # lịch sử request
  hooks/useHistory.ts   # lưu lịch sử vào localStorage
  types/request.ts      # kiểu dữ liệu
  App.tsx               # ghép mọi thứ
```

## Lưu ý về CORS

`curly` chạy trong trình duyệt nên chịu ràng buộc **CORS**: nếu API đích không trả header `Access-Control-Allow-Origin` phù hợp, request sẽ báo lỗi network. Đây là hành vi của trình duyệt — Postman *desktop* không gặp vì nó không phải trình duyệt. Khi cần test những API như vậy, thêm một dev proxy vào `vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': { target: 'https://api.example.com', changeOrigin: true },
  },
}
```

rồi gọi qua `/api/...`.

## Fork & tự chỉnh

Đây là dự án nhỏ, dễ đọc — hợp để fork và mở rộng. Vài hướng gợi ý: lưu **collection** nhiều request, tab **Authorization** (Bearer/Basic), **export cURL**, hoặc dark/light theme.

## License

MIT
