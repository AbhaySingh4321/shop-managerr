// Initialize Supabase client from supabase-config.js
// supabase is already defined globally

const LOW_STOCK_THRESHOLD = 50;

let appData = {
  user: null,
  products: [],
  sales: [],
  restock: [],
  unsubscribes: []
};

let pendingAction = null;

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', () => {
  setupAuthListener();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
  document.getElementById('recordSaleForm').addEventListener('submit', handleRecordSale);
  document.getElementById('addStockForm').addEventListener('submit', handleAddStock);
}

function setupAuthListener() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
      appData.user = session.user;
      showDashboardPage();
      startRealtimeListeners();
    } else {
      appData.user = null;
      cleanupRealtimeListeners();
      showLoginPage();
    }
  });

  // Also check current session on load
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (session && session.user) {
      appData.user = session.user;
      showDashboardPage();
      startRealtimeListeners();
    }
  });
}

// ============ UI Navigation ============

function showLoginPage() {
  document.getElementById('loginContainer').style.display = 'flex';
  document.getElementById('dashboardContainer').style.display = 'none';
}

function showDashboardPage() {
  document.getElementById('loginContainer').style.display = 'none';
  document.getElementById('dashboardContainer').style.display = 'block';
  showSection('dashboard');
}

function showSection(sectionId) {
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  document.getElementById(sectionId + '-section').classList.add('active');
  document.getElementById(sectionId + '-section').style.display = 'block';

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById('nav-' + sectionId);
  if (activeBtn) activeBtn.classList.add('active');

  // Refresh views when switched
  if (sectionId === 'dashboard') refreshDashboard();
  else if (sectionId === 'inventory') refreshInventory();
  else if (sectionId === 'sale') refreshSaleForm();
  else if (sectionId === 'restock') refreshRestockForm();
  else if (sectionId === 'sales-history') refreshSalesHistory();
  else if (sectionId === 'restock-history') refreshRestockHistory();
}

// ============ Login, Logout ============

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();
  if (!email || !password) {
    document.getElementById('loginError').textContent = 'Please enter email and password.';
    return;
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    document.getElementById('loginError').textContent = 'Login failed: ' + error.message;
  } else {
    document.getElementById('loginError').textContent = '';
    document.getElementById('loginForm').reset();
  }
}

function logout() {
  supabase.auth.signOut();
}

// ============ Realtime Listeners ============

function startRealtimeListeners() {
  cleanupRealtimeListeners();

  let productsSub = supabase
    .channel('public:products')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'products' },
      () => {
        fetchProducts();
      }
    )
    .subscribe();

  let salesSub = supabase
    .channel('public:sales')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sales' },
      () => {
        fetchSales();
      }
    )
    .subscribe();

  let restockSub = supabase
    .channel('public:restock')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'restock' },
      () => {
        fetchRestocks();
      }
    )
    .subscribe();

  appData.unsubscribes = [productsSub, salesSub, restockSub];

  // Initial fetch
  fetchProducts();
  fetchSales();
  fetchRestocks();
}

function cleanupRealtimeListeners() {
  appData.unsubscribes.forEach(sub => supabase.removeChannel(sub));
  appData.unsubscribes = [];
}

// ============ Data Fetching ============

async function fetchProducts() {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) alert('Failed to load products: ' + error.message);
  else {
    appData.products = data;
    refreshDashboard();
    refreshInventory();
    refreshSaleForm();
    refreshRestockForm();
  }
}

async function fetchSales() {
  const { data, error } = await supabase.from('sales').select('*').order('timestamp', { ascending: false });
  if (error) alert('Failed to load sales: ' + error.message);
  else {
    appData.sales = data;
    refreshDashboard();
    refreshSalesHistory();
  }
}

async function fetchRestocks() {
  const { data, error } = await supabase.from('restock').select('*').order('timestamp', { ascending: false });
  if (error) alert('Failed to load restocks: ' + error.message);
  else {
    appData.restock = data;
    refreshDashboard();
    refreshRestockHistory();
  }
}

