const STORAGE_KEY = "sakura-shop-v3";

const STATUSES = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  pending_payment: "Chờ thanh toán",
  deposited: "Đã cọc",
  paid: "Đã thanh toán đủ",
  shipping: "Đang giao",
  done: "Hoàn thành",
  cancelled: "Đã hủy",
};

let state = { products: [], orders: [], categories: [], contributions: [] };
let currentView = "dashboard";
let inventorySearchQuery = "";

// Tải dữ liệu: ưu tiên localStorage để dữ liệu mới không bị mất khi reload
async function loadData() {
  const rawLocal = localStorage.getItem(STORAGE_KEY);
  if (rawLocal) {
    try {
      state = normalizeState(JSON.parse(rawLocal));
      render();
      return;
    } catch (err) {
      console.error("Lỗi khi đọc localStorage:", err);
      localStorage.removeItem(STORAGE_KEY);
    }
  }

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
      orders: orderData.orders || [],
      contributions: orderData.contributions || []
    });

    save();
  } catch (err) {
    console.error("Lỗi khi tải file JSON:", err);
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
  const contributions = Array.isArray(parsed.contributions) ? parsed.contributions : [];
  let categories = Array.isArray(parsed.categories) ? parsed.categories.filter((c) => c && c.id && c.name) : [];
  const known = new Set(categories.map((c) => c.id));
  
  products.forEach((p) => {
    if (p.category && !known.has(p.category)) {
      categories.push({ id: p.category, name: p.category });
      known.add(p.category);
    }
    if (p.costPrice === undefined) p.costPrice = 0;
    if (p.costPriceJpy === undefined) p.costPriceJpy = Number(Math.round((p.costPrice || 0) / 180));
    if (p.weight === undefined) p.weight = 0;
    if (p.shippingFee === undefined) p.shippingFee = 0;
    if (p.packagingFee === undefined) p.packagingFee = 0;
    if (p.sourceUrl === undefined) p.sourceUrl = "";
    if (!p.color && typeof p.variant === "string" && p.variant.includes("/")) {
      const [size, ...colorParts] = p.variant.split("/");
      p.variant = size.trim();
      p.color = colorParts.join("/").trim();
    }
    if (p.color === undefined) p.color = "";
  });
  const productsById = new Map(products.map((product) => [product.id, product]));
  orders.forEach((o) => {
    if (o.depositAmount === undefined) o.depositAmount = 0;
    if (o.shippingPayer === undefined) o.shippingPayer = "shop";
    if (o.customerAddress === undefined) o.customerAddress = "";
    if (o.shippingCarrier === undefined) o.shippingCarrier = "";
    if (o.trackingNumber === undefined) o.trackingNumber = "";
    (o.items || []).forEach((item) => {
      const product = productsById.get(item.productId);
      if (item.costPrice === undefined) item.costPrice = Number(product?.costPrice) || 0;
      if (item.productShippingFee === undefined) item.productShippingFee = Number(product?.shippingFee) || 0;
      if (item.packagingFee === undefined) item.packagingFee = Number(product?.packagingFee) || 0;
    });
  });
  contributions.forEach((contribution) => {
    if (contribution.amountVnd === undefined) {
      contribution.amountVnd = Number(contribution.amount || 0);
    }
  });
  return { products, orders, categories, contributions };
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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
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

function moneyJpy(n) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(n || 0);
}

function orderProfit(order) {
  const productProfit = order.items.reduce((sum, item) => {
    const unitProfit = Number(item.price || 0)
      - Number(item.costPrice || 0)
      - Number(item.productShippingFee || 0)
      - Number(item.packagingFee || 0);
    return sum + unitProfit * Number(item.qty || 0);
  }, 0);
  const shopShippingCost = order.shippingPayer === "customer" ? 0 : Number(order.shippingFee || 0);
  return productProfit - shopShippingCost;
}

function orderAmountDue(order) {
  if (order.status === "cancelled") return 0;
  const paidAmount = ["paid", "done"].includes(order.status)
    ? order.total
    : Number(order.depositAmount || 0);
  return Math.max(0, Number(order.total || 0) - paidAmount);
}

