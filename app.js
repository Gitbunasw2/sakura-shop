const STORAGE_KEY = "sakura-shop-v1";

const CATEGORIES = {
  clothes: "Quần áo",
  cosmetics: "Mỹ phẩm",
};

const STATUSES = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao",
  done: "Hoàn thành",
  cancelled: "Đã hủy",
};

const seed = {
  products: [
    {
      id: "p1",
      sku: "QA-001",
      name: "Áo cotton MUJI",
      brand: "MUJI",
      category: "clothes",
      variant: "M / trắng",
      stock: 12,
      minStock: 4,
      price: 390000,
    },
    {
      id: "p2",
      sku: "QA-002",
      name: "Quần linen Uniqlo",
      brand: "Uniqlo",
      category: "clothes",
      variant: "S / be",
      stock: 3,
      minStock: 3,
      price: 590000,
    },
    {
      id: "p3",
      sku: "MP-001",
      name: "Hada Labo Gokujyun Lotion",
      brand: "Hada Labo",
      category: "cosmetics",
      variant: "170ml",
      stock: 20,
      minStock: 6,
      price: 245000,
    },
    {
      id: "p4",
      sku: "MP-002",
      name: "Senka Perfect Whip",
      brand: "Shiseido",
      category: "cosmetics",
      variant: "120g",
      stock: 2,
      minStock: 5,
      price: 129000,
    },
  ],
  orders: [],
};