// ============ Dashboard ============

function refreshDashboard() {
  const lowStockProducts = appData.products.filter(p => p.stock < LOW_STOCK_THRESHOLD);

  document.getElementById('totalProducts').textContent = appData.products.length;
  document.getElementById('totalSales').textContent = appData.sales.length;
  document.getElementById('totalRestock').textContent = appData.restock.length;
  document.getElementById('lowStockCount').textContent = lowStockProducts.length;

  const lowStockTable = document.getElementById('lowStockTable');
  lowStockTable.innerHTML = '';
  lowStockProducts.forEach(product => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td style="color: #dc3545; font-weight: bold;">${product.stock}</td>
      <td>${product.unit}</td>
    `;
    lowStockTable.appendChild(row);
  });
}

// ============ Inventory ============

function refreshInventory() {
  const table = document.getElementById('productsTable');
  table.innerHTML = '';
  appData.products.forEach(product => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.stock}</td>
      <td>${product.unit}</td>
      <td>$${product.price?.toFixed(2) || '0.00'}</td>
      <td><button class="btn btn-danger" onclick="confirmDeleteProduct('${product.id}', '${product.name}')">Delete</button></td>
    `;
    table.appendChild(row);
  });
}

async function handleAddProduct(event) {
  event.preventDefault();
  const name = document.getElementById('productName').value.trim();
  const stock = parseInt(document.getElementById('productStock').value);
  const unit = document.getElementById('productUnit').value.trim();
  const price = parseFloat(document.getElementById('productPrice').value) || 0;

  if (!name || !unit || stock < 0) {
    alert('Please fill all required fields correctly');
    return;
  }

  const { error } = await supabase.from('products').insert([{ name, stock, unit, price }]);
  if (error) alert('Failed to add product: ' + error.message);
  else {
    document.getElementById('addProductMsg').textContent = '✓ Product added!';
    event.target.reset();
    setTimeout(() => {
      document.getElementById('addProductMsg').textContent = '';
    }, 3000);
  }
}

function confirmDeleteProduct(id, name) {
  pendingAction = () => deleteProduct(id, name);
  showConfirmModal('Delete Product', `Are you sure you want to delete "${name}"?`);
}

async function deleteProduct(id, name) {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) alert('Failed to delete product: ' + error.message);
  else alert(`Product "${name}" deleted!`);
}

// ============ Sales Management ============

function refreshSaleForm() {
  const select = document.getElementById('saleProduct');
  select.innerHTML = '<option value="">Select product</option>';
  appData.products.filter(p => p.stock > 0).forEach(product => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = `${product.name} (${product.stock} ${product.unit})`;
    select.appendChild(option);
  });
}

async function handleRecordSale(event) {
  event.preventDefault();
  const customerName = document.getElementById('customerName').value.trim();
  const productId = document.getElementById('saleProduct').value;
  const quantity = parseInt(document.getElementById('saleQuantity').value);

  if (!customerName || !productId || quantity <= 0) {
    document.getElementById('saleError').textContent = 'Please fill all fields correctly.';
    return;
  }

  const product = appData.products.find(p => p.id === productId);
  if (!product) {
    document.getElementById('saleError').textContent = 'Selected product not found.';
    return;
  }

  if (product.stock < quantity) {
    document.getElementById('saleError').textContent = `Insufficient stock! Available: ${product.stock}`;
    return;
  }

  try {
    await supabase.from('products').update({ stock: product.stock - quantity }).eq('id', productId);
    await supabase.from('sales').insert([{ customer_name: customerName, product_id: productId, quantity }]);

    document.getElementById('saleError').textContent = '';
    document.getElementById('saleSuccess').textContent = `✓ Sale recorded!`;
    event.target.reset();
    refreshSaleForm();

    setTimeout(() => {
      document.getElementById('saleSuccess').textContent = '';
    }, 3000);
  } catch (e) {
    document.getElementById('saleError').textContent = 'Error recording sale: ' + e.message;
  }
}

