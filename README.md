# Sakura Shop — Kho & đơn hàng

Ứng dụng quản lý **tồn kho**, **đơn hàng**, hóa đơn nhập/xuất và góp vốn cho shop quần áo + mỹ phẩm Nhật. Thay đổi được lưu trong trình duyệt; ứng dụng tĩnh không tự ghi ngược vào các file JSON trên máy chủ.

`funds.json` chứa dữ liệu góp vốn; `invoice.json` chứa hóa đơn nhập/xuất. Dùng **Xuất backup** để tải `store_data.json`, `order_data.json`, `funds.json` và `invoice.json`; nhập các file để khôi phục dữ liệu.

## Đồng bộ nhiều máy bằng Supabase

1. Tạo một project Supabase.
2. Mở SQL Editor và chạy nội dung `supabase-schema.sql`.
3. Trong Authentication, tạo tài khoản email/mật khẩu cho người dùng shop.
4. Điền Project URL và anon/publishable key vào `supabase-config.js`. Không dùng service-role key trong trình duyệt.
5. Deploy lại ứng dụng rồi đăng nhập bằng tài khoản vừa tạo.

Lần đăng nhập đầu tiên trên project Supabase mới sẽ đưa dữ liệu `localStorage` hiện có lên cloud (nếu không có dữ liệu cloud). Sau đó các lần lưu được đồng bộ vào bảng `shop_state`; các máy đăng nhập cùng project sẽ dùng chung dữ liệu. File JSON backup vẫn có thể dùng để sao lưu/khôi phục thủ công.

## Chạy local

Mở `index.html` trong trình duyệt, hoặc:

```bash
npx serve .
```

## Deploy Netlify

1. Vào [app.netlify.com/drop](https://app.netlify.com/drop)
2. Kéo cả thư mục `sakura-shop` vào
3. Site lên ngay, không cần build

Hoặc kết nối Git: publish directory = `.` (đã có `netlify.toml`).

## Dùng

- **Tổng quan** — tồn kho, cảnh báo sắp hết, đơn gần đây
- **Kho** — thêm/sửa/xóa sản phẩm, điều chỉnh tồn
- **Đơn hàng** — tạo đơn (trừ kho), đổi trạng thái; hủy đơn hoàn kho
- **Sao lưu** — xuất/nhập file JSON
