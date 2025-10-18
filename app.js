import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// 🔑 Replace with your Supabase credentials
const SUPABASE_URL = "https://dhfllljsncnjelftzisk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoZmxsbGpzbmNuamVsZnR6aXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4ODczOTUsImV4cCI6MjA2MzQ2MzM5NX0.EFl0NEiMwp3qM_hX_iFJoZHgV2EEERfpSmmBhjTZNuE";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;


// -------------------- IMAGE UPLOAD HELPER -------------------- //
async function uploadImage(file, folder = "uploads") {
  const fileName = `${folder}/${Date.now()}_${file.name}`;
  const { error } = await supabase.storage
    .from("minutt-media")
    .upload(fileName, file);

  if (error) {
    console.error("❌ Image upload failed:", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("minutt-media")
    .getPublicUrl(fileName);

  return urlData?.publicUrl || null;
}

// -------------------- RIDERS -------------------- //
async function fetchRiders() {
  try {
    const { data, error } = await supabase.from("riders").select("*");
    if (error) {
      console.error("❌ Failed to fetch riders:", error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error("❌ fetchRiders exception:", e);
    return [];
  }
}

// -------------------- ORDERS -------------------- //
async function fetchOrders() {
  const filterEl = document.getElementById("statusFilter");
  if (!filterEl) return;

  try {
    let query = supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false });
    if (filterEl.value) query = query.eq("status", filterEl.value);

    const { data: orders, error } = await query;
    const riders = await fetchRiders();
    const ordersContainer = document.getElementById("ordersContainer");
    const tableBody = document.getElementById("orders-table-body");

    if (ordersContainer) ordersContainer.innerHTML = "";
    if (tableBody) tableBody.innerHTML = "";

    if (error) {
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="7">Error loading orders</td></tr>`;
      if (ordersContainer) ordersContainer.innerHTML = "❌ Error loading orders";
      console.error("❌ fetchOrders error:", error.message);
      return;
    }

    if (!orders || orders.length === 0) {
      if (tableBody) tableBody.innerHTML = `<tr><td colspan="7">No orders found</td></tr>`;
      if (ordersContainer) ordersContainer.innerHTML = "No orders found";
      return;
    }

    orders.forEach(order => {
      // Build items HTML
      let itemsHTML = "";
      if (order.order_items && order.order_items.length > 0) {
        itemsHTML = `
          <ul>
            ${order.order_items.map(item => `
              <li>${item.product_name} (x${item.quantity}) - ₹${item.price}</li>
            `).join("")}
          </ul>
        `;
      } else {
        itemsHTML = "<p>No items found</p>";
      }

      // If using table view
      if (tableBody) {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${order.id}</td>
          <td>${order.customer_name}</td>
          <td>${order.customer_phone}</td>
          <td>${order.customer_address}</td>
          <td>₹${order.order_amount}</td>
          <td>${order.status}</td>
          <td>${order.created_at ? new Date(order.created_at).toLocaleString() : ""}</td>
        `;
        tableBody.appendChild(row);
      }

      // If using card/container view
      if (ordersContainer) {
        ordersContainer.innerHTML += `
          <div class="card">
            <h3>Order #${order.id}</h3>
            <p><strong>Name:</strong> ${order.customer_name}</p>
            <p><strong>Phone:</strong> ${order.customer_phone}</p>
            <p><strong>Address:</strong> ${order.customer_address}</p>
            <p><strong>Total:</strong> ₹${order.order_amount}</p>
            <p><strong>Status:</strong> ${order.status}</p>
            <p><strong>Items:</strong></p>
            ${itemsHTML}
            <label>Assign Rider:</label>
            <select onchange="assignRider(${order.id}, this.value)">
              <option value="">-- Select Rider --</option>
              ${riders.map(r => `
                <option value="${r.id}" ${order.rider_id === r.id ? "selected" : ""}>
                  ${r.name} (${r.status})
                </option>`).join("")}
            </select>
          </div>
        `;
      }
    });
  } catch (e) {
    console.error("❌ fetchOrders exception:", e);
  }
}

window.assignRider = async function(orderId, riderId) {
  if (!riderId) return;

  try {
    // Update order
    const { error: orderError } = await supabase
      .from("orders")
      .update({ rider_id: riderId, status: "assigned", assigned_at: new Date() })
      .eq("id", orderId);

    if (orderError) {
      alert("❌ Failed to assign order: " + orderError.message);
      return;
    }

    // Update rider
    const { error: riderError } = await supabase
      .from("riders")
      .update({ status: "busy" })
      .eq("id", riderId);

    if (riderError) {
      alert("❌ Failed to update rider: " + riderError.message);
      return;
    }

    alert("✅ Rider assigned!");
    fetchOrders();
  } catch (e) {
    console.error("❌ assignRider exception:", e);
    alert("❌ Something went wrong while assigning rider.");
  }
};

if (document.getElementById("statusFilter")) {
  document.getElementById("statusFilter").addEventListener("change", fetchOrders);
  fetchOrders();
}

// -------------------- CATEGORIES -------------------- //
async function fetchCategories() {
  if (!document.getElementById("categories-table-body")) return;

  try {
    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .order("created_at", { ascending: false });

    const tableBody = document.getElementById("categories-table-body");
    tableBody.innerHTML = "";

    if (error) {
      tableBody.innerHTML = `<tr><td colspan="5">Error loading categories</td></tr>`;
      console.error("❌ fetchCategories error:", error.message);
      return;
    }

    if (!categories || categories.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5">No categories found</td></tr>`;
      return;
    }

    categories.forEach(cat => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${cat.id}</td>
        <td>${cat.name}</td>
        <td>${cat.description || ""}</td>
        <td><img src="${cat.image_url}" alt="category" width="50"></td>
        <td>
          <button onclick="editCategory(${cat.id})">✏ Edit</button>
          <button onclick="deleteCategory(${cat.id})">🗑 Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (e) {
    console.error("❌ fetchCategories exception:", e);
  }
}

if (document.getElementById("addCategoryForm")) {
  document.getElementById("addCategoryForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("categoryName").value;
    const description = document.getElementById("categoryDesc").value;
    const file = document.getElementById("categoryImage").files[0];

    const image_url = file ? await uploadImage(file, "categories") : null;

    try {
      const { error } = await supabase
        .from("categories")
        .insert([{ name, description, image_url }]);

      if (error) {
        alert("❌ Failed to add category: " + error.message);
      } else {
        alert("✅ Category added!");
        document.getElementById("addCategoryForm").reset();
        fetchCategories();
      }
    } catch (e) {
      console.error("❌ addCategory exception:", e);
    }
  });

  fetchCategories();
}

window.deleteCategory = async function (id) {
  if (!confirm("Are you sure you want to delete this category?")) return;
  try {
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      alert("❌ Failed to delete category: " + error.message);
    } else {
      alert("✅ Category deleted!");
      fetchCategories();
    }
  } catch (e) {
    console.error("❌ deleteCategory exception:", e);
  }
};

window.editCategory = async function (id) {
  try {
    const { data: category, error } = await supabase.from("categories").select("*").eq("id", id).single();
    if (error || !category) {
      alert("❌ Failed to fetch category details");
      return;
    }
    const newName = prompt("Enter new category name:", category.name);
    const newDesc = prompt("Enter new category description:", category.description || "");
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    let newImageUrl = null;
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (file) newImageUrl = await uploadImage(file, "categories");
      const { error: updateError } = await supabase
        .from("categories")
        .update({
          name: newName,
          description: newDesc,
          image_url: newImageUrl || category.image_url,
        })
        .eq("id", id);
      if (updateError) {
        alert("❌ Failed to update category: " + updateError.message);
      } else {
        alert("✅ Category updated!");
        fetchCategories();
      }
    };
    fileInput.click();
  } catch (e) {
    console.error("❌ editCategory exception:", e);
  }
};

// -------------------- PRODUCTS -------------------- //
async function fetchCategoriesDropdown() {
  const dropdown = document.getElementById("productCategory");
  if (!dropdown) return;
  try {
    const { data: categories, error } = await supabase.from("categories").select("*");
    if (error) {
      console.error("❌ Failed to fetch categories:", error.message);
      return;
    }
    dropdown.innerHTML = "";
    categories.forEach(cat => {
      const option = document.createElement("option");
      option.value = cat.id;
      option.textContent = cat.name;
      dropdown.appendChild(option);
    });
  } catch (e) {
    console.error("❌ fetchCategoriesDropdown exception:", e);
  }
}

async function fetchProducts() {
  if (!document.getElementById("products-table-body")) return;
  try {
    const { data: products, error } = await supabase
      .from("products")
      .select("*, categories(name)")
      .order("created_at", { ascending: false });
    const tableBody = document.getElementById("products-table-body");
    tableBody.innerHTML = "";
    if (error) {
      tableBody.innerHTML = `<tr><td colspan="9">Error loading products</td></tr>`;
      console.error("❌ fetchProducts error:", error.message);
      return;
    }
    if (!products || products.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="9">No products found</td></tr>`;
      return;
    }
    products.forEach(product => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${product.id}</td>
        <td>${product.name}</td>
        <td>${product.description || ""}</td>
        <td>₹${product.price}</td>
        <td><img src="${product.image_url}" alt="product" width="50"></td>
        <td>${product.categories ? product.categories.name : "Uncategorized"}</td>
        <td>${product.stock}</td>
        <td>${product.status}</td>
        <td>
          <button onclick="editProduct(${product.id})">✏ Edit</button>
          <button onclick="deleteProduct(${product.id})">🗑 Delete</button>
        </td>
      `;
      tableBody.appendChild(row);
    });
  } catch (e) {
    console.error("❌ fetchProducts exception:", e);
  }
}

if (document.getElementById("addProductForm")) {
  document.getElementById("addProductForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const name = document.getElementById("productName").value;
      const description = document.getElementById("productDesc").value;
      const price = parseFloat(document.getElementById("productPrice").value);
      const stock = parseInt(document.getElementById("productStock").value);
      const category_id = parseInt(document.getElementById("productCategory").value);
      const file = document.getElementById("productImage").files[0];
      const image_url = file ? await uploadImage(file, "products") : null;
      const { error } = await supabase
        .from("products")
        .insert([{ name, description, price, stock, category_id, image_url, status: "active" }]);
      if (error) {
        alert("❌ Failed to add product: " + error.message);
      } else {
        alert("✅ Product added!");
        document.getElementById("addProductForm").reset();
        fetchProducts();
      }
    } catch (e) {
      console.error("❌ addProduct exception:", e);
    }
  });
  fetchCategoriesDropdown();
  fetchProducts();
}

window.deleteProduct = async function (id) {
  if (!confirm("Are you sure you want to delete this product?")) return;
  try {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      alert("❌ Failed to delete product: " + error.message);
    } else {
      alert("✅ Product deleted!");
      fetchProducts();
    }
  } catch (e) {
    console.error("❌ deleteProduct exception:", e);
  }
};

window.editProduct = async function (id) {
  try {
    const { data: product, error } = await supabase.from("products").select("*").eq("id", id).single();
    if (error || !product) {
      alert("❌ Failed to fetch product details");
      return;
    }
    const newName = prompt("Enter new product name:", product.name);
    const newDesc = prompt("Enter new description:", product.description || "");
    const newPrice = prompt("Enter new price:", product.price);
    const newStock = prompt("Enter new stock:", product.stock);
    const newStatus = prompt("Enter new status (active/inactive):", product.status);
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    let newImageUrl = null;
    fileInput.onchange = async () => {
      const file = fileInput.files[0];
      if (file) newImageUrl = await uploadImage(file, "products");
      const { error: updateError } = await supabase
        .from("products")
        .update({
          name: newName,
          description: newDesc,
          price: parseFloat(newPrice),
          stock: parseInt(newStock),
          status: newStatus,
          image_url: newImageUrl || product.image_url,
        })
        .eq("id", id);
      if (updateError) {
        alert("❌ Failed to update product: " + updateError.message);
      } else {
        alert("✅ Product updated!");
        fetchProducts();
      }
    };
    fileInput.click();
  } catch (e) {
    console.error("❌ editProduct exception:", e);
  }
};

// -------------------- SETTINGS -------------------- //
async function fetchDeliveryFee() {
  const el = document.getElementById("deliveryFee");
  if (!el) return;

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("*")
      .eq("key", "delivery_fee")
      .limit(1);

    if (error) {
      console.error("❌ Failed to fetch delivery fee:", error.message);
      return;
    }

    if (data && data.length > 0) {
      el.value = data[0].value;
    }
  } catch (e) {
    console.error("❌ fetchDeliveryFee exception:", e);
  }
}

if (document.getElementById("deliveryFeeForm")) {
  document.getElementById("deliveryFeeForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const feeEl = document.getElementById("deliveryFee");
    if (!feeEl) return;
    const fee = feeEl.value;
    try {
      const { error } = await supabase
        .from("settings")
        .upsert([{ key: "delivery_fee", value: fee }], { onConflict: "key" });
      if (error) {
        alert("❌ Failed to save delivery fee: " + error.message);
      } else {
        alert("✅ Delivery fee updated!");
      }
    } catch (e) {
      console.error("❌ save delivery fee exception:", e);
    }
  });
  fetchDeliveryFee();
}

// -------------------- BANNERS -------------------- //

// Fetch the latest banner
async function fetchBanner() {
  try {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("❌ Failed to fetch banner:", error.message);
      return;
    }

    if (data && data.length > 0) {
      const banner = data[0];
      document.getElementById("bannerPreview").innerHTML = `
        <img src="${banner.image_url}" width="200" alt="Banner" />
        <p><strong>${banner.title}</strong></p>
      `;
    } else {
      document.getElementById("bannerPreview").innerHTML =
        "<p>No banner uploaded yet.</p>";
    }
  } catch (err) {
    console.error("❌ fetchBanner exception:", err);
  }
}

// Upload new banner
if (document.getElementById("bannerForm")) {
  document
    .getElementById("bannerForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const file = document.getElementById("bannerImage").files[0];
      if (!file) return;

      const fileName = `banners/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("minutt-media")
        .upload(fileName, file, { upsert: true });

      if (uploadError) {
        alert("❌ Failed to upload banner: " + uploadError.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("minutt-media")
        .getPublicUrl(fileName);

      const image_url = urlData.publicUrl;

      const { error } = await supabase
        .from("banners")
        .upsert([
          {
            title: "Home Banner",
            image_url: image_url,
            is_active: true,
            created_at: new Date(),
          },
        ]);

      if (error) {
        alert("❌ Failed to save banner: " + error.message);
        return;
      }

      alert("✅ Banner updated!");
      fetchBanner();
    });

  fetchBanner();
}

// -------------------- INITIAL LOADS -------------------- //
fetchCategories();
fetchOrders();
fetchProducts();
fetchCategoriesDropdown();
fetchBanner();
fetchDeliveryFee();