// ============ Sales History ============

function refreshSalesHistory() {
  const table = document.getElementById('salesHistoryTable');
  table.innerHTML = '';
  appData.sales.forEach(sale => {
    const date = sale.timestamp ? new Date(sale.timestamp).toLocaleString() : 'N/A';
    const row = document.createElement('tr');

    const product = appData.products.find(p => p.id === sale.product_id);
    const productName = product ? product.name : 'Unknown';

    row.innerHTML = `
      <td>${sale.customer_name}</td>
      <td>${productName}</td>
      <td>${sale.quantity}</td>
      <td>${date}</td>
      <td><button class="btn btn-danger" onclick="confirmDeleteSale('${sale.id}', '${sale.product_id}', ${sale.quantity})">Delete</button></td>
    `;
    table.appendChild(row);
  });
}

function confirmDeleteSale(id, productId, quantity) {
  pendingAction = () => deleteSale(id, productId, quantity);
  showConfirmModal('Delete Sale', `Are you sure you want to delete this sale and restore stock?`);
}

async function deleteSale(id, productId, quantity) {
  try {
    // Restore stock first
    const product = appData.products.find(p => p.id === productId);
    const newStock = (product?.stock || 0) + quantity;
    await supabase.from('products').update({ stock: newStock }).eq('id', productId);

    // Delete sale record
    await supabase.from('sales').delete().eq('id', id);

    alert('Sale deleted and stock restored.');
  } catch (e) {
    alert('Failed to delete sale: ' + e.message);
  }
}

// ============ Restock Management ============

function refreshRestockForm() {
  const select = document.getElementById('restockProduct');
  select.innerHTML = '<option value="">Select product</option>';
  appData.products.forEach(product => {
    const option = document.createElement('option');
    option.value = product.id;
    option.textContent = product.name;
    select.appendChild(option);
  });
}

async function handleAddStock(event) {
  event.preventDefault();
  const supplierName = document.getElementById('supplierName').value.trim();
  const productId = document.getElementById('restockProduct').value;
  const quantity = parseInt(document.getElementById('restockQuantity').value);
  const notes = document.getElementById('restockNotes').value.trim();

  if (!supplierName || !productId || quantity <= 0) {
    alert('Please fill all required fields.');
    return;
  }

  const product = appData.products.find(p => p.id === productId);
  if (!product) {
    alert('Selected product not found.');
    return;
  }

  try {
    await supabase.from('products').update({ stock: product.stock + quantity }).eq('id', productId);
    await supabase.from('restock').insert([{ supplier_name: supplierName, product_id: productId, quantity, notes }]);

    document.getElementById('restockSuccess').textContent = '✓ Stock added!';
    event.target.reset();

    setTimeout(() => {
      document.getElementById('restockSuccess').textContent = '';
    }, 3000);
  } catch (e) {
    alert('Error adding stock: ' + e.message);
  }
}

function refreshRestockHistory() {
  const table = document.getElementById('restockHistoryTable');
  table.innerHTML = '';
  appData.restock.forEach(restock => {
    const date = restock.timestamp ? new Date(restock.timestamp).toLocaleString() : 'N/A';
    const row = document.createElement('tr');

    const product = appData.products.find(p => p.id === restock.product_id);
    const productName = product ? product.name : 'Unknown';

    row.innerHTML = `
      <td>${restock.supplier_name}</td>
      <td>${productName}</td>
      <td>${restock.quantity}</td>
      <td>${date}</td>
      <td>${restock.notes || '-'}</td>
    `;
    table.appendChild(row);
  });
}

// ============ Confirmation Modal ============

function showConfirmModal(title, message) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmModal').style.display = 'flex';
}

function confirmAction() {
  if (pendingAction) {
    pendingAction();
    pendingAction = null;
  }
  document.getElementById('confirmModal').style.display = 'none';
}

function cancelAction() {
  pendingAction = null;
  document.getElementById('confirmModal').style.display = 'none';
}
