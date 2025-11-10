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
function formatIST(isoString) {
  if (!isoString) return 'N/A';
  return new Date(isoString).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', () => {
  setupAuthListener();
  setupEventListeners();
});

function setupEventListeners() {
  document.getElementById('loginForm').addEventListener('submit', handleLogin);
  //document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
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
      <td>₹${product.price?.toFixed(2) || '0.00'}</td>
      <td><button class="btn btn-danger" onclick="confirmDeleteProduct('${product.id}', '${product.name}')">Delete</button></td>
    `;
    table.appendChild(row);
  });
}

let productsToAddList = [];

function addProductToList() {
  const name = document.getElementById('productName').value.trim();
  const stock = parseInt(document.getElementById('productStock').value);
  const unit = document.getElementById('productUnit').value.trim();
  const price = parseFloat(document.getElementById('productPrice').value) || 0;

  if (!name || !unit || stock < 0) {
    alert('Please fill all required fields correctly');
    return;
  }

  // Check against already-added products in database
  const isDuplicateDb = appData.products.some(prod =>
    prod.name.trim().toLowerCase() === name.toLowerCase()
  );
  // Check against unsubmitted add-list items
  const isDuplicateQueued = productsToAddList.some(prod =>
    prod.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (isDuplicateDb || isDuplicateQueued) {
    alert('Product with this name already exists!');
    return;
  }

  productsToAddList.push({ name, stock, unit, price });

  // Clear form
  document.getElementById('productName').value = '';
  document.getElementById('productStock').value = '';
  document.getElementById('productUnit').value = '';
  document.getElementById('productPrice').value = '';

  refreshProductsToAddTable();
}


function removeProductFromList(index) {
  productsToAddList.splice(index, 1);
  refreshProductsToAddTable();
}

function refreshProductsToAddTable() {
  const table = document.getElementById('productsToAddTable');
  table.innerHTML = '';
  productsToAddList.forEach((product, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.stock}</td>
      <td>${product.unit}</td>
      <td>₹${product.price.toFixed(2)}</td>
      <td><button class="btn btn-danger" onclick="removeProductFromList(${index})">Remove</button></td>
    `;
    table.appendChild(row);
  });
}

