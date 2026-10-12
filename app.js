const STORAGE_KEY = "sakura-shop-v3";

const STATUSES = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  done: "Hoàn thành",
  cancelled: "Đã hủy",
};

let state = { products: [], orders: [], categories: [] };
let currentView = "dashboard";

// Tải dữ liệu từ 2 file JSON ngoài
async function loadData() {
  try {
    const [storeRes, orderRes] = await Promise.all([
      fetch('./store_data.json'),
      fetch('./order_data.json')
    ]);
    
    if (!storeRes.ok || !orderRes.ok) {
      throw new Error("Không thể tải tệp JSON từ server.");
    }

    const storeData = await storeRes.json();
    const orderData = await orderRes.json();

    state = normalizeState({
      products: storeData.products || [],
      categories: storeData.categories || [],
      orders: orderData.orders || []
    });

    save();
  } catch (err) {
    console.error("Lỗi khi tải file JSON:", err);
    const rawLocal = localStorage.getItem(STORAGE_KEY);
    if (rawLocal) {
      state = normalizeState(JSON.parse(rawLocal));
    } else {
      toast("Không tìm thấy tệp dữ liệu JSON nguồn!");
    }
  }
  render();
}

function normalizeState(parsed) {
  const products = parsed.products || [];
  const orders = parsed.orders || [];
  let categories = Array.isArray(parsed.categories) ? parsed.categories.filter((c) => c && c.id && c.name) : [];
  const known = new Set(categories.map((c) => c.id));
  
  products.forEach((p) => {
    if (p.category && !known.has(p.category)) {
      categories.push({ id: p.category, name: p.category });
      known.add(p.category);
    }
    if (p.costPrice === undefined) p.costPrice = 0;
  });
  return { products, orders, categories };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function categoryById(id) {
  return state.categories.find((c) => c.id === id);
}

function categoryName(id) {
  return categoryById(id)?.name || id || "—";
}

function categoryOptions(selected) {
  return state.categories
    .map((c) => `<option value="${esc(c.id)}" ${c.id === selected ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
}

function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function money(n) {
  return new Intl.NumberFormat("vi-VN").format(n || 0) + " đ";
}

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2200);
}

function setView(view) {
  currentView = view;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  document.getElementById("view-dashboard").classList.toggle("hidden", view !== "dashboard");
  document.getElementById("view-inventory").classList.toggle("hidden", view !== "inventory");
  document.getElementById("view-orders").classList.toggle("hidden", view !== "orders");
  const titles = { dashboard: "Tổng quan", inventory: "Kho hàng", orders: "Đơn hàng" };
  document.getElementById("page-title").textContent = titles[view];
  render();
}

function openModal(title, html) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = html;
  document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  if (currentView === "inventory") renderInventory();
}

function productById(id) {
  return state.products.find((p) => p.id === id);
}

function render() {
  const actions = document.getElementById("top-actions");
  if (!actions) return;
  if (currentView === "inventory") {
    actions.innerHTML = `
      <button class="btn secondary" id="manage-cats">Quản lý nhóm</button>
      <button class="btn sakura" id="add-product">Thêm sản phẩm</button>
    `;
    document.getElementById("manage-cats").onclick = () => categoryManager();
    document.getElementById("add-product").onclick = () => productForm();
    renderInventory();
  } else if (currentView === "orders") {
    actions.innerHTML = `<button class="btn sakura" id="add-order">Tạo đơn hàng</button>`;
    document.getElementById("add-order").onclick = () => orderForm();
    renderOrders();
  } else {
    actions.innerHTML = `<button class="btn sakura" id="quick-order">Tạo đơn nhanh</button>`;
    document.getElementById("quick-order").onclick = () => orderForm();
    renderDashboard();
  }
}

function renderDashboard() {
  const low = state.products.filter((p) => p.stock <= p.minStock);
  const sku = state.products.length;
  const units = state.products.reduce((s, p) => s + Number(p.stock), 0);
  const openOrders = state.orders.filter((o) => !["done", "cancelled"].includes(o.status)).length;
  const revenue = state.orders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);

  document.getElementById("view-dashboard").innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">Mã hàng</div><div class="value">${sku}</div></div>
      <div class="card"><div class="label">Tổng tồn</div><div class="value">${units}</div></div>
      <div class="card"><div class="label">Đơn đang xử lý</div><div class="value">${openOrders}</div></div>
      <div class="card"><div class="label">Doanh thu (chưa hủy)</div><div class="value" style="font-size:20px">${money(revenue)}</div></div>
    </div>
    <div class="card list-block">
      <h3>Sắp hết hàng</h3>
      ${
        low.length
          ? `<table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Tồn</th><th>Ngưỡng</th></tr></thead><tbody>
          ${low
            .map(
              (p) =>
                `<tr><td>${p.sku}</td><td>${p.name}</td><td><span class="badge low">${p.stock}</span></td><td>${p.minStock}</td></tr>`
            )
            .join("")}
        </tbody></table>`
          : `<div class="empty">Chưa có sản phẩm dưới ngưỡng.</div>`
      }
    </div>
  `;
}

function renderInventory() {
  const q = (document.getElementById("inv-q")?.value || "").toLowerCase();
  const cat = document.getElementById("inv-cat")?.value || "";
  const rows = state.products.filter((p) => {
    const matchQ = [p.sku, p.name, p.brand, p.variant].join(" ").toLowerCase().includes(q);
    const matchC = !cat || p.category === cat;
    return matchQ && matchC;
  });

  document.getElementById("view-inventory").innerHTML = `
    <div class="toolbar">
      <input id="inv-q" class="search" placeholder="Tìm SKU, tên, thương hiệu..." value="${q}" />
      <select id="inv-cat">
        <option value="">Tất cả nhóm</option>
        ${categoryOptions(cat)}
      </select>
    </div>
    ${
      rows.length
        ? `<table><thead><tr>
          <th>SKU</th><th>Sản phẩm</th><th>Nhóm</th><th>Tồn</th><th>Giá gốc</th><th>Giá bán</th><th></th>
        </tr></thead><tbody>
        ${rows
          .map((p) => {
            const low = p.stock <= p.minStock;
            return `<tr>
              <td>${esc(p.sku)}</td>
              <td><strong>${esc(p.name)}</strong><br><span style="color:var(--muted)">${esc(p.brand)} · ${esc(p.variant || "—")}</span></td>
              <td><span class="badge">${esc(categoryName(p.category))}</span></td>
              <td><span class="badge ${low ? "low" : "ok"}">${p.stock}</span></td>
              <td>${money(p.costPrice)}</td>
              <td>${money(p.price)}</td>
              <td class="row-actions">
                <button class="btn secondary" data-edit="${p.id}">Sửa</button>
                <button class="btn danger" data-del="${p.id}">Xóa</button>
              </td>
            </tr>`;
          })
          .join("")}
        </tbody></table>`
        : `<div class="card empty">Chưa có sản phẩm.</div>`
    }
  `;

  document.getElementById("inv-q").oninput = renderInventory;
  document.getElementById("inv-cat").onchange = renderInventory;
  document.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => productForm(b.dataset.edit);
  });
  document.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = () => deleteProduct(b.dataset.del);
  });
}

