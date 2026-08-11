import React from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Package, 
  Filter,
  Tag,
  AlertCircle,
  Clock,
  Calendar
} from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { formatCurrency } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  categoryId: string;
  description: string;
  imageUrl: string;
  purchasePrice: number;
  minStockLevel: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
}

interface InventoryItem {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
}

interface StockItem {
  id: string;
  productId: string;
  warehouseId: string;
  entryDate: string;
}

export default function Products() {
  const { isAdmin, isManager } = useAuth();
  const [products, setProducts] = React.useState<Product[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [inventory, setInventory] = React.useState<InventoryItem[]>([]);
  const [stockItems, setStockItems] = React.useState<StockItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('all');
  const [showCategoryModal, setShowCategoryModal] = React.useState(false);

  React.useEffect(() => {
    let productsDone = false;
    let categoriesDone = false;
    let inventoryDone = false;
    let stockItemsDone = false;

    const checkAllDone = () => {
      if (productsDone && categoriesDone && inventoryDone && stockItemsDone) {
        setLoading(false);
      }
    };

    const unsubProducts = onSnapshot(query(collection(db, 'products'), limit(300)), (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      productsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading products:", error);
      productsDone = true;
      checkAllDone();
    });

    const unsubCategories = onSnapshot(query(collection(db, 'product_categories'), limit(100)), (snap) => {
      setCategories(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Category)));
      categoriesDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading categories:", error);
      categoriesDone = true;
      checkAllDone();
    });

    const unsubInventory = onSnapshot(query(collection(db, 'inventory'), limit(300)), (snap) => {
      setInventory(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      inventoryDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading inventory:", error);
      inventoryDone = true;
      checkAllDone();
    });

    const unsubStockItems = onSnapshot(query(collection(db, 'stock_items'), limit(300)), (snap) => {
      setStockItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockItem)));
      stockItemsDone = true;
      checkAllDone();
    }, (error) => {
      console.error("Error loading stock_items:", error);
      stockItemsDone = true;
      checkAllDone();
    });

    // Fallback safety timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      clearTimeout(timeout);
      unsubProducts();
      unsubCategories();
      unsubInventory();
      unsubStockItems();
    };
  }, []);

  const getProductStock = (productId: string) => {
    return inventory
      .filter(i => i.productId === productId)
      .reduce((sum, item) => sum + (item.quantity || 0), 0);
  };

  const filteredProducts = products.map(p => {
    const stock = getProductStock(p.id);
    const productStockItems = stockItems.filter(si => si.productId === p.id);
    const agingItems = productStockItems.filter(si => {
      const entryDate = new Date(si.entryDate);
      const diffDays = Math.ceil(Math.abs(new Date().getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));
      return diffDays > 30;
    });

    return {
      ...p,
      stock,
      hasAgingStock: agingItems.length > 0,
      agingCount: agingItems.length
    };
  }).filter(p => {
    const q = searchTerm.toLowerCase().trim();
    const nameMatch = (p.name || '').toLowerCase().includes(q);
    const codeMatch = (p.code || '').toLowerCase().includes(q);
    const matchesSearch = !q || nameMatch || codeMatch;
    const matchesCategory = selectedCategory === 'all' || p.categoryId === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalAgingProducts = filteredProducts.filter(p => p.hasAgingStock).length;

  if (loading) return <div className="p-8 text-center text-gray-500 font-bold uppercase tracking-widest">Đang tải dữ liệu...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
            <Package size={24} strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tight">
              Sản phẩm trong kho
            </h2>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-sm text-gray-500">Hàng hóa khả dụng thực tế</p>
              {totalAgingProducts > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 rounded-lg text-[10px] font-black uppercase animate-pulse">
                  <Clock size={12} />
                  {totalAgingProducts} sản phẩm tồn lâu
                </div>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex gap-2">
          {(isAdmin || isManager) && (
            <button 
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-200 transition-all text-sm uppercase tracking-wider"
            >
              <Tag size={18} />
              Danh mục
            </button>
          )}
        </div>
      </div>

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl"
          >
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900 uppercase">Quản lý Danh mục</h3>
              <button onClick={() => setShowCategoryModal(false)} className="p-2 hover:bg-white rounded-xl">
                <Plus className="rotate-45 text-gray-400" size={24} />
              </button>
            </div>
            <div className="p-6 space-y-4">
               <div className="space-y-4">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <span className="font-bold text-gray-700">{cat.name}</span>
                      <button 
                        onClick={async () => {
                          if (confirm('Xóa danh mục này?')) {
                            await deleteDoc(doc(db, 'product_categories', cat.id));
                          }
                        }}
                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
               </div>
               <form 
                 onSubmit={async (e) => {
                   e.preventDefault();
                   const name = (e.currentTarget.elements.namedItem('catName') as HTMLInputElement).value;
                   if (!name) return;
                   await addDoc(collection(db, 'product_categories'), { name, createdAt: new Date().toISOString() });
                   (e.currentTarget.elements.namedItem('catName') as HTMLInputElement).value = '';
                 }}
                 className="flex gap-2 pt-4 border-t border-gray-100"
               >
                 <input 
                   name="catName"
                   placeholder="Tên danh mục mới..."
                   className="flex-1 px-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-blue-100"
                 />
                 <button 
                   type="submit"
                   className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm"
                 >
                   Thêm
                 </button>
               </form>
            </div>
          </motion.div>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text"
            placeholder="Tìm theo tên hoặc mã sản phẩm..."
            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <Filter className="text-gray-400" size={18} />
          <select 
            className="bg-gray-50 border-none rounded-xl text-sm px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-100"
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option value="all">Tất cả danh mục</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map(product => (
          <motion.div 
            layout
            key={product.id}
            className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden group hover:border-blue-200 transition-all"
          >
            <div className="h-40 bg-gray-50 relative overflow-hidden">
               {product.imageUrl ? (
                 <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center text-gray-300">
                    <Package size={48} strokeWidth={1} />
                    <p className="text-[10px] font-black uppercase mt-2">No Image</p>
                 </div>
               )}
               <div className="absolute top-3 right-3">
                  <span className={cn(
                    "px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm",
                    product.status === 'active' ? "bg-green-500 text-white" : "bg-gray-400 text-white"
                  )}>
                    {product.status === 'active' ? 'Đang bán' : 'Ngừng bán'}
                  </span>
               </div>
            </div>
            <div className="p-5">
               <div className="flex items-start justify-between mb-2">
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg uppercase">
                    {product.code}
                  </span>
                  {product.hasAgingStock && (
                    <div className="flex items-center gap-1 text-[8px] font-black text-rose-600 bg-rose-50 px-2 py-1 rounded-lg uppercase animate-pulse">
                      <Clock size={10} />
                      Tồn lâu
                    </div>
                  )}
               </div>
               <h3 className="font-bold text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 min-h-[3rem] mb-2 leading-tight uppercase text-sm">
                {product.name}
               </h3>
               <div className="flex items-center justify-between text-[10px] text-gray-400 font-black uppercase mb-4 tracking-widest">
                  <span className="flex items-center gap-1">
                    <Tag size={12} />
                    {categories.find(c => c.id === product.categoryId)?.name || 'Chưa phân loại'}
                  </span>
                  <span>{product.unit}</span>
               </div>
               <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1">Số lượng tồn</p>
                    <p className="text-xl font-black text-blue-600">{getProductStock(product.id)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest leading-none mb-1 text-right">Giá nhập</p>
                    <p className="text-sm font-bold text-gray-900">{formatCurrency(product.purchasePrice)}</p>
                  </div>
               </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
