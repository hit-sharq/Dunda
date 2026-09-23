'use client'

import { ShoppingBag, Plus, Search, Grid, List } from 'lucide-react'

const categories = ['All', 'Beer', 'Spirits', 'Cocktails', 'Wine', 'Food', 'Cigars', 'Non-Alcoholic']

const products = [
  { name: 'Tusker Lager', category: 'Beer', price: 250, stock: 48 },
  { name: 'White Cap', category: 'Beer', price: 220, stock: 32 },
  { name: 'Jameson', category: 'Spirits', price: 800, stock: 12 },
  { name: 'Jack Daniels', category: 'Spirits', price: 950, stock: 8 },
  { name: 'Whisky Sour', category: 'Cocktails', price: 1200, stock: 0 },
  { name: 'Mojito', category: 'Cocktails', price: 1100, stock: 0 },
  { name: 'House Red Wine', category: 'Wine', price: 6500, stock: 6 },
  { name: 'House Burger', category: 'Food', price: 950, stock: 0 },
  { name: 'Cuban Cigar', category: 'Cigars', price: 500, stock: 15 },
]

export default function PageContent({ organizationId }: { organizationId: string }) {
  const [activeCategory, setActiveCategory] = useState('All')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [cart, setCart] = useState<Array<{ id: string; name: string; price: number; qty: number }>>([])

  const addToCart = (product: typeof products[0]) => {
    setCart(prev => {
      const existing = prev.find(item => item.name === product.name)
      if (existing) {
        return prev.map(item => item.name === product.name ? { ...item, qty: item.qty + 1 } : item)
      }
      return [...prev, { id: product.name, name: product.name, price: product.price, qty: 1 }]
    })
  }

  const updateQty = (name: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.name !== name))
    } else {
      setCart(prev => prev.map(item => item.name === name ? { ...item, qty } : item))
    }
  }

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0)
  const tax = subtotal * 0.16
  const total = subtotal + tax

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4 p-4">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-[#172019]">Point of Sale</h1>
            <span className="text-sm text-[#68736b]">Main Branch</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 rounded-lg border border-[#e2e6df] bg-white px-3 py-2 text-sm text-[#68736b] hover:bg-[#f5f5f0]">
              <Search className="size-4" />
              Search products
            </button>
            <div className="flex rounded-lg border border-[#e2e6df] bg-white">
              {['grid', 'list'].map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode as 'grid' | 'list')}
                  className={`p-2 transition-colors ${viewMode === mode ? 'bg-[#172019] text-white' : 'text-[#68736b] hover:bg-[#f5f5f0]'}`}
                >
                  {mode === 'grid' ? <Grid className="size-4" /> : <List className="size-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-[#172019] text-white'
                  : 'bg-white text-[#68736b] hover:bg-[#f5f5f0] border border-[#e2e6df]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {viewMode === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products
                .filter(p => activeCategory === 'All' || p.category === activeCategory)
                .map(product => (
                  <button
                    key={product.name}
                    onClick={() => addToCart(product)}
                    disabled={product.stock === 0}
                    className={`relative rounded-xl border p-4 transition-colors ${
                      product.stock === 0
                        ? 'border-[#fee2e2] bg-[#fef2f2] opacity-50 cursor-not-allowed'
                        : 'border-[#e2e6df] bg-white hover:border-[#d3f36b] hover:shadow-lg'
                    }`}
                  >
                    <div className="mb-3 aspect-square bg-[#f5f5f0] rounded-lg flex items-center justify-center">
                      <span className="text-3xl">🍺</span>
                    </div>
                    <h3 className="font-medium text-[#172019] line-clamp-1">{product.name}</h3>
                    <p className="text-xs text-[#9aa49d]">{product.category}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-lg font-semibold text-[#172019]">KES {product.price.toLocaleString()}</span>
                      {product.stock > 0 && (
                        <span className="text-xs text-[#9aac51]">{product.stock} left</span>
                      )}
                    </div>
                  </button>
                ))}
            </div>
          ) : (
            <div className="space-y-2">
              {products
                .filter(p => activeCategory === 'All' || p.category === activeCategory)
                .map(product => (
                  <button
                    key={product.name}
                    onClick={() => addToCart(product)}
                    disabled={product.stock === 0}
                    className={`w-full flex items-center gap-4 rounded-xl border p-3 transition-colors ${
                      product.stock === 0
                        ? 'border-[#fee2e2] bg-[#fef2f2] opacity-50 cursor-not-allowed'
                        : 'border-[#e2e6df] bg-white hover:border-[#d3f36b]'
                    }`}
                  >
                    <div className="size-12 bg-[#f5f5f0] rounded-lg flex items-center justify-center">
                      <span className="text-xl">🍺</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-[#172019] truncate">{product.name}</h3>
                      <p className="text-xs text-[#9aa49d]">{product.category}</p>
                    </div>
                    <span className="text-lg font-semibold text-[#172019]">KES {product.price.toLocaleString()}</span>
                    {product.stock > 0 && (
                      <span className="text-xs text-[#9aac51]">{product.stock} left</span>
                    )}
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-80 flex flex-col bg-white border border-[#e2e6df] rounded-xl overflow-hidden">
        <div className="border-b border-[#e2e6df] px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-[#172019]">Current Order</h2>
          <span className="text-sm text-[#68736b]">{cart.length} items</span>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-[#9aa49d]">
              <ShoppingBag className="size-12 mb-3 opacity-50" />
              <p className="text-center">No items in order</p>
              <p className="text-xs">Tap products to add</p>
            </div>
          ) : (
            <div className="space-y-3">
              {cart.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-[#172019] truncate">{item.name}</p>
                    <p className="text-xs text-[#9aa49d]">KES {item.price.toLocaleString()} each</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQty(item.name, item.qty - 1)}
                      className="size-8 rounded-lg border border-[#e2e6df] flex items-center justify-center hover:bg-[#f5f5f0]"
                    >
                      −
                    </button>
                    <span className="w-10 text-center font-medium text-[#172019]">{item.qty}</span>
                    <button
                      onClick={() => updateQty(item.name, item.qty + 1)}
                      className="size-8 rounded-lg border border-[#e2e6df] flex items-center justify-center hover:bg-[#f5f5f0]"
                    >
                      +
                    </button>
                    <span className="w-24 text-right font-medium text-[#172019]">
                      KES {(item.price * item.qty).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#e2e6df] p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-[#68736b]">Subtotal</span>
            <span className="text-[#172019]">KES {subtotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#68736b]">Tax (16%)</span>
            <span className="text-[#172019]">KES {tax.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-lg font-semibold text-[#172019] pt-2 border-t border-[#e2e6df]">
            <span>Total</span>
            <span>KES {total.toLocaleString()}</span>
          </div>
          <button
            disabled={cart.length === 0}
            className="w-full rounded-full bg-[#172019] px-6 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
          >
            Checkout
          </button>
        </div>
      </div>
    </div>
  )
}