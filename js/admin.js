import { supabase, showToast, guardPage } from './auth-utils.js';
import { statusLabel as supportStatusLabel } from './support-utils.js';
import './speed-insights.js'; // Initialize Vercel Speed Insights

async function fetchRequests() {
  const tbody = document.getElementById('requests-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando solicitudes...</td></tr>';

  const { data, error } = await supabase
    .from('seller_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching requests:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar las solicitudes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay solicitudes registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach(req => {
    const date = new Date(req.created_at).toLocaleDateString('es-AR');
    let statusClass = '';
    let statusText = '';
    
    if (req.status === 'pending') {
      statusClass = 'status-pending';
      statusText = 'Pendiente';
    } else if (req.status === 'approved') {
      statusClass = 'status-approved';
      statusText = 'Aprobado';
    } else {
      statusClass = 'status-rejected';
      statusText = 'Rechazado';
    }

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = date;
    tr.appendChild(tdDate);

    const tdShop = document.createElement('td');
    const shopStrong = document.createElement('strong');
    shopStrong.textContent = req.shop_name;
    tdShop.appendChild(shopStrong);
    tdShop.appendChild(document.createElement('br'));
    const addressSmall = document.createElement('small');
    addressSmall.textContent = req.address || '';
    tdShop.appendChild(addressSmall);
    tr.appendChild(tdShop);

    const tdCuit = document.createElement('td');
    tdCuit.textContent = req.cuit || '-';
    tr.appendChild(tdCuit);

    const tdCategory = document.createElement('td');
    // P2-10: category_slugs (array, multi-rubro) reemplaza a category_slug (un solo valor).
    tdCategory.textContent = (req.category_slugs && req.category_slugs.length ? req.category_slugs.join(', ') : req.category_slug) || '-';
    tr.appendChild(tdCategory);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.textContent = statusText;
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    if (req.status === 'pending') {
      const approveBtn = document.createElement('button');
      approveBtn.className = 'action-btn btn-approve';
      approveBtn.dataset.id = req.id;
      approveBtn.title = 'Aprobar';
      const checkIcon = document.createElement('i');
      checkIcon.className = 'fa-solid fa-check';
      approveBtn.appendChild(checkIcon);
      tdActions.appendChild(approveBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'action-btn btn-reject';
      rejectBtn.dataset.id = req.id;
      rejectBtn.title = 'Rechazar';
      const xIcon = document.createElement('i');
      xIcon.className = 'fa-solid fa-xmark';
      rejectBtn.appendChild(xIcon);
      tdActions.appendChild(rejectBtn);
    } else {
      tdActions.textContent = '-';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  // Bind actions
  document.querySelectorAll('.btn-approve').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de aprobar este comercio?')) {
        await approveRequest(id);
      }
    });
  });

  document.querySelectorAll('.btn-reject').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de rechazar este comercio?')) {
        await rejectRequest(id);
      }
    });
  });
}

async function approveRequest(id) {
  try {
    // LLama a la función de RPC creada en la base de datos
    const { error } = await supabase.rpc('approve_seller_request', { req_id: id });
    if (error) throw error;
    
    showToast('Comercio aprobado exitosamente', 'success');
    fetchRequests();
  } catch (err) {
    console.error('Error al aprobar:', err);
    showToast('Error al aprobar el comercio. Verifica que corriste los scripts SQL.', 'error');
  }
}

async function rejectRequest(id) {
  try {
    const { error } = await supabase
      .from('seller_requests')
      .update({ status: 'rejected', updated_at: new Date() })
      .eq('id', id);
      
    if (error) throw error;
    
    showToast('Solicitud rechazada', 'success');
    fetchRequests();
  } catch (err) {
    console.error('Error al rechazar:', err);
    showToast('Error al rechazar el comercio', 'error');
  }
}

const VEHICLE_LABELS = {
  bicicleta: 'Bicicleta',
  moto: 'Moto',
  auto: 'Auto',
};