function productForm(id) {
  if (!state.categories.length) {
    toast("Thêm nhóm hàng trước");
    categoryManager();
    return;
  }
  const p = id ? productById(id) : {
    sku: "",
    name: "",
    brand: "",
    category: state.categories[0].id,
    variant: "",
    stock: 0,
    minStock: 3,
    costPrice: 0,
    price: 0,
  };
  openModal(id ? "Sửa sản phẩm" : "Thêm sản phẩm", `
    <form id="product-form" class="form-grid">
      <label>SKU<input name="sku" required value="${esc(p.sku || "")}" /></label>
      <label>Nhóm
        <select name="category" required>
          ${state.categories.length ? categoryOptions(p.category) : `<option value="">Chưa có nhóm</option>`}
        </select>
      </label>
      <label class="full">Tên sản phẩm<input name="name" required value="${esc(p.name || "")}" /></label>
      <label>Thương hiệu<input name="brand" value="${esc(p.brand || "")}" /></label>
      <label>Size / dung tích<input name="variant" value="${esc(p.variant || "")}" placeholder="M / 170ml" /></label>
      <label>Tồn kho<input name="stock" type="number" min="0" value="${p.stock || 0}" /></label>
      <label>Ngưỡng cảnh báo<input name="minStock" type="number" min="0" value="${p.minStock || 0}" /></label>
      <label>Giá gốc (đ)<input name="costPrice" type="number" min="0" value="${p.costPrice || 0}" /></label>
      <label>Giá bán (đ)<input name="price" type="number" min="0" value="${p.price || 0}" /></label>
      <div class="form-actions full">
        <button type="button" class="btn secondary" id="cancel-modal">Hủy</button>
        <button class="btn" type="submit">Lưu</button>
      </div>
    </form>
  `);
  document.getElementById("cancel-modal").onclick = closeModal;
  document.getElementById("product-form").onsubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    data.stock = Number(data.stock);
    data.minStock = Number(data.minStock);
    data.costPrice = Number(data.costPrice);
    data.price = Number(data.price);
    if (id) {
      Object.assign(productById(id), data);
      toast("Đã cập nhật sản phẩm");
    } else {
      state.products.unshift({ id: uid("p"), ...data });
      toast("Đã thêm sản phẩm");
    }
    save();
    closeModal();
    render();
  };
}