async function submitAllProducts() {
  if (productsToAddList.length === 0) {
    alert('Please add at least one product');
    return;
  }

  try {
    for (const product of productsToAddList) {
      await supabase.from('products').insert([product]);
    }
    alert(`✓ ${productsToAddList.length} product(s) added successfully!`);
    productsToAddList = [];
    refreshProductsToAddTable();
  } catch (e) {
    alert('Error adding products: ' + e.message);
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

// NEW: Multi-item sale logic and complete sale handler

let currentSaleItems = [];

function addItemToSale() {
  const productId = document.getElementById('saleProduct').value;
  const quantity = parseInt(document.getElementById('saleQuantity').value);

  if (!productId || quantity <= 0) {
    alert('Please select product and enter quantity');
    return;
  }

  const product = appData.products.find(p => p.id == productId);
  if (!product) {
    alert('Product not found');
    return;
  }

  if (product.stock < quantity) {
    alert(`Insufficient stock! Available: ${product.stock}`);
    return;
  }

  // Check if item already in cart
  const existingItem = currentSaleItems.find(item => item.product_id == productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    currentSaleItems.push({
      product_id: productId,
      product_name: product.name,
      quantity
    });
  }

  // Reset input fields
  document.getElementById('saleProduct').value = '';
  document.getElementById('saleQuantity').value = '';

  refreshSaleItems();
}

function removeSaleItem(productId) {
  currentSaleItems = currentSaleItems.filter(item => item.product_id != productId);
  refreshSaleItems();
}

function refreshSaleItems() {
  const table = document.getElementById('saleItemsTable');
  table.innerHTML = '';
  currentSaleItems.forEach(item => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${item.product_name}</td>
      <td>${item.quantity}</td>
      <td><button class="btn btn-danger" onclick="removeSaleItem('${item.product_id}')">Remove</button></td>
    `;
    table.appendChild(row);
  });
}

async function handleRecordSale(event) {
  event.preventDefault();
  const customerName = document.getElementById('customerName').value.trim();

  if (!customerName) {
    document.getElementById('saleError').textContent = 'Please enter customer name';
    return;
  }

  if (currentSaleItems.length === 0) {
    document.getElementById('saleError').textContent = 'Please add at least one item';
    return;
  }

  try {
    for (const item of currentSaleItems) {
      const product = appData.products.find(p => p.id == item.product_id);
      if (!product) continue;

      await supabase.from('products').update({ stock: product.stock - item.quantity }).eq('id', item.product_id);

      await supabase.from('sales').insert([{
        customer_name: customerName,
        product_id: item.product_id,
        quantity: item.quantity,
        timestamp: new Date().toISOString()
      }]);
    }

    document.getElementById('saleError').textContent = '';
    document.getElementById('saleSuccess').textContent = `✓ Sale completed for ${currentSaleItems.length} item(s)!`;

    currentSaleItems = [];
    refreshSaleItems();
    document.getElementById('recordSaleForm').reset();
    document.getElementById('customerName').value = '';

    setTimeout(() => {
      document.getElementById('saleSuccess').textContent = '';
    }, 3000);
  } catch (e) {
    document.getElementById('saleError').textContent = 'Error: ' + e.message;
  }
}
// ============ PRODUCT SEARCH IN RECORD SALE ============

function setupProductSearch() {
  const searchInput = document.getElementById('saleProductSearch');
  const selectDropdown = document.getElementById('saleProduct');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const searchTerm = searchInput.value.toLowerCase();
      
      // Hide/show options based on search
      Array.from(selectDropdown.options).forEach(option => {
        if (option.value === '') {
          option.style.display = '';
        } else {
          option.style.display = option.textContent.toLowerCase().includes(searchTerm) ? '' : 'none';
        }
      });
    });
  }
}

// ============ Sales History ============

function renderSalesTable(sales) {
  const table = document.getElementById('salesHistoryTable');
  table.innerHTML = '';
  sales.forEach(sale => {
    const date = sale.timestamp ? formatIST(sale.timestamp) : 'N/A';
    const product = appData.products.find(p => p.id == sale.product_id);
    const productName = product ? product.name : 'Unknown';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Customer">${sale.customer_name}</td>
      <td data-label="Product">${productName}</td>
      <td data-label="Qty">${sale.quantity}</td>
      <td data-label="Date & Time">${date}</td>
      <td data-label="Action" class="actions">
        <button class="btn btn-danger" onclick="confirmDeleteSale('${sale.id}', '${sale.product_id}', ${sale.quantity})">Delete</button>
      </td>
    `;
    table.appendChild(row);
  });
}

function refreshSalesHistory() {
  renderSalesTable(appData.sales);
}

// Filtering
async function filterSalesHistory() {
  const searchText = document.getElementById('searchCustomer').value.toLowerCase();
  const fromDate = document.getElementById('searchFromDate').value;
  const toDate = document.getElementById('searchToDate').value;
  let filtered = appData.sales;

  if (searchText) {
    filtered = filtered.filter(sale => {
      const product = appData.products.find(p => p.id == sale.product_id);
      const productName = product ? product.name.toLowerCase() : '';
      return sale.customer_name.toLowerCase().includes(searchText) || productName.includes(searchText);
    });
  }

  if (fromDate || toDate) {
    const from = fromDate ? new Date(fromDate + 'T00:00:00Z').getTime() : 0;
    const to = toDate ? new Date(toDate + 'T23:59:59Z').getTime() : Date.now();
    filtered = filtered.filter(sale => {
      const saleTime = new Date(sale.timestamp).getTime();
      return saleTime >= from && saleTime <= to;
    });
  }

  renderSalesTable(filtered);
}

function resetSalesFilter() {
  document.getElementById('searchCustomer').value = '';
  document.getElementById('searchFromDate').value = '';
  document.getElementById('searchToDate').value = '';
  refreshSalesHistory();
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


function addProductToList() {
  const name = document.getElementById('productName').value.trim();
  const stock = parseInt(document.getElementById('productStock').value);
  const unit = document.getElementById('productUnit').value.trim();
  const price = parseFloat(document.getElementById('productPrice').value) || 0;

  if (!name || !unit || stock < 0) {
    alert('Please fill all required fields correctly');
    return;
  }
  productsToAddList.push({ name, stock, unit, price });

  // Clear form
  document.getElementById('productName').value = '';
  document.getElementById('productStock').value = '';
  document.getElementById('productUnit').value = '';
  document.getElementById('productPrice').value = '';

  refreshProductsToAddTable();
}

function removeProductFromList(index) {
  productsToAddList.splice(index, 1);
  refreshProductsToAddTable();
}

function refreshProductsToAddTable() {
  const table = document.getElementById('productsToAddTable');
  table.innerHTML = '';
  productsToAddList.forEach((product, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${product.name}</td>
      <td>${product.stock}</td>
      <td>${product.unit}</td>
      <td>₹${product.price.toFixed(2)}</td>
      <td><button class="btn btn-danger" onclick="removeProductFromList(${index})">Remove</button></td>
    `;
    table.appendChild(row);
  });
}

async function submitAllProducts() {
  if (productsToAddList.length === 0) {
    alert('Please add at least one product');
    return;
  }

  try {
    for (const product of productsToAddList) {
      await supabase.from('products').insert([product]);
    }
    alert(`✓ ${productsToAddList.length} product(s) added successfully!`);
    productsToAddList = [];
    refreshProductsToAddTable();
  } catch (e) {
    alert('Error adding products: ' + e.message);
  }
}


function renderRestockTable(restocks) {
  const table = document.getElementById('restockHistoryTable');
  table.innerHTML = '';
  restocks.forEach(restock => {
    const date = restock.timestamp ? formatIST(restock.timestamp) : 'N/A';
    const product = appData.products.find(p => p.id == restock.product_id);
    const productName = product ? product.name : 'Unknown';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td data-label="Supplier">${restock.supplier_name}</td>
      <td data-label="Product">${productName}</td>
      <td data-label="Qty">${restock.quantity}</td>
      <td data-label="Date & Time">${date}</td>
      <td data-label="Notes">${restock.notes || '-'}</td>
      <td data-label="Action" class="actions">
        <button class="btn btn-danger" onclick="confirmDeleteRestock('${restock.id}', '${restock.product_id}', ${restock.quantity})">Delete</button>
      </td>
    `;
    table.appendChild(row);
  });
}

function refreshRestockHistory() {
  renderRestockTable(appData.restock);
}

async function filterRestockHistory() {
  const searchText = document.getElementById('searchSupplier').value.toLowerCase();
  const fromDate = document.getElementById('restockFromDate').value;
  const toDate = document.getElementById('restockToDate').value;

  let filtered = appData.restock;

  if (searchText) {
    filtered = filtered.filter(restock => {
      const product = appData.products.find(p => p.id == restock.product_id);
      const productName = product ? product.name.toLowerCase() : '';
      return restock.supplier_name.toLowerCase().includes(searchText) || productName.includes(searchText);
    });
  }

  if (fromDate || toDate) {
    const from = fromDate ? new Date(fromDate + 'T00:00:00Z').getTime() : 0;
    const to = toDate ? new Date(toDate + 'T23:59:59Z').getTime() : Date.now();
    filtered = filtered.filter(restock => {
      const restockTime = new Date(restock.timestamp).getTime();
      return restockTime >= from && restockTime <= to;
    });
  }

  renderRestockTable(filtered);
}

function resetRestockFilter() {
  document.getElementById('searchSupplier').value = '';
  document.getElementById('restockFromDate').value = '';
  document.getElementById('restockToDate').value = '';
  refreshRestockHistory();
}

function confirmDeleteRestock(id, productId, quantity) {
  pendingAction = () => deleteRestock(id, productId, quantity);
  showConfirmModal('Delete Restock', 
    `Are you sure you want to delete this restock entry? This will reduce the product stock by the restock amount.`);
}

async function deleteRestock(id, productId, quantity) {
  try {
    // Reduce product stock
    const product = appData.products.find(p => p.id == productId);
    if (product) {
      const newStock = Math.max(0, product.stock - quantity);
      await supabase.from('products').update({ stock: newStock }).eq('id', productId);
    }
    // Delete the restock entry itself
    await supabase.from('restock').delete().eq('id', id);
    alert('Restock deleted and stock adjusted.');
  } catch (e) {
    alert('Failed to delete restock: ' + e.message);
  }
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