async function fetchDeliveryRequests() {
  const tbody = document.getElementById('delivery-requests-tbody');
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando solicitudes...</td></tr>';

  const { data, error } = await supabase
    .from('delivery_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching delivery requests:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar las solicitudes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay solicitudes registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach(req => {
    const date = new Date(req.created_at).toLocaleDateString('es-AR');
    let statusClass = '';
    let statusText = '';

    if (req.status === 'pending') {
      statusClass = 'status-pending';
      statusText = 'Pendiente';
    } else if (req.status === 'approved') {
      statusClass = 'status-approved';
      statusText = 'Aprobado';
    } else {
      statusClass = 'status-rejected';
      statusText = 'Rechazado';
    }

    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = date;
    tr.appendChild(tdDate);

    const tdName = document.createElement('td');
    tdName.textContent = req.full_name;
    tr.appendChild(tdName);

    const tdPhone = document.createElement('td');
    tdPhone.textContent = req.phone;
    tr.appendChild(tdPhone);

    const tdVehicle = document.createElement('td');
    tdVehicle.textContent = VEHICLE_LABELS[req.vehicle_type] || req.vehicle_type;
    if (req.vehicle_plate) {
      tdVehicle.appendChild(document.createElement('br'));
      const plateSmall = document.createElement('small');
      plateSmall.textContent = req.vehicle_plate;
      tdVehicle.appendChild(plateSmall);
    }
    tr.appendChild(tdVehicle);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${statusClass}`;
    statusBadge.textContent = statusText;
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    if (req.status === 'pending') {
      const approveBtn = document.createElement('button');
      approveBtn.className = 'action-btn btn-approve-delivery';
      approveBtn.dataset.id = req.id;
      approveBtn.title = 'Aprobar';
      const checkIcon = document.createElement('i');
      checkIcon.className = 'fa-solid fa-check';
      approveBtn.appendChild(checkIcon);
      tdActions.appendChild(approveBtn);

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'action-btn btn-reject-delivery';
      rejectBtn.dataset.id = req.id;
      rejectBtn.title = 'Rechazar';
      const xIcon = document.createElement('i');
      xIcon.className = 'fa-solid fa-xmark';
      rejectBtn.appendChild(xIcon);
      tdActions.appendChild(rejectBtn);
    } else {
      tdActions.textContent = '-';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });

  document.querySelectorAll('.btn-approve-delivery').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de aprobar este repartidor?')) {
        await approveDeliveryRequest(id);
      }
    });
  });

  document.querySelectorAll('.btn-reject-delivery').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.currentTarget.dataset.id;
      if (confirm('¿Estás seguro de rechazar esta solicitud?')) {
        await rejectDeliveryRequest(id);
      }
    });
  });
}

async function approveDeliveryRequest(id) {
  try {
    const { error } = await supabase.rpc('approve_delivery_request', { req_id: id });
    if (error) throw error;

    showToast('Repartidor aprobado exitosamente', 'success');
    fetchDeliveryRequests();
  } catch (err) {
    console.error('Error al aprobar repartidor:', err);
    showToast('Error al aprobar la solicitud.', 'error');
  }
}

async function rejectDeliveryRequest(id) {
  try {
    const { error } = await supabase
      .from('delivery_requests')
      .update({ status: 'rejected', updated_at: new Date() })
      .eq('id', id);

    if (error) throw error;

    showToast('Solicitud rechazada', 'success');
    fetchDeliveryRequests();
  } catch (err) {
    console.error('Error al rechazar repartidor:', err);
    showToast('Error al rechazar la solicitud.', 'error');
  }
}

// --- F6-05: métricas globales ---

async function loadGlobalMetrics() {
  const grid = document.getElementById('metrics-grid');
  if (!grid) return;

  const [{ data: profiles }, { data: stores }, { data: paidOrders }, { data: deliveries }] = await Promise.all([
    supabase.from('profiles').select('role'),
    supabase.from('stores').select('status'),
    supabase.from('orders').select('total_price').eq('payment_status', 'paid'),
    supabase.from('deliveries').select('status'),
  ]);

  const countBy = (rows, key) => (rows || []).reduce((acc, row) => {
    acc[row[key]] = (acc[row[key]] || 0) + 1;
    return acc;
  }, {});

  const roleCounts = countBy(profiles, 'role');
  const storeCounts = countBy(stores, 'status');
  const deliveryCounts = countBy(deliveries, 'status');
  const totalSales = (paidOrders || []).reduce((sum, o) => sum + o.total_price, 0);

  const metrics = [
    { label: 'Usuarios totales', value: (profiles || []).length, icon: 'fa-users', color: '#2563eb' },
    { label: 'Vendedores', value: roleCounts.vendedor || 0, icon: 'fa-store', color: '#0891b2' },
    { label: 'Repartidores', value: roleCounts.repartidor || 0, icon: 'fa-motorcycle', color: '#7c3aed' },
    { label: 'Comercios aprobados', value: storeCounts.approved || 0, icon: 'fa-circle-check', color: '#10b981' },
    { label: 'Comercios suspendidos', value: storeCounts.suspended || 0, icon: 'fa-ban', color: '#ef4444' },
    { label: 'Ventas totales', value: `$${totalSales.toLocaleString('es-AR')}`, icon: 'fa-sack-dollar', color: '#f59e0b' },
    { label: 'Entregas en curso', value: (deliveryCounts.assigned || 0) + (deliveryCounts.picked_up || 0), icon: 'fa-truck-fast', color: '#3b82f6' },
    { label: 'Entregas completadas', value: deliveryCounts.delivered || 0, icon: 'fa-flag-checkered', color: '#059669' },
  ];

  grid.textContent = '';
  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'admin-metric-card';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'admin-metric-card__icon';
    iconWrap.style.setProperty('--m-color', m.color);
    const iconEl = document.createElement('i');
    iconEl.className = `fa-solid ${m.icon}`;
    iconEl.setAttribute('aria-hidden', 'true');
    iconWrap.appendChild(iconEl);

    const body = document.createElement('div');
    body.className = 'admin-metric-card__body';
    const h3 = document.createElement('h3');
    h3.textContent = m.value;
    const p = document.createElement('p');
    p.textContent = m.label;
    body.appendChild(h3);
    body.appendChild(p);

    card.appendChild(iconWrap);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

// --- F6-02: CRUD de categorías ---

async function fetchCategories() {
  const tbody = document.getElementById('categories-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando categorías...</td></tr>';

  const { data, error } = await supabase.from('categories').select('*').order('name');

  if (error) {
    console.error('Error fetching categories:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar las categorías.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay categorías registradas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((cat) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = cat.name;
    tr.appendChild(tdName);

    const tdSlug = document.createElement('td');
    tdSlug.textContent = cat.slug;
    tr.appendChild(tdSlug);

    const tdIcon = document.createElement('td');
    tdIcon.textContent = cat.icon || '-';
    tr.appendChild(tdIcon);

    const tdActions = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn btn-reject';
    deleteBtn.title = 'Borrar';
    const xIcon = document.createElement('i');
    xIcon.className = 'fa-solid fa-trash';
    deleteBtn.appendChild(xIcon);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`¿Borrar la categoría "${cat.name}"? Los productos que la usaban quedarán sin rubro.`)) return;
      const { error: deleteError } = await supabase.from('categories').delete().eq('id', cat.id);
      if (deleteError) {
        showToast('No se pudo borrar la categoría.', 'error');
        console.error(deleteError);
        return;
      }
      showToast('Categoría borrada.', 'success');
      fetchCategories();
    });
    tdActions.appendChild(deleteBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

function setupCategoryForm() {
  document.getElementById('category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const slug = document.getElementById('cat-slug').value.trim().toLowerCase();
    const icon = document.getElementById('cat-icon').value.trim();

    if (!name || !slug) {
      showToast('Nombre y slug son obligatorios.', 'error');
      return;
    }

    const { error } = await supabase.from('categories').insert({ name, slug, icon: icon || null });
    if (error) {
      showToast('No se pudo crear la categoría (¿el slug ya existe?).', 'error');
      console.error(error);
      return;
    }

    showToast('Categoría creada.', 'success');
    e.target.reset();
    fetchCategories();
  });
}

// --- F6-03: CRUD de cupones ---

async function fetchCoupons() {
  const tbody = document.getElementById('coupons-tbody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando cupones...</td></tr>';

  const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching coupons:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar los cupones.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay cupones registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((coupon) => {
    const tr = document.createElement('tr');
    const isExpired = coupon.expires_at && new Date(coupon.expires_at) < new Date();

    const tdCode = document.createElement('td');
    const codeStrong = document.createElement('strong');
    codeStrong.textContent = coupon.code;
    tdCode.appendChild(codeStrong);
    tr.appendChild(tdCode);

    const tdDiscount = document.createElement('td');
    tdDiscount.textContent = `${coupon.discount_percentage}%`;
    tr.appendChild(tdDiscount);

    const tdExpires = document.createElement('td');
    tdExpires.textContent = coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('es-AR') : 'Sin vencimiento';
    tr.appendChild(tdExpires);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    if (isExpired) {
      statusBadge.className = 'status-badge status-rejected';
      statusBadge.textContent = 'Vencido';
    } else if (coupon.is_active) {
      statusBadge.className = 'status-badge status-approved';
      statusBadge.textContent = 'Activo';
    } else {
      statusBadge.className = 'status-badge status-suspended';
      statusBadge.textContent = 'Inactivo';
    }
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');

    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${coupon.is_active ? 'btn-suspend' : 'btn-reactivate'}`;
    toggleBtn.textContent = coupon.is_active ? 'Desactivar' : 'Activar';
    toggleBtn.addEventListener('click', async () => {
      const { error: updateError } = await supabase.from('coupons').update({ is_active: !coupon.is_active }).eq('id', coupon.id);
      if (updateError) {
        showToast('No se pudo actualizar el cupón.', 'error');
        console.error(updateError);
        return;
      }
      fetchCoupons();
    });
    tdActions.appendChild(toggleBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn btn-reject';
    deleteBtn.title = 'Borrar';
    const xIcon = document.createElement('i');
    xIcon.className = 'fa-solid fa-trash';
    deleteBtn.appendChild(xIcon);
    deleteBtn.addEventListener('click', async () => {
      if (!confirm(`¿Borrar el cupón "${coupon.code}"?`)) return;
      const { error: deleteError } = await supabase.from('coupons').delete().eq('id', coupon.id);
      if (deleteError) {
        showToast('No se pudo borrar el cupón.', 'error');
        console.error(deleteError);
        return;
      }
      showToast('Cupón borrado.', 'success');
      fetchCoupons();
    });
    tdActions.appendChild(deleteBtn);

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

function setupCouponForm() {
  document.getElementById('coupon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('coupon-code').value.trim().toUpperCase();
    const discount = document.getElementById('coupon-discount').value;
    const expiresAt = document.getElementById('coupon-expires').value;

    const discountNum = parseInt(discount, 10);
    if (!code || !Number.isInteger(discountNum) || discountNum < 1 || discountNum > 100) {
      showToast('Código y descuento (1-100) son obligatorios.', 'error');
      return;
    }

    const { error } = await supabase.from('coupons').insert({
      code,
      discount_percentage: discountNum,
      expires_at: expiresAt || null,
      is_active: true,
    });

    if (error) {
      showToast('No se pudo crear el cupón (¿el código ya existe?).', 'error');
      console.error(error);
      return;
    }

    showToast('Cupón creado.', 'success');
    e.target.reset();
    fetchCoupons();
  });
}

// --- F6-04: moderación ---

async function fetchStoresForModeration() {
  const tbody = document.getElementById('stores-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando comercios...</td></tr>';

  const { data, error } = await supabase.from('stores').select('id, name, cuit, status').order('name');

  if (error) {
    console.error('Error fetching stores for moderation:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los comercios.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay comercios registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((store) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = store.name;
    tr.appendChild(tdName);

    const tdCuit = document.createElement('td');
    tdCuit.textContent = store.cuit || '-';
    tr.appendChild(tdCuit);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge status-${store.status}`;
    statusBadge.textContent = store.status;
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    if (store.status === 'approved' || store.status === 'suspended') {
      const isSuspended = store.status === 'suspended';
      const toggleBtn = document.createElement('button');
      toggleBtn.className = `action-btn ${isSuspended ? 'btn-reactivate' : 'btn-suspend'}`;
      toggleBtn.textContent = isSuspended ? 'Reactivar' : 'Suspender';
      toggleBtn.addEventListener('click', async () => {
        const newStatus = isSuspended ? 'approved' : 'suspended';
        if (!confirm(`¿${isSuspended ? 'Reactivar' : 'Suspender'} el comercio "${store.name}"?`)) return;
        const { error: updateError } = await supabase.from('stores').update({ status: newStatus }).eq('id', store.id);
        if (updateError) {
          showToast('No se pudo actualizar el comercio.', 'error');
          console.error(updateError);
          return;
        }
        showToast(`Comercio ${isSuspended ? 'reactivado' : 'suspendido'}.`, 'success');
        fetchStoresForModeration();
      });
      tdActions.appendChild(toggleBtn);
    } else {
      tdActions.textContent = '-';
    }
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function fetchRepartidoresForModeration() {
  const tbody = document.getElementById('repartidores-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando repartidores...</td></tr>';

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, is_suspended')
    .eq('role', 'repartidor')
    .order('full_name');

  if (error) {
    console.error('Error fetching repartidores:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los repartidores.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay repartidores registrados.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((rep) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = rep.full_name || '-';
    tr.appendChild(tdName);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = rep.email;
    tr.appendChild(tdEmail);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${rep.is_suspended ? 'status-suspended' : 'status-approved'}`;
    statusBadge.textContent = rep.is_suspended ? 'Suspendido' : 'Activo';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${rep.is_suspended ? 'btn-reactivate' : 'btn-suspend'}`;
    toggleBtn.textContent = rep.is_suspended ? 'Reactivar' : 'Suspender';
    toggleBtn.addEventListener('click', async () => {
      if (!confirm(`¿${rep.is_suspended ? 'Reactivar' : 'Suspender'} a "${rep.full_name || rep.email}"?`)) return;
      const { error: rpcError } = await supabase.rpc('admin_set_repartidor_suspended', {
        p_user_id: rep.id,
        p_suspended: !rep.is_suspended,
      });
      if (rpcError) {
        showToast(rpcError.message || 'No se pudo actualizar el repartidor.', 'error');
        console.error(rpcError);
        return;
      }
      showToast(`Repartidor ${rep.is_suspended ? 'reactivado' : 'suspendido'}.`, 'success');
      fetchRepartidoresForModeration();
    });
    tdActions.appendChild(toggleBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

function setupProductSearch() {
  document.getElementById('product-search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const term = document.getElementById('product-search-input').value.trim();
    const tbody = document.getElementById('products-mod-tbody');
    if (!term) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Buscando...</td></tr>';

    const { data, error } = await supabase
      .from('products')
      .select('id, title, is_active, stores(name)')
      .ilike('title', `%${term}%`)
      .limit(20);

    if (error) {
      console.error('Error searching products:', error);
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al buscar productos.</td></tr>';
      return;
    }

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Sin resultados.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    data.forEach((product) => {
      const tr = document.createElement('tr');

      const tdTitle = document.createElement('td');
      tdTitle.textContent = product.title;
      tr.appendChild(tdTitle);

      const tdStore = document.createElement('td');
      tdStore.textContent = product.stores?.name || '-';
      tr.appendChild(tdStore);

      const tdStatus = document.createElement('td');
      const statusBadge = document.createElement('span');
      statusBadge.className = `status-badge ${product.is_active ? 'status-approved' : 'status-suspended'}`;
      statusBadge.textContent = product.is_active ? 'Activo' : 'Suspendido';
      tdStatus.appendChild(statusBadge);
      tr.appendChild(tdStatus);

      const tdActions = document.createElement('td');
      const toggleBtn = document.createElement('button');
      toggleBtn.className = `action-btn ${product.is_active ? 'btn-suspend' : 'btn-reactivate'}`;
      toggleBtn.textContent = product.is_active ? 'Suspender' : 'Reactivar';
      toggleBtn.addEventListener('click', async () => {
        if (!confirm(`¿${product.is_active ? 'Suspender' : 'Reactivar'} "${product.title}"?`)) return;
        const { error: rpcError } = await supabase.rpc('admin_set_product_active', {
          p_product_id: product.id,
          p_is_active: !product.is_active,
        });
        if (rpcError) {
          showToast(rpcError.message || 'No se pudo actualizar el producto.', 'error');
          console.error(rpcError);
          return;
        }
        showToast(`Producto ${product.is_active ? 'suspendido' : 'reactivado'}.`, 'success');
        document.getElementById('product-search-form').dispatchEvent(new Event('submit'));
      });
      tdActions.appendChild(toggleBtn);
      tr.appendChild(tdActions);

      tbody.appendChild(tr);
    });
  });
}

async function fetchPendingProofsAdmin() {
  const tbody = document.getElementById('proofs-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando comprobantes...</td></tr>';

  const { data, error } = await supabase
    .from('payment_proofs')
    .select('id, receipt_url, created_at, orders(id, total_price, stores(name))')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching payment proofs:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los comprobantes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay comprobantes pendientes.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((proof) => {
    const order = proof.orders;
    const tr = document.createElement('tr');

    const tdOrder = document.createElement('td');
    tdOrder.textContent = order ? `#${order.id.split('-')[0].toUpperCase()}` : '-';
    tr.appendChild(tdOrder);

    const tdStore = document.createElement('td');
    tdStore.textContent = order?.stores?.name || '-';
    tr.appendChild(tdStore);

    const tdAmount = document.createElement('td');
    tdAmount.textContent = order ? `$${order.total_price.toLocaleString('es-AR')}` : '-';
    tr.appendChild(tdAmount);

    const tdActions = document.createElement('td');

    const viewBtn = document.createElement('button');
    viewBtn.className = 'action-btn';
    viewBtn.style.background = 'var(--bl-primary)';
    viewBtn.style.color = 'white';
    viewBtn.textContent = 'Ver';
    viewBtn.addEventListener('click', async () => {
      const { data: signedData, error: signedError } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(proof.receipt_url, 60);
      if (signedError || !signedData?.signedUrl) {
        showToast('No se pudo abrir el comprobante.', 'error');
        return;
      }
      window.open(signedData.signedUrl, '_blank', 'noopener,noreferrer');
    });
    tdActions.appendChild(viewBtn);

    const approveBtn = document.createElement('button');
    approveBtn.className = 'action-btn btn-approve';
    approveBtn.title = 'Confirmar';
    const checkIcon = document.createElement('i');
    checkIcon.className = 'fa-solid fa-check';
    approveBtn.appendChild(checkIcon);
    approveBtn.addEventListener('click', () => handleProofDecisionAdmin(proof.id, true));
    tdActions.appendChild(approveBtn);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'action-btn btn-reject';
    rejectBtn.title = 'Rechazar';
    const xIcon = document.createElement('i');
    xIcon.className = 'fa-solid fa-xmark';
    rejectBtn.appendChild(xIcon);
    rejectBtn.addEventListener('click', () => handleProofDecisionAdmin(proof.id, false));
    tdActions.appendChild(rejectBtn);

    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

async function handleProofDecisionAdmin(proofId, approve) {
  const { error } = await supabase.rpc('confirm_transfer_payment', { p_proof_id: proofId, p_approve: approve });
  if (error) {
    showToast(error.message || 'No se pudo procesar el comprobante.', 'error');
    return;
  }
  showToast(approve ? 'Pago confirmado.' : 'Comprobante rechazado.', 'success');
  fetchPendingProofsAdmin();
}

// --- A113-261: farmacias de turno ---
//
// Dos bloques separados porque tienen ritmos distintos: la ficha de una
// farmacia se carga una vez, el turno se asigna todas las semanas. Esa
// fricción es la que decide si la sección se mantiene actualizada o se
// pudre — y una lista de turnos vencida es tan dañina como el alert() con
// datos inventados que este módulo vino a reemplazar.

let pharmaciesCache = [];

async function fetchPharmacies() {
  const tbody = document.getElementById('pharmacies-tbody');
  const select = document.getElementById('shift-pharmacy');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando farmacias...</td></tr>';

  const { data, error } = await supabase
    .from('pharmacies')
    .select('id, name, address, phone, whatsapp, pharmacist, insurances, is_active')
    .order('name');

  if (error) {
    console.error('Error al cargar farmacias:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar las farmacias.</td></tr>';
    return;
  }

  pharmaciesCache = data || [];

  // El select del formulario de turnos sale de acá: no se puede asignar un
  // turno a una farmacia que no está cargada.
  if (select) {
    select.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = pharmaciesCache.length ? 'Elegí una farmacia...' : 'Cargá una farmacia primero';
    select.appendChild(placeholder);
    pharmaciesCache.filter((p) => p.is_active).forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  }

  if (pharmaciesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay farmacias cargadas todavía.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  pharmaciesCache.forEach((ph) => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.textContent = ph.name;
    tr.appendChild(tdName);

    const tdAddress = document.createElement('td');
    tdAddress.textContent = ph.address;
    tr.appendChild(tdAddress);

    const tdContact = document.createElement('td');
    tdContact.textContent = [ph.phone, ph.whatsapp].filter(Boolean).join(' · ') || '-';
    tr.appendChild(tdContact);

    const tdStatus = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-badge ${ph.is_active ? 'status-approved' : 'status-suspended'}`;
    badge.textContent = ph.is_active ? 'Activa' : 'Inactiva';
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${ph.is_active ? 'btn-suspend' : 'btn-reactivate'}`;
    toggleBtn.textContent = ph.is_active ? 'Desactivar' : 'Activar';
    toggleBtn.addEventListener('click', async () => {
      const { error: updErr } = await supabase
        .from('pharmacies')
        .update({ is_active: !ph.is_active })
        .eq('id', ph.id);
      if (updErr) {
        showToast(updErr.message || 'No se pudo actualizar la farmacia.', 'error');
        return;
      }
      fetchPharmacies();
    });
    tdActions.appendChild(toggleBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function fetchShifts() {
  const tbody = document.getElementById('shifts-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando turnos...</td></tr>';

  // Desde ayer: a la madrugada el turno vigente sigue siendo el del día
  // anterior, así que esconderlo confundiría a quien está cargando.
  const desde = new Date();
  desde.setDate(desde.getDate() - 1);
  const desdeIso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase
    .from('pharmacy_shifts')
    .select('id, shift_date, opens_at, closes_at, pharmacies ( name )')
    .gte('shift_date', desdeIso)
    .order('shift_date', { ascending: true });

  if (error) {
    console.error('Error al cargar turnos:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar los turnos.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay turnos cargados. La página pública va a avisar que no hay dato.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((shift) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    const [y, m, d] = shift.shift_date.split('-').map(Number);
    tdDate.textContent = new Date(y, m - 1, d).toLocaleDateString('es-AR', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
    tr.appendChild(tdDate);

    const tdName = document.createElement('td');
    tdName.textContent = shift.pharmacies?.name || '(farmacia borrada)';
    tr.appendChild(tdName);

    const tdHours = document.createElement('td');
    tdHours.textContent = `${shift.opens_at.slice(0, 5)} a ${shift.closes_at.slice(0, 5)}`;
    tr.appendChild(tdHours);

    const tdActions = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.className = 'action-btn btn-suspend';
    delBtn.textContent = 'Quitar';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`¿Quitar el turno del ${tdDate.textContent}?`)) return;
      const { error: delErr } = await supabase.from('pharmacy_shifts').delete().eq('id', shift.id);
      if (delErr) {
        showToast(delErr.message || 'No se pudo quitar el turno.', 'error');
        return;
      }
      showToast('Turno quitado.', 'success');
      fetchShifts();
    });
    tdActions.appendChild(delBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

function setupPharmacyForms() {
  const pharmacyForm = document.getElementById('pharmacy-form');
  pharmacyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = pharmacyForm.querySelector('button[type="submit"]');
    btn.disabled = true;

    const insurancesRaw = document.getElementById('pharmacy-insurances').value.trim();

    const { error } = await supabase.from('pharmacies').insert({
      name: document.getElementById('pharmacy-name').value.trim(),
      address: document.getElementById('pharmacy-address').value.trim(),
      phone: document.getElementById('pharmacy-phone').value.trim() || null,
      whatsapp: document.getElementById('pharmacy-whatsapp').value.trim() || null,
      pharmacist: document.getElementById('pharmacy-pharmacist').value.trim() || null,
      insurances: insurancesRaw ? insurancesRaw.split(',').map((s) => s.trim()).filter(Boolean) : null,
    });

    btn.disabled = false;

    if (error) {
      console.error('Error al agregar farmacia:', error);
      showToast(error.message || 'No se pudo agregar la farmacia.', 'error');
      return;
    }

    showToast('Farmacia agregada.', 'success');
    pharmacyForm.reset();
    fetchPharmacies();
  });

  const shiftForm = document.getElementById('shift-form');
  shiftForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = shiftForm.querySelector('button[type="submit"]');
    const pharmacyId = document.getElementById('shift-pharmacy').value;

    if (!pharmacyId) {
      showToast('Elegí una farmacia.', 'error');
      return;
    }

    btn.disabled = true;

    const { error } = await supabase.from('pharmacy_shifts').insert({
      pharmacy_id: pharmacyId,
      shift_date: document.getElementById('shift-date').value,
      opens_at: document.getElementById('shift-opens').value,
      closes_at: document.getElementById('shift-closes').value,
    });

    btn.disabled = false;

    if (error) {
      console.error('Error al asignar turno:', error);
      // La restricción unique(shift_date) es intencional: una farmacia de
      // guardia por día. El mensaje crudo de Postgres no lo explica.
      const msg = error.code === '23505'
        ? 'Ya hay una farmacia de turno para esa fecha. Quitá la existente antes de cargar otra.'
        : (error.message || 'No se pudo asignar el turno.');
      showToast(msg, 'error');
      return;
    }

    showToast('Turno asignado.', 'success');
    shiftForm.reset();
    document.getElementById('shift-opens').value = '08:00';
    document.getElementById('shift-closes').value = '08:00';
    fetchShifts();
  });
}

/** Las dos tablas de la sección se cargan juntas. */
async function loadPharmaciesSection() {
  await fetchPharmacies();
  await fetchShifts();
}

// --- F7-03: moderación de reseñas reportadas ---

async function fetchReportedReviews() {
  const tbody = document.getElementById('reviews-mod-tbody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando reseñas reportadas...</td></tr>';

  const { data, error } = await supabase
    .from('reviews')
    .select('id, rating, comment, is_hidden, report_reason, reported_at')
    .not('report_reason', 'is', null)
    .order('reported_at', { ascending: false });

  if (error) {
    console.error('Error fetching reported reviews:', error);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#ef4444;">Error al cargar las reseñas reportadas.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay reseñas reportadas.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((review) => {
    const tr = document.createElement('tr');

    const tdReview = document.createElement('td');
    const starsSpan = document.createElement('span');
    starsSpan.style.color = '#f59e0b';
    starsSpan.textContent = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    tdReview.appendChild(starsSpan);
    if (review.comment) {
      tdReview.appendChild(document.createElement('br'));
      const commentSmall = document.createElement('small');
      commentSmall.textContent = review.comment;
      tdReview.appendChild(commentSmall);
    }
    tr.appendChild(tdReview);

    const tdReason = document.createElement('td');
    tdReason.textContent = review.report_reason;
    tr.appendChild(tdReason);

    const tdStatus = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${review.is_hidden ? 'status-suspended' : 'status-approved'}`;
    statusBadge.textContent = review.is_hidden ? 'Oculta' : 'Visible';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const toggleBtn = document.createElement('button');
    toggleBtn.className = `action-btn ${review.is_hidden ? 'btn-reactivate' : 'btn-suspend'}`;
    toggleBtn.textContent = review.is_hidden ? 'Mostrar' : 'Ocultar';
    toggleBtn.addEventListener('click', async () => {
      const { error: updateError } = await supabase.from('reviews').update({ is_hidden: !review.is_hidden }).eq('id', review.id);
      if (updateError) {
        showToast('No se pudo actualizar la reseña.', 'error');
        console.error(updateError);
        return;
      }
      fetchReportedReviews();
    });
    tdActions.appendChild(toggleBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// --- F12-02: solicitudes de arrepentimiento (auditoría cross-tienda) ---
// El admin no resuelve la solicitud acá (eso lo hace el vendedor coordinando
// la devolución y usando "Cancelar" en su propio panel, F5-06) — esta vista
// es solo para auditar que no quede una solicitud sin atender.
async function fetchRevocationRequests() {
  const tbody = document.getElementById('revocations-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando solicitudes...</td></tr>';

  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total_price, revocation_requested_at, stores(name)')
    .not('revocation_requested_at', 'is', null)
    .order('revocation_requested_at', { ascending: false });

  if (error) {
    console.error('Error fetching revocation requests:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar las solicitudes.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay solicitudes de arrepentimiento.</td></tr>';
    return;
  }

  tbody.innerHTML = '';
  data.forEach((order) => {
    const tr = document.createElement('tr');

    const tdOrder = document.createElement('td');
    tdOrder.textContent = `#${order.id.slice(0, 8).toUpperCase()}`;
    tr.appendChild(tdOrder);

    const tdStore = document.createElement('td');
    tdStore.textContent = order.stores?.name || 'Comercio';
    tr.appendChild(tdStore);

    const tdTotal = document.createElement('td');
    tdTotal.textContent = `$${order.total_price.toLocaleString('es-AR')}`;
    tr.appendChild(tdTotal);

    const tdRequested = document.createElement('td');
    tdRequested.textContent = new Date(order.revocation_requested_at).toLocaleDateString('es-AR');
    tr.appendChild(tdRequested);

    const tdStatus = document.createElement('td');
    const resolved = order.status === 'cancelled';
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge ${resolved ? 'status-approved' : 'status-pending'}`;
    statusBadge.textContent = resolved ? 'Resuelto (cancelado)' : 'Pendiente de resolución';
    tdStatus.appendChild(statusBadge);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });
}

// --- F12-10: panel de errores de cliente (error_logs, A113-171) ---
// Hasta ahora solo se podían leer con SQL directo en el dashboard de Supabase.
// Vista de solo lectura -- no hay "resolver"/"archivar", es telemetría de
// diagnóstico, no un flujo con estados. Limitado a los últimos 100 (no es un
// visor de historial completo, es para detectar problemas recientes).
async function fetchErrorLogs() {
  const tbody = document.getElementById('error-logs-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando errores...</td></tr>';

  const { data, error } = await supabase
    .from('error_logs')
    .select('id, message, stack, url, user_id, user_agent, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching error logs:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar los errores.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No hay errores registrados.</td></tr>';
    return;
  }

  // error_logs.user_id referencia auth.users, no profiles -> segunda consulta
  // por los distintos user_id de la página (mismo patrón que phoneByClientId
  // en vender.js/repartidor.js, F12-05).
  const userIds = [...new Set(data.map((log) => log.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, email').in('id', userIds)
    : { data: [] };
  const emailByUserId = new Map((profiles || []).map((p) => [p.id, p.email]));

  tbody.innerHTML = '';
  data.forEach((log) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(log.created_at).toLocaleString('es-AR');
    tr.appendChild(tdDate);

    const tdUser = document.createElement('td');
    tdUser.textContent = log.user_id ? (emailByUserId.get(log.user_id) || 'Usuario eliminado') : 'Invitado';
    tr.appendChild(tdUser);

    const tdMessage = document.createElement('td');
    tdMessage.style.cssText = 'max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    tdMessage.textContent = log.message;
    tdMessage.title = log.message;
    tr.appendChild(tdMessage);

    const tdUrl = document.createElement('td');
    tdUrl.style.cssText = 'max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    tdUrl.textContent = log.url || '—';
    tdUrl.title = log.url || '';
    tr.appendChild(tdUrl);

    const tdActions = document.createElement('td');
    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'action-btn';
    detailBtn.textContent = 'Ver detalle';
    detailBtn.addEventListener('click', () => {
      alert(
        `Mensaje:\n${log.message}\n\nURL: ${log.url || '—'}\n\nUser agent: ${log.user_agent || '—'}\n\nStack:\n${log.stack || '(sin stack trace)'}`
      );
    });
    tdActions.appendChild(detailBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// --- F12-11 + P0-5: soporte/reclamos (support_tickets, 46/54_support_tickets) ---
// El admin cambia el estado Y responde en el hilo (mensajes bidireccionales).
const SUPPORT_STATUSES = ['open', 'in_progress', 'resolved', 'cancelled'];

async function fetchSupportTickets() {
  const tbody = document.getElementById('support-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Cargando reclamos...</td></tr>';

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, message, status, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching support tickets:', error);
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444;">Error al cargar los reclamos.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay reclamos registrados.</td></tr>';
    return;
  }

  const userIds = [...new Set(data.map((t) => t.user_id).filter(Boolean))];
  const { data: profiles } = userIds.length
    ? await supabase.from('profiles').select('id, email').in('id', userIds)
    : { data: [] };
  const emailByUserId = new Map((profiles || []).map((p) => [p.id, p.email]));

  tbody.innerHTML = '';
  data.forEach((ticket) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(ticket.created_at).toLocaleString('es-AR');
    tr.appendChild(tdDate);

    const tdUser = document.createElement('td');
    tdUser.textContent = emailByUserId.get(ticket.user_id) || 'Usuario eliminado';
    tr.appendChild(tdUser);

    const tdSubject = document.createElement('td');
    tdSubject.textContent = ticket.subject;
    tr.appendChild(tdSubject);

    const tdMessage = document.createElement('td');
    tdMessage.style.cssText = 'max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    tdMessage.textContent = ticket.message;
    tdMessage.title = ticket.message;
    tr.appendChild(tdMessage);

    const tdStatus = document.createElement('td');
    const statusSelect = document.createElement('select');
    statusSelect.style.cssText = 'padding: 0.35rem; width: auto;';
    SUPPORT_STATUSES.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = supportStatusLabel(s);
      if (s === ticket.status) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', async () => {
      const newStatus = statusSelect.value;
      statusSelect.disabled = true;
      const { error: updateError } = await supabase
        .from('support_tickets')
        .update({ status: newStatus })
        .eq('id', ticket.id);

      if (updateError) {
        console.error('Error al actualizar el estado del reclamo:', updateError);
        showToast('No se pudo actualizar el estado.', 'error');
        statusSelect.value = ticket.status;
      } else {
        ticket.status = newStatus;
        showToast('Estado actualizado.', 'success');
      }
      statusSelect.disabled = false;
    });
    tdStatus.appendChild(statusSelect);
    tr.appendChild(tdStatus);

    const tdActions = document.createElement('td');
    const replyBtn = document.createElement('button');
    replyBtn.type = 'button';
    replyBtn.style.cssText = 'padding: 0.35rem 0.7rem; border: 1px solid var(--bl-primary, #2563eb); color: var(--bl-primary, #2563eb); background: white; border-radius: 6px; cursor: pointer; font-size: 0.85rem;';
    replyBtn.textContent = 'Ver hilo';
    replyBtn.addEventListener('click', () => toggleAdminTicketThread(tr, ticket));
    tdActions.appendChild(replyBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

async function toggleAdminTicketThread(tr, ticket) {
  const existing = tr.nextSibling;
  if (existing && existing.classList?.contains('ticket-thread-row')) {
    existing.remove();
    return;
  }

  const threadRow = document.createElement('tr');
  threadRow.classList.add('ticket-thread-row');
  const threadCell = document.createElement('td');
  threadCell.colSpan = 6;
  threadCell.style.cssText = 'padding: 1rem; background: var(--bl-surface-alt, #f0f4f8);';

  const threadDiv = document.createElement('div');
  threadDiv.style.cssText = 'max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.75rem;';
  threadCell.appendChild(threadDiv);

  const loadingP = document.createElement('p');
  loadingP.style.cssText = 'color: var(--bl-text-muted, #94a3b8); font-size: 0.85rem;';
  loadingP.textContent = 'Cargando mensajes...';
  threadDiv.appendChild(loadingP);

  const { data: messages, error } = await supabase
    .from('support_ticket_messages')
    .select('id, sender_id, message, created_at')
    .eq('ticket_id', ticket.id)
    .order('created_at', { ascending: true });

  threadDiv.innerHTML = '';

  if (error) {
    const errP = document.createElement('p');
    errP.style.cssText = 'color: #ef4444; font-size: 0.85rem;';
    errP.textContent = 'Error al cargar los mensajes.';
    threadDiv.appendChild(errP);
  } else if (!messages || messages.length === 0) {
    const noMsgs = document.createElement('p');
    noMsgs.style.cssText = 'color: var(--bl-text-muted, #94a3b8); font-size: 0.85rem;';
    noMsgs.textContent = 'Todavía no hay mensajes en el hilo.';
    threadDiv.appendChild(noMsgs);
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    const myId = session?.user?.id;
    messages.forEach((m) => {
      const isMine = m.sender_id === myId;
      const bubble = document.createElement('div');
      bubble.style.cssText = `padding: 0.5rem 0.75rem; border-radius: 12px; max-width: 80%; font-size: 0.875rem; ${isMine ? 'align-self: flex-end; background: var(--bl-primary, #2563eb); color: white;' : 'align-self: flex-start; background: white;'}`;
      bubble.textContent = m.message;
      const meta = document.createElement('div');
      meta.style.cssText = `font-size: 0.7rem; color: ${isMine ? 'rgba(255,255,255,0.7)' : 'var(--bl-text-muted, #94a3b8)'}; margin-top: 0.2rem;`;
      meta.textContent = new Date(m.created_at).toLocaleString('es-AR');
      bubble.appendChild(meta);
      threadDiv.appendChild(bubble);
    });
  }

  if (ticket.status !== 'cancelled' && ticket.status !== 'resolved') {
    const replyForm = document.createElement('div');
    replyForm.style.cssText = 'display: flex; gap: 0.5rem;';

    const replyInput = document.createElement('textarea');
    replyInput.placeholder = 'Escribí una respuesta al usuario...';
    replyInput.maxLength = 2000;
    replyInput.style.cssText = 'flex: 1; padding: 0.5rem; border: 1px solid var(--bl-border, #e2e8f0); border-radius: var(--bl-radius-sm, 0.375rem); min-height: 60px; font-family: inherit; resize: vertical;';
    replyForm.appendChild(replyInput);

    const sendBtn = document.createElement('button');
    sendBtn.type = 'button';
    sendBtn.style.cssText = 'align-self: flex-end; padding: 0.5rem 1rem; background: var(--bl-primary, #2563eb); color: white; border: none; border-radius: var(--bl-radius-md, 0.5rem); cursor: pointer; font-weight: 600;';
    sendBtn.textContent = 'Enviar';
    replyForm.appendChild(sendBtn);

    sendBtn.addEventListener('click', async () => {
      const msg = replyInput.value.trim();
      if (!msg) return;
      sendBtn.disabled = true;
      sendBtn.textContent = 'Enviando...';
      const { data: { session } } = await supabase.auth.getSession();
      const { error: insertError } = await supabase.from('support_ticket_messages').insert({
        ticket_id: ticket.id,
        sender_id: session.user.id,
        message: msg,
      });
      if (insertError) {
        showToast(insertError.message || 'No se pudo enviar.', 'error');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Enviar';
        return;
      }
      showToast('Respuesta enviada.', 'success');
      threadRow.remove();
      toggleAdminTicketThread(tr, ticket);
    });

    threadCell.appendChild(replyForm);
  } else {
    const closed = document.createElement('p');
    closed.style.cssText = 'font-size: 0.85rem; color: var(--bl-text-muted, #94a3b8);';
    closed.textContent = ticket.status === 'cancelled' ? 'Reclamo cancelado por el usuario.' : 'Reclamo resuelto.';
    threadCell.appendChild(closed);
  }

  threadRow.appendChild(threadCell);
  tr.after(threadRow);
}

// --- F12-12: log de auditoría de admin (admin_audit_log, 47_admin_audit_log.sql) ---
// Poblado solo por el trigger log_admin_action (SECURITY DEFINER) -- no hay
// insert directo expuesto, esta vista es de solo lectura.
const AUDIT_ACTION_LABELS = { insert: 'Creó', update: 'Modificó', delete: 'Borró' };

async function fetchAuditLog() {
  const tbody = document.getElementById('audit-log-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Cargando log...</td></tr>';

  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('id, admin_id, action, target_table, target_id, details, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('Error fetching audit log:', error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">Error al cargar el log.</td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Todavía no hay acciones de admin registradas.</td></tr>';
    return;
  }

  const adminIds = [...new Set(data.map((log) => log.admin_id).filter(Boolean))];
  const { data: profiles } = adminIds.length
    ? await supabase.from('profiles').select('id, email').in('id', adminIds)
    : { data: [] };
  const emailByAdminId = new Map((profiles || []).map((p) => [p.id, p.email]));

  tbody.innerHTML = '';
  data.forEach((log) => {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(log.created_at).toLocaleString('es-AR');
    tr.appendChild(tdDate);

    const tdAdmin = document.createElement('td');
    tdAdmin.textContent = log.admin_id ? (emailByAdminId.get(log.admin_id) || 'Admin eliminado') : '—';
    tr.appendChild(tdAdmin);

    const tdAction = document.createElement('td');
    tdAction.textContent = AUDIT_ACTION_LABELS[log.action] || log.action;
    tr.appendChild(tdAction);

    const tdTable = document.createElement('td');
    tdTable.textContent = log.target_table;
    tr.appendChild(tdTable);

    const tdActions = document.createElement('td');
    const detailBtn = document.createElement('button');
    detailBtn.type = 'button';
    detailBtn.className = 'action-btn';
    detailBtn.textContent = 'Ver detalle';
    detailBtn.addEventListener('click', () => {
      alert(
        `Tabla: ${log.target_table}\nID: ${log.target_id || '—'}\n\nDatos:\n${JSON.stringify(log.details, null, 2)}`
      );
    });
    tdActions.appendChild(detailBtn);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  });
}

// --- Navegación por secciones con carga perezosa ---
// Antes se cargaban las 14 secciones de una sola vez al iniciar (13 fetches
// en paralelo). Ahora cada sección carga sus datos la primera vez que se
// abre; los botones "Refrescar" siguen forzando una recarga.
const SECTION_LOADERS = {
  'metrics': loadGlobalMetrics,
  'seller-requests': fetchRequests,
  'delivery-requests': fetchDeliveryRequests,
  'categories': fetchCategories,
  'coupons': fetchCoupons,
  'pharmacies': loadPharmaciesSection,
  'stores-mod': fetchStoresForModeration,
  'products-mod': null, // se llena al buscar (setupProductSearch)
  'repartidores-mod': fetchRepartidoresForModeration,
  'reviews-mod': fetchReportedReviews,
  'proofs': fetchPendingProofsAdmin,
  'revocations': fetchRevocationRequests,
  'support': fetchSupportTickets,
  'error-logs': fetchErrorLogs,
  'audit-log': fetchAuditLog,
};

const loadedSections = new Set();

function showSection(key) {
  const section = document.querySelector(`.admin-section[data-section="${key}"]`);
  if (!section || section.dataset.disabled === 'true') return;

  document.querySelectorAll('.admin-section').forEach((s) => {
    s.classList.toggle('is-active', s === section);
  });

  document.querySelectorAll('.admin-nav__item[data-target]').forEach((item) => {
    const active = item.dataset.target === key;
    item.classList.toggle('is-active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });

  const titleEl = section.querySelector('.admin-section__title');
  const heading = document.getElementById('admin-current-title');
  if (titleEl && heading) heading.textContent = titleEl.textContent;

  // Carga perezosa: solo la primera vez que se abre la sección.
  if (!loadedSections.has(key) && SECTION_LOADERS[key]) {
    loadedSections.add(key);
    SECTION_LOADERS[key]();
  }

  window.scrollTo({ top: 0, behavior: 'auto' });
  closeSidebar();
}

// --- Drawer móvil ---
function openSidebar() {
  document.getElementById('admin-sidebar')?.classList.add('is-open');
  const scrim = document.getElementById('admin-scrim');
  if (scrim) { scrim.hidden = false; scrim.classList.add('is-open'); }
  document.getElementById('admin-menu-toggle')?.setAttribute('aria-expanded', 'true');
}

function closeSidebar() {
  document.getElementById('admin-sidebar')?.classList.remove('is-open');
  const scrim = document.getElementById('admin-scrim');
  if (scrim) { scrim.classList.remove('is-open'); scrim.hidden = true; }
  document.getElementById('admin-menu-toggle')?.setAttribute('aria-expanded', 'false');
}

function setupSectionNav() {
  document.querySelectorAll('.admin-nav__item[data-target]').forEach((item) => {
    item.addEventListener('click', () => showSection(item.dataset.target));
  });

  const toggle = document.getElementById('admin-menu-toggle');
  toggle?.addEventListener('click', () => {
    const isOpen = document.getElementById('admin-sidebar')?.classList.contains('is-open');
    if (isOpen) closeSidebar(); else openSidebar();
  });
  document.getElementById('admin-scrim')?.addEventListener('click', closeSidebar);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
}

function initAdminPage() {
  document.getElementById('admin-content').style.display = 'block';

  document.getElementById('btn-refresh').addEventListener('click', fetchRequests);
  document.getElementById('btn-refresh-delivery').addEventListener('click', fetchDeliveryRequests);
  document.getElementById('btn-refresh-metrics').addEventListener('click', loadGlobalMetrics);
  document.getElementById('btn-refresh-categories').addEventListener('click', fetchCategories);
  document.getElementById('btn-refresh-coupons').addEventListener('click', fetchCoupons);
  document.getElementById('btn-refresh-pharmacies').addEventListener('click', loadPharmaciesSection);
  document.getElementById('btn-refresh-stores-mod').addEventListener('click', fetchStoresForModeration);
  document.getElementById('btn-refresh-repartidores-mod').addEventListener('click', fetchRepartidoresForModeration);
  document.getElementById('btn-refresh-proofs').addEventListener('click', fetchPendingProofsAdmin);
  document.getElementById('btn-refresh-reviews-mod').addEventListener('click', fetchReportedReviews);
  document.getElementById('btn-refresh-revocations').addEventListener('click', fetchRevocationRequests);
  document.getElementById('btn-refresh-error-logs').addEventListener('click', fetchErrorLogs);
  document.getElementById('btn-refresh-support').addEventListener('click', fetchSupportTickets);
  document.getElementById('btn-refresh-audit-log').addEventListener('click', fetchAuditLog);

  setupCategoryForm();
  setupCouponForm();
  setupPharmacyForms();
  setupProductSearch();
  setupSectionNav();

  // Abrir la primera sección visible (respeta el rol) y cargar solo esa.
  const firstNav = document.querySelector('.admin-nav__item[data-target]:not([hidden])');
  showSection(firstNav ? firstNav.dataset.target : 'metrics');
}

// F12-17: roles de admin granulares. 'moderador' es un rol más acotado --
// solo ve/gestiona reseñas reportadas y reclamos de soporte (F7-03/F12-11),
// nada financiero ni de configuración (cupones, categorías, comercios,
// métricas, log de auditoría, etc). Las policies de RLS son las que de
// verdad protegen cada tabla (ver 50_moderador_role.sql) -- esto solo
// oculta la UI que un moderador no puede usar, para que no vea opciones
// que van a fallar.
const MODERADOR_HIDDEN_SECTIONS = [
  'seller-requests', 'delivery-requests', 'metrics', 'categories', 'coupons',
  'pharmacies',
  'stores-mod', 'products-mod', 'repartidores-mod', 'proofs',
  'revocations', 'error-logs', 'audit-log',
];

function hideAdminSection(sectionKey) {
  const navItem = document.querySelector(`.admin-nav__item[data-target="${sectionKey}"]`);
  if (navItem) navItem.hidden = true;
  const section = document.querySelector(`.admin-section[data-section="${sectionKey}"]`);
  if (section) section.dataset.disabled = 'true';
}

function hideEmptyNavGroups() {
  document.querySelectorAll('.admin-nav__group').forEach((group) => {
    if (!group.querySelector('.admin-nav__item[data-target]:not([hidden])')) {
      group.hidden = true;
    }
  });
}

function applyRoleVisibility(role) {
  if (role !== 'moderador') return;
  MODERADOR_HIDDEN_SECTIONS.forEach(hideAdminSection);
  hideEmptyNavGroups();
}

guardPage({
  requireAuth: true,
  requireRole: ['admin', 'moderador'],
  onReady: (user) => {
    applyRoleVisibility(user?.app_metadata?.role);
    initAdminPage();
  }
});