function categoryManager() {
  const rows = state.categories
    .map((c) => {
      const count = state.products.filter((p) => p.category === c.id).length;
      return `<tr>
        <td><strong>${esc(c.name)}</strong></td>
        <td>${count} SP</td>
        <td class="row-actions">
          <button class="btn secondary" type="button" data-cat-edit="${esc(c.id)}">Sửa</button>
          <button class="btn danger" type="button" data-cat-del="${esc(c.id)}">Xóa</button>
        </td>
      </tr>`;
    })
    .join("");

  openModal("Quản lý nhóm", `
    <form id="cat-add" class="toolbar">
      <input name="name" class="search" required maxlength="40" placeholder="Tên nhóm mới..." />
      <button class="btn sakura" type="submit">Thêm nhóm</button>
    </form>
    ${
      state.categories.length
        ? `<table><thead><tr><th>Nhóm</th><th>Sản phẩm</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="empty">Chưa có nhóm.</div>`
    }
  `);

  document.getElementById("cat-add").onsubmit = (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get("name").trim();
    if (!name) return;
    if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      toast("Nhóm này đã có");
      return;
    }
    state.categories.push({ id: uid("c"), name });
    save();
    toast("Đã thêm nhóm");
    categoryManager();
  };
  document.querySelectorAll("[data-cat-edit]").forEach((b) => {
    b.onclick = () => categoryEdit(b.dataset.catEdit);
  });
  document.querySelectorAll("[data-cat-del]").forEach((b) => {
    b.onclick = () => categoryDelete(b.dataset.catDel);
  });
}

function categoryEdit(id) {
  const c = categoryById(id);
  if (!c) return;
  openModal("Sửa nhóm", `
    <form id="cat-edit" class="form-grid">
      <label class="full">Tên nhóm<input name="name" required maxlength="40" value="${esc(c.name)}" /></label>
      <div class="form-actions full">
        <button type="button" class="btn secondary" id="back-cats">Quay lại</button>
        <button class="btn" type="submit">Lưu</button>
      </div>
    </form>
  `);
  document.getElementById("back-cats").onclick = () => categoryManager();
  document.getElementById("cat-edit").onsubmit = (e) => {
    e.preventDefault();
    const name = new FormData(e.target).get("name").trim();
    if (!name) return;
    c.name = name;
    save();
    toast("Đã sửa nhóm");
    categoryManager();
  };
}

function categoryDelete(id) {
  const c = categoryById(id);
  if (!c) return;
  const used = state.products.filter((p) => p.category === id);
  const others = state.categories.filter((x) => x.id !== id);

  if (!used.length) {
    if (!confirm(`Xóa nhóm "${c.name}"?`)) return;
    state.categories = others;
    save();
    toast("Đã xóa nhóm");
    categoryManager();
    return;
  }

  openModal("Xóa nhóm " + c.name, `
    <p>${used.length} sản phẩm đang thuộc nhóm này. Chọn nhóm chuyển sang rồi xóa.</p>
    <form id="cat-move" class="form-grid">
      <label class="full">Chuyển sang
        <select name="to">${others.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select>
      </label>
      <div class="form-actions full">
        <button type="button" class="btn secondary" id="back-cats">Hủy</button>
        <button class="btn danger" type="submit">Chuyển & xóa nhóm</button>
      </div>
    </form>
  `);
  document.getElementById("back-cats").onclick = () => categoryManager();
  document.getElementById("cat-move").onsubmit = (e) => {
    e.preventDefault();
    const to = new FormData(e.target).get("to");
    used.forEach((p) => { p.category = to; });
    state.categories = others;
    save();
    toast("Đã chuyển sản phẩm và xóa nhóm");
    categoryManager();
  };
}

