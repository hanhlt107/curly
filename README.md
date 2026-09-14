# curly

Công cụ kiểm thử REST API chạy trực tiếp trên trình duyệt, không yêu cầu cài đặt hay tài khoản. Toàn bộ dữ liệu được lưu cục bộ trong trình duyệt.

**Demo:** https://hanhlt107.github.io/curly/

![Giao diện curly](docs/screenshot.png)

## Tính năng

- Hỗ trợ đầy đủ HTTP method: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Cấu hình Query Params, Headers và Authorization (Bearer, Basic, API key)
- Nhiều định dạng body: JSON, Raw, GraphQL, Form-data, URL-encoded
- Hiển thị response chi tiết: status, thời gian phản hồi, dung lượng, headers, body được format
- So sánh response giữa các lần gọi
- Quản lý request theo Collection và chạy toàn bộ collection
- Biến môi trường với cú pháp `{{variable}}` dùng trong URL, header, body
- Pre-request / post-response script để lấy token động, truyền biến giữa các request
- Command palette tìm kiếm nhanh (`Ctrl/⌘ + K`), giao diện sáng/tối
- Import từ Postman và cURL, export workspace, chia sẻ request qua link

## Autotest

- Viết assertion cho response: `status === 200`, `time < 2000`, `body contains "..."`, `body matches /regex/`, `header ... contains ...`, `json data.id === 1`, `json data.count > 0`
- Collection Runner: chạy toàn bộ collection, tự chuyền biến giữa các request
- Chạy lặp nhiều vòng, đặt delay, hoặc data-driven theo file CSV/JSON
- Tùy chọn dừng khi gặp lỗi, xuất báo cáo kết quả ra JSON

## Công nghệ

React, Vite, TypeScript, axios.

## Cài đặt và chạy

Yêu cầu Node.js 18 trở lên.

```bash
npm install
npm run dev
```

Ứng dụng chạy tại http://localhost:5200.

Các lệnh khác:

```bash
npm run build      # Build bản production vào thư mục dist/
npm run preview    # Xem thử bản build
npm run typecheck  # Kiểm tra kiểu dữ liệu
```

## Triển khai

Dự án được cấu hình sẵn để triển khai lên GitHub Pages qua GitHub Actions. Sau khi fork, vào **Settings → Pages** và chọn **Source: GitHub Actions**. Mỗi lần push lên nhánh `main`, ứng dụng sẽ được build và cập nhật tự động.

Khi triển khai lên gốc domain (Vercel, Netlify, v.v.), hãy xóa dòng `base: '/curly/'` trong `vite.config.ts`.

## Lưu ý về CORS

curly chạy trong trình duyệt nên tuân theo chính sách CORS. Nếu API đích không trả về header `Access-Control-Allow-Origin` phù hợp, request sẽ bị trình duyệt chặn. Trong trường hợp này, cấu hình proxy trong `vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': { target: 'https://api.example.com', changeOrigin: true },
  },
}
```

sau đó gọi qua đường dẫn `/api/...`.

## License

MIT
