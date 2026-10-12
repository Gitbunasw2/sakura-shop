# Sakura Shop — Kho & đơn hàng

Ứng dụng quản lý **tồn kho** và **đơn hàng** cho shop quần áo + mỹ phẩm Nhật. Dữ liệu lưu trên trình duyệt (có xuất/nhập backup). Chưa có bán hàng online — chỉ nội bộ.

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
