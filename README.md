# Sakura Shop — Kho & đơn hàng

Ứng dụng quản lý **tồn kho**, **đơn hàng**, hóa đơn nhập/xuất và góp vốn cho shop quần áo + mỹ phẩm Nhật. Thay đổi được lưu trong trình duyệt; ứng dụng tĩnh không tự ghi ngược vào các file JSON trên máy chủ.

`funds.json` chứa dữ liệu góp vốn; `invoice.json` chứa hóa đơn nhập/xuất. Dùng **Xuất backup** để tải `store_data.json`, `order_data.json`, `funds.json` và `invoice.json`; nhập các file để khôi phục dữ liệu.

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