function dateInputValue(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatOrderDate(timestamp) {
  return new Intl.DateTimeFormat("vi-VN").format(new Date(timestamp));
}

function orderMatchesPeriod(order, period, selectedDate) {
  const [year, month, day] = selectedDate.split("-").map(Number);
  const referenceDate = new Date(year, month - 1, day);
  const orderDate = new Date(order.createdAt);
  if (Number.isNaN(referenceDate.getTime()) || Number.isNaN(orderDate.getTime())) return false;

  if (period === "day") return dateInputValue(order.createdAt) === selectedDate;
  if (period === "month") {
    return orderDate.getFullYear() === year && orderDate.getMonth() === month - 1;
  }
  if (period === "year") return orderDate.getFullYear() === year;

  referenceDate.setDate(referenceDate.getDate() - ((referenceDate.getDay() + 6) % 7));
  const weekEnd = new Date(referenceDate);
  weekEnd.setDate(weekEnd.getDate() + 7);
  orderDate.setHours(0, 0, 0, 0);
  return orderDate >= referenceDate && orderDate < weekEnd;
}

async function fetchInternetDate() {
  const response = await fetch("https://worldtimeapi.org/api/timezone/Asia/Ho_Chi_Minh", {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("Không lấy được ngày từ internet");
  const data = await response.json();
  const date = String(data.datetime || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Ngày internet không hợp lệ");
  return date;
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
  document.getElementById("view-contributions").classList.toggle("hidden", view !== "contributions");
  const titles = { dashboard: "Tổng quan", inventory: "Kho hàng", orders: "Đơn hàng", contributions: "Góp vốn" };
  document.getElementById("page-title").textContent = titles[view];
  render();
}

function openModal(title, html) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = html;
  document.querySelector("#modal .modal-card").classList.toggle("wide", title.startsWith("Tạo đơn hàng") || title.startsWith("Sửa đơn "));
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
  } else if (currentView === "contributions") {
    actions.innerHTML = `<button class="btn sakura" id="add-contribution">Thêm khoản góp vốn</button>`;
    document.getElementById("add-contribution").onclick = () => contributionForm();
    renderContributions();
  } else {
    actions.innerHTML = `<button class="btn sakura" id="quick-order">Tạo đơn nhanh</button>`;
    document.getElementById("quick-order").onclick = () => orderForm();
    renderDashboard();
  }
}

function renderDashboard() {
  const period = document.getElementById("profit-period")?.value || "year";
  const todayValue = dateInputValue(Date.now());
  const referenceDate = document.getElementById("profit-date")?.value || todayValue;
  const currentYear = new Date().getFullYear();
  const selectedYear = Number(document.getElementById("profit-year")?.value)
    || Number(referenceDate.slice(0, 4))
    || currentYear;
  const selectedMonth = Number(document.getElementById("profit-month")?.value)
    || Number(referenceDate.slice(5, 7))
    || new Date().getMonth() + 1;
  const selectedDate = period === "year"
    ? `${selectedYear}-01-01`
    : period === "month"
      ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`
      : referenceDate;
  const availableYears = [...new Set([
    currentYear,
    selectedYear,
    ...state.orders.map((order) => new Date(order.createdAt).getFullYear()).filter(Number.isFinite),
    ...state.contributions.map((contribution) => new Date(`${contribution.date}T12:00:00`).getFullYear()).filter(Number.isFinite),
  ])].sort((a, b) => b - a);
  const low = state.products.filter((p) => p.stock <= p.minStock);
  const sku = state.products.length;
  const units = state.products.reduce((s, p) => s + Number(p.stock), 0);
  const inventoryValue = state.products.reduce((sum, product) => {
    const unitCost = Number(product.costPrice || 0)
      + Number(product.shippingFee || 0)
      + Number(product.packagingFee || 0);
    return sum + Number(product.stock || 0) * unitCost;
  }, 0);
  const periodContributions = state.contributions.filter((contribution) => {
    const createdAt = new Date(`${contribution.date}T12:00:00`).getTime();
    return Number.isFinite(createdAt) && orderMatchesPeriod({ createdAt }, period, selectedDate);
  });
  const contributionTotals = new Map();
  periodContributions.forEach((contribution) => {
    const name = String(contribution.contributor || "").trim();
    const key = normalizeText(name);
    if (!key) return;
    const existing = contributionTotals.get(key) || { name, amount: 0 };
    existing.amount += Number(contribution.amountVnd || 0);
    contributionTotals.set(key, existing);
  });
  const totalContributions = [...contributionTotals.values()].reduce((sum, item) => sum + item.amount, 0);
  const contributorTotals = [...contributionTotals.values()].sort((a, b) => b.amount - a.amount);
  const periodOrders = state.orders.filter((order) =>
    order.status !== "cancelled" && (period === "year" || orderMatchesPeriod(order, period, selectedDate))
  );
  const openOrders = periodOrders.filter((order) => order.status !== "done").length;
  const revenue = periodOrders.reduce((sum, order) => sum + order.total, 0);
  const profit = periodOrders
    .reduce((sum, order) => sum + orderProfit(order), 0);
  const periodLabels = { day: "ngày", week: "tuần", month: "tháng", year: "năm" };
  const periodName = period === "year"
    ? String(selectedYear)
    : period === "month"
      ? `${String(selectedMonth).padStart(2, "0")}/${selectedYear}`
      : periodLabels[period];
  const profitLabel = `Lợi nhuận (${periodName})`;
  const filteredPeriodLabel = `${periodName}, chưa hủy`;
  const openOrdersLabel = `Đơn đang xử lý (${periodName})`;

  document.getElementById("view-dashboard").innerHTML = `
    <div class="toolbar dashboard-filters">
      <label>Kỳ thống kê
        <select id="profit-period">
          <option value="day" ${period === "day" ? "selected" : ""}>Ngày</option>
          <option value="week" ${period === "week" ? "selected" : ""}>Tuần</option>
          <option value="month" ${period === "month" ? "selected" : ""}>Tháng</option>
          <option value="year" ${period === "year" ? "selected" : ""}>Năm</option>
        </select>
      </label>
      ${period === "year" ? `
        <label>Năm
          <select id="profit-year">${availableYears.map((year) => `<option value="${year}" ${year === selectedYear ? "selected" : ""}>${year}</option>`).join("")}</select>
        </label>
      ` : period === "month" ? `
        <label>Năm
          <select id="profit-year">${availableYears.map((year) => `<option value="${year}" ${year === selectedYear ? "selected" : ""}>${year}</option>`).join("")}</select>
        </label>
        <label>Tháng
          <select id="profit-month">${Array.from({ length: 12 }, (_, index) => index + 1).map((month) => `<option value="${month}" ${month === selectedMonth ? "selected" : ""}>${month}</option>`).join("")}</select>
        </label>
      ` : `
        <label>Ngày mốc<input id="profit-date" type="date" value="${referenceDate}" /></label>
      `}
    </div>
    <div class="cards">
      <div class="card"><div class="label">Mã hàng</div><div class="value">${sku}</div></div>
      <div class="card"><div class="label">Tổng tồn</div><div class="value">${units}</div></div>
      <div class="card"><div class="label">Tổng giá trị kho hàng</div><div class="value" style="font-size:20px">${money(inventoryValue)}</div></div>
      <div class="card"><div class="label">Tổng góp vốn (${periodName})</div><div class="value" style="font-size:20px">${money(totalContributions)}</div></div>
      <div class="card"><div class="label">${openOrdersLabel}</div><div class="value">${openOrders}</div></div>
      <div class="card"><div class="label">Doanh thu (${filteredPeriodLabel})</div><div class="value" style="font-size:20px">${money(revenue)}</div></div>
      <div class="card"><div class="label">${profitLabel}</div><div class="value" style="font-size:20px">${money(profit)}</div></div>
    </div>
    <div class="dashboard-lists">
      <div class="card list-block">
        <h3>Góp vốn theo người (${periodName})</h3>
        ${contributorTotals.length
          ? `<div class="table-wrap"><table><thead><tr><th>Người góp</th><th>Tổng tiền góp</th><th>Tỷ lệ</th></tr></thead><tbody>
            ${contributorTotals.map((item) => {
              const share = totalContributions ? (item.amount / totalContributions) * 100 : 0;
              return `<tr><td><strong>${esc(item.name)}</strong></td><td>${money(item.amount)}</td><td>${share.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}%</td></tr>`;
            }).join("")}
          </tbody></table></div>`
          : `<div class="empty">Chưa có dữ liệu góp vốn.</div>`}
      </div>
      <div class="card list-block">
        <h3>Sắp hết hàng</h3>
        ${
          low.length
            ? `<table><thead><tr><th>SKU</th><th>Sản phẩm</th><th>Size</th><th>Màu sắc</th><th>Tồn</th><th>Ngưỡng</th></tr></thead><tbody>
            ${low
              .map(
                (p) =>
                  `<tr><td>${esc(p.sku)}</td><td>${esc(p.name)}</td><td>${esc(p.variant || "—")}</td><td>${esc(p.color || "—")}</td><td><span class="badge low">${p.stock}</span></td><td>${p.minStock}</td></tr>`
              )
              .join("")}
          </tbody></table>`
            : `<div class="empty">Chưa có sản phẩm dưới ngưỡng.</div>`
        }
      </div>
    </div>
  `;
  document.getElementById("profit-period").onchange = renderDashboard;
  document.getElementById("profit-year")?.addEventListener("change", renderDashboard);
  document.getElementById("profit-month")?.addEventListener("change", renderDashboard);
  document.getElementById("profit-date")?.addEventListener("change", renderDashboard);
}

function renderInventory() {
  const q = document.getElementById("inv-q")?.value ?? inventorySearchQuery;
  const searchValue = normalizeText(inventorySearchQuery);
  const cat = document.getElementById("inv-cat")?.value || "";
  const rows = state.products.filter((p) => {
    const haystack = [
      p.sku,
      p.name,
      p.brand,
      p.variant,
      p.color,
      categoryName(p.category),
    ].map((value) => normalizeText(value)).join(" ");
    const matchQ = !searchValue || haystack.includes(searchValue);
    const matchC = !cat || p.category === cat;
    return matchQ && matchC;
  });

  document.getElementById("view-inventory").innerHTML = `
    <form id="inventory-search-form" class="toolbar">
      <input id="inv-q" class="search" placeholder="Tìm SKU, tên, thương hiệu..." value="${esc(q)}" />
      <button class="btn secondary" type="submit">Tìm kiếm</button>
      <select id="inv-cat">
        <option value="">Tất cả nhóm</option>
        ${categoryOptions(cat)}
      </select>
    </form>
    ${
      rows.length
        ? `<div class="table-wrap"><table><thead><tr>
          <th>SKU</th><th>Sản phẩm</th><th>Link gốc</th><th>Size</th><th>Màu sắc</th><th>Nhóm</th><th>Tồn</th><th>Giá gốc JPY</th><th>Giá gốc VNĐ</th><th>Trọng lượng</th><th>Phí vận chuyển</th><th>Phí bao bì</th><th>Giá bán</th><th>Lợi nhuận</th><th></th>
        </tr></thead><tbody>
        ${rows
          .map((p) => {
            const low = p.stock <= p.minStock;
            const profit = Number(p.price || 0)
              - Number(p.costPrice || 0)
              - Number(p.shippingFee || 0)
              - Number(p.packagingFee || 0);
            return `<tr>
              <td>${esc(p.sku)}</td>
              <td><strong>${esc(p.name)}</strong></td>
              <td>${p.sourceUrl ? `<a href="${esc(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">Mở link</a>` : "—"}</td>
              <td>${esc(p.variant || "—")}</td>
              <td>${esc(p.color || "—")}</td>
              <td><span class="badge">${esc(categoryName(p.category))}</span></td>
              <td><span class="badge ${low ? "low" : "ok"}">${p.stock}</span></td>
              <td>${moneyJpy(p.costPriceJpy)}</td>
              <td>${money(p.costPrice)}</td>
              <td>${Number(p.weight || 0)} kg</td>
              <td>${money(p.shippingFee || 0)}</td>
              <td>${money(p.packagingFee || 0)}</td>
              <td><strong>${money(p.price)}</strong></td>
              <td><strong>${money(profit)}</strong></td>
              <td class="row-actions">
                <button class="btn secondary" data-edit="${p.id}">Sửa</button>
                <button class="btn danger" data-del="${p.id}">Xóa</button>
              </td>
            </tr>`;
          })
          .join("")}
        </tbody></table></div>`
        : `<div class="card empty">Chưa có sản phẩm.</div>`
    }
  `;

  document.getElementById("inventory-search-form").onsubmit = (event) => {
    event.preventDefault();
    inventorySearchQuery = document.getElementById("inv-q").value;
    renderInventory();
  };
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
    color: "",
    stock: 0,
    minStock: 3,
    costPrice: 0,
    costPriceJpy: 0,
    weight: 0,
    shippingFee: 0,
    packagingFee: 0,
    sourceUrl: "",
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
      <label class="full">Link sản phẩm gốc<input name="sourceUrl" type="url" value="${esc(p.sourceUrl || "")}" placeholder="https://..." /></label>
      <label>Brand<input name="brand" value="${esc(p.brand || "")}" /></label>
      <label>Size / dung tích<input name="variant" value="${esc(p.variant || "")}" placeholder="M / 170ml" /></label>
      <label>Màu sắc<input name="color" value="${esc(p.color || "")}" placeholder="Trắng / Đen" /></label>
      <label>Tồn kho<input name="stock" type="number" min="0" value="${p.stock || 0}" /></label>
      <label>Ngưỡng cảnh báo<input name="minStock" type="number" min="0" value="${p.minStock || 0}" /></label>
      <label>Giá gốc VNĐ<input name="costPrice" type="number" min="0" value="${p.costPrice || 0}" /></label>
      <label>Giá gốc JPY<input name="costPriceJpy" type="number" min="0" value="${p.costPriceJpy || 0}" /></label>
      <label>Trọng lượng (kg)<input name="weight" type="number" min="0" step="0.1" value="${p.weight || 0}" /></label>
      <label>Phí vận chuyển (đ)<input name="shippingFee" type="number" min="0" value="${p.shippingFee || 0}" /></label>
      <label>Phí bao bì (đ)<input name="packagingFee" type="number" min="0" value="${p.packagingFee || 0}" /></label>
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
    data.sku = data.sku.trim();
    const skuKey = data.sku.toLocaleUpperCase("vi-VN");
    const duplicateSku = state.products.some((product) =>
      product.id !== id && String(product.sku || "").trim().toLocaleUpperCase("vi-VN") === skuKey
    );
    if (duplicateSku) return toast("SKU này đã được sử dụng");
    data.stock = Number(data.stock);
    data.minStock = Number(data.minStock);
    data.costPrice = Number(data.costPrice);
    data.costPriceJpy = Number(data.costPriceJpy);
    data.weight = Number(data.weight);
    data.shippingFee = Number(data.shippingFee);
    data.packagingFee = Number(data.packagingFee);
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
          <th>Mã</th><th>Ngày tạo</th><th>Khách</th><th>Món</th><th>Tổng</th><th>Khách cần thanh toán</th><th>Lợi nhuận</th><th>Trạng thái</th><th></th>
        </tr></thead><tbody>
        ${rows.map((o) => {
          const count = o.items.reduce((s, i) => s + i.qty, 0);
          return `<tr>
            <td>${o.code}</td>
            <td>${formatOrderDate(o.createdAt)}</td>
            <td><strong>${o.customerName}</strong><br><span style="color:var(--muted)">${o.customerPhone || ""}</span></td>
            <td>${count} sp</td>
            <td>${money(o.total)}</td>
            <td><strong>${money(orderAmountDue(o))}</strong></td>
            <td><strong>${money(orderProfit(o))}</strong></td>
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

function renderContributions() {
  const contributions = [...state.contributions].sort((a, b) => b.date.localeCompare(a.date));
  const totalVnd = contributions.reduce((sum, contribution) => sum + Number(contribution.amountVnd || 0), 0);

  document.getElementById("view-contributions").innerHTML = `
    <div class="cards">
      <div class="card"><div class="label">Tổng góp tiền Việt</div><div class="value" style="font-size:20px">${money(totalVnd)}</div></div>
      <div class="card"><div class="label">Số lần góp</div><div class="value">${contributions.length}</div></div>
    </div>
    ${contributions.length
      ? `<div class="table-wrap"><table><thead><tr><th>Ngày góp vốn</th><th>Người góp</th><th>Số tiền (VNĐ)</th><th></th></tr></thead><tbody>
        ${contributions.map((contribution) => `<tr>
          <td>${formatOrderDate(new Date(`${contribution.date}T12:00:00`).getTime())}</td>
          <td><strong>${esc(contribution.contributor)}</strong></td>
          <td>${money(contribution.amountVnd)}</td>
          <td class="row-actions">
            <button class="btn secondary" data-contribution-edit="${esc(contribution.id)}">Sửa</button>
            <button class="btn danger" data-contribution-delete="${esc(contribution.id)}">Xóa</button>
          </td>
        </tr>`).join("")}
      </tbody></table></div>`
      : `<div class="card empty">Chưa có khoản góp vốn.</div>`}
  `;

  document.querySelectorAll("[data-contribution-edit]").forEach((button) => {
    button.onclick = () => contributionForm(button.dataset.contributionEdit);
  });
  document.querySelectorAll("[data-contribution-delete]").forEach((button) => {
    button.onclick = () => deleteContribution(button.dataset.contributionDelete);
  });
}

function contributionForm(id) {
  const contribution = id ? state.contributions.find((item) => item.id === id) : null;
  if (id && !contribution) return;

  openModal(id ? "Sửa khoản góp vốn" : "Thêm khoản góp vốn", `
    <form id="contribution-form" class="form-grid">
      <label>Ngày góp vốn<input name="date" type="date" required value="${contribution?.date || dateInputValue(Date.now())}" /></label>
      <label>Người góp<input name="contributor" required maxlength="100" value="${esc(contribution?.contributor || "")}" placeholder="Tên người góp vốn" /></label>
      <label class="full">Số tiền (VNĐ)<input name="amountVnd" type="number" min="1" step="1" required value="${contribution?.amountVnd || ""}" /></label>
      <div class="form-actions full">
        <button type="button" class="btn secondary" id="cancel-modal">Hủy</button>
        <button class="btn" type="submit">${id ? "Lưu thay đổi" : "Lưu khoản góp"}</button>
      </div>
    </form>
  `);

  document.getElementById("cancel-modal").onclick = closeModal;
  document.getElementById("contribution-form").onsubmit = (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target).entries());
    const amountVnd = Number(data.amountVnd) || 0;
    if (!Number.isFinite(amountVnd) || amountVnd <= 0) return toast("Số tiền góp phải lớn hơn 0");

    const record = {
      id: contribution?.id || uid("capital"),
      date: data.date,
      contributor: data.contributor.trim(),
      amountVnd,
    };
    if (contribution) Object.assign(contribution, record);
    else state.contributions.unshift(record);
    save();
    closeModal();
    toast(contribution ? "Đã cập nhật khoản góp vốn" : "Đã thêm khoản góp vốn");
    renderContributions();
  };
}

function deleteContribution(id) {
  const contribution = state.contributions.find((item) => item.id === id);
  if (!contribution || !confirm(`Xóa khoản góp vốn của ${contribution.contributor}?`)) return;
  state.contributions = state.contributions.filter((item) => item.id !== id);
  save();
  toast("Đã xóa khoản góp vốn");
  renderContributions();
}

function orderForm(orderId) {
  const existingOrder = orderId ? state.orders.find((order) => order.id === orderId) : null;
  if (orderId && !existingOrder) return;
  const sellable = state.products.filter((p) => p.stock > 0);
  if (!sellable.length && !existingOrder) {
    toast("Kho trống — thêm sản phẩm trước");
    return;
  }
  const availableStatuses = existingOrder
    ? ["new", "confirmed", "pending_payment", "deposited", "paid", "shipping", "done", "cancelled"]
    : ["new", "confirmed", "pending_payment", "deposited", "paid", "cancelled"];
  openModal(existingOrder ? "Sửa đơn " + existingOrder.code : "Tạo đơn hàng", `
    <form id="order-form" class="stack">
      <div class="form-grid">
        <label>Tên khách<input name="customerName" required placeholder="Nguyễn A" value="${esc(existingOrder?.customerName || "")}" /></label>
        <label>Số điện thoại<input name="customerPhone" placeholder="09..." value="${esc(existingOrder?.customerPhone || "")}" /></label>
        <label>Ngày tạo đơn<input name="createdDate" id="order-created-date" type="date" required value="${dateInputValue(existingOrder?.createdAt || Date.now())}" /></label>
        <small id="order-date-help" class="full">${existingOrder ? "Có thể chỉnh sửa ngày tạo." : "Đang lấy ngày hiện tại từ internet... Nếu không kết nối được, bạn có thể nhập ngày thủ công."}</small>
        <label class="full">Địa chỉ khách hàng<textarea name="customerAddress" rows="2" placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố">${esc(existingOrder?.customerAddress || "")}</textarea></label>
        <label>Đơn vị vận chuyển
          <select name="shippingCarrier">
            <option value="">Chưa chọn</option>
            ${["SPX", "J&T", "Viettel Post", "EMS"].map((carrier) => `<option value="${carrier}" ${existingOrder?.shippingCarrier === carrier ? "selected" : ""}>${carrier}</option>`).join("")}
          </select>
        </label>
        <label>Mã vận đơn<input name="trackingNumber" value="${esc(existingOrder?.trackingNumber || "")}" placeholder="Nhập mã vận đơn" /></label>
        <label>Phí vận chuyển (đ)<input name="shippingFee" id="order-shipping-fee" type="number" min="0" step="1" placeholder="0" value="${existingOrder?.shippingFee || ""}" /></label>
        <label class="shipping-payer-toggle full">
          <input id="shipping-paid-by-customer" name="shippingPaidByCustomer" type="checkbox" ${existingOrder?.shippingPayer === "customer" ? "checked" : ""} />
          <span class="shipping-payer-switch" aria-hidden="true"></span>
          <span id="shipping-payer-label">${existingOrder?.shippingPayer === "customer" ? "Khách hàng trả phí vận chuyển" : "Shop trả phí vận chuyển"}</span>
        </label>
        <label>Trạng thái
          <select name="status" id="new-order-status">
            ${availableStatuses.map((status) => `<option value="${status}" ${status === (existingOrder?.status || "new") ? "selected" : ""}>${STATUSES[status]}</option>`).join("")}
          </select>
        </label>
        <label id="new-deposit-field" class="${existingOrder?.status === "deposited" ? "" : "hidden"}">Tiền cọc (đ)
          <input name="depositAmount" id="new-deposit-amount" type="number" min="1" step="1" value="${existingOrder?.depositAmount || ""}" ${existingOrder?.status === "deposited" ? "required" : ""} />
        </label>
        <label class="full">Ghi chú<textarea name="note" rows="2">${esc(existingOrder?.note || "")}</textarea></label>
      </div>
      <h3 style="margin:16px 0 8px">Sản phẩm</h3>
      <div id="lines" class="order-lines"></div>
      <button type="button" class="btn secondary" id="add-line">Thêm sản phẩm</button>
      <div class="order-payment-summary">
        <p>Tổng đơn: <strong id="new-order-total">0 đ</strong></p>
        <p>Khách cần thanh toán: <strong id="new-order-amount-due">0 đ</strong></p>
      </div>
      <div class="form-actions">
        <button type="button" class="btn secondary" id="cancel-modal">Hủy</button>
        <button class="btn" type="submit">${existingOrder ? "Lưu thay đổi" : "Tạo đơn & trừ kho"}</button>
      </div>
    </form>
  `);
  document.getElementById("cancel-modal").onclick = closeModal;
  document.getElementById("add-line").onclick = () => addLine();
  const createdDateInput = document.getElementById("order-created-date");
  const dateHelp = document.getElementById("order-date-help");
  let dateEdited = false;
  createdDateInput.oninput = () => {
    dateEdited = true;
    dateHelp.textContent = "Ngày tạo đã được nhập thủ công.";
  };
  if (!existingOrder) {
    fetchInternetDate().then((date) => {
      if (!dateEdited && document.getElementById("order-created-date") === createdDateInput) {
        createdDateInput.value = date;
        dateHelp.textContent = "Đã lấy ngày hiện tại từ internet (múi giờ Việt Nam).";
      }
    }).catch(() => {
      if (document.getElementById("order-created-date") === createdDateInput) {
        dateHelp.textContent = "";
      }
    });
  }
  const statusSelect = document.getElementById("new-order-status");
  const depositField = document.getElementById("new-deposit-field");
  const depositInput = document.getElementById("new-deposit-amount");
  statusSelect.onchange = () => {
    const isDeposited = statusSelect.value === "deposited";
    depositField.classList.toggle("hidden", !isDeposited);
    depositInput.required = isDeposited;
    updateOrderPaymentSummary();
  };
  document.getElementById("order-shipping-fee").oninput = updateOrderPaymentSummary;
  const shippingPayerToggle = document.getElementById("shipping-paid-by-customer");
  shippingPayerToggle.onchange = () => {
    document.getElementById("shipping-payer-label").textContent = shippingPayerToggle.checked
      ? "Khách hàng trả phí vận chuyển"
      : "Shop trả phí vận chuyển";
    updateOrderPaymentSummary();
  };
  depositInput.oninput = updateOrderPaymentSummary;
  if (existingOrder) {
    existingOrder.items.forEach((item) => addLine(item.productId, item.qty));
  } else {
    addLine();
  }
  document.getElementById("order-form").onsubmit = (e) => submitOrder(e, orderId);
}

function productsForOrderSearch(query) {
  const searchValue = normalizeText(query);
  return state.products.filter((product) => {
    const searchableText = [product.sku, product.name, product.brand, product.variant, product.color]
      .map(normalizeText)
      .join(" ");
    return !searchValue || searchableText.includes(searchValue);
  });
}

function productOptionLabel(product) {
  const details = [product.variant, product.color].filter(Boolean).join(" / ");
  return `${product.sku} — ${product.name}${details ? ` (${details})` : ""}`;
}

function renderSelectedProductInfo(container, product) {
  if (!product) {
    container.innerHTML = "";
    container.classList.add("hidden");
    return;
  }
  const details = [product.variant, product.color].filter(Boolean).map(esc).join(" · ");
  container.innerHTML = `
    <strong>${esc(product.sku)} — ${esc(product.name)}</strong>
    <span>${details || "Không có thông tin size/màu"}</span>
    <span>Giá: ${money(product.price)} · Tồn kho: ${product.stock}</span>
  `;
  container.classList.remove("hidden");
}

function renderProductSuggestions(list, query, onSelect) {
  const matches = productsForOrderSearch(query);
  list.innerHTML = matches.length
    ? matches.map((product) => {
      const details = [product.variant, product.color].filter(Boolean).map(esc).join(" · ");
      return `<button type="button" class="product-suggestion" data-product-id="${esc(product.id)}">
        <span>${esc(product.sku)} — ${esc(product.name)}</span>
        <small>${details ? `${details} · ` : ""}${money(product.price)} · Tồn ${product.stock}</small>
      </button>`;
    }).join("")
    : `<div class="product-suggestion-empty">Không tìm thấy sản phẩm</div>`;
  list.classList.toggle("hidden", !query.trim());
  list.querySelectorAll("[data-product-id]").forEach((button) => {
    button.onmousedown = (event) => event.preventDefault();
    button.onclick = () => onSelect(productById(button.dataset.productId));
  });
}

function addLine(productId, quantity = 1) {
  const wrap = document.getElementById("lines");
  const row = document.createElement("div");
  const selectedProduct = productById(productId);
  row.className = "line";
  row.innerHTML = `
    <div class="product-picker">
      <input class="product-search" type="search" autocomplete="off" aria-autocomplete="list" aria-expanded="false" placeholder="Nhập SKU, tên, size hoặc màu để chọn..." value="${selectedProduct ? esc(productOptionLabel(selectedProduct)) : ""}" />
      <div class="product-suggestions hidden" role="listbox"></div>
      <div class="selected-product-info${selectedProduct ? "" : " hidden"}"></div>
      <input type="hidden" name="pid" value="${esc(selectedProduct?.id || "")}" />
    </div>
    <input name="qty" type="number" min="1" step="1" value="${quantity}" />
    <button type="button" class="btn danger rm">X</button>
  `;
  const searchInput = row.querySelector(".product-search");
  const productIdInput = row.querySelector("[name=pid]");
  const suggestions = row.querySelector(".product-suggestions");
  const selectedProductInfo = row.querySelector(".selected-product-info");
  renderSelectedProductInfo(selectedProductInfo, selectedProduct);
  const selectProduct = (product) => {
    searchInput.value = productOptionLabel(product);
    productIdInput.value = product.id;
    renderSelectedProductInfo(selectedProductInfo, product);
    suggestions.classList.add("hidden");
    searchInput.setAttribute("aria-expanded", "false");
    updateOrderPaymentSummary();
  };
  searchInput.oninput = () => {
    const selected = state.products.find((product) => productOptionLabel(product) === searchInput.value);
    productIdInput.value = selected?.id || "";
    renderSelectedProductInfo(selectedProductInfo, selected);
    renderProductSuggestions(suggestions, selected ? "" : searchInput.value, selectProduct);
    searchInput.setAttribute("aria-expanded", String(!selected && Boolean(searchInput.value.trim())));
    updateOrderPaymentSummary();
  };
  searchInput.onfocus = () => {
    if (searchInput.value.trim() && !productIdInput.value) {
      renderProductSuggestions(suggestions, searchInput.value, selectProduct);
      searchInput.setAttribute("aria-expanded", "true");
    }
  };
  searchInput.onblur = () => {
    setTimeout(() => {
      suggestions.classList.add("hidden");
      searchInput.setAttribute("aria-expanded", "false");
    }, 120);
  };
  searchInput.onkeydown = (event) => {
    if (event.key === "Enter" && !suggestions.classList.contains("hidden")) {
      const firstSuggestion = suggestions.querySelector("[data-product-id]");
      if (firstSuggestion) {
        event.preventDefault();
        firstSuggestion.click();
      }
    }
    if (event.key === "Escape") {
      suggestions.classList.add("hidden");
      searchInput.setAttribute("aria-expanded", "false");
    }
  };
  row.querySelector("[name=qty]").oninput = updateOrderPaymentSummary;
  row.querySelector(".rm").onclick = () => {
    row.remove();
    updateOrderPaymentSummary();
  };
  wrap.appendChild(row);
  updateOrderPaymentSummary();
}

function updateOrderPaymentSummary() {
  const lines = [...document.querySelectorAll("#lines .line")];
  const productTotal = lines.reduce((sum, line) => {
    const product = productById(line.querySelector("[name=pid]").value);
    const quantity = Math.max(0, Number(line.querySelector("[name=qty]").value) || 0);
    return sum + (product ? product.price * quantity : 0);
  }, 0);
  const shippingFee = Math.max(0, Number(document.getElementById("order-shipping-fee")?.value) || 0);
  const customerPaysShipping = document.getElementById("shipping-paid-by-customer")?.checked || false;
  const total = productTotal + (customerPaysShipping ? shippingFee : 0);
  const status = document.getElementById("new-order-status")?.value;
  const depositAmount = Number(document.getElementById("new-deposit-amount")?.value) || 0;
  const paidAmount = ["paid", "done", "cancelled"].includes(status)
    ? total
    : status === "deposited" ? depositAmount : 0;
  const totalElement = document.getElementById("new-order-total");
  const dueElement = document.getElementById("new-order-amount-due");
  if (totalElement) totalElement.textContent = money(total);
  if (dueElement) dueElement.textContent = money(Math.max(0, total - paidAmount));
}

function submitOrder(e, orderId) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const existingOrder = orderId ? state.orders.find((order) => order.id === orderId) : null;
  const lines = [...document.querySelectorAll("#lines .line")];
  if (!lines.length) return toast("Thêm ít nhất 1 sản phẩm");

  const items = [];
  const requestedQuantities = new Map();
  const status = fd.get("status");
  for (const line of lines) {
    const pid = line.querySelector("[name=pid]").value;
    const qty = Number(line.querySelector("[name=qty]").value);
    const p = productById(pid);
    if (!p || !Number.isInteger(qty) || qty < 1) return toast("Vui lòng chọn sản phẩm và nhập số lượng hợp lệ");
    requestedQuantities.set(pid, (requestedQuantities.get(pid) || 0) + qty);
    items.push({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      qty,
      price: p.price,
      costPrice: Number(p.costPrice) || 0,
      productShippingFee: Number(p.shippingFee) || 0,
      packagingFee: Number(p.packagingFee) || 0,
    });
  }

  const originalQuantities = new Map();
  if (existingOrder && existingOrder.status !== "cancelled") {
    existingOrder.items.forEach((item) => {
      originalQuantities.set(item.productId, (originalQuantities.get(item.productId) || 0) + item.qty);
    });
  }
  if (status !== "cancelled") {
    for (const [pid, qty] of requestedQuantities) {
      const product = productById(pid);
      const available = product.stock + (originalQuantities.get(pid) || 0);
      if (qty > available) return toast("Số lượng không hợp lệ hoặc vượt tồn kho");
    }
  }

  const shippingFee = Number(fd.get("shippingFee")) || 0;
  if (!Number.isFinite(shippingFee) || shippingFee < 0) {
    return toast("Phí vận chuyển không hợp lệ");
  }
  const shippingPayer = fd.has("shippingPaidByCustomer") ? "customer" : "shop";
  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0)
    + (shippingPayer === "customer" ? shippingFee : 0);
  const [year, month, day] = String(fd.get("createdDate") || "").split("-").map(Number);
  const createdDate = new Date(year, month - 1, day, 12);
  if (!year || !month || !day || createdDate.getFullYear() !== year || createdDate.getMonth() !== month - 1 || createdDate.getDate() !== day) {
    return toast("Ngày tạo đơn không hợp lệ");
  }
  let depositAmount = existingOrder?.depositAmount || 0;
  if (status === "deposited") {
    depositAmount = Number(fd.get("depositAmount"));
    if (!Number.isFinite(depositAmount) || depositAmount <= 0 || depositAmount > total) {
      return toast("Tiền cọc phải lớn hơn 0 và không vượt quá tổng đơn");
    }
  } else if (["paid", "done"].includes(status)) {
    depositAmount = total;
  }
  if (status !== "cancelled" && depositAmount > total) {
    return toast("Tổng đơn không thể thấp hơn số tiền khách đã thanh toán");
  }

  if (existingOrder && existingOrder.status !== "cancelled") {
    existingOrder.items.forEach((item) => {
      const product = productById(item.productId);
      if (product) product.stock += item.qty;
    });
  }
  if (status !== "cancelled") {
    items.forEach((item) => { productById(item.productId).stock -= item.qty; });
  }

  const order = {
    ...(existingOrder || {}),
    id: existingOrder?.id || uid("o"),
    code: existingOrder?.code || "DH" + String(state.orders.length + 1).padStart(4, "0"),
    customerName: fd.get("customerName").trim(),
    customerPhone: fd.get("customerPhone").trim(),
    customerAddress: fd.get("customerAddress").trim(),
    shippingCarrier: fd.get("shippingCarrier"),
    trackingNumber: fd.get("trackingNumber").trim(),
    note: fd.get("note").trim(),
    items,
    shippingFee,
    shippingPayer,
    status,
    depositAmount,
    total,
    createdAt: createdDate.getTime(),
  };
  if (existingOrder) {
    Object.assign(existingOrder, order);
  } else {
    state.orders.unshift(order);
  }
  save();
  closeModal();
  toast(existingOrder ? "Đã cập nhật " + order.code : "Đã tạo " + order.code);
  setView("orders");
}