function deleteProduct(id) {
  if (!confirm("Xóa sản phẩm này khỏi kho?")) return;
  state.products = state.products.filter((p) => p.id !== id);
  save();
  toast("Đã xóa sản phẩm");
  render();
}

function renderOrders() {
  const q = (document.getElementById("ord-q")?.value || "").toLowerCase();
  const st = document.getElementById("ord-st")?.value || "";
  const rows = [...state.orders]
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((o) => {
      const matchQ = [o.code, o.customerName, o.customerPhone].join(" ").toLowerCase().includes(q);
      return matchQ && (!st || o.status === st);
    });

  document.getElementById("view-orders").innerHTML = `
    <div class="toolbar">
      <input id="ord-q" class="search" placeholder="Tìm mã đơn, khách, SĐT..." value="${q}" />
      <select id="ord-st">
        <option value="">Mọi trạng thái</option>
        ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${st === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
    </div>
    ${
      rows.length
        ? `<table><thead><tr>
          <th>Mã</th><th>Khách</th><th>Món</th><th>Tổng</th><th>Trạng thái</th><th></th>
        </tr></thead><tbody>
        ${rows.map((o) => {
          const count = o.items.reduce((s, i) => s + i.qty, 0);
          return `<tr>
            <td>${o.code}</td>
            <td><strong>${o.customerName}</strong><br><span style="color:var(--muted)">${o.customerPhone || ""}</span></td>
            <td>${count} sp</td>
            <td>${money(o.total)}</td>
            <td><span class="badge status-${o.status}">${STATUSES[o.status]}</span></td>
            <td class="row-actions"><button class="btn secondary" data-view-order="${o.id}">Chi tiết</button></td>
          </tr>`;
        }).join("")}
        </tbody></table>`
        : `<div class="card empty">Chưa có đơn hàng.</div>`
    }
  `;
  document.getElementById("ord-q").oninput = renderOrders;
  document.getElementById("ord-st").onchange = renderOrders;
  document.querySelectorAll("[data-view-order]").forEach((b) => {
    b.onclick = () => orderDetail(b.dataset.viewOrder);
  });
}

function orderForm() {
  const sellable = state.products.filter((p) => p.stock > 0);
  if (!sellable.length) {
    toast("Kho trống — thêm sản phẩm trước");
    return;
  }
  openModal("Tạo đơn hàng", `
    <form id="order-form" class="stack">
      <div class="form-grid">
        <label>Tên khách<input name="customerName" required placeholder="Nguyễn A" /></label>
        <label>Số điện thoại<input name="customerPhone" placeholder="09..." /></label>
        <label class="full">Ghi chú<textarea name="note" rows="2"></textarea></label>
      </div>
      <h3 style="margin:16px 0 8px">Sản phẩm</h3>
      <div id="lines" class="order-lines"></div>
      <button type="button" class="btn secondary" id="add-line">Thêm dòng</button>
      <div class="form-actions">
        <button type="button" class="btn secondary" id="cancel-modal">Hủy</button>
        <button class="btn" type="submit">Tạo đơn & trừ kho</button>
      </div>
    </form>
  `);
  document.getElementById("cancel-modal").onclick = closeModal;
  document.getElementById("add-line").onclick = () => addLine();
  addLine();
  document.getElementById("order-form").onsubmit = submitOrder;
}

function productOptions() {
  return state.products.map((p) => `<option value="${p.id}">${p.sku} — ${p.name} (tồn ${p.stock})</option>`).join("");
}

function addLine() {
  const wrap = document.getElementById("lines");
  const row = document.createElement("div");
  row.className = "line";
  row.innerHTML = `
    <select name="pid">${productOptions()}</select>
    <input name="qty" type="number" min="1" value="1" />
    <button type="button" class="btn danger rm">X</button>
  `;
  row.querySelector(".rm").onclick = () => row.remove();
  wrap.appendChild(row);
}