let state = load();
let currentView = "dashboard";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(seed);
    const parsed = JSON.parse(raw);
    return {
      products: parsed.products || [],
      orders: parsed.orders || [],
    };
  } catch {
    return structuredClone(seed);
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid(prefix) {
  return prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

function money(n) {
  return new Intl.NumberFormat("vi-VN").format(n || 0) + " đ";
}

function toast(msg) {
  const el = document.getElementById("toast");
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
}

function productById(id) {
  return state.products.find((p) => p.id === id);
}

function render() {
  const actions = document.getElementById("top-actions");
  if (currentView === "inventory") {
    actions.innerHTML = `<button class="btn sakura" id="add-product">Thêm sản phẩm</button>`;
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
        <option value="clothes" ${cat === "clothes" ? "selected" : ""}>Quần áo</option>
        <option value="cosmetics" ${cat === "cosmetics" ? "selected" : ""}>Mỹ phẩm</option>
      </select>
    </div>
    ${
      rows.length
        ? `<table><thead><tr>
          <th>SKU</th><th>Sản phẩm</th><th>Nhóm</th><th>Tồn</th><th>Giá bán</th><th></th>
        </tr></thead><tbody>
        ${rows
          .map((p) => {
            const low = p.stock <= p.minStock;
            return `<tr>
              <td>${p.sku}</td>
              <td><strong>${p.name}</strong><br><span style="color:var(--muted)">${p.brand} · ${p.variant || "—"}</span></td>
              <td><span class="badge">${CATEGORIES[p.category] || p.category}</span></td>
              <td><span class="badge ${low ? "low" : "ok"}">${p.stock}</span></td>
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
  const p = id ? productById(id) : {
    sku: "",
    name: "",
    brand: "",
    category: "clothes",
    variant: "",
    stock: 0,
    minStock: 3,
    price: 0,
  };
  openModal(id ? "Sửa sản phẩm" : "Thêm sản phẩm", `
    <form id="product-form" class="form-grid">
      <label>SKU<input name="sku" required value="${p.sku || ""}" /></label>
      <label>Nhóm
        <select name="category">
          <option value="clothes" ${p.category === "clothes" ? "selected" : ""}>Quần áo</option>
          <option value="cosmetics" ${p.category === "cosmetics" ? "selected" : ""}>Mỹ phẩm</option>
        </select>
      </label>
      <label class="full">Tên sản phẩm<input name="name" required value="${p.name || ""}" /></label>
      <label>Thương hiệu<input name="brand" value="${p.brand || ""}" /></label>
      <label>Size / dung tích<input name="variant" value="${p.variant || ""}" placeholder="M / 170ml" /></label>
      <label>Tồn kho<input name="stock" type="number" min="0" value="${p.stock || 0}" /></label>
      <label>Ngưỡng cảnh báo<input name="minStock" type="number" min="0" value="${p.minStock || 0}" /></label>
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
        ${Object.entries(STATUSES)
          .map(([k, v]) => `<option value="${k}" ${st === k ? "selected" : ""}>${v}</option>`)
          .join("")}
      </select>
    </div>
    ${
      rows.length
        ? `<table><thead><tr>
          <th>Mã</th><th>Khách</th><th>Món</th><th>Tổng</th><th>Trạng thái</th><th></th>
        </tr></thead><tbody>
        ${rows
          .map((o) => {
            const count = o.items.reduce((s, i) => s + i.qty, 0);
            return `<tr>
              <td>${o.code}</td>
              <td><strong>${o.customerName}</strong><br><span style="color:var(--muted)">${o.customerPhone || ""}</span></td>
              <td>${count} sp</td>
              <td>${money(o.total)}</td>
              <td><span class="badge status-${o.status}">${STATUSES[o.status]}</span></td>
              <td class="row-actions">
                <button class="btn secondary" data-view-order="${o.id}">Chi tiết</button>
              </td>
            </tr>`;
          })
          .join("")}
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
  return state.products
    .map((p) => `<option value="${p.id}">${p.sku} — ${p.name} (tồn ${p.stock})</option>`)
    .join("");
}

function addLine() {
  const wrap = document.getElementById("lines");
  const row = document.createElement("div");
  row.className = "line";
  row.innerHTML = `
    <select name="pid">${productOptions()}</select>
    <input name="qty" type="number" min="1" value="1" />
    <span class="muted-price"></span>
    <button type="button" class="btn danger rm">X</button>
  `;
  row.querySelector(".rm").onclick = () => row.remove();
  wrap.appendChild(row);
}

function submitOrder(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const lines = [...document.querySelectorAll("#lines .line")];
  if (!lines.length) {
    toast("Thêm ít nhất 1 sản phẩm");
    return;
  }

  const items = [];
  for (const line of lines) {
    const pid = line.querySelector("[name=pid]").value;
    const qty = Number(line.querySelector("[name=qty]").value);
    const p = productById(pid);
    if (!p || qty < 1) {
      toast("Dòng hàng không hợp lệ");
      return;
    }
    if (qty > p.stock) {
      toast(`${p.name} chỉ còn ${p.stock}`);
      return;
    }
    items.push({ productId: p.id, name: p.name, sku: p.sku, qty, price: p.price });
  }

  for (const item of items) {
    productById(item.productId).stock -= item.qty;
  }

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
  const canCancel = o.status !== "cancelled" && o.status !== "done";
  openModal("Đơn " + o.code, `
    <p><strong>${o.customerName}</strong> · ${o.customerPhone || "—"}</p>
    <p style="color:var(--muted)">${o.note || ""}</p>
    <table><thead><tr><th>SP</th><th>SL</th><th>Giá</th></tr></thead>
    <tbody>
      ${o.items
        .map((i) => `<tr><td>${i.sku} ${i.name}</td><td>${i.qty}</td><td>${money(i.qty * i.price)}</td></tr>`)
        .join("")}
    </tbody></table>
    <p style="margin-top:12px"><strong>Tổng: ${money(o.total)}</strong></p>
    <label>Trạng thái
      <select id="st-change" ${o.status === "cancelled" ? "disabled" : ""}>
        ${Object.entries(STATUSES)
          .filter(([k]) => k !== "cancelled")
          .map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`)
          .join("")}
      </select>
    </label>
    <div class="form-actions">
      ${canCancel ? `<button class="btn danger" id="cancel-order">Hủy đơn (hoàn kho)</button>` : ""}
      <button class="btn" id="save-st">Lưu trạng thái</button>
    </div>
  `);
  document.getElementById("save-st").onclick = () => {
    if (o.status === "cancelled") return;
    o.status = document.getElementById("st-change").value;
    save();
    closeModal();
    toast("Đã cập nhật trạng thái");
    render();
  };
  const cancelBtn = document.getElementById("cancel-order");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      if (!confirm("Hủy đơn và hoàn kho?")) return;
      o.items.forEach((i) => {
        const p = productById(i.productId);
        if (p) p.stock += i.qty;
      });
      o.status = "cancelled";
      save();
      closeModal();
      toast("Đã hủy đơn, hoàn kho");
      render();
    };
  }
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sakura-shop-backup.json";
  a.click();
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.products) || !Array.isArray(parsed.orders)) throw new Error("bad");
      state = { products: parsed.products, orders: parsed.orders };
      save();
      toast("Đã nhập backup");
      render();
    } catch {
      toast("File backup không hợp lệ");
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.onclick = () => setView(btn.dataset.view);
});
document.getElementById("modal-close").onclick = closeModal;
document.getElementById("modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.getElementById("btn-export").onclick = exportBackup;
document.getElementById("input-import").onchange = (e) => {
  const file = e.target.files[0];
  if (file) importBackup(file);
  e.target.value = "";
};

render();