function orderDetail(id) {
  const o = state.orders.find((x) => x.id === id);
  if (!o) return;
  openModal("Đơn " + o.code, `
    <p>Ngày tạo: ${formatOrderDate(o.createdAt)}</p>
    <p><strong>${o.customerName}</strong> · ${o.customerPhone || "—"}</p>
    <p>Địa chỉ: ${esc(o.customerAddress || "—")}</p>
    <p>Đơn vị vận chuyển: ${esc(o.shippingCarrier || "—")}</p>
    <p>Mã vận đơn: ${esc(o.trackingNumber || "—")}</p>
    <table><thead><tr><th>SP</th><th>SL</th><th>Giá</th></tr></thead>
    <tbody>${o.items.map((i) => `<tr><td>${i.sku}${i.name}</td><td>${i.qty}</td><td>${money(i.qty * i.price)}</td></tr>`).join("")}</tbody></table>
    <p>Phí vận chuyển: ${money(o.shippingFee || 0)} · ${o.shippingPayer === "customer" ? "Khách hàng trả" : "Shop trả"}</p>
    <p style="margin-top:12px"><strong>Tổng: ${money(o.total)}</strong></p>
    <p>Lợi nhuận đơn: <strong>${money(orderProfit(o))}</strong></p>
    <p>Đã thanh toán: <strong id="order-paid-amount">${money(["paid", "done"].includes(o.status) ? o.total : o.depositAmount || 0)}</strong></p>
    <p>Còn phải trả: <strong id="order-remaining-amount">${money(orderAmountDue(o))}</strong></p>
    <label>Trạng thái
      <select id="st-change" ${o.status === "cancelled" ? "disabled" : ""}>
        ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${o.status === k ? "selected" : ""}>${v}</option>`).join("")}
      </select>
    </label>
    <label id="edit-deposit-field" class="${o.status === "deposited" ? "" : "hidden"}">Tiền cọc (đ)
      <input id="edit-deposit-amount" type="number" min="1" step="1" value="${o.depositAmount || ""}" ${o.status === "deposited" ? "required" : ""} />
    </label>
    <div class="form-actions">
      <button class="btn secondary" id="edit-order">Sửa đơn</button>
      ${o.status !== "cancelled" && o.status !== "done" ? `<button class="btn danger" id="cancel-order">Hủy đơn (hoàn kho)</button>` : ""}
      <button class="btn" id="save-st">Lưu trạng thái</button>
    </div>
  `);
  const statusSelect = document.getElementById("st-change");
  const depositField = document.getElementById("edit-deposit-field");
  const depositInput = document.getElementById("edit-deposit-amount");
  statusSelect.onchange = () => {
    const isDeposited = statusSelect.value === "deposited";
    depositField.classList.toggle("hidden", !isDeposited);
    depositInput.required = isDeposited;
    if (statusSelect.value === "paid") depositInput.value = o.total;
  };
  const editButton = document.getElementById("edit-order");
  if (editButton) editButton.onclick = () => orderForm(id);
  document.getElementById("save-st").onclick = () => {
    const nextStatus = statusSelect.value;
    if (nextStatus === "cancelled") {
      if (!confirm("Hủy đơn và hoàn kho?")) return;
      o.items.forEach((item) => {
        const product = productById(item.productId);
        if (product) product.stock += item.qty;
      });
      o.status = "cancelled";
      save();
      closeModal();
      render();
      return;
    }
    if (nextStatus === "deposited") {
      const amount = Number(depositInput.value);
      if (!Number.isFinite(amount) || amount <= 0 || amount > o.total) {
        return toast("Tiền cọc phải lớn hơn 0 và không vượt quá tổng đơn");
      }
      o.depositAmount = amount;
    } else if (["paid", "done"].includes(nextStatus)) {
      o.depositAmount = o.total;
    }
    o.status = nextStatus;
    save();
    closeModal();
    render();
  };
  const cancelBtn = document.getElementById("cancel-order");
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      statusSelect.value = "cancelled";
      document.getElementById("save-st").click();
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
    orders: state.orders,
    contributions: state.contributions
  };
  downloadJSON(orderData, "order_data.json");
}

function exportBackupBundle() {
  exportStoreData();
  setTimeout(() => exportOrderData(), 150);
}

function openImportBackupModal() {
  openModal("Nhập backup", `
    <form id="backup-import-form" class="form-grid">
      <label class="full">
        File store_data.json
        <input id="backup-store-file" type="file" accept=".json,application/json" required />
      </label>
      <label class="full">
        File order_data.json
        <input id="backup-order-file" type="file" accept=".json,application/json" required />
      </label>
      <div class="form-actions full">
        <button type="button" class="btn secondary" id="cancel-modal">Hủy</button>
        <button class="btn" type="submit">Nhập dữ liệu</button>
      </div>
    </form>
  `);

  document.getElementById("cancel-modal").onclick = closeModal;
  document.getElementById("backup-import-form").onsubmit = async (e) => {
    e.preventDefault();

    const storeFile = document.getElementById("backup-store-file").files[0];
    const orderFile = document.getElementById("backup-order-file").files[0];

    if (!storeFile || !orderFile) {
      toast("Vui lòng chọn cả 2 file store_data.json và order_data.json");
      return;
    }

    try {
      const [storeText, orderText] = await Promise.all([
        storeFile.text(),
        orderFile.text(),
      ]);

      const storeData = JSON.parse(storeText);
      const orderData = JSON.parse(orderText);

      if (!(storeData && (storeData.products || storeData.categories))) {
        throw new Error("File store không đúng định dạng");
      }
      if (!(orderData && orderData.orders)) {
        throw new Error("File order không đúng định dạng");
      }

      state = normalizeState({
        products: storeData.products || [],
        categories: storeData.categories || [],
        orders: orderData.orders || [],
        contributions: orderData.contributions || []
      });

      save();
      closeModal();
      toast("Đã nhập backup thành công!");
      render();
    } catch (err) {
      console.error("Lỗi nhập backup:", err);
      toast("File backup không hợp lệ hoặc sai định dạng");
    }
  };
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
          if (loadedOrders.contributions) state.contributions = loadedOrders.contributions;
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

document.getElementById("btn-export")?.addEventListener("click", exportBackupBundle);
document.getElementById("btn-import")?.addEventListener("click", openImportBackupModal);

// Backward compatibility if older markup still exists
document.getElementById("btn-export-store")?.addEventListener("click", exportStoreData);
document.getElementById("btn-export-orders")?.addEventListener("click", exportOrderData);
document.getElementById("input-import-dual")?.addEventListener("change", importDualFiles);