function submitOrder(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const lines = [...document.querySelectorAll("#lines .line")];
  if (!lines.length) return toast("Thêm ít nhất 1 sản phẩm");

  const items = [];
  for (const line of lines) {
    const pid = line.querySelector("[name=pid]").value;
    const qty = Number(line.querySelector("[name=qty]").value);
    const p = productById(pid);
    if (!p || qty < 1 || qty > p.stock) return toast("Số lượng không hợp lệ hoặc vượt tồn kho");
    items.push({ productId: p.id, name: p.name, sku: p.sku, qty, price: p.price });
  }

  items.forEach(i => { productById(i.productId).stock -= i.qty; });

  const order = {
    id: uid("o"),
    code: "DH" + String(state.orders.length + 1).padStart(4, "0"),
    customerName: fd.get("customerName"),
    customerPhone: fd.get("customerPhone"),
    note: fd.get("note"),
    items,
    status: "new",
    total: items.reduce((s, i) => s + i.qty * i.price, 0),
    createdAt: Date.now(),
  };
  state.orders.unshift(order);
  save();
  closeModal();
  toast("Đã tạo " + order.code);
  setView("orders");
}

function orderDetail(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  openModal("Đơn " + o.code, `
    <p><strong>${o.customerName}</strong> · ${o.customerPhone || "—"}</p>
    <table><thead><tr><th>SP</th><th>SL</th><th>Giá</th></tr></thead>
    <tbody>${o.items.map((i) => `<tr><td>${i.sku}${i.name}</td><td>${i.qty}</td><td>${money(i.qty * i.price)}</td></tr>`).join("")}</tbody></table>
    <p style="margin-top:12px"><strong>Tổng: ${money(o.total)}</strong></p>
    <label>Trạng thái
      <select id="st-change" ${o.status === "cancelled" ? "disabled" : ""}>
        ${Object.entries(STATUSES).filter(([k]) => k !== "cancelled").map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
    </label>
    <div class="form-actions">
      ${o.status !== "cancelled" && o.status !== "done" ? `<button class="btn danger" id="cancel-order">Hủy đơn (hoàn kho)</button>` : ""}
      <button class="btn" id="save-st">Lưu trạng thái</button>
    </div>
  `);
  document.getElementById("save-st").onclick = () => {
    o.status = document.getElementById("st-change").value;
    save();
    closeModal();
    render();
  };
  const cancelBtn = document.getElementById("cancel-order");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (!confirm("Hủy đơn và hoàn kho?")) return;
      o.items.forEach((i) => { const p = productById(i.productId); if (p) p.stock += i.qty; });
      o.status = "cancelled";
      save();
      closeModal();
      render();
    };
  }
}

// === TÍNH NĂNG XUẤT / NHẬP RIÊNG BIỆT 2 FILE (STORE & ORDERS) ===
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Đã tải xuống " + filename);
}

function exportStoreData() {
  const storeData = {
    categories: state.categories,
    products: state.products
  };
  downloadJSON(storeData, "store_data.json");
}

function exportOrderData() {
  const orderData = {
    orders: state.orders
  };
  downloadJSON(orderData, "order_data.json");
}

function importDualFiles(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  let loadedStore = null;
  let loadedOrders = null;
  let processedCount = 0;

  Array.from(files).forEach((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (parsed.products || parsed.categories) {
          loadedStore = parsed;
        } else if (parsed.orders) {
          loadedOrders = parsed;
        }
      } catch (err) {
        console.error("Lỗi đọc file JSON:", err);
      }

      processedCount++;
      if (processedCount === files.length) {
        if (!loadedStore && !loadedOrders) {
          toast("Không nhận diện được định dạng file dữ liệu hợp lệ!");
          return;
        }

        if (loadedStore) {
          if (loadedStore.products) state.products = loadedStore.products;
          if (loadedStore.categories) state.categories = loadedStore.categories;
        }
        if (loadedOrders) {
          if (loadedOrders.orders) state.orders = loadedOrders.orders;
        }

        state = normalizeState(state);
        save();
        toast("Đã nhập thành công dữ liệu từ các file tải lên!");
        render();
      }
    };
    reader.readAsText(file);
  });

  event.target.value = "";
}

// Khởi chạy hệ thống
loadData();

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.onclick = () => setView(btn.dataset.view);
});
document.getElementById("modal-close").onclick = closeModal;
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

// Gắn sự kiện cho các nút Xuất / Nhập backup 2 file nếu giao diện của bạn có sẵn các ID tương ứng
document.getElementById("btn-export-store")?.addEventListener("click", exportStoreData);
document.getElementById("btn-export-orders")?.addEventListener("click", exportOrderData);
document.getElementById("input-import-dual")?.addEventListener("change", importDualFiles);