import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import DeliveryReceipt from '../components/DeliveryReceipt';

interface Product {
  id: string;
  name: string;
  selling_price: number;
  sku: string;
  category_id: string | null;
  company_id: string;
}

interface Warehouse {
  id: string;
  name: string;
  company_id: string;
  company_name: string;
}

interface StockInfo {
  product_id: string;
  quantity: number;
}

interface CartItem extends Product {
  quantity: number;
  cartItemId?: string;
  identifier?: {
    id: string;
    product_identifier?: string;
    model?: string;
    mac?: string;
    dev_id?: string;
  };
}

interface Category {
  id: string;
  name: string;
  company_id: string;
}

interface Voucher {
  id: string;
  code: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_purchase_amount: number;
  max_usage: number;
  current_usage: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
}

interface Bank {
  id: string;
  bank_name: string;
  current_amount: number;
  company_id: string;
}

interface ProductIdentifier {
  id: string;
  product_identifier?: string;
  model?: string;
  mac?: string;
  dev_id?: string;
}

export default function POS() {
  const { profile, allowedWarehouseIds, currentCompanyId, isHeadquarters } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [discount, setDiscount] = useState('');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [selectedVoucherId, setSelectedVoucherId] = useState<string | null>(null);
  const [showIdentifierModal, setShowIdentifierModal] = useState(false);
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [productIdentifiers, setProductIdentifiers] = useState<ProductIdentifier[]>([]);
  const [identifierSearchQuery, setIdentifierSearchQuery] = useState('');
  const [usedIdentifierIds, setUsedIdentifierIds] = useState<Set<string>>(new Set());
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransactionNumber, setLastTransactionNumber] = useState('');
  const [deliveryAgentName, setDeliveryAgentName] = useState('');
  const [deliveredTo, setDeliveredTo] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [editableSubtotal, setEditableSubtotal] = useState<string>('');
  const [editableTotal, setEditableTotal] = useState<string>('');
  const [editedPrices, setEditedPrices] = useState<Record<string, string>>({});
  const [banks, setBanks] = useState<Bank[]>([]);
  const [selectedBank, setSelectedBank] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  useEffect(() => {
    if (profile) loadData();
  }, [profile, currentCompanyId, isHeadquarters]);

  useEffect(() => {
    if (selectedWarehouse) {
      setCart([]);
      loadStock();
    }
  }, [selectedWarehouse, warehouses]);

  const loadData = async () => {
    if (!profile) return;
    setDataLoading(true);
    try {
      let loadedWarehouses: Warehouse[] = [];
      const mode = isAdmin && isHeadquarters ? 'hq' : isAdmin ? 'admin' : 'restricted';
      const data = await api.get<{
        warehouses: Warehouse[];
        products: Product[];
        categories: Category[];
        vouchers: Voucher[];
        banks: Bank[];
      }>(`/ops/pos/bootstrap?companyId=${currentCompanyId || profile.company_id}&mode=${mode}&allowedWarehouseIds=${allowedWarehouseIds.join(',')}`);

      const userWarehouses = data.warehouses || [];
      loadedWarehouses = userWarehouses;
      setProducts(data.products || []);
      setWarehouses(userWarehouses);
      setCategories(data.categories || []);
      setVouchers(data.vouchers || []);
      setBanks(data.banks || []);

      if (loadedWarehouses.length > 0 && !selectedWarehouse) {
        setSelectedWarehouse(loadedWarehouses[0].id);
      }
    } catch (error) {
      console.error('Error loading POS data:', error);
    } finally {
      setDataLoading(false);
    }
  };

  const loadStock = async () => {
    try {
      const selectedWarehouseObj = warehouses.find((w) => w.id === selectedWarehouse);
      if (!selectedWarehouseObj) return;

      const data = await api.get<StockInfo[]>(`/ops/stock?warehouseId=${selectedWarehouse}`);
      const map: Record<string, number> = {};
      (data || []).forEach((s: StockInfo) => { map[s.product_id] = s.quantity; });
      setStockMap(map);
    } catch (error) {
      console.error('Error loading stock:', error);
    }
  };

  const checkProductIdentifiers = async (product: Product) => {
    try {
      const data = await api.get<any[]>(`/ops/product-identifiers?productId=${product.id}&warehouseId=${selectedWarehouse}`);

      if (data && data.length > 0) {
        const filteredIdentifiers = data.filter(id => !id.warehouse_id || id.warehouse_id === selectedWarehouse);
        if (filteredIdentifiers.length > 0) {
          setProductIdentifiers(filteredIdentifiers);
          setPendingProduct(product);
          setShowIdentifierModal(true);
          return;
        }
      }
      proceedAddToCart(product);
    } catch (error) {
      console.error('Error checking product identifiers:', error);
      proceedAddToCart(product);
    }
  };


  const proceedAddToCart = async (product: Product, identifierId?: string) => {
    const available = stockMap[product.id] || 0;
    const inCart = cart.reduce((sum, item) => item.id === product.id ? sum + item.quantity : sum, 0);
    if (inCart >= available) {
      return;
    }

    let identifierData = undefined;
    if (identifierId) {
      const identifier = productIdentifiers.find(i => i.id === identifierId);
      if (identifier) {
        identifierData = {
          id: identifier.id,
          product_identifier: identifier.product_identifier,
          model: identifier.model,
          mac: identifier.mac,
          dev_id: identifier.dev_id,
        };
      }
    }

    if (identifierData) {
      const cartItemId = `${product.id}-${identifierData.id}`;
      const existing = cart.find((item) => item.cartItemId === cartItemId);
      if (existing) {
        setCart(cart.map((item) => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item));
      } else {
        setCart([...cart, { ...product, quantity: 1, cartItemId, identifier: identifierData }]);
        setUsedIdentifierIds((prev) => new Set([...prev, identifierData.id]));
      }
    } else {
      const cartItemId = `${product.id}-no-identifier`;
      const existing = cart.find((item) => item.cartItemId === cartItemId);
      if (existing) {
        setCart(cart.map((item) => item.cartItemId === cartItemId ? { ...item, quantity: item.quantity + 1 } : item));
      } else {
        setCart([...cart, { ...product, quantity: 1, cartItemId, identifier: undefined }]);
      }
    }
  };

  const addToCart = (product: Product) => {
    checkProductIdentifiers(product);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setImageError('Please select an image file');
      return;
    }

    if (!pendingProduct) {
      setImageError('Please select a product first');
      e.target.value = '';
      return;
    }

    setUploadingImage(true);
    setImageError('');
    try {
      const base64Image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const data = String(reader.result || '');
          resolve(data.includes(',') ? data.split(',')[1] : data);
        };
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(file);
      });

      const data = await api.post<{ identifiers?: Array<{ product_id?: string; model?: string; mac?: string; dev_id?: string }> }>(
        '/ops/ocr/identifier-image',
        { base64Image },
      );

      const normalized = (value?: string) => (value || '').trim().toLowerCase();
      const detected = (data.identifiers || []).find((ocr) => {
        return productIdentifiers.some((existing) => {
          const hasAnyMatch =
            (normalized(ocr.product_id) && normalized(existing.product_identifier) === normalized(ocr.product_id)) ||
            (normalized(ocr.model) && normalized(existing.model) === normalized(ocr.model)) ||
            (normalized(ocr.mac) && normalized(existing.mac) === normalized(ocr.mac)) ||
            (normalized(ocr.dev_id) && normalized(existing.dev_id) === normalized(ocr.dev_id));

          return hasAnyMatch && !usedIdentifierIds.has(existing.id);
        });
      });

      if (!detected) {
        setImageError('No matching identifier found from OCR. Please select manually.');
      } else {
        const match = productIdentifiers.find((existing) => {
          const hasAnyMatch =
            (normalized(detected.product_id) && normalized(existing.product_identifier) === normalized(detected.product_id)) ||
            (normalized(detected.model) && normalized(existing.model) === normalized(detected.model)) ||
            (normalized(detected.mac) && normalized(existing.mac) === normalized(detected.mac)) ||
            (normalized(detected.dev_id) && normalized(existing.dev_id) === normalized(detected.dev_id));
          return hasAnyMatch && !usedIdentifierIds.has(existing.id);
        });

        if (!match) {
          setImageError('No available identifier match found. Please select manually.');
        } else {
          proceedAddToCart(pendingProduct, match.id);
          setShowIdentifierModal(false);
          setPendingProduct(null);
          setProductIdentifiers([]);
          setIdentifierSearchQuery('');
        }
      }
    } catch (error: any) {
      setImageError(error?.message || 'Failed to process image');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const updateQuantity = (cartItemId: string, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    const cartItem = cart.find((item) => item.cartItemId === cartItemId);
    if (!cartItem) return;
    const available = stockMap[cartItem.id] || 0;
    if (newQty > available) return;
    setCart(cart.map((item) => item.cartItemId === cartItemId ? { ...item, quantity: newQty } : item));
  };

  const removeFromCart = (cartItemId: string) => {
    const cartItem = cart.find((item) => item.cartItemId === cartItemId);
    if (!cartItem) return;
    setCart(cart.filter((item) => item.cartItemId !== cartItemId));
    const newEditedPrices = { ...editedPrices };
    delete newEditedPrices[cartItemId];
    setEditedPrices(newEditedPrices);
    if (cartItem.identifier?.id) {
      setUsedIdentifierIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cartItem.identifier!.id);
        return newSet;
      });
    }
  };

  const originalSubtotal = cart.reduce((sum, item) => sum + item.selling_price * item.quantity, 0);
  const calculatedSubtotal = cart.reduce((sum, item) => {
    const itemPrice = editedPrices[item.cartItemId || item.id] ? parseFloat(editedPrices[item.cartItemId || item.id]) : item.selling_price;
    return sum + itemPrice * item.quantity;
  }, 0);
  const subtotal = editableSubtotal ? parseFloat(editableSubtotal) : calculatedSubtotal;

  const getVoucherDiscount = () => {
    if (!selectedVoucherId) return 0;
    const voucher = vouchers.find(v => v.id === selectedVoucherId);
    if (!voucher) return 0;

    const now = new Date();
    const validFrom = new Date(voucher.valid_from);
    const validUntil = voucher.valid_until ? new Date(voucher.valid_until) : null;

    if (!voucher.is_active || validFrom > now || (validUntil && validUntil < now)) return 0;
    if (calculatedSubtotal < voucher.min_purchase_amount) return 0;
    if (voucher.max_usage > 0 && voucher.current_usage >= voucher.max_usage) return 0;

    if (voucher.discount_type === 'percentage') {
      return (calculatedSubtotal * voucher.discount_value) / 100;
    } else {
      return voucher.discount_value;
    }
  };

  const voucherDiscount = getVoucherDiscount();
  const manualDiscount = parseFloat(discount) || 0;
  const totalDiscount = voucherDiscount + manualDiscount;
  const calculatedTotal = Math.max(0, subtotal - totalDiscount);
  const total = editableTotal ? parseFloat(editableTotal) : calculatedTotal;

  useEffect(() => {
    if (editableSubtotal && !editableTotal) {
      setEditableTotal('');
    }
  }, [editableSubtotal]);

  const handleCheckoutClick = () => {
    setShowDeliveryModal(true);
  };

  const handleConfirmCheckout = () => {
    setShowDeliveryModal(false);
    setShowConfirmation(true);
  };

  const processTransaction = async () => {
    if (!profile || cart.length === 0 || !selectedWarehouse) return;
    setLoading(true);
    try {
      const companyId = currentCompanyId || profile.company_id;

      const markupTotal = cart.reduce((sum, item) => {
        const editedPrice = editedPrices[item.cartItemId || item.id] ? parseFloat(editedPrices[item.cartItemId || item.id]) : item.selling_price;
        const markupPerItem = Math.max(0, editedPrice - item.selling_price) * item.quantity;
        return sum + markupPerItem;
      }, 0);

      const calculatedTotal = Math.max(0, subtotal - totalDiscount);
      const agentPrice = markupTotal;

      const transaction = await api.post<{ id: string; transaction_number: string }>('/ops/pos/checkout', {
        company_id: companyId,
        warehouse_id: selectedWarehouse,
        agent_id: profile.user_id,
        voucher_id: selectedVoucherId || null,
        subtotal: originalSubtotal,
        discount_amount: totalDiscount,
        total_amount: calculatedTotal,
        base_total: originalSubtotal,
        agent_price: agentPrice,
        payment_method: paymentMethod,
        bank_id: paymentMethod === 'bank' ? selectedBank : null,
        delivery_agent_name: deliveryAgentName,
        delivered_to: deliveredTo,
        delivery_address: deliveryAddress,
        items: cart.map((item) => {
          const editedPrice = editedPrices[item.cartItemId || item.id] ? parseFloat(editedPrices[item.cartItemId || item.id]) : item.selling_price;
          return {
            product_id: item.id,
            quantity: item.quantity,
            unit_price: item.selling_price,
            total_price: editedPrice * item.quantity,
            edited_unit_price: editedPrices[item.cartItemId || item.id] ? editedPrice : null,
            product_identifier: item.identifier?.product_identifier || null,
            model: item.identifier?.model || null,
            mac: item.identifier?.mac || null,
            dev_id: item.identifier?.dev_id || null,
            identifier_id: item.identifier?.id || null,
          };
        }),
      });

      setLastTransactionNumber(transaction.transaction_number);
      setShowReceipt(true);
      setCart([]);
      setUsedIdentifierIds(new Set());
      setDiscount('');
      setSelectedVoucherId(null);
      setDeliveryAgentName('');
      setDeliveredTo('');
      setDeliveryAddress('');
      setEditableSubtotal('');
      setEditableTotal('');
      setEditedPrices({});
      setPaymentMethod('cash');
      setSelectedBank('');
      setShowDeliveryModal(false);
      setShowConfirmation(false);
      await loadStock();
    } catch (error: any) {
      console.error('Error processing transaction:', error);
      alert(`Failed to process transaction: ${error?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const selectedWarehouseName = warehouses.find((w) => w.id === selectedWarehouse)?.name || '';
  const hasNoAssignedWarehouse = !isAdmin && allowedWarehouseIds.length === 0;

  const filteredProducts = products
    .filter((p) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
      const matchesCategory = !filterCategory || p.category_id === filterCategory;
      const hasStock = (stockMap[p.id] || 0) > 0;
      return matchesSearch && matchesCategory && hasStock;
    });

  if (dataLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (hasNoAssignedWarehouse) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-slate-600 mt-0.5 text-sm">Process sales transactions</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">No Warehouse Assigned</h2>
          <p className="text-slate-500 text-sm">You don't have any warehouse assigned to your account. Please contact your administrator to get warehouse access.</p>
        </div>
      </div>
    );
  }

  if (warehouses.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-slate-600 mt-0.5 text-sm">Process sales transactions</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <svg className="w-12 h-12 text-slate-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">No Warehouses Available</h2>
          <p className="text-slate-500 text-sm">There are no active warehouses set up yet. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  if (showReceipt && lastTransactionNumber) {
    return (
      <div className="space-y-4">
        <DeliveryReceipt
          transactionNumber={lastTransactionNumber}
          onClose={() => {
            setShowReceipt(false);
            setLastTransactionNumber('');
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showIdentifierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Select Product Variant</h2>
              <p className="text-sm text-slate-500 mt-1">{pendingProduct?.name} has multiple identifiers</p>
            </div>
            <div className="p-4 border-b border-slate-200 space-y-3">
              <div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                  className="hidden"
                  id="pos-product-image-upload"
                />
                <label
                  htmlFor="pos-product-image-upload"
                  className={`w-full cursor-pointer bg-white border-2 border-dashed border-slate-300 rounded-lg px-4 py-3 text-center hover:bg-slate-50 transition-colors block ${
                    uploadingImage ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    {uploadingImage ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-sm font-medium text-slate-600">Processing image...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-sm font-medium text-slate-600">Upload Product Image</span>
                      </>
                    )}
                  </div>
                </label>
                {imageError && (
                  <p className="mt-1.5 text-xs text-red-600 font-medium">{imageError}</p>
                )}
              </div>
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search identifier..."
                  value={identifierSearchQuery}
                  onChange={(e) => setIdentifierSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
            <div className="p-6 space-y-2 max-h-96 overflow-y-auto">
              {productIdentifiers
                .filter((identifier) => {
                  const searchText = identifierSearchQuery.toLowerCase();
                  const identifierText = [
                    identifier.product_identifier,
                    identifier.model,
                    identifier.mac,
                    identifier.dev_id,
                  ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                  return identifierText.includes(searchText);
                })
                .map((identifier) => {
                  const isUsed = usedIdentifierIds.has(identifier.id);
                  return (
                    <button
                      key={identifier.id}
                      onClick={() => {
                        if (pendingProduct && !isUsed) {
                          proceedAddToCart(pendingProduct, identifier.id);
                        }
                        setShowIdentifierModal(false);
                        setPendingProduct(null);
                        setProductIdentifiers([]);
                        setIdentifierSearchQuery('');
                        setImageError('');
                      }}
                      disabled={uploadingImage || isUsed}
                      className={`w-full p-3 text-left border rounded-lg transition-all ${
                        isUsed
                          ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-not-allowed opacity-50'
                          : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      <div className="text-sm font-medium">
                        {[
                          identifier.product_identifier && `ID: ${identifier.product_identifier}`,
                          identifier.model && `Model: ${identifier.model}`,
                          identifier.mac && `MAC: ${identifier.mac}`,
                          identifier.dev_id && `Device: ${identifier.dev_id}`,
                        ]
                          .filter(Boolean)
                          .join(' | ') || 'No identifiers specified'}
                      </div>
                      {isUsed && (
                        <div className="text-xs text-gray-600 mt-1">Already in cart</div>
                      )}
                    </button>
                  );
                })}
              {productIdentifiers.filter((identifier) => {
                const searchText = identifierSearchQuery.toLowerCase();
                const identifierText = [
                  identifier.product_identifier,
                  identifier.model,
                  identifier.mac,
                  identifier.dev_id,
                ]
                  .filter(Boolean)
                  .join(' ')
                  .toLowerCase();
                return identifierText.includes(searchText);
              }).length === 0 && (
                <p className="text-center py-4 text-slate-500 text-sm">No matching identifiers found</p>
              )}
            </div>
            <div className="p-4 border-t border-slate-200">
              <button
                onClick={() => {
                  setShowIdentifierModal(false);
                  setPendingProduct(null);
                  setProductIdentifiers([]);
                  setIdentifierSearchQuery('');
                  setImageError('');
                }}
                disabled={uploadingImage}
                className="w-full bg-slate-100 text-slate-700 py-2 rounded-lg hover:bg-slate-200 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Point of Sale</h1>
          <p className="text-slate-600 mt-0.5 text-sm">Process sales transactions</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            </svg>
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Company</span>
              <span className="text-sm font-medium text-blue-900">
                {warehouses.find((w) => w.id === selectedWarehouse)?.company_name || 'Loading...'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg">
            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            {warehouses.length === 1 ? (
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Warehouse</span>
                <span className="text-sm font-medium text-slate-700">
                  {isHeadquarters ? `${warehouses[0].company_name} - ${warehouses[0].name}` : warehouses[0].name}
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Warehouse</span>
                <select
                  value={selectedWarehouse}
                  onChange={(e) => setSelectedWarehouse(e.target.value)}
                  className="bg-transparent text-sm font-medium text-slate-700 border-none outline-none cursor-pointer pr-2"
                >
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {isHeadquarters ? `${w.company_name} - ${w.name}` : w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg bg-white text-sm"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
            >
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-3">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-10 h-10 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <p className="text-slate-500 text-sm font-medium">No products with stock in {selectedWarehouseName}</p>
                <p className="text-slate-400 text-xs mt-1">Products will appear here when stock is available</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {filteredProducts.map((product) => {
                  const stock = stockMap[product.id] || 0;
                  return (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="p-3 border border-slate-200 rounded-lg text-left transition-all hover:border-slate-400 hover:shadow-sm active:scale-[0.98]"
                    >
                      <p className="font-medium text-slate-900 text-sm truncate">{product.name}</p>
                      <p className="text-base font-bold text-slate-900 mt-1">{'\u20B1'}{Number(product.selling_price).toLocaleString()}</p>
                      <p className="text-xs mt-0.5 text-slate-500">{stock} available</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-3 uppercase tracking-wider">Cart</h2>

            <div className="space-y-2 mb-4 max-h-[40vh] overflow-y-auto">
              {cart.length === 0 ? (
                <p className="text-slate-400 text-center py-6 text-sm">No items in cart</p>
              ) : (
                cart.map((item) => {
                  const cartItemId = item.cartItemId || item.id;
                  const isEdited = !!editedPrices[cartItemId];
                  return (
                    <div key={cartItemId} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{item.name}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-slate-500">₱</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editedPrices[cartItemId] || ''}
                            onChange={(e) => {
                              if (e.target.value === '') {
                                const newPrices = { ...editedPrices };
                                delete newPrices[cartItemId];
                                setEditedPrices(newPrices);
                              } else {
                                setEditedPrices({ ...editedPrices, [cartItemId]: e.target.value });
                              }
                            }}
                            placeholder={item.selling_price.toLocaleString()}
                            className={`w-16 px-1 py-0.5 border rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-slate-900 ${
                              isEdited ? 'bg-blue-50 border-blue-300' : 'bg-white border-slate-200'
                            }`}
                          />
                        </div>
                        {item.identifier && (
                          <div className="text-xs text-slate-600 mt-0.5 font-mono">
                            {[
                              item.identifier.product_identifier && `ID: ${item.identifier.product_identifier}`,
                              item.identifier.model && `Model: ${item.identifier.model}`,
                              item.identifier.mac && `MAC: ${item.identifier.mac}`,
                              item.identifier.dev_id && `Dev: ${item.identifier.dev_id}`,
                            ].filter(Boolean).join(' • ')}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          max={stockMap[item.id] || 999}
                          value={item.quantity}
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            if (!isNaN(value) && value > 0) {
                              updateQuantity(cartItemId, value);
                            }
                          }}
                          className="w-14 px-2 py-1 border border-slate-300 rounded text-sm text-center font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                      <button
                        onClick={() => removeFromCart(cartItemId)}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-slate-200 pt-3 space-y-2">
              <div className="flex justify-between items-center text-sm text-slate-600">
                <span>Subtotal</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editableSubtotal}
                    onChange={(e) => setEditableSubtotal(e.target.value)}
                    placeholder={calculatedSubtotal.toFixed(2)}
                    className="w-24 px-2 py-1 border border-slate-300 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-slate-900 bg-blue-50"
                  />
                </div>
              </div>

              {vouchers.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Voucher</label>
                  <select
                    value={selectedVoucherId || ''}
                    onChange={(e) => setSelectedVoucherId(e.target.value || null)}
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                  >
                    <option value="">No Voucher</option>
                    {vouchers.map((v) => {
                      const now = new Date();
                      const validFrom = new Date(v.valid_from);
                      const validUntil = v.valid_until ? new Date(v.valid_until) : null;
                      const isValid = v.is_active && validFrom <= now && (!validUntil || validUntil >= now) &&
                        (v.max_usage === 0 || v.current_usage < v.max_usage) &&
                        calculatedSubtotal >= v.min_purchase_amount;

                      return (
                        <option key={v.id} value={v.id} disabled={!isValid}>
                          {v.code} - {v.discount_type === 'percentage' ? `${v.discount_value}%` : `₱${v.discount_value}`}
                          {!isValid && ' (unavailable)'}
                        </option>
                      );
                    })}
                  </select>
                  {selectedVoucherId && voucherDiscount > 0 && (
                    <div className="mt-1 text-xs text-emerald-600 font-medium">
                      Voucher saving: ₱{voucherDiscount.toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Manual Discount</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">₱</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 text-sm text-right"
                  />
                </div>
              </div>

              {totalDiscount > 0 && (
                <div className="flex justify-between text-sm text-emerald-600 font-medium">
                  <span>Total Discount</span>
                  <span className="tabular-nums">-₱{totalDiscount.toLocaleString()}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-lg font-bold text-slate-900 pt-1">
                <span>Total</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editableTotal}
                    onChange={(e) => setEditableTotal(e.target.value)}
                    placeholder={calculatedTotal.toFixed(2)}
                    className="w-28 px-2 py-1 border border-slate-300 rounded text-lg font-bold text-right focus:outline-none focus:ring-2 focus:ring-slate-900 bg-emerald-50"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5 uppercase tracking-wider">Payment Method</label>
                <div className="flex gap-1.5">
                  {['cash', 'gcash', 'card', 'bank'].map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentMethod(method)}
                      className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                        paymentMethod === method ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'bank' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Select Bank</label>
                  {banks.length > 0 ? (
                    <select
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value)}
                      className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    >
                      <option value="">Choose a bank...</option>
                      {banks.map((bank) => (
                        <option key={bank.id} value={bank.id}>
                          {bank.bank_name} - ₱{Number(bank.current_amount).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="px-2 py-1.5 border border-slate-300 rounded text-sm text-slate-500">
                      No banks available
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleCheckoutClick}
                disabled={cart.length === 0 || loading || !selectedWarehouse || (paymentMethod === 'bank' && banks.length > 0 && !selectedBank)}
                className="w-full bg-emerald-600 text-white py-3 rounded-lg hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {loading ? 'Processing...' : `Complete Sale - ₱${total.toLocaleString()}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showDeliveryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Delivery Information</h2>
              <button
                onClick={() => setShowDeliveryModal(false)}
                className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Delivery Agent Name <span className="text-slate-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={deliveryAgentName}
                  onChange={(e) => setDeliveryAgentName(e.target.value)}
                  placeholder="Enter agent name"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Delivered To <span className="text-slate-400 text-xs">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={deliveredTo}
                  onChange={(e) => setDeliveredTo(e.target.value)}
                  placeholder="Customer name or recipient"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Delivery Address <span className="text-slate-400 text-xs">(Optional)</span>
                </label>
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Enter delivery address"
                  rows={3}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none text-sm"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleConfirmCheckout}
                  disabled={loading}
                  className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium text-sm"
                >
                  {loading ? 'Processing...' : 'Review Sale'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeliveryModal(false)}
                  className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 p-6 border-b border-slate-200 bg-white">
              <h2 className="text-lg font-bold text-slate-900">Confirm Sale Details</h2>
              <p className="text-sm text-slate-500 mt-1">Please review all information before confirming</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-6 pb-6 border-b border-slate-200">
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Warehouse</p>
                  <p className="text-sm font-medium text-slate-900 mt-1">
                    {warehouses.find((w) => w.id === selectedWarehouse)?.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payment Method</p>
                  <p className="text-sm font-medium text-slate-900 mt-1 capitalize">
                    {paymentMethod}
                    {paymentMethod === 'bank' && selectedBank && (
                      <>
                        <br />
                        <span className="text-xs text-slate-600">
                          {banks.find(b => b.id === selectedBank)?.bank_name}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="pb-6 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Delivery Information</p>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-slate-600">Agent:</span>
                    <span className="ml-2 font-medium text-slate-900">{deliveryAgentName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-600">Delivered To:</span>
                    <span className="ml-2 font-medium text-slate-900">{deliveredTo || '—'}</span>
                  </div>
                  {deliveryAddress && (
                    <div>
                      <span className="text-slate-600">Address:</span>
                      <p className="mt-1 p-2 bg-slate-50 rounded text-slate-900 text-xs whitespace-pre-wrap">{deliveryAddress}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="pb-6 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Items ({cart.length})</p>
                <div className="space-y-3 max-h-48 overflow-y-auto">
                  {cart.map((item) => {
                    const editedPrice = editedPrices[item.id] ? parseFloat(editedPrices[item.id]) : item.selling_price;
                    return (
                      <div key={item.id} className="flex justify-between items-start pb-2 border-b border-slate-100 last:border-0">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.name}</p>
                          {item.identifier && (
                            <p className="text-xs text-slate-500 mt-1">
                              {[
                                item.identifier.product_identifier && `ID: ${item.identifier.product_identifier}`,
                                item.identifier.model && `Model: ${item.identifier.model}`,
                                item.identifier.mac && `MAC: ${item.identifier.mac}`,
                                item.identifier.dev_id && `Dev: ${item.identifier.dev_id}`,
                              ].filter(Boolean).join(' • ')}
                            </p>
                          )}
                          <p className="text-xs text-slate-600 mt-1">
                            {item.quantity} x ₱{editedPrice.toLocaleString()}
                            {editedPrice !== item.selling_price && (
                              <span className="text-blue-600 ml-1">(edited from ₱{item.selling_price.toLocaleString()})</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-900">
                            ₱{(editedPrice * item.quantity).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 bg-slate-50 p-4 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Subtotal:</span>
                  <span className="font-medium text-slate-900">₱{subtotal.toLocaleString()}</span>
                </div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Discount:</span>
                    <span className="font-medium text-emerald-600">-₱{totalDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2 mt-2">
                  <span className="text-slate-900">Total:</span>
                  <span className="text-emerald-600">₱{total.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 p-6 border-t border-slate-200 bg-white flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmation(false);
                  setShowDeliveryModal(true);
                }}
                disabled={loading}
                className="flex-1 bg-slate-100 text-slate-700 py-2.5 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50 font-medium text-sm"
              >
                Back
              </button>
              <button
                onClick={processTransaction}
                disabled={loading}
                className="flex-1 bg-emerald-600 text-white py-2.5 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 font-medium text-sm"
              >
                {loading ? 'Processing...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